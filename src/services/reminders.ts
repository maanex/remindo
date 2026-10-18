import { MessageFlags, type Client, type TextChannel } from 'discord.js'
import { nanoid } from 'nanoid'
import { rrulestr } from 'rrule'
import { button, container, section, selectString, text, type CordoComponent } from 'cordo/components'
import { goto } from 'cordo/functions'
import { db, type Reminder } from '../db'
import { ms } from '../lib/ms'
import { renderCordoComponents } from '../lib/cordo'

export type ReminderData = {
  id: string
  time: number
  title?: string | null
  channel_id: string
  guild_id?: string | null
  source_id?: string | null
  rrule?: string | null
  snooze_count: number
  created_at: number
  triggered_at?: number | null
  subscribers: string[]
}

const MAX_TIME_LOCAL = 1000 * 30 // 30 seconds
const MAX_TIME_HYBRID = 1000 * 60 * 5 // 5 minutes
const LOCAL_PREFIX = 'local_'

const SNOOZE_OPTIONS = [
  { label: '10 minutes', value: ms('10m').toString() },
  { label: '30 minutes', value: ms('30m').toString() },
  { label: '1 hour', value: ms('1h').toString() },
  { label: '2 hours', value: ms('2h').toString() },
  { label: '3 hours', value: ms('3h').toString() },
  { label: '12 hours', value: ms('12h').toString() },
  { label: '1 day', value: ms('1d').toString() },
  { label: '2 days', value: ms('2d').toString() },
  { label: '5 days', value: ms('5d').toString() },
  { label: 'Surprise me', value: 'surprise' },
]

type Timer = ReturnType<typeof setTimeout>

let discordClient: Client | null = null
let checkInterval: Timer | null = null

export function getDiscordClient(): Client | null {
  return discordClient
}

const localOnly = new Map<string, ReminderData>()
const hybrid = new Map<string, ReminderData>()
const timers = new Map<string, Timer>()
const inFlight = new Set<string>()

// --- UI Helpers & Builders (Cordo Style) ---

export function formatReminderTitle(title?: string | null, snoozeCount = 0): string {
  const baseTitle = title ? title : '*No description*'
  if (snoozeCount === 1)
    return `[Snoozed] ${baseTitle}`
  if (snoozeCount > 1)
    return `[Snoozed ${snoozeCount}x] ${baseTitle}`
  return baseTitle
}

export function buildReminderComponents(data: ReminderData, opts?: { snoozeOpen?: boolean, snoozeText?: string }) {
  const content = formatReminderTitle(data.title, data.snooze_count)
  const pings = (data.rrule ? '🔄 ' : '⏰ ')
    + data.subscribers.map(s => `<@${s}>`).join(' ')
    + ((data.subscribers.length > 1) ? '\n' : '')

  if (opts?.snoozeOpen) {
    return [
      text(pings, content),
      selectString()
        .placeholder('Select Snooze Delay')
        .setOptions(SNOOZE_OPTIONS)
        .onSubmit(goto(`reminders/${data.id}/snooze`))
    ]
  }
  if (opts?.snoozeText) {
    return [
      text(pings, content),
      button()
        .emoji('💤')
        .label(opts?.snoozeText!)
        .style('secondary')
        .onClick(goto(`reminders/${data.id}/subscribe`, { private: true, asReply: true })),
    ]
  }

  return [
    section(
      text(pings, content),
    ).decorate(
      button()
        .emoji('💤')
        .style('secondary')
        .onClick(goto(`reminders/${data.id}/snooze`)),
    )
  ]
}

export function renderReminderComponents(data: ReminderData, opts?: { snoozeOpen?: boolean, snoozeText?: string }): any[] {
  return renderCordoComponents(buildReminderComponents(data, opts))
}

// --- Database Helpers ---

function getSubscribersFromDb(reminderId: string): string[] {
  const subs = db.query(`
    SELECT user_id FROM reminder_sub WHERE reminder_id = $reminder_id
  `).all({ $reminder_id: reminderId }) as Array<{ user_id: string }>
  return subs.map(s => s.user_id)
}

