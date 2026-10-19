import { parse } from 'gpu-time'
import { rrulestr } from 'rrule'
import { translateGermanTime, translateGermanTimeWithMap, type TranslatedGermanTimeResult } from './translate-de'
import { userMs } from './user-ms'

export type ResolvedTimeEntry = {
  time: number
  rrule: string | null
  sourceText: string
  labelStart: number
}

export type ResolveTimeOptions = {
  referenceDate?: Date
  timeZone?: string
  maxItems?: number
}

export const DEFAULT_TIMEZONE = 'Europe/Berlin'

function setTimeInZone(
  isoDateOrYMD: string,
  hour: number,
  minute = 0,
  second = 0,
  timeZone = DEFAULT_TIMEZONE,
): Date {
  const dateOnly = isoDateOrYMD.slice(0, 10)
  const splitted = dateOnly.split('-')
  const y = Number(splitted[0])
  const m = Number(splitted[1])
  const d = Number(splitted[2])
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute, second))
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(guess)) {
    parts[p.type] = p.value
  }
  const guessLocalHour = parseInt(parts['hour'] ?? '0', 10)
  const guessLocalDay = parseInt(parts['day'] ?? '1', 10)
  const diffHours = (guessLocalDay - d) * 24 + (guessLocalHour - hour)
  return new Date(guess.getTime() - diffHours * 60 * 60 * 1000)
}

function getLocalParts(date: Date, timeZone = DEFAULT_TIMEZONE) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(date)) {
    p[part.type] = part.value
  }
  return {
    year: parseInt(p['year'] ?? '0', 10),
    month: parseInt(p['month'] ?? '1', 10),
    day: parseInt(p['day'] ?? '1', 10),
    hour: parseInt(p['hour'] ?? '0', 10),
    minute: parseInt(p['minute'] ?? '0', 10),
    second: parseInt(p['second'] ?? '0', 10),
  }
}

function resolveAllDayOccurrence(
  occurrences: Array<{ start: string; allDay?: boolean }>,
  isRecurring: boolean,
  reference: Date,
  timeZone: string,
): { targetDate: Date; localYear: number; localMonth: number; localDay: number } {
  const refParts = getLocalParts(reference, timeZone)

  if (isRecurring) {
    // For recurring reminders, start on the first future cycle at 09:00 AM
    for (const occ of occurrences) {
      const target = setTimeInZone(occ.start, 9, 0, 0, timeZone)
      if (target.getTime() > reference.getTime()) {
        const parts = getLocalParts(target, timeZone)
        return {
          targetDate: target,
          localYear: parts.year,
          localMonth: parts.month,
          localDay: parts.day,
        }
      }
    }
    const fallbackStart = occurrences[0]?.start ?? reference.toISOString()
    const fallbackTarget = setTimeInZone(fallbackStart, 9, 0, 0, timeZone)
    const parts = getLocalParts(fallbackTarget, timeZone)
    return {
      targetDate: fallbackTarget,
      localYear: parts.year,
      localMonth: parts.month,
      localDay: parts.day,
    }
  }

  // Non-recurring
  const firstOcc = occurrences[0]
  const dateOnly = firstOcc?.start ? firstOcc.start.slice(0, 10) : reference.toISOString().slice(0, 10)
  const splitted = dateOnly.split('-')
  const y = Number(splitted[0])
  const m = Number(splitted[1])
  const d = Number(splitted[2])
  const isToday = y === refParts.year && m === refParts.month && d === refParts.day

  if (!isToday) {
    const target = setTimeInZone(dateOnly, 9, 0, 0, timeZone)
    return {
      targetDate: target,
      localYear: y,
      localMonth: m,
      localDay: d,
    }
  }

  // Non-recurring date falling on today:
  // Before 09:00 -> 09:00 today
  // Before 18:00 -> 18:00 today
  // Before 22:00 -> 22:00 today
  // Otherwise -> 06:00 tomorrow
  let targetHour: number
  let targetDateOnly = dateOnly

  if (refParts.hour < 9) {
    targetHour = 9
  } else if (refParts.hour < 18) {
    targetHour = 18
  } else if (refParts.hour < 22) {
    targetHour = 22
  } else {
    targetHour = 6
    const tomorrowRef = new Date(reference.getTime() + 24 * 60 * 60 * 1000)
    const tomParts = getLocalParts(tomorrowRef, timeZone)
    targetDateOnly = `${tomParts.year}-${String(tomParts.month).padStart(2, '0')}-${String(tomParts.day).padStart(2, '0')}`
  }

  const target = setTimeInZone(targetDateOnly, targetHour, 0, 0, timeZone)
  const targetParts = getLocalParts(target, timeZone)
  return {
    targetDate: target,
    localYear: targetParts.year,
    localMonth: targetParts.month,
    localDay: targetParts.day,
  }
}

