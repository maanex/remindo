#!/usr/bin/env bun
import { db } from '../src/db'
import { enrichMissingXkcdDetails } from '../src/services/xkcd'

console.log('--- XKCD Extra Context Enrichment ---')

const getCounts = () => ({
  extra: db.query<{ c: number }, []>('SELECT COUNT(*) as c FROM xkcd_comic WHERE extra IS NULL').get()?.c ?? 0,
  transcript: db.query<{ c: number }, []>('SELECT COUNT(*) as c FROM xkcd_comic WHERE transcript IS NULL OR length(transcript) = 0').get()?.c ?? 0,
})

const initial = getCounts()
console.log(`Comics missing explanations: ${initial.extra}`)
console.log(`Comics missing transcripts:  ${initial.transcript}`)

if (initial.extra === 0 && initial.transcript === 0) {
  console.log('All comics are already fully enriched!')
  process.exit(0)
}

const attempted = new Set<number>()
let totalEnriched = 0

while (true) {
  const processed = await enrichMissingXkcdDetails(25, 5, attempted)
  if (processed.length === 0) break

  for (const num of processed) {
    attempted.add(num)
  }

  totalEnriched += processed.length
  const current = getCounts()
  console.log(`Checked ${totalEnriched} comics (remaining without explanation: ${current.extra}, without transcript: ${current.transcript})...`)
}

const final = getCounts()
console.log(`Done! Enriched ${totalEnriched} comics. (Remaining: ${final.extra} without explanation, ${final.transcript} without transcript)`)