function saveReminderToDb(reminder: ReminderData) {
  db.query(`
    INSERT INTO reminder (id, time, title, channel_id, guild_id, source_id, rrule, snooze_count, created_at, triggered_at)
    VALUES ($id, $time, $title, $channel_id, $guild_id, $source_id, $rrule, $snooze_count, $created_at, $triggered_at)
  `).run({
    $id: reminder.id,
    $time: reminder.time,
    $title: reminder.title ?? null,
    $channel_id: reminder.channel_id,
    $guild_id: reminder.guild_id ?? null,
    $source_id: reminder.source_id ?? null,
    $rrule: reminder.rrule ?? null,
    $snooze_count: reminder.snooze_count ?? 0,
    $created_at: reminder.created_at,
    $triggered_at: reminder.triggered_at ?? null,
  })

  for (const userId of reminder.subscribers) {
    db.query(`
      INSERT OR IGNORE INTO reminder_sub (reminder_id, user_id)
      VALUES ($reminder_id, $user_id)
    `).run({
      $reminder_id: reminder.id,
      $user_id: userId,
    })
  }
}

function deleteReminderFromDb(id: string) {
  db.query(`DELETE FROM reminder WHERE id = $id`).run({ $id: id })
}

// --- Timer Helpers ---

function scheduleTimer(id: string, fn: () => void, delayMs: number) {
  clearTimer(id)
  const timer = setTimeout(fn, Math.max(0, delayMs))
  timers.set(id, timer)
}

function clearTimer(id: string) {
  const existing = timers.get(id)
  if (existing) {
    clearTimeout(existing)
    timers.delete(id)
  }
}

// --- Core Reminder Actions ---

export async function getReminder(id: string): Promise<ReminderData | null> {
  if (localOnly.has(id)) {
    return localOnly.get(id)!
  }
  if (hybrid.has(id)) {
    return hybrid.get(id)!
  }

  const row = db.query(`SELECT * FROM reminder WHERE id = $id`).get({ $id: id }) as Reminder | null
  if (!row) return null

  return {
    id: row.id,
    time: row.time,
    title: row.title,
    channel_id: row.channel_id,
    guild_id: row.guild_id ?? null,
    source_id: row.source_id,
    rrule: row.rrule,
    snooze_count: row.snooze_count ?? 0,
    created_at: row.created_at,
    triggered_at: row.triggered_at ?? null,
    subscribers: getSubscribersFromDb(id),
  }
}

export function deleteReminder(id: string) {
  clearTimer(id)
  localOnly.delete(id)
  hybrid.delete(id)
  deleteReminderFromDb(id)
}

export async function registerReminder(params: {
  time: number
  title?: string | null
  channel_id: string
  guild_id?: string | null
  source_id?: string | null
  rrule?: string | null
  snooze_count?: number
  user_id: string
}): Promise<string> {
  const delta = params.time - Date.now()
  const snoozeCount = params.snooze_count ?? 0

  // If already in the past, trigger immediately
  if (delta <= 0) {
    const id = params.rrule ? nanoid() : (LOCAL_PREFIX + nanoid())
    const reminder: ReminderData = {
      id,
      time: params.time,
      title: params.title ?? null,
      channel_id: params.channel_id,
      guild_id: params.guild_id ?? null,
      source_id: params.source_id ?? null,
      rrule: params.rrule ?? null,
      snooze_count: snoozeCount,
      created_at: Date.now(),
      triggered_at: null,
      subscribers: [params.user_id],
    }

    if (params.rrule) saveReminderToDb(reminder)
    await triggerReminder(reminder)
    return id
  }

  // Short-lived (< 30s) one-time reminder: memory only
  if (delta < MAX_TIME_LOCAL && !params.rrule) {
    const id = LOCAL_PREFIX + nanoid()
    const reminder: ReminderData = {
      id,
      time: params.time,
      title: params.title ?? null,
      channel_id: params.channel_id,
      guild_id: params.guild_id ?? null,
      source_id: params.source_id ?? null,
      rrule: null,
      snooze_count: snoozeCount,
      created_at: Date.now(),
      triggered_at: null,
      subscribers: [params.user_id],
    }

    localOnly.set(id, reminder)
    scheduleTimer(id, () => {
      triggerReminder(reminder)
      clearTimer(id)
    }, delta)
    return id
  }

  // Persistent (long-lived or recurring): save to SQLite
  const id = nanoid()
  const reminder: ReminderData = {
    id,
    time: params.time,
    title: params.title ?? null,
    channel_id: params.channel_id,
    guild_id: params.guild_id ?? null,
    source_id: params.source_id ?? null,
    rrule: params.rrule ?? null,
    snooze_count: snoozeCount,
    created_at: Date.now(),
    triggered_at: null,
    subscribers: [params.user_id],
  }

  saveReminderToDb(reminder)

  // Within hybrid window (< 5m): schedule in-memory timer
  if (delta < MAX_TIME_HYBRID) {
    hybrid.set(id, reminder)
    scheduleTimer(id, () => triggerReminder(reminder), delta)
  }

  return id
}

