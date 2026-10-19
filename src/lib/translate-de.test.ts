import { describe, expect, it } from 'bun:test'
import { translateGermanTimeWithMap } from './translate-de'

describe('translateGermanTimeWithMap', () => {
  it('tracks character positions and allows reversing positions after translation', () => {
    // "heute" (0..5) -> "today" (0..5)
    // " " (5..6) -> " " (5..6)
    // "nachmittag" (6..16) -> "afternoon" (6..15)
    // " macht bingo" (16..28) -> " macht bingo" (15..27)
    const result = translateGermanTimeWithMap('heute nachmittag macht bingo')

    expect(result.text).toBe('today afternoon macht bingo')
    expect(result.changes).toHaveLength(2)

    expect(result.changes[0]).toEqual({
      origStart: 0,
      origEnd: 5,
      transStart: 0,
      transEnd: 5,
      origText: 'heute',
      transText: 'today',
      added: 5,
      removed: 5,
      diff: 0,
    })

    expect(result.changes[1]).toEqual({
      origStart: 6,
      origEnd: 16,
      transStart: 6,
      transEnd: 15,
      origText: 'nachmittag',
      transText: 'afternoon',
      added: 9,
      removed: 10,
      diff: -1,
    })

    // End of "afternoon" (index 15) -> end of "nachmittag" (index 16)
    expect(result.reverseIndex(15)).toBe(16)

    // Space after "afternoon" (index 16) -> space after "nachmittag" (index 17)
    expect(result.reverseIndex(16)).toBe(17)

    // End of "macht" (index 21) -> end of "macht" in original (index 22)
    expect(result.reverseIndex(21)).toBe(22)

    // End of string (index 27) -> end of original string (index 28)
    expect(result.reverseIndex(27)).toBe(28)
  })

  it('handles expanding replacements correctly', () => {
    // "ab" (0..2) -> "from" (0..4) (+2 diff)
    // " " (2..3) -> " " (4..5)
    // "montag" (3..9) -> "monday" (5..11)
    const result = translateGermanTimeWithMap('ab montag')
    expect(result.text).toBe('from monday')

    // End of "from" (index 4) -> end of "ab" (index 2)
    expect(result.reverseIndex(4)).toBe(2)

    // Space after "from" (index 5) -> space after "ab" (index 3)
    expect(result.reverseIndex(5)).toBe(3)

    // End of "monday" (index 11) -> end of "montag" (index 9)
    expect(result.reverseIndex(11)).toBe(9)
  })

  it('handles "uhr" clock replacements and maps positions accurately', () => {
    const result = translateGermanTimeWithMap('um 15 uhr start')
    expect(result.text).toBe('at 15:00 start')

    // "at" (0..2) -> "um" (0..2)
    expect(result.reverseIndex(2)).toBe(2)

    // "15:00" ends at 8 in translated -> "15 uhr" ends at 9 in original
    expect(result.reverseIndex(8)).toBe(9)

    // " start" ends at 14 in translated -> 15 in original
    expect(result.reverseIndex(14)).toBe(15)
  })

  it('handles dotted German date and 20uhr together with correct boundary mapping', () => {
    // "7.5." (0..4) -> "7 May" (0..5)
    // " " (4..5) -> " " (5..6)
    // "20uhr" (5..10) -> "20:00" (6..11)
    // " gaming" (10..17) -> " gaming" (11..18)
    const result = translateGermanTimeWithMap('7.5. 20uhr gaming')
    expect(result.text).toBe('7 May 20:00 gaming')

    // End of "7 May 20:00" (index 11) -> end of "7.5. 20uhr" in original (index 10)
    expect(result.reverseIndex(11)).toBe(10)
    expect('7.5. 20uhr gaming'.slice(0, result.reverseIndex(11))).toBe('7.5. 20uhr')
    expect('7.5. 20uhr gaming'.slice(result.reverseIndex(11)).trim()).toBe('gaming')
  })
})