/**
 * Resolves a natural language time string into one or more scheduled timestamps and recurrence rules.
 *
 * Sequence:
 * 1. Checks simple relative durations with `ms` (e.g. "10m", "in 5 minutes").
 * 2. If unresolved, runs neural schedule parser (`gpu-time`) using Berlin timezone (supporting DST switches).
 * 3. If GPU check yields 0 matches, applies DE -> EN dictionary translation and retries `gpu-time`.
 * 4. Extracts the occurrence timestamp (with timezone & DST offset) and any recurrence rule.
 */
export async function resolveTimeRules(
  input: string,
  options: ResolveTimeOptions = {},
): Promise<ResolvedTimeEntry[]> {
  const reference = options.referenceDate ?? new Date()
  const timeZone = options.timeZone ?? DEFAULT_TIMEZONE
  const maxItems = options.maxItems ?? 10

  const trimmed = input.trim()
  if (!trimmed) return []

  const parts = trimmed
    .split(/\s+(?:and|und)\s+/i)
    .map(s => s.trim())
    .filter(Boolean)

  const results: ResolvedTimeEntry[] = []

  for (const part of parts) {
    if (results.length >= maxItems) break

    // 1. Try simple relative duration parsing via /lib/ms.ts first
    const simpleMs = userMs(part, reference)
    if (typeof simpleMs === 'number' && !isNaN(simpleMs) && simpleMs > 0) {
      results.push({
        time: reference.getTime() + simpleMs,
        rrule: null,
        sourceText: part,
        labelStart: -1
      })
      continue
    }

    // 2. Fall back to neural parser (gpu-time) if ms does not resolve
    try {
      let translation: TranslatedGermanTimeResult | null = null
      let parsed = await parse(part, {
        reference: reference.toISOString(),
        timeZone,
      })

      // 3. If German words, times (e.g. 20uhr), or dates (e.g. 7.5.) exist, parse translated text
      const transResult = translateGermanTimeWithMap(part)
      if (transResult.changes.length > 0) {
        const transParsed = await parse(transResult.text, {
          reference: reference.toISOString(),
          timeZone,
        })
        if (transParsed && transParsed.occurrences && transParsed.occurrences.length > 0) {
          parsed = transParsed
          translation = transResult
        }
      }

      // 4. If full query produced no matches, retry prefixes (in case trailing reminder title text confused gpu-time)
      if (!parsed || !parsed.occurrences || parsed.occurrences.length === 0) {
        const words = part.trim().split(/\s+/)
        for (let len = words.length - 1; len >= 1; len--) {
          const prefix = words.slice(0, len).join(' ')
          const prefixTrans = translateGermanTimeWithMap(prefix)
          const targetText = prefixTrans.changes.length > 0 ? prefixTrans.text : prefix
          const prefixParsed = await parse(targetText, {
            reference: reference.toISOString(),
            timeZone,
          })
          if (prefixParsed && prefixParsed.occurrences && prefixParsed.occurrences.length > 0) {
            parsed = prefixParsed
            translation = prefixTrans.changes.length > 0 ? prefixTrans : null
            break
          }
        }
      }

      if (!parsed || !parsed.occurrences || parsed.occurrences.length === 0) {
        continue
      }

      const firstOcc = parsed.occurrences[0]
      let rruleString = (parsed.rrules && parsed.rrules.length > 0 && parsed.rrules[0])
        ? parsed.rrules[0]
        : null

      // Use gpu-time's occurrence start which respects timeZone and automatic DST transitions
      if (firstOcc) {
        let occurrenceTime: number

        if (firstOcc.allDay) {
          const resolved = resolveAllDayOccurrence(
            parsed.occurrences,
            Boolean(rruleString),
            reference,
            timeZone,
          )
          occurrenceTime = resolved.targetDate.getTime()
          if (rruleString) {
            const y = resolved.localYear
            const m = String(resolved.localMonth).padStart(2, '0')
            const d = String(resolved.localDay).padStart(2, '0')
            const dateDigits = `${y}${m}${d}`
            rruleString = rruleString.replace(
              /DTSTART(?:;[^\n\r:]+)?:[^\n\r]+/,
              `DTSTART;TZID=${timeZone}:${dateDigits}T090000`,
            )
          }
        } else {
          occurrenceTime = new Date(firstOcc.start).getTime()
        }

        const labelStart = parsed.spans.length > 0
          ? Math.max(...parsed.spans.map(s => translation ? translation.reverseIndex(s.end) : s.end))
          : -1

        results.push({
          time: occurrenceTime,
          rrule: rruleString,
          sourceText: part,
          labelStart
        })
        continue
      }

      // Fallback to rrulestr only if occurrence was not directly produced
      if (rruleString) {
        try {
          const rule = rrulestr(rruleString)
          const next = rule.after(reference)
          if (next) {
            const labelStart = parsed.spans.length > 0
              ? Math.max(...parsed.spans.map(s => translation ? translation.reverseIndex(s.end) : s.end))
              : -1

            results.push({
              time: next.getTime(),
              rrule: rruleString,
              sourceText: part,
              labelStart
            })
            continue
          }
        } catch (ex) {
          console.error('Failed to parse rrule with rrule package:', ex)
        }
      }
    } catch (err) {
      console.error(`Failed parsing time input: "${part}":`, err)
    }
  }

  return results
}