export async function subscribeUser(userId: string, reminderId: string): Promise<boolean> {
  const local = localOnly.get(reminderId)
  if (local) {
    if (!local.subscribers.includes(userId)) local.subscribers.push(userId)
    return true
  }

  const hyb = hybrid.get(reminderId)
  if (hyb && !hyb.subscribers.includes(userId)) {
    hyb.subscribers.push(userId)
  }

  const res = db.query(`
    INSERT OR IGNORE INTO reminder_sub (reminder_id, user_id)
    VALUES ($reminder_id, $user_id)
  `).run({ $reminder_id: reminderId, $user_id: userId })

  return res.changes > 0
}

export async function unsubscribeUser(userId: string, reminderId: string): Promise<{ unsubscribed: boolean, deleted: boolean }> {
  const local = localOnly.get(reminderId)
  if (local) {
    local.subscribers = local.subscribers.filter(id => id !== userId)
    if (local.subscribers.length === 0) {
      deleteReminder(reminderId)
      return { unsubscribed: true, deleted: true }
    }
    return { unsubscribed: true, deleted: false }
  }

  const hyb = hybrid.get(reminderId)
  if (hyb) {
    hyb.subscribers = hyb.subscribers.filter(id => id !== userId)
  }

  db.query(`
    DELETE FROM reminder_sub
    WHERE reminder_id = $reminder_id AND user_id = $user_id
  `).run({ $reminder_id: reminderId, $user_id: userId })

  const remaining = db.query(`
    SELECT COUNT(*) as count FROM reminder_sub WHERE reminder_id = $reminder_id
  `).get({ $reminder_id: reminderId }) as { count: number } | null

  if (!remaining || remaining.count === 0) {
    deleteReminder(reminderId)
    return { unsubscribed: true, deleted: true }
  }

  return { unsubscribed: true, deleted: false }
}

export async function getRemindersForUser(userId: string): Promise<ReminderData[]> {
  const rows = db.query(`
    SELECT r.* FROM reminder r
    JOIN reminder_sub rs ON r.id = rs.reminder_id
    WHERE rs.user_id = $userId AND (r.triggered_at IS NULL OR r.triggered_at = 0)
    ORDER BY r.time ASC
  `).all({ $userId: userId }) as Reminder[]

  const reminders: ReminderData[] = rows.map(r => ({
    id: r.id,
    time: r.time,
    title: r.title,
    channel_id: r.channel_id,
    guild_id: r.guild_id,
    source_id: r.source_id,
    rrule: r.rrule,
    snooze_count: r.snooze_count ?? 0,
    created_at: r.created_at,
    triggered_at: r.triggered_at,
    subscribers: getSubscribersFromDb(r.id),
  }))

  for (const local of localOnly.values()) {
    if (!local.triggered_at && local.subscribers.includes(userId)) {
      reminders.push(local)
    }
  }

  return reminders.sort((a, b) => a.time - b.time)
}

// --- Recurrence & Dispatch Helpers ---

function rollForwardRecurring(data: ReminderData): boolean {
  if (!data.rrule) return false
  try {
    const rule = rrulestr(data.rrule)
    const nextDate = rule.after(new Date(Math.max(Date.now(), data.time)))
    if (!nextDate) return false

    const nextTime = nextDate.getTime()
    db.query(`UPDATE reminder SET time = $time WHERE id = $id`).run({
      $time: nextTime,
      $id: data.id,
    })
    data.time = nextTime

    const delta = nextTime - Date.now()
    if (delta < MAX_TIME_HYBRID) {
      hybrid.set(data.id, data)
      scheduleTimer(data.id, () => triggerReminder(data), delta)
    }
    return true
  } catch (err) {
    console.error('Failed to calculate next occurrence for recurring reminder:', err)
    return false
  }
}

