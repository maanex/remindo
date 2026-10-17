function levenshtein(a: string, b: string): number {
  const an = a.length
  const bn = b.length
  if (an === 0) return bn
  if (bn === 0) return an

  const matrix: number[][] = []
  for (let i = 0; i <= bn; i++) matrix[i] = [i]
  for (let j = 0; j <= an; j++) matrix[0]![j] = j

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1,     // deletion
        )
      }
    }
  }

  return matrix[bn]![an]!
}

const DE_EN_DICT: Record<string, string> = {
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

  // Prepositions / Conjunctions / Modifiers
  um: 'at',
  am: 'on',
  an: 'on',
  im: 'in',
  in: 'in',
  ab: 'from',
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

function findFuzzyMatch(word: string): string | null {
  if (DE_EN_DICT[word]) return DE_EN_DICT[word]
  if (word.length < 3) return null

  let bestKey = ''
  let minDistance = Infinity

  for (const key of Object.keys(DE_EN_DICT)) {
    const dist = levenshtein(word, key)
    const maxAllowed = key.length <= 4 ? 1 : 2

    if (dist <= maxAllowed && dist < minDistance) {
      minDistance = dist
      bestKey = key
    }
  }

  return bestKey ? DE_EN_DICT[bestKey]! : null
}

export function translateGermanTime(input: string): string {
  // Convert German time notation like "15 uhr" -> "15:00"
  let text = input.replace(/(\d+)\s*uhr/gi, '$1:00')

  const tokens = text.split(/\s+/)
  const translated = tokens.map(token => {
    // Strip surrounding punctuation for matching
    const clean = token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    if (!clean) return token

    const match = findFuzzyMatch(clean)
    return match ?? token
  })

  return translated.join(' ')
}

