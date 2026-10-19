export const DE_EN_DICT: Record<string, string> = {
  // Recurrence / Frequency
  jede: 'every',
  jeden: 'every',
  jedes: 'every',
  jeder: 'every',
  alle: 'every',
  aller: 'every',
  allen: 'every',
  taeglich: 'daily',
  taegliche: 'daily',
  taeglichen: 'daily',
  täglich: 'daily',
  tägliche: 'daily',
  täglichen: 'daily',
  woechentlich: 'weekly',
  wöchentlich: 'weekly',
  monatlich: 'monthly',
  jaehrlich: 'yearly',
  jährlich: 'yearly',

  // Days of week
  montag: 'monday',
  montags: 'mondays',
  dienstag: 'tuesday',
  dienstags: 'tuesdays',
  mittwoch: 'wednesday',
  mittwochs: 'wednesdays',
  donnerstag: 'thursday',
  donnerstags: 'thursdays',
  freitag: 'friday',
  freitags: 'fridays',
  samstag: 'saturday',
  samstags: 'saturdays',
  sonnabend: 'saturday',
  sonntag: 'sunday',
  sonntags: 'sundays',
  wochenende: 'weekend',

  // Relative days
  heute: 'today',
  morgen: 'tomorrow',
  uebermorgen: 'in 2 days',
  übermorgen: 'in 2 days',
  gestern: 'yesterday',
  jetzt: 'now',

  // Time units
  sekunde: 'second',
  sekunden: 'seconds',
  sek: 'sec',
  minute: 'minute',
  minuten: 'minutes',
  min: 'min',
  stunde: 'hour',
  stunden: 'hours',
  std: 'hours',
  tag: 'day',
  tage: 'days',
  tagen: 'days',
  woche: 'week',
  wochen: 'weeks',
  monat: 'month',
  monate: 'months',
  monaten: 'months',
  jahr: 'year',
  jahre: 'years',
  jahren: 'years',
  viertelstunde: '15 minutes',
  viertelstunden: '15 minutes',
  dreiviertelstunde: '45 minutes',
  dreiviertelstunden: '45 minutes',
  halbestunde: '30 minutes',
  halbestunden: '30 minutes',

  // Prepositions / Conjunctions / Modifiers
  um: 'at',
  am: 'on',
  an: 'on',
  im: 'in',
  in: 'in',
  ab: 'from',
  von: 'from',
  bis: 'until',
  vor: 'to',
  nach: 'past',
  und: 'and',
  naechste: 'next',
  naechsten: 'next',
  naechstes: 'next',
  naechster: 'next',
  nächste: 'next',
  nächsten: 'next',
  nächstes: 'next',
  nächster: 'next',
  kommende: 'next',
  kommenden: 'next',
  kommendes: 'next',

  // Clock / Fractional times
  dreiviertel: 'quarter to',
  viertel: 'quarter',
  halb: 'half',
  halbe: 'half',
  halben: 'half',

  // Numbers
  null: 'zero',
  eins: 'one',
  ein: 'one',
  eine: 'one',
  einer: 'one',
  einem: 'one',
  einen: 'one',
  zwei: 'two',
  zwo: 'two',
  drei: 'three',
  vier: 'four',
  fünf: 'five',
  fuenf: 'five',
  sechs: 'six',
  sieben: 'seven',
  acht: 'eight',
  neun: 'nine',
  zehn: 'ten',
  elf: 'eleven',
  zwölf: 'twelve',
  zwoelf: 'twelve',
  dreizehn: 'thirteen',
  vierzehn: 'fourteen',
  fünfzehn: 'fifteen',
  fuenfzehn: 'fifteen',
  sechzehn: 'sixteen',
  siebzehn: 'seventeen',
  achtzehn: 'eighteen',
  neunzehn: 'nineteen',
  zwanzig: 'twenty',

  // Time of day
  mittag: 'noon',
  mittags: 'noon',
  mitternacht: 'midnight',
  morgens: 'morning',
  vormittag: 'morning',
  vormittags: 'morning',
  nachmittag: 'afternoon',
  nachmittags: 'afternoon',
  abend: 'evening',
  abends: 'evening',
  nacht: 'night',
  nachts: 'night',
}

export type TextChange = {
  origStart: number
  origEnd: number
  transStart: number
  transEnd: number
  origText: string
  transText: string
  added: number
  removed: number
  diff: number
}

