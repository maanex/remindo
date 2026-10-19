import { describe, expect, it } from 'bun:test'
import { resolveTimeRules } from './resolve-time'

describe('resolveTimeRules', () => {
  const fixedReference = new Date('2026-10-14T12:00:00Z')
  const TIME_TOLERANCE_MS = 10

  function expectTimeClose(actual: number, expected: string): void {
    expect(Math.abs(actual - new Date(expected).getTime())).toBeLessThanOrEqual(TIME_TOLERANCE_MS)
  }

  describe('User-facing input matrix', () => {
    const cases: Array<{
      input: string
      expectedTime: string
      options?: Parameters<typeof resolveTimeRules>[1]
    }> = [
      { input: '5m', expectedTime: '2026-10-14T12:05:00.000Z' },
      { input: 'in 2 hours', expectedTime: '2026-10-14T14:00:00.000Z' },
      { input: 'in 1 day', expectedTime: '2026-10-15T12:00:00.000Z' },
      { input: '1h 30m', expectedTime: '2026-10-14T13:30:00.000Z' },
      { input: 'in 1,5 hours', expectedTime: '2026-10-14T13:30:00.000Z' },
      { input: '5 minuten', expectedTime: '2026-10-14T12:05:00.000Z' },
      { input: 'tomorrow', expectedTime: '2026-10-15T07:00:00.000Z' },
      { input: 'tomorrow morning', expectedTime: '2026-10-15T04:00:00.000Z' },
      { input: 'tomorrow at 08:00', expectedTime: '2026-10-15T06:00:00.000Z' },
      { input: 'tomorrow at noon', expectedTime: '2026-10-15T10:00:00.000Z' },
      { input: 'today at 18:30', expectedTime: '2026-10-14T16:30:00.000Z' },
      { input: '4.11.', expectedTime: '2026-11-04T08:00:00.000Z' },
      { input: '04.11.', expectedTime: '2026-11-04T08:00:00.000Z' },
      { input: '4.11.2027', expectedTime: '2027-11-04T08:00:00.000Z' },
      { input: '4 November', expectedTime: '2026-11-04T08:00:00.000Z' },
      { input: 'November 4', expectedTime: '2026-11-04T08:00:00.000Z' },
      { input: 'next friday at 17:45', expectedTime: '2026-10-23T15:45:00.000Z' },
      { input: 'morgen um 15 uhr', expectedTime: '2026-10-15T13:00:00.000Z' },
      { input: 'übermorgen um 14 uhr', expectedTime: '2026-10-16T12:00:00.000Z' },
      { input: 'heute abend', expectedTime: '2026-10-14T15:00:00.000Z' },
      {
        input: 'tomorrow at 3pm',
        expectedTime: '2026-10-15T15:00:00.000Z',
        options: { referenceDate: fixedReference, timeZone: 'UTC' },
      },
      {
        input: 'tomorrow at 3pm',
        expectedTime: '2026-11-15T14:00:00.000Z',
        options: { referenceDate: new Date('2026-11-14T12:00:00Z') },
      },
    ]

    for (const testCase of cases) {
      it(`"${testCase.input}" -> ${testCase.expectedTime}`, async () => {
        const results = await resolveTimeRules(testCase.input, {
          referenceDate: fixedReference,
          ...testCase.options,
        })

        expect(results).toHaveLength(1)
        expectTimeClose(results[0]!.time, testCase.expectedTime)
      })
    }
  })

  describe('Short reminder inputs with content text', () => {
    it('keeps five hours when reminder content follows the duration', async () => {
      const results = await resolveTimeRules('5h example text', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(1)
      expectTimeClose(results[0]!.time, '2026-10-14T17:00:00.000Z')
      expect(results[0]!.sourceText).toBe('5h example text')
      expect(results[0]!.rrule).toBeNull()
    })

    it('keeps both units when reminder content follows a compound duration', async () => {
      const results = await resolveTimeRules('1m20s example text', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(1)
      expectTimeClose(results[0]!.time, '2026-10-14T12:01:20.000Z')
      expect(results[0]!.sourceText).toBe('1m20s example text')
      expect(results[0]!.rrule).toBeNull()
    })

    it('preserves text after a German natural-language time', async () => {
      const results = await resolveTimeRules('morgen früh einkaufen gehen', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(1)
      expectTimeClose(results[0]!.time, '2026-10-15T07:00:00.000Z')
      expect(results[0]!.sourceText).toBe('morgen früh einkaufen gehen')
    })

    it('parses multiple clock times while retaining trailing reminder text', async () => {
      const results = await resolveTimeRules('at 15 and at 20 about bingus tomorrow', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(2)
      expectTimeClose(results[0]!.time, '2026-10-14T13:00:00.000Z')
      expectTimeClose(results[1]!.time, '2026-10-14T18:00:00.000Z')
      expect(results[0]!.sourceText).toBe('at 15')
      expect(results[1]!.sourceText).toBe('at 20 about bingus tomorrow')
    })

    it('parses the short duration used before command title text', async () => {
      const results = await resolveTimeRules('5h', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(1)
      expectTimeClose(results[0]!.time, '2026-10-14T17:00:00.000Z')
      expect(results[0]!.sourceText).toBe('5h')
      expect(results[0]!.rrule).toBeNull()
    })

    it('parses the natural-language time used before command title text', async () => {
      const results = await resolveTimeRules('tomorrow morning', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(1)
      expectTimeClose(results[0]!.time, '2026-10-15T04:00:00.000Z')
      expect(results[0]!.sourceText).toBe('tomorrow morning')
      expect(results[0]!.rrule).toBeNull()
    })

    it('parses a compound duration used before command title text', async () => {
      const results = await resolveTimeRules('1m20s', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(1)
      expectTimeClose(results[0]!.time, '2026-10-14T12:01:20.000Z')
      expect(results[0]!.sourceText).toBe('1m20s')
      expect(results[0]!.rrule).toBeNull()
    })

    it('keeps content on the final expression when parsing multiple short times', async () => {
      const results = await resolveTimeRules('at 15 and at 20 about bingus', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(2)
      expectTimeClose(results[0]!.time, '2026-10-14T13:00:00.000Z')
      expectTimeClose(results[1]!.time, '2026-10-14T18:00:00.000Z')
      expect(results[0]!.sourceText).toBe('at 15')
      expect(results[1]!.sourceText).toBe('at 20 about bingus')
      expect(results[0]!.rrule).toBeNull()
      expect(results[1]!.rrule).toBeNull()
    })
  })

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

    it('interprets dotted dates in German day-month order', async () => {
      const results = await resolveTimeRules('4.11.', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)

      const date = new Date(results[0]!.time)
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).formatToParts(date)
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]))

      expect(values.year).toBe('2026')
      expect(values.month).toBe('11')
      expect(values.day).toBe('4')
    })

    it('preserves an explicit year in dotted German dates', async () => {
      const results = await resolveTimeRules('4.11.2027', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)

      const date = new Date(results[0]!.time)
      expect(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).format(date)).toBe('11/4/2027')
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

    it('keeps the weekly recurrence details and next occurrence time', async () => {
      const results = await resolveTimeRules('every week on monday at 10:30', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(1)
      expect(results[0]!.rrule).toContain('RRULE:FREQ=WEEKLY')
      expect(results[0]!.rrule).toContain('BYDAY=MO')
      expectTimeClose(results[0]!.time, '2026-10-19T08:30:00.000Z')
    })

    it('translates a German weekly schedule', async () => {
      const results = await resolveTimeRules('jeden montag um 9 uhr', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(1)
      expect(results[0]!.rrule).toContain('RRULE:FREQ=WEEKLY')
      expect(results[0]!.rrule).toContain('BYDAY=MO')
      expectTimeClose(results[0]!.time, '2026-10-19T07:00:00.000Z')
    })
  })

  describe('German translation fallback', () => {
    it('translates "morgen um 15 uhr" when raw query produces no GPU match', async () => {
      const results = await resolveTimeRules('morgen um 15 uhr', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(fixedReference.getTime())

      const date = new Date(results[0]!.time)
      expect(getBerlinHour(date)).toBe(15)
      expect(date.getUTCHours()).toBe(13)
    })

    it('translates "übermorgen um 14 uhr"', async () => {
      const results = await resolveTimeRules('übermorgen um 14 uhr', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      expect(results[0]!.time).toBeGreaterThan(fixedReference.getTime())

      const date = new Date(results[0]!.time)
      expect(getBerlinHour(date)).toBe(14)
      expect(date.getUTCHours()).toBe(12)
    })

    it('translates "dreiviertel fünf" to quarter to five (04:45)', async () => {
      const results = await resolveTimeRules('dreiviertel fünf', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      const date = new Date(results[0]!.time)
      expect(getBerlinHour(date)).toBe(4)
      expect(date.getMinutes()).toBe(45)
    })

    it('translates "dreiviertel vier denk dran" correctly identifying the time boundary', async () => {
      const results = await resolveTimeRules('dreiviertel vier denk dran', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      const date = new Date(results[0]!.time)
      expect(getBerlinHour(date)).toBe(3)
      expect(date.getMinutes()).toBe(45)
      expect(results[0]!.labelStart).toBe(16) // length of "dreiviertel vier"
    })

    it('translates "7.5. 20uhr gaming" identifying the time boundary without slicing into words', async () => {
      const results = await resolveTimeRules('7.5. 20uhr gaming', { referenceDate: fixedReference })
      expect(results).toHaveLength(1)
      const date = new Date(results[0]!.time)
      expect(getBerlinHour(date)).toBe(20)
      expect(date.getMinutes()).toBe(0)
      expect(results[0]!.labelStart).toBe(10) // length of "7.5. 20uhr"
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

    it('uses the target date timezone offset for a German date with a time', async () => {
      const results = await resolveTimeRules('am 4.11. um 16 uhr', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(1)
      expectTimeClose(results[0]!.time, '2026-11-04T15:00:00.000Z')
    })
  })

  describe('Result limits and metadata', () => {
    it('limits compound expressions to one result when maxItems is one', async () => {
      const results = await resolveTimeRules('in 5m and in 10m and in 15m', {
        referenceDate: fixedReference,
        maxItems: 1,
      })

      expect(results).toHaveLength(1)
      expectTimeClose(results[0]!.time, '2026-10-14T12:05:00.000Z')
      expect(results[0]!.sourceText).toBe('in 5m')
    })

    it('preserves each trimmed source expression in a compound request', async () => {
      const results = await resolveTimeRules('  in 5m  and  in 10m  ', {
        referenceDate: fixedReference,
      })

      expect(results).toHaveLength(2)
      expect(results[0]!.sourceText).toBe('in 5m')
      expect(results[1]!.sourceText).toBe('in 10m')
      expect(results[0]!.rrule).toBeNull()
      expect(results[1]!.rrule).toBeNull()
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
