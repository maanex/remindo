import { describe, expect, it } from 'bun:test'
import { formatReminderTimestamp } from './format-timestamp'

describe('formatReminderTimestamp', () => {
  const baseNow = new Date('2026-10-14T10:00:00Z').getTime()

  it('shows delta time (:R) if < 3 hours', () => {
    // 2 hours in future
    const target2h = baseNow + 2 * 60 * 60 * 1000
    const sec2h = Math.floor(target2h / 1000)
    expect(formatReminderTimestamp(target2h, baseNow)).toBe(`<t:${sec2h}:R>`)

    // 10 minutes in future
    const target10m = baseNow + 10 * 60 * 1000
    const sec10m = Math.floor(target10m / 1000)
    expect(formatReminderTimestamp(target10m, baseNow)).toBe(`<t:${sec10m}:R>`)

    // 5 minutes in past (due recently)
    const targetPast = baseNow - 5 * 60 * 1000
    const secPast = Math.floor(targetPast / 1000)
    expect(formatReminderTimestamp(targetPast, baseNow)).toBe(`<t:${secPast}:R>`)
  })

  it('shows just the time (:t) if on same calendar day and >= 3 hours', () => {
    // 8 hours in future on the same UTC day (18:00 UTC)
    const target8h = baseNow + 8 * 60 * 60 * 1000
    const sec8h = Math.floor(target8h / 1000)
    expect(formatReminderTimestamp(target8h, baseNow)).toBe(`<t:${sec8h}:t>`)
  })

  it('shows date and time (:f) if < 3 days (and not same calendar day)', () => {
    // Tomorrow (26 hours later)
    const targetTomorrow = baseNow + 26 * 60 * 60 * 1000
    const secTomorrow = Math.floor(targetTomorrow / 1000)
    expect(formatReminderTimestamp(targetTomorrow, baseNow)).toBe(`<t:${secTomorrow}:f>`)

    // 2 days later (48 hours)
    const target2Days = baseNow + 48 * 60 * 60 * 1000
    const sec2Days = Math.floor(target2Days / 1000)
    expect(formatReminderTimestamp(target2Days, baseNow)).toBe(`<t:${sec2Days}:f>`)
  })

  it('shows just date (:d) otherwise (>= 3 days)', () => {
    // 5 days later
    const target5Days = baseNow + 5 * 24 * 60 * 60 * 1000
    const sec5Days = Math.floor(target5Days / 1000)
    expect(formatReminderTimestamp(target5Days, baseNow)).toBe(`<t:${sec5Days}:d>`)

    // 30 days later
    const targetMonth = baseNow + 30 * 24 * 60 * 60 * 1000
    const secMonth = Math.floor(targetMonth / 1000)
    expect(formatReminderTimestamp(targetMonth, baseNow)).toBe(`<t:${secMonth}:d>`)
  })
})

