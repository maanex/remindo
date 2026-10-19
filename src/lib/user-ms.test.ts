import { describe, expect, it } from 'bun:test'
import { userMs } from './user-ms'

describe('userMs', () => {
  const reference = new Date('2026-10-14T12:00:00Z')
  const second = 1000
  const minute = 60 * second
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  const cases: Array<{ input: string, expectedMs: number }> = [
    { input: '1s', expectedMs: second },
    { input: '10s', expectedMs: 10 * second },
    { input: '1 second', expectedMs: second },
    { input: '10 seconds', expectedMs: 10 * second },
    { input: '1m', expectedMs: minute },
    { input: '10m', expectedMs: 10 * minute },
    { input: '1 minute', expectedMs: minute },
    { input: '10 minutes', expectedMs: 10 * minute },
    { input: '1h', expectedMs: hour },
    { input: '10h', expectedMs: 10 * hour },
    { input: '1 hour', expectedMs: hour },
    { input: '10 hours', expectedMs: 10 * hour },
    { input: '1d', expectedMs: day },
    { input: '3d', expectedMs: 3 * day },
    { input: '1 day', expectedMs: day },
    { input: '3 days', expectedMs: 3 * day },
    { input: '1w', expectedMs: week },
    { input: '2w', expectedMs: 2 * week },
    { input: '1 week', expectedMs: week },
    { input: '2 weeks', expectedMs: 2 * week },
    { input: '1 month', expectedMs: 31 * day },
    { input: '2 months', expectedMs: 61 * day },
    { input: '1 year', expectedMs: 365 * day },
    { input: '2 years', expectedMs: 731 * day },
    { input: '1,5h', expectedMs: 1.5 * hour },
    { input: '1.5h', expectedMs: 1.5 * hour },
    { input: '0.5h', expectedMs: 0.5 * hour },
    { input: '1.25h', expectedMs: 1.25 * hour },
    { input: '2,5m', expectedMs: 2.5 * minute },
    { input: '0.5s', expectedMs: 0.5 * second },
    { input: '0.5d', expectedMs: 0.5 * day },
    { input: '1,5d', expectedMs: 1.5 * day },
    { input: '2.5 weeks', expectedMs: 2.5 * week },
    { input: '1.5h30m', expectedMs: 1.5 * hour + 30 * minute },
    { input: '1,5h30m', expectedMs: 1.5 * hour + 30 * minute },
    { input: '1h2,5m', expectedMs: hour + 2.5 * minute },
    { input: '1m20.5s', expectedMs: minute + 20.5 * second },
    { input: '0.5d12h', expectedMs: 0.5 * day + 12 * hour },
    { input: '1,5d6h30m', expectedMs: 1.5 * day + 6 * hour + 30 * minute },
    { input: '1.5w2d', expectedMs: 1.5 * week + 2 * day },
    { input: '1.25h15m30s', expectedMs: 1.25 * hour + 15 * minute + 30 * second },
    { input: '1h 22m 40s', expectedMs: hour + 22 * minute + 40 * second },
    { input: '1.5h 22m 40s', expectedMs: 1.5 * hour + 22 * minute + 40 * second },
    { input: '1h 22.5m 40.5s', expectedMs: hour + 22.5 * minute + 40.5 * second },
    { input: '1d 2h 30m 10s', expectedMs: day + 2 * hour + 30 * minute + 10 * second },
    { input: '1.5d 2h 30m 10s', expectedMs: 1.5 * day + 2 * hour + 30 * minute + 10 * second },
    { input: '1m20s', expectedMs: minute + 20 * second },
    { input: '1h30m', expectedMs: hour + 30 * minute },
    { input: '1d2h30m10s', expectedMs: day + 2 * hour + 30 * minute + 10 * second },
    { input: '1 h 20 m', expectedMs: hour + 20 * minute },
    { input: 'in 5m', expectedMs: 5 * minute },
    { input: 'in 2 hours', expectedMs: 2 * hour },
    { input: '  5m  ', expectedMs: 5 * minute },
    { input: '5 m', expectedMs: 5 * minute },
    { input: '5 minuten', expectedMs: 5 * minute },
    { input: '2 stunden', expectedMs: 2 * hour },
    { input: '3 tage', expectedMs: 3 * day },
    { input: '2 wochen', expectedMs: 2 * week },
    { input: '1 monat', expectedMs: 31 * day },
    { input: '1 jahr', expectedMs: 365 * day },
    { input: '0m', expectedMs: 0 },
    { input: '-5m', expectedMs: -5 * minute },
    { input: '', expectedMs: 0 },
    { input: 'not-a-duration', expectedMs: 0 },
  ]

  for (const testCase of cases) {
    it(`parses "${testCase.input}"`, () => {
      expect(userMs(testCase.input, reference)).toBe(testCase.expectedMs)
    })
  }

  it('uses calendar month arithmetic from the reference date', () => {
    const start = new Date('2026-01-31T12:00:00Z')
    const expected = new Date(start)
    expected.setMonth(expected.getMonth() + 1)

    expect(userMs('1 month', start)).toBe(expected.getTime() - start.getTime())
  })

  it('uses calendar year arithmetic across a leap day', () => {
    const start = new Date('2026-10-14T12:00:00Z')
    const expected = new Date(start)
    expected.setFullYear(expected.getFullYear() + 2)

    expect(userMs('2 years', start)).toBe(expected.getTime() - start.getTime())
  })
})