export type TranslatedGermanTimeResult = {
  text: string
  changes: TextChange[]
  reverseIndex: (transIndex: number) => number
  forwardIndex: (origIndex: number) => number
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function translateGermanTimeWithMap(input: string): TranslatedGermanTimeResult {
  let transText = ''
  const changes: TextChange[] = []
  let i = 0

  while (i < input.length) {
    const isWordStart = i === 0 || !/[\p{L}\d:]/u.test(input[i - 1]!)

    // 1. German numeric dates: e.g. "7.5." or "4.11." or "4.11.2027"
    if (isWordStart) {
      const dateMatch = input.slice(i).match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\.?(?=\s|$)/)
      if (dateMatch) {
        const day = Number(dateMatch[1])
        const month = Number(dateMatch[2])
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          const matchStr = dateMatch[0]!
          const origStart = i
          const origEnd = i + matchStr.length
          const year = dateMatch[3] ? ` ${dateMatch[3]}` : ''
          const replacement = `${day} ${MONTH_NAMES[month - 1]}${year}`
          const transStart = transText.length
          const transEnd = transStart + replacement.length

          changes.push({
            origStart,
            origEnd,
            transStart,
            transEnd,
            origText: matchStr,
            transText: replacement,
            added: replacement.length,
            removed: matchStr.length,
            diff: replacement.length - matchStr.length,
          })

          transText += replacement
          i = origEnd
          continue
        }
      }
    }

    // 2. Clock notation: (\d+)\s*uhr(?!\p{L})
    const uhrMatch = isWordStart ? input.slice(i).match(/^(\d+)\s*uhr(?!\p{L})/iu) : null
    if (uhrMatch) {
      const matchStr = uhrMatch[0]!
      const origStart = i
      const origEnd = i + matchStr.length
      const replacement = `${uhrMatch[1]}:00`
      const transStart = transText.length
      const transEnd = transStart + replacement.length

      changes.push({
        origStart,
        origEnd,
        transStart,
        transEnd,
        origText: matchStr,
        transText: replacement,
        added: replacement.length,
        removed: matchStr.length,
        diff: replacement.length - matchStr.length,
      })

      transText += replacement
      i = origEnd
      continue
    }

    // 2. Word tokens
    const wordMatch = input.slice(i).match(/^\p{L}+/u)
    if (wordMatch) {
      const word = wordMatch[0]!
      const origStart = i
      const origEnd = i + word.length
      const clean = word.toLowerCase()
      const translation = DE_EN_DICT[clean]

      if (translation !== undefined) {
        const transStart = transText.length
        const transEnd = transStart + translation.length

        changes.push({
          origStart,
          origEnd,
          transStart,
          transEnd,
          origText: word,
          transText: translation,
          added: translation.length,
          removed: word.length,
          diff: translation.length - word.length,
        })

        transText += translation
        i = origEnd
        continue
      } else {
        transText += word
        i = origEnd
        continue
      }
    }

    // 3. Characters outside words (spaces, punctuation, digits not followed by uhr)
    transText += input[i]
    i++
  }

  function reverseIndex(transIndex: number): number {
    if (changes.length === 0) return transIndex
    if (transIndex <= changes[0]!.transStart) return transIndex
    const last = changes[changes.length - 1]!
    if (transIndex >= last.transEnd) {
      return last.origEnd + (transIndex - last.transEnd)
    }

    for (let j = 0; j < changes.length; j++) {
      const c = changes[j]!
      if (transIndex >= c.transStart && transIndex <= c.transEnd) {
        if (c.transEnd === c.transStart) return c.origStart
        const ratio = (transIndex - c.transStart) / (c.transEnd - c.transStart)
        return Math.round(c.origStart + ratio * (c.origEnd - c.origStart))
      }
      if (j < changes.length - 1) {
        const next = changes[j + 1]!
        if (transIndex > c.transEnd && transIndex < next.transStart) {
          return c.origEnd + (transIndex - c.transEnd)
        }
      }
    }
    return transIndex
  }

  function forwardIndex(origIndex: number): number {
    if (changes.length === 0) return origIndex
    if (origIndex <= changes[0]!.origStart) return origIndex
    const last = changes[changes.length - 1]!
    if (origIndex >= last.origEnd) {
      return last.transEnd + (origIndex - last.origEnd)
    }

    for (let j = 0; j < changes.length; j++) {
      const c = changes[j]!
      if (origIndex >= c.origStart && origIndex <= c.origEnd) {
        if (c.origEnd === c.origStart) return c.transStart
        const ratio = (origIndex - c.origStart) / (c.origEnd - c.origStart)
        return Math.round(c.transStart + ratio * (c.transEnd - c.transStart))
      }
      if (j < changes.length - 1) {
        const next = changes[j + 1]!
        if (origIndex > c.origEnd && origIndex < next.origStart) {
          return c.transEnd + (origIndex - c.origEnd)
        }
      }
    }
    return origIndex
  }

  return {
    text: transText,
    changes,
    reverseIndex,
    forwardIndex,
  }
}

export function translateGermanTime(input: string): string {
  return translateGermanTimeWithMap(input).text
}

