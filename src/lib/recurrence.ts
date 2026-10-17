import { rrulestr } from 'rrule'

/**
 * Converts an RRULE string into simplified human-readable English text.
 * Uses rrule's toText() and shortens common phrases (e.g. "every week" -> "weekly").
 */
export function formatRecurrence(rruleString?: string | null): string {
  if (!rruleString || typeof rruleString !== 'string') {
    return ''
  }

  try {
    const rule = rrulestr(rruleString)
    const text = rule.toText()

    return text
      .replace(/^every day\b/i, 'daily')
      .replace(/^every week\b/i, 'weekly')
      .replace(/^every month\b/i, 'monthly')
      .replace(/^every year\b/i, 'yearly')
      .replace(/^every hour\b/i, 'hourly')
  } catch {
    return 'recurring'
  }
}

export const rruleToText = formatRecurrence

