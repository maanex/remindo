import { describe, expect, test } from 'bun:test'
import { buildIcalendar, escapeIcalText, foldIcalLine, formatIcalInZone, formatIcalUtc } from './ical'

describe('ical', () => {
  test('escapes text values', () => {
    expect(escapeIcalText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })

  test('folds long lines to 75 octets', () => {
    const folded = foldIcalLine('SUMMARY:' + 'x'.repeat(200))
    for (const line of folded.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe('SUMMARY:' + 'x'.repeat(200))
  })

  test('does not split multi-byte characters when folding', () => {
    const value = 'SUMMARY:' + '🦆'.repeat(40)
    const folded = foldIcalLine(value)
    expect(folded.replace(/\r\n /g, '')).toBe(value)
  })

  test('formats utc and zoned times', () => {
    const t = Date.UTC(2026, 6, 1, 12, 30, 0)
    expect(formatIcalUtc(t)).toBe('20260701T123000Z')
    expect(formatIcalInZone(t, 'Europe/Berlin')).toBe('20260701T143000')
  })

  test('builds one-off and recurring events', () => {
    const start = Date.UTC(2026, 10, 20, 8, 0, 0)
    const out = buildIcalendar({
      name: 'Reminders',
      now: start,
      events: [
        { uid: 'a@x', start, summary: 'Buy milk, eggs' },
        { uid: 'b@x', start, summary: 'Standup', rrule: 'DTSTART;TZID=Europe/Berlin:20261018T090000\nRRULE:FREQ=DAILY;INTERVAL=1' },
      ],
    })

    expect(out).toContain('BEGIN:VCALENDAR\r\n')
    expect(out).toContain('SUMMARY:Buy milk\\, eggs')
    expect(out).toContain('DTSTART:20261120T080000Z')
    expect(out).toContain('DTSTART;TZID=Europe/Berlin:20261120T090000')
    expect(out).toContain('RRULE:FREQ=DAILY;INTERVAL=1')
    expect(out).not.toContain('20261018')
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
})
