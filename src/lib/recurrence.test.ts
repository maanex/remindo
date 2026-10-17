import { describe, expect, it } from 'bun:test'
import { formatRecurrence } from './recurrence'

describe('formatRecurrence', () => {
  it('converts daily rule to "daily"', () => {
    expect(formatRecurrence('RRULE:FREQ=DAILY')).toBe('daily')
  })

  it('converts weekly rule to "weekly"', () => {
    expect(formatRecurrence('RRULE:FREQ=WEEKLY')).toBe('weekly')
  })

  it('converts weekly rule with day to "weekly on <day>"', () => {
    expect(formatRecurrence('RRULE:FREQ=WEEKLY;BYDAY=MO')).toBe('weekly on Monday')
  })

  it('converts monthly rule to "monthly"', () => {
    expect(formatRecurrence('RRULE:FREQ=MONTHLY')).toBe('monthly')
    expect(formatRecurrence('RRULE:FREQ=MONTHLY;BYMONTHDAY=1')).toBe('monthly on the 1st')
  })

  it('converts yearly rule to "yearly"', () => {
    expect(formatRecurrence('RRULE:FREQ=YEARLY')).toBe('yearly')
  })

  it('converts hourly rule to "hourly"', () => {
    expect(formatRecurrence('RRULE:FREQ=HOURLY')).toBe('hourly')
  })

  it('preserves multi-interval descriptions like "every 2 days"', () => {
    expect(formatRecurrence('RRULE:FREQ=DAILY;INTERVAL=2')).toBe('every 2 days')
  })

  it('handles null, undefined, or empty string gracefully', () => {
    expect(formatRecurrence(null)).toBe('')
    expect(formatRecurrence(undefined)).toBe('')
    expect(formatRecurrence('')).toBe('')
  })

  it('falls back to "recurring" on invalid string', () => {
    expect(formatRecurrence('invalid-rule')).toBe('recurring')
  })
})