export async function checkDueReminders() {
  const now = Date.now()
  const cutoff = now + 30_000
  const pruneCutoff = now - 24 * 60 * 60 * 1000

  // Prune triggered reminders older than 24 hours
  try {
    db.query(`
      DELETE FROM reminder 
      WHERE triggered_at IS NOT NULL AND triggered_at > 0 AND triggered_at < $pruneCutoff
    `).run({ $pruneCutoff: pruneCutoff })

    for (const [id, local] of localOnly.entries()) {
      if (local.triggered_at && local.triggered_at < pruneCutoff) {
        localOnly.delete(id)
      }
    }
  } catch (err) {
    console.error('Failed to prune old triggered reminders:', err)
  }

  const dueReminders = db.query(`
    SELECT * FROM reminder 
    WHERE (triggered_at IS NULL OR triggered_at = 0) AND time <= $cutoff 
    ORDER BY time ASC
  `).all({ $cutoff: cutoff }) as Reminder[]

  if (!dueReminders.length) return

  for (const rem of dueReminders) {
    if (hybrid.has(rem.id) || timers.has(rem.id) || inFlight.has(rem.id)) {
      continue
    }

    const data: ReminderData = {
      id: rem.id,
      time: rem.time,
      title: rem.title,
      channel_id: rem.channel_id,
      guild_id: rem.guild_id,
      source_id: rem.source_id,
      rrule: rem.rrule,
      snooze_count: rem.snooze_count ?? 0,
      created_at: rem.created_at,
      triggered_at: rem.triggered_at,
      subscribers: getSubscribersFromDb(rem.id),
    }

    const delay = Math.max(0, rem.time - now)
    if (delay === 0) {
      await triggerReminder(data)
    } else {
      scheduleTimer(rem.id, () => triggerReminder(data), delay)
    }
  }
}

export async function triggerReminder(data: ReminderData) {
  if (inFlight.has(data.id))
    return
  inFlight.add(data.id)

  try {
    clearTimer(data.id)
    hybrid.delete(data.id)

    // Authoritative check on subscribers
    if (!data.id.startsWith(LOCAL_PREFIX))
      data.subscribers = getSubscribersFromDb(data.id)

    if (!data.subscribers.length) {
      deleteReminder(data.id)
      return
    }

    const components = renderReminderComponents(data)
    let sent = false

    try {
      const channel = await discordClient?.channels.fetch(data.channel_id)
      if (channel && channel.isTextBased()) {
        const textChannel = channel as TextChannel
        const message = await textChannel.send({
          components: components as any,
          flags: MessageFlags.IsComponentsV2,
          reply: data.source_id
            ? { messageReference: data.source_id, failIfNotExists: false }
            : undefined,
          allowedMentions: { users: data.subscribers },
        })
        if (message) sent = true
      }
    } catch (err) {
      console.error(`Failed to send reminder in channel ${data.channel_id}:`, err)
    }

    if (!sent) {
      await triggerReminderBackup(data, components)
    }

    // If recurring, reschedule; otherwise mark as triggered (retained for snooze grace period)
    if (rollForwardRecurring(data)) {
      return
    }

    const now = Date.now()
    data.triggered_at = now
    if (data.id.startsWith(LOCAL_PREFIX)) {
      localOnly.set(data.id, data)
    } else {
      db.query(`UPDATE reminder SET triggered_at = $now WHERE id = $id`).run({
        $now: now,
        $id: data.id,
      })
    }
  } finally {
    inFlight.delete(data.id)
  }
}

export async function triggerReminderBackup(data: ReminderData, components: any[]) {
  if (!discordClient) return

  for (const sub of data.subscribers) {
    try {
      const user = await discordClient.users.fetch(sub)
      if (!user) continue

      const dm = user.dmChannel ?? await user.createDM()
      await dm.send({
        components: components as any,
        flags: MessageFlags.IsComponentsV2,
      })
    } catch (ex) {
      console.error(`Failed to send backup DM reminder to user ${sub}:`, ex)
    }
  }
}

// --- Service Lifecycle ---

export function initReminders(client: Client) {
  discordClient = client
  checkInterval = setInterval(checkDueReminders, 30_000)
  setTimeout(checkDueReminders, 1_000)
}

export function stopReminders() {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
  for (const timer of timers.values()) {
    clearTimeout(timer)
  }
  timers.clear()
}
