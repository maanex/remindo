import { describe, expect, it } from 'bun:test'
import { resolveTimeRules } from './resolve-time'

describe('resolveTimeRules', () => {
  const fixedReference = new Date('2026-10-14T12:00:00Z')

  describe('Simple relative durations (via ms)', () => {
    it('parses short duration "10m"', async () => {
      const results = await resolveTimeRules('10m', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.rrule).toBeNull()
      expect(results[0]!.time).toBe(fixedReference.getTime() + 10 * 60 * 1000)
      expect(results[0]!.sourceText).toBe('10m')
    })

    it('parses "in 5 minutes" with prefix stripped', async () => {
      const results = await resolveTimeRules('in 5 minutes', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.rrule).toBeNull()
      expect(results[0]!.time).toBe(fixedReference.getTime() + 5 * 60 * 1000)
    })

    it('parses hour and day units', async () => {
      const hours = await resolveTimeRules('2h', { referenceDate: fixedReference })
      expect(hours[0]!.time).toBe(fixedReference.getTime() + 2 * 60 * 60 * 1000)

      const days = await resolveTimeRules('3 days', { referenceDate: fixedReference })
      expect(days[0]!.time).toBe(fixedReference.getTime() + 3 * 24 * 60 * 60 * 1000)
    })
  })

  describe('Multiple expressions joined with "and" or "und"', () => {
    it('parses multiple compound durations joined with "and"', async () => {
      const results = await resolveTimeRules('in 5m and in 15m', { referenceDate: fixedReference })
      expect(results).toHaveLength(2)
      expect(results[0]!.time).toBe(fixedReference.getTime() + 5 * 60 * 1000)
      expect(results[1]!.time).toBe(fixedReference.getTime() + 15 * 60 * 1000)
    })

    it('parses multiple compound durations joined with "und"', async () => {
      const results = await resolveTimeRules('in 5m und in 15m', { referenceDate: fixedReference })
      expect(results).toHaveLength(2)
      expect(results[0]!.time).toBe(fixedReference.getTime() + 5 * 60 * 1000)
      expect(results[1]!.time).toBe(fixedReference.getTime() + 15 * 60 * 1000)
    })

    it('respects maxItems limit', async () => {
      const results = await resolveTimeRules('in 5m and in 10m and in 15m', {
        referenceDate: fixedReference,
        maxItems: 2,
      })
      expect(results).toHaveLength(2)
    })
  })

  function getBerlinHour(date: Date): number {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date)
    return parseInt(hourStr, 10)
  }

  describe('Natural language date/time expressions (via gpu-time in Europe/Berlin)', () => {
    it('parses "tomorrow at 3pm" as 15:00 Berlin time', async () => {
      const results = await resolveTimeRules('tomorrow at 3pm', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.rrule).toBeNull()
      expect(results[0]!.time).toBeGreaterThan(fixedReference.getTime())

      const date = new Date(results[0]!.time)
      expect(getBerlinHour(date)).toBe(15)
      // On Oct 15 (CEST, UTC+2), 15:00 Berlin is 13:00 UTC
      expect(date.getUTCHours()).toBe(13)
    })
  })

  describe('Recurring schedules (via gpu-time + rrule in Europe/Berlin)', () => {
    it('parses recurring rule "every monday at 9am" as 09:00 Berlin time', async () => {
      const results = await resolveTimeRules('every monday at 9am', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.rrule).not.toBeNull()
      expect(results[0]!.rrule).toContain('RRULE:FREQ=WEEKLY')
      expect(results[0]!.time).toBeGreaterThan(fixedReference.getTime())

      const nextDate = new Date(results[0]!.time)
      expect(nextDate.getUTCDay()).toBe(1) // Monday
      expect(getBerlinHour(nextDate)).toBe(9)
      // On Oct 19 (CEST, UTC+2), 09:00 Berlin is 07:00 UTC
      expect(nextDate.getUTCHours()).toBe(7)
    })

    it('parses daily recurring rule "every day at 8pm"', async () => {
      const results = await resolveTimeRules('every day at 8pm', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.rrule).not.toBeNull()
      expect(results[0]!.rrule).toContain('RRULE:FREQ=DAILY')
      const date = new Date(results[0]!.time)
      expect(getBerlinHour(date)).toBe(20)
    })
  })

  describe('German translation & fuzzy matching fallback', () => {
    it('translates "morgen um 15 uhr" when raw query produces no GPU match', async () => {
      const results = await resolveTimeRules('morgen um 15 uhr', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(fixedReference.getTime())

      const date = new Date(results[0]!.time)
      expect(getBerlinHour(date)).toBe(15)
      expect(date.getUTCHours()).toBe(13)
    })

    it('fuzzy matches typos like "jedn montag um 9 uhr"', async () => {
      const results = await resolveTimeRules('jedn montag um 9 uhr', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.rrule).not.toBeNull()
      expect(results[0]!.rrule).toContain('RRULE:FREQ=WEEKLY')

      const date = new Date(results[0]!.time)
      expect(date.getUTCDay()).toBe(1) // Monday
      expect(getBerlinHour(date)).toBe(9)
      expect(date.getUTCHours()).toBe(7)
    })

    it('translates "übermorgen um 14 uhr"', async () => {
      const results = await resolveTimeRules('übermorgen um 14 uhr', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(fixedReference.getTime())

      const date = new Date(results[0]!.time)
      expect(getBerlinHour(date)).toBe(14)
      expect(date.getUTCHours()).toBe(12)
    })
  })

  describe('Daylight Saving Time (DST) handling in Berlin timezone', () => {
    it('handles winter time (CET, UTC+1) vs summer time (CEST, UTC+2)', async () => {
      const winterReference = new Date('2026-11-14T12:00:00Z')
      const winterResults = await resolveTimeRules('tomorrow at 3pm', { referenceDate: winterReference })
      expect(winterResults).toHaveLength(1)
      const winterDate = new Date(winterResults[0]!.time)
      expect(getBerlinHour(winterDate)).toBe(15)
      // In winter (CET, UTC+1), 15:00 Berlin is 14:00 UTC
      expect(winterDate.getUTCHours()).toBe(14)

      const summerReference = new Date('2026-07-14T12:00:00Z')
      const summerResults = await resolveTimeRules('tomorrow at 3pm', { referenceDate: summerReference })
      expect(summerResults).toHaveLength(1)
      const summerDate = new Date(summerResults[0]!.time)
      expect(getBerlinHour(summerDate)).toBe(15)
      // In summer (CEST, UTC+2), 15:00 Berlin is 13:00 UTC
      expect(summerDate.getUTCHours()).toBe(13)
    })

    it('correctly shifts offset across the autumn DST transition (last Sunday of October)', async () => {
      const preTransitionRef = new Date('2026-10-20T12:00:00Z')
      // 24 October 2026 (CEST, UTC+2)
      const preSwitch = await resolveTimeRules('24 October at 10:00', { referenceDate: preTransitionRef })
      expect(preSwitch).toHaveLength(1)
      const preDate = new Date(preSwitch[0]!.time)
      expect(getBerlinHour(preDate)).toBe(10)
      expect(preDate.getUTCHours()).toBe(8) // 10:00 - 2h = 08:00 UTC

      // 26 October 2026 (CET, UTC+1, after DST change on 25 October)
      const postSwitch = await resolveTimeRules('26 October at 10:00', { referenceDate: preTransitionRef })
      expect(postSwitch).toHaveLength(1)
      const postDate = new Date(postSwitch[0]!.time)
      expect(getBerlinHour(postDate)).toBe(10)
      expect(postDate.getUTCHours()).toBe(9) // 10:00 - 1h = 09:00 UTC
    })

    it('allows explicit timeZone override when specified', async () => {
      const utcResults = await resolveTimeRules('tomorrow at 3pm', {
        referenceDate: fixedReference,
        timeZone: 'UTC',
      })
      expect(utcResults).toHaveLength(1)
      const utcDate = new Date(utcResults[0]!.time)
      expect(utcDate.getUTCHours()).toBe(15)
    })
  })

  describe('All-day and recurring schedule handling (preventing immediate trigger)', () => {
    it('schedules "every year" to next year at 09:00 AM instead of today at midnight', async () => {
      const ref = new Date('2026-10-17T14:37:25+02:00')
      const results = await resolveTimeRules('every year', { referenceDate: ref })
      expect(results).toHaveLength(1)
      expect(results[0]!.rrule).not.toBeNull()
      expect(results[0]!.rrule).toContain('FREQ=YEARLY')
      expect(results[0]!.rrule).toContain('20271017T090000')

      // Must be in the future (next year)
      expect(results[0]!.time).toBeGreaterThan(ref.getTime())
      const scheduledDate = new Date(results[0]!.time)
      expect(getBerlinHour(scheduledDate)).toBe(9)
      expect(scheduledDate.getUTCFullYear()).toBe(2027)
    })

    it('schedules "every day" created after 09:00 AM to tomorrow at 09:00 AM', async () => {
      const ref = new Date('2026-10-17T14:37:25+02:00')
      const results = await resolveTimeRules('every day', { referenceDate: ref })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(ref.getTime())
      const scheduledDate = new Date(results[0]!.time)
      expect(getBerlinHour(scheduledDate)).toBe(9)
      expect(scheduledDate.getUTCDate()).toBe(18)
    })

    it('schedules "tomorrow" (all-day) to tomorrow at 09:00 AM', async () => {
      const ref = new Date('2026-10-17T14:37:25+02:00')
      const results = await resolveTimeRules('tomorrow', { referenceDate: ref })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(ref.getTime())
      const scheduledDate = new Date(results[0]!.time)
      expect(getBerlinHour(scheduledDate)).toBe(9)
      expect(scheduledDate.getUTCDate()).toBe(18)
    })

    it('schedules "today" before 09:00 to today at 09:00 AM', async () => {
      const morningRef = new Date('2026-10-17T07:15:00+02:00')
      const results = await resolveTimeRules('today', { referenceDate: morningRef })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(morningRef.getTime())
      const scheduledDate = new Date(results[0]!.time)
      expect(getBerlinHour(scheduledDate)).toBe(9)
      expect(scheduledDate.getUTCDate()).toBe(17)
    })

    it('schedules "today" between 09:00 and 18:00 to today at 18:00 (evening)', async () => {
      const afternoonRef = new Date('2026-10-17T14:37:25+02:00')
      const results = await resolveTimeRules('today', { referenceDate: afternoonRef })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(afternoonRef.getTime())
      const scheduledDate = new Date(results[0]!.time)
      expect(getBerlinHour(scheduledDate)).toBe(18)
      expect(scheduledDate.getUTCDate()).toBe(17)
    })

    it('schedules "today" between 18:00 and 22:00 to today at 22:00', async () => {
      const eveningRef = new Date('2026-10-17T20:30:00+02:00')
      const results = await resolveTimeRules('today', { referenceDate: eveningRef })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(eveningRef.getTime())
      const scheduledDate = new Date(results[0]!.time)
      expect(getBerlinHour(scheduledDate)).toBe(22)
      expect(scheduledDate.getUTCDate()).toBe(17)
    })

    it('schedules "today" after 22:00 to tomorrow at 06:00 AM', async () => {
      const lateNightRef = new Date('2026-10-17T22:30:00+02:00')
      const results = await resolveTimeRules('today', { referenceDate: lateNightRef })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(lateNightRef.getTime())
      const scheduledDate = new Date(results[0]!.time)
      expect(getBerlinHour(scheduledDate)).toBe(6)
      expect(scheduledDate.getUTCDate()).toBe(18)
    })
  })

  describe('Invalid or unparseable inputs', () => {
    it('returns empty array for empty or whitespace input', async () => {
      expect(await resolveTimeRules('')).toEqual([])
      expect(await resolveTimeRules('   ')).toEqual([])
    })

    it('returns empty array for non-temporal random text', async () => {
      const results = await resolveTimeRules('random gibberish completely unrelated xyz', { referenceDate: fixedReference })
      expect(results).toEqual([])
    })
  })
})

