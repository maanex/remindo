import { ms } from "./ms"

/**
 * Formats a reminder timestamp for Discord based on its proximity:
 * - < 3 hours: delta time (`:R`)
 * - Same calendar day: just the time (`:t`)
 * - < 3 days: date and time (`:f`)
 * - Otherwise: just date (`:d`)
 */
export function formatReminderTimestamp(timeMs: number, nowMs: number = Date.now()): string {
  const timeSec = Math.floor(timeMs / 1000)
  const diffMs = Math.abs(timeMs - nowMs)

  // 1. Delta time if < 3h
  if (diffMs < ms('3h'))
    return `<t:${timeSec}:R>`

  // 2. Just time if on the same calendar day (UTC)
  const targetDate = new Date(timeMs)
  const nowDate = new Date(nowMs)
  const isSameDay =
    targetDate.getUTCFullYear() === nowDate.getUTCFullYear() &&
    targetDate.getUTCMonth() === nowDate.getUTCMonth() &&
    targetDate.getUTCDate() === nowDate.getUTCDate()

  if (isSameDay)
    return `<t:${timeSec}:t>`

  // 3. Date and time if < 3 days
  if (diffMs < ms('3d'))
    return `<t:${timeSec}:f>`

  // 4. Otherwise just date (no time)
  return `<t:${timeSec}:d>`
}

