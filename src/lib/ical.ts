import { randomBytes } from 'node:crypto'
import { sign, verify } from 'hono/jwt'
import { getMetadata, setMetadata } from '../db'

export type IcalEvent = {
  uid: string
  start: number
  /** duration in ms, defaults to 15 minutes */
  duration?: number
  summary: string
  description?: string | null
  url?: string | null
  /** raw rrule string as stored in the db, may include a DTSTART line */
  rrule?: string | null
  createdAt?: number
}

const DEFAULT_DURATION = 15 * 60 * 1000

/** Escapes a TEXT value per RFC 5545 §3.3.11 */
export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Folds a content line to at most 75 octets per RFC 5545 §3.1 */
export function foldIcalLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75)
    return line

  const parts: string[] = []
  let current = ''
  let currentLen = 0
  // the first line may hold 75 octets, continuation lines 74 (plus the leading space)
  let limit = 75
  for (const char of line) {
    const charLen = encoder.encode(char).length
    if (currentLen + charLen > limit) {
      parts.push(current)
      current = ''
      currentLen = 0
      limit = 74
    }
    current += char
    currentLen += charLen
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function formatIcalUtc(time: number): string {
  return new Date(time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Formats a timestamp as local floating time (YYYYMMDDTHHMMSS) in the given IANA time zone */
export function formatIcalInZone(time: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(time))
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`
}

/**
 * Builds DTSTART/DTEND/RRULE lines for an event. For recurring events the stored DTSTART line is
 * replaced with the next occurrence, keeping the original TZID so recurrences stay DST-correct.
 */
function buildTimeLines(event: IcalEvent): string[] {
  const end = event.start + (event.duration ?? DEFAULT_DURATION)

  if (!event.rrule)
    return [ `DTSTART:${formatIcalUtc(event.start)}`, `DTEND:${formatIcalUtc(end)}` ]

  const lines = event.rrule.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const tzid = lines
    .find(l => l.startsWith('DTSTART'))
    ?.match(/TZID=([^:;]+)/)?.[1]
  const ruleLines = lines.filter(l => /^(RRULE|EXRULE|RDATE|EXDATE)[:;]/.test(l))

  let timeLines: string[]
  try {
    timeLines = tzid
      ? [ `DTSTART;TZID=${tzid}:${formatIcalInZone(event.start, tzid)}`, `DTEND;TZID=${tzid}:${formatIcalInZone(end, tzid)}` ]
      : [ `DTSTART:${formatIcalUtc(event.start)}`, `DTEND:${formatIcalUtc(end)}` ]
  } catch {
    // unknown time zone, fall back to UTC
    timeLines = [ `DTSTART:${formatIcalUtc(event.start)}`, `DTEND:${formatIcalUtc(end)}` ]
  }

  return [ ...timeLines, ...ruleLines ]
}

export function buildIcalendar(opts: { name: string, events: IcalEvent[], now?: number }): string {
  const now = opts.now ?? Date.now()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//cluelessbot//reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcalText(opts.name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ]

  for (const event of opts.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${formatIcalUtc(now)}`,
      ...(event.createdAt ? [ `CREATED:${formatIcalUtc(event.createdAt)}` ] : []),
      ...buildTimeLines(event),
      `SUMMARY:${escapeIcalText(event.summary)}`,
      ...(event.description ? [ `DESCRIPTION:${escapeIcalText(event.description)}` ] : []),
      ...(event.url ? [ `URL:${event.url}` ] : []),
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldIcalLine).join('\r\n') + '\r\n'
}

// --- Signed feed tokens ---

export type IcalScope = {
  userId?: string
  guildId?: string
  channelId?: string
}

type IcalTokenPayload = {
  uid?: string
  gid?: string
  cid?: string
}

const SECRET_METADATA_KEY = 'ical_jwt_secret'
let cachedSecret: string | null = null

/** Uses ICAL_JWT_SECRET if set, otherwise a random secret that is generated once and persisted in the db */
function getSecret(): string {
  if (process.env.ICAL_JWT_SECRET)
    return process.env.ICAL_JWT_SECRET
  if (cachedSecret)
    return cachedSecret

  let secret = getMetadata(SECRET_METADATA_KEY)
  if (!secret) {
    secret = randomBytes(32).toString('hex')
    setMetadata(SECRET_METADATA_KEY, secret)
  }
  cachedSecret = secret
  return secret
}

export async function signIcalToken(scope: IcalScope): Promise<string> {
  const payload: IcalTokenPayload = {}
  if (scope.userId) payload.uid = scope.userId
  if (scope.guildId) payload.gid = scope.guildId
  if (scope.channelId) payload.cid = scope.channelId

  if (!payload.uid && !payload.gid && !payload.cid)
    throw new Error('An ical token needs at least one of userId, guildId or channelId')

  return sign(payload, getSecret(), 'HS256')
}

/** Returns the scope encoded in the token, or null if the token is invalid */
export async function verifyIcalToken(token: string): Promise<IcalScope | null> {
  try {
    const payload = await verify(token, getSecret(), 'HS256') as IcalTokenPayload
    const scope: IcalScope = {}
    if (typeof payload.uid === 'string') scope.userId = payload.uid
    if (typeof payload.gid === 'string') scope.guildId = payload.gid
    if (typeof payload.cid === 'string') scope.channelId = payload.cid

    if (!scope.userId && !scope.guildId && !scope.channelId)
      return null
    return scope
  } catch {
    return null
  }
}

export function getPublicBaseUrl(): string {
  const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
  return base.replace(/\/+$/, '')
}

export async function buildIcalUrl(scope: IcalScope): Promise<string> {
  return `${getPublicBaseUrl()}/ical/${await signIcalToken(scope)}`
}
