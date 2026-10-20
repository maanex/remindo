import { db, type XkcdComic } from '../db'
import { truncateString } from '../lib/text'

export interface XkcdApiResponse {
  month: string
  num: number
  link: string
  year: string
  news: string
  safe_title: string
  transcript: string
  alt: string
  img: string
  title: string
  day: string
  extra?: string
}

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO xkcd_comic (
    num, title, safe_title, img, alt, transcript, year, month, day, link, news, extra
  ) VALUES (
    $num, $title, $safe_title, $img, $alt, $transcript, $year, $month, $day, $link, $news, $extra
  )
`)

export function saveXkcdComic(comic: XkcdComic) {
  insertStmt.run({
    $num: comic.num,
    $title: comic.title,
    $safe_title: comic.safe_title,
    $img: comic.img,
    $alt: comic.alt,
    $transcript: comic.transcript ?? null,
    $year: comic.year ?? null,
    $month: comic.month ?? null,
    $day: comic.day ?? null,
    $link: comic.link ?? null,
    $news: comic.news ?? null,
    $extra: comic.extra ?? null,
  })
}

export function saveXkcdComics(comics: XkcdComic[]) {
  if (comics.length === 0) return
  const tx = db.transaction((items: XkcdComic[]) => {
    for (const c of items) {
      saveXkcdComic(c)
    }
  })
  tx(comics)
}

export function getXkcdComicByNum(num: number): XkcdComic | null {
  if (!num || isNaN(num) || num <= 0) return null
  return db.query<XkcdComic, [number]>('SELECT * FROM xkcd_comic WHERE num = ?').get(num) ?? null
}

export function getLatestLocalComic(): XkcdComic | null {
  return db.query<XkcdComic, []>('SELECT * FROM xkcd_comic ORDER BY num DESC LIMIT 1').get() ?? null
}

export function getLocalComicCount(): number {
  const row = db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM xkcd_comic').get()
  return row?.count ?? 0
}

export async function fetchXkcdFromApi(num?: number, timeoutMs = 8_000): Promise<XkcdComic | null> {
  const url = num ? `https://xkcd.com/${num}/info.0.json` : 'https://xkcd.com/info.0.json'

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CluelessBot/1.0 (https://github.com/cluelessbot)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (res.status === 404) return null
    if (!res.ok) {
      console.warn(`[XKCD] API request to ${url} returned status ${res.status}`)
      return null
    }

    const data = (await res.json()) as XkcdApiResponse
    const comic: XkcdComic = {
      num: data.num,
      title: data.title,
      safe_title: data.safe_title,
      img: data.img,
      alt: data.alt,
      transcript: data.transcript || null,
      year: data.year || null,
      month: data.month || null,
      day: data.day || null,
      link: data.link || null,
      news: data.news || null,
      extra: data.extra || null,
    }

    saveXkcdComic(comic)

    // Asynchronously enrich with ExplainXKCD if transcript/extra is missing
    if (!comic.transcript) {
      enrichComicWithExplainXkcd(comic).catch(() => {})
    }

    return comic
  } catch (err: any) {
    // Network or timeout failure
    return null
  }
}

export function searchXkcdLocal(query: string, limit = 25): XkcdComic[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return db.query<XkcdComic, [number]>('SELECT * FROM xkcd_comic ORDER BY num DESC LIMIT ?').all(limit)
  }

  const results: XkcdComic[] = []
  const seenIds = new Set<number>()

  // 1. If query is or contains a pure number (e.g. "327" or "#327" or "xkcd 327")
  const numMatches = trimmed.match(/(?:^|\b|#)(\d+)\b/g)
  if (numMatches) {
    for (const match of numMatches) {
      const parsedNum = parseInt(match.replace('#', ''), 10)
      if (parsedNum > 0) {
        const comic = getXkcdComicByNum(parsedNum)
        if (comic && !seenIds.has(comic.num)) {
          results.push(comic)
          seenIds.add(comic.num)
        }
      }
    }
  }

  // 2. Exact or prefix comic number matching (e.g. typing "32" in autocomplete finds 32, 320, 321, ...)
  if (/^\d+$/.test(trimmed)) {
    const numPrefixRows = db.query<XkcdComic, [string, number]>(`
      SELECT * FROM xkcd_comic
      WHERE CAST(num AS TEXT) LIKE ?
      ORDER BY num ASC
      LIMIT ?
    `).all(`${trimmed}%`, limit)

    for (const row of numPrefixRows) {
      if (!seenIds.has(row.num)) {
        results.push(row)
        seenIds.add(row.num)
      }
    }
  }

  // 3. Exact title match (case-insensitive)
  const exactTitleRows = db.query<XkcdComic, [string, string, number]>(`
    SELECT * FROM xkcd_comic
    WHERE LOWER(title) = LOWER(?) OR LOWER(safe_title) = LOWER(?)
    LIMIT ?
  `).all(trimmed, trimmed, limit)

  for (const row of exactTitleRows) {
    if (!seenIds.has(row.num)) {
      results.push(row)
      seenIds.add(row.num)
    }
  }

  // 4. Title starts with query
  const titlePrefixRows = db.query<XkcdComic, [string, string, number]>(`
    SELECT * FROM xkcd_comic
    WHERE LOWER(title) LIKE LOWER(?) OR LOWER(safe_title) LIKE LOWER(?)
    LIMIT ?
  `).all(`${trimmed}%`, `${trimmed}%`, limit)

  for (const row of titlePrefixRows) {
    if (!seenIds.has(row.num)) {
      results.push(row)
      seenIds.add(row.num)
    }
  }

  // 5. Title contains query
  const titleContainsRows = db.query<XkcdComic, [string, string, number]>(`
    SELECT * FROM xkcd_comic
    WHERE LOWER(title) LIKE LOWER(?) OR LOWER(safe_title) LIKE LOWER(?)
    LIMIT ?
  `).all(`%${trimmed}%`, `%${trimmed}%`, limit)

  for (const row of titleContainsRows) {
    if (!seenIds.has(row.num)) {
      results.push(row)
      seenIds.add(row.num)
    }
  }

  // 6. FTS5 ranked search (covers title, safe_title, alt text, and transcript)
  const cleanTokens = trimmed
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (cleanTokens.length > 0 && results.length < limit) {
    try {
      const ftsQuery = cleanTokens.map(token => `"${token}"*`).join(' ')
      const ftsRows = db.query<XkcdComic, [string, number]>(`
        SELECT x.* FROM xkcd_comic_fts f
        JOIN xkcd_comic x ON x.num = f.rowid
        WHERE xkcd_comic_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit)

      for (const row of ftsRows) {
        if (!seenIds.has(row.num)) {
          results.push(row)
          seenIds.add(row.num)
        }
      }
    } catch {
      // If FTS syntax error occurs on unusual characters, ignore and keep existing results
    }
  }

  return results.slice(0, limit)
}

export async function searchExplainXkcd(query: string, limit = 5, timeoutMs = 2500): Promise<number[]> {
  try {
    const url = new URL('https://www.explainxkcd.com/wiki/api.php')
    url.searchParams.set('action', 'query')
    url.searchParams.set('list', 'search')
    url.searchParams.set('srsearch', query)
    url.searchParams.set('srlimit', String(limit))
    url.searchParams.set('srnamespace', '0')
    url.searchParams.set('format', 'json')

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'CluelessBot/1.0 (https://github.com/cluelessbot)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) return []
    const data = (await res.json()) as any
    const searchItems: Array<{ title: string; snippet?: string }> = data?.query?.search ?? []

    const nums: number[] = []
    const seen = new Set<number>()

    for (const item of searchItems) {
      // 1. Direct title pattern "327: Exploits of a Mom"
      const titleMatch = item.title.match(/^(\d+):/)
      if (titleMatch) {
        const num = parseInt(titleMatch[1]!, 10)
        if (num > 0 && !seen.has(num)) {
          seen.add(num)
          nums.push(num)
          continue
        }
      }

      // 2. Redirect or wikilink snippet, e.g. "[[327: Exploits of a Mom]]" or "comic 327"
      if (item.snippet) {
        const snippetMatch = item.snippet.match(/(?:#REDIRECT\s*\[\[|\[\[|comic\s*|#)(\d{1,4})(?::|\b)/i)
        if (snippetMatch) {
          const num = parseInt(snippetMatch[1]!, 10)
          if (num > 0 && !seen.has(num)) {
            seen.add(num)
            nums.push(num)
            continue
          }
        }
      }
    }

    return nums
  } catch {
    return []
  }
}

export function cleanWikitext(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/\[\[Category:[^\]]+\]\]/gi, '')
    .replace(/\[\[File:[^\]]+\]\]/gi, '')
    .replace(/\[\[Image:[^\]]+\]\]/gi, '')
    .replace(/\[\[([^\]]+)\]\]/g, (_, inner) => inner.split('|').pop() ?? '')
    .replace(/'{2,3}/g, '')
    .replace(/==+[^=]+==+/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function fetchExplainXkcdDetails(num: number, title?: string, timeoutMs = 8_000): Promise<{ explanation?: string; transcript?: string } | null> {
  try {
    const url = new URL('https://www.explainxkcd.com/wiki/api.php')
    url.searchParams.set('action', 'parse')
    url.searchParams.set('page', title ? `${num}: ${title}` : String(num))
    url.searchParams.set('redirects', '1')
    url.searchParams.set('prop', 'wikitext')
    url.searchParams.set('format', 'json')

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'CluelessBot/1.0 (https://github.com/cluelessbot)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) return null
    const data = (await res.json()) as any
    const wikitext = data?.parse?.wikitext?.['*']
    if (!wikitext || typeof wikitext !== 'string') return null

    // Extract Explanation
    let explanation: string | undefined = undefined
    const expMatch = wikitext.match(/==\s*Explanation\s*==([\s\S]*?)(?:==\s*(?:Transcript|Trivia|Discussion|References)|\{\{|$)/i)
    if (expMatch && expMatch[1]) {
      const cleaned = cleanWikitext(expMatch[1])
      if (cleaned) {
        explanation = truncateString(cleaned, 2500)
      }
    }

    // Extract Transcript
    let transcript: string | undefined = undefined
    const trMatch = wikitext.match(/==\s*Transcript\s*==([\s\S]*?)(?:==\s*(?:Explanation|Trivia|Discussion|References)|\{\{|$)/i)
    if (trMatch && trMatch[1]) {
      const cleaned = cleanWikitext(trMatch[1])
      if (cleaned) {
        transcript = truncateString(cleaned, 2500)
      }
    }

    return { explanation, transcript }
  } catch {
    return null
  }
}

export async function enrichComicWithExplainXkcd(comic: XkcdComic): Promise<XkcdComic> {
  if (comic.extra !== null && comic.extra !== undefined && comic.transcript) return comic

  const details = await fetchExplainXkcdDetails(comic.num, comic.title, 6_000)

  let changed = false
  if (comic.extra === null || comic.extra === undefined) {
    comic.extra = details?.explanation ?? ''
    changed = true
  }
  if (!comic.transcript && details?.transcript) {
    comic.transcript = details.transcript
    changed = true
  }

  if (changed) {
    saveXkcdComic(comic)
  }

  return comic
}

export async function resolveBestXkcd(input: string): Promise<XkcdComic | null> {
  const trimmed = input.trim()
  if (!trimmed) return null

  // 1. Direct number check
  const numOnlyMatch = trimmed.match(/^#?(\d+)$/)
  if (numOnlyMatch) {
    const num = parseInt(numOnlyMatch[1]!, 10)
    const local = getXkcdComicByNum(num)
    if (local) return local
    return await fetchXkcdFromApi(num)
  }

  // 2. Search local database
  const localResults = searchXkcdLocal(trimmed, 5)
  if (localResults.length > 0) {
    return localResults[0]!
  }

  // 3. Fallback to ExplainXKCD search online if local DB didn't find anything
  const remoteNums = await searchExplainXkcd(trimmed, 3, 5000)
  for (const num of remoteNums) {
    const local = getXkcdComicByNum(num)
    if (local) return local
    const fetched = await fetchXkcdFromApi(num)
    if (fetched) return fetched
  }

  // 4. Check for keywords like "latest", "newest", "current"
  if (/^(latest|newest|current|today)$/i.test(trimmed)) {
    const fetched = await fetchXkcdFromApi()
    if (fetched) return fetched
    return getLatestLocalComic()
  }

  return null
}

export async function autocompleteXkcd(input: string): Promise<Array<{ name: string; value: string }>> {
  const trimmed = input.trim()

  let matches: XkcdComic[] = []

  if (!trimmed) {
    matches = searchXkcdLocal('', 25)
  } else {
    matches = searchXkcdLocal(trimmed, 25)

    // If local search found very few results, try ExplainXKCD with a brief timeout
    if (matches.length < 5) {
      const remoteNums = await searchExplainXkcd(trimmed, 5, 1200)
      for (const num of remoteNums) {
        if (!matches.some(m => m.num === num)) {
          let comic = getXkcdComicByNum(num)
          if (!comic) {
            comic = await fetchXkcdFromApi(num, 1200)
          }
          if (comic) {
            matches.push(comic)
          }
        }
      }
    }
  }

  return matches.slice(0, 25).map(c => {
    const yearStr = c.year ? ` (${c.year})` : ''
    const label = `#${c.num}: ${c.title}${yearStr}`
    return {
      name: truncateString(label, 100),
      value: String(c.num),
    }
  })
}

export async function enrichMissingXkcdDetails(batchLimit = 50, concurrency = 5, excludeNums?: Set<number>): Promise<number[]> {
  // Prioritize comics lacking transcripts (newer comics), then those lacking explanations
  const allCandidates = db.query<{ num: number }, []>(`
    SELECT num FROM xkcd_comic
    WHERE extra IS NULL OR (transcript IS NULL OR length(transcript) = 0)
    ORDER BY (CASE WHEN transcript IS NULL OR length(transcript) = 0 THEN 0 ELSE 1 END) ASC, num DESC
  `).all()

  const rows = (excludeNums ? allCandidates.filter(r => !excludeNums.has(r.num)) : allCandidates).slice(0, batchLimit)

  if (rows.length === 0) return []

  const processedNums: number[] = []

  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency)
    await Promise.all(
      chunk.map(async r => {
        processedNums.push(r.num)
        const comic = getXkcdComicByNum(r.num)
        if (comic) {
          await enrichComicWithExplainXkcd(comic)
        }
      })
    )
    // Polite delay between batches for ExplainXKCD MediaWiki API
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  return processedNums
}

export async function syncXkcd(batchSize = 20): Promise<void> {
  const latest = await fetchXkcdFromApi(undefined, 10_000)
  if (!latest) {
    console.warn('[XKCD] Could not fetch latest comic info, skipping sync.')
    return
  }

  const existingRows = db.query<{ num: number }, []>('SELECT num FROM xkcd_comic').all()
  const existingSet = new Set(existingRows.map(r => r.num))

  const missing: number[] = []
  for (let i = 1; i <= latest.num; i++) {
    if (i === 404) continue // Comic 404 intentionally returns 404
    if (!existingSet.has(i)) {
      missing.push(i)
    }
  }

  if (missing.length === 0) {
    console.log(`[XKCD] Comics are up to date (total: ${existingSet.size}).`)
    return
  }

  console.log(`[XKCD] Found ${missing.length} missing comics to fetch (latest: #${latest.num}). Starting sync...`)

  for (let i = 0; i < missing.length; i += batchSize) {
    const chunk = missing.slice(i, i + batchSize)
    const fetchedComics = await Promise.all(
      chunk.map(num => fetchXkcdFromApi(num, 8_000))
    )
    const valid = fetchedComics.filter((c): c is XkcdComic => c !== null)
    saveXkcdComics(valid)

    // Log progress periodically
    if ((i + batchSize) % 200 === 0 || i + batchSize >= missing.length) {
      console.log(`[XKCD] Synced ${Math.min(i + batchSize, missing.length)}/${missing.length} comics...`)
    }

    // Small delay between batches to be respectful to xkcd servers
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  console.log(`[XKCD] Sync complete. Total comics in DB: ${getLocalComicCount()}.`)
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null

export function initXkcd() {
  console.log(`[XKCD] Initializing. Current local comics: ${getLocalComicCount()}`)

  // Start initial sync in background
  syncXkcd().catch(err => {
    console.error('[XKCD] Background sync failed:', err)
  })

  // Schedule periodic sync every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000
  if (syncTimeout) clearInterval(syncTimeout)
  syncTimeout = setInterval(() => {
    syncXkcd().catch(err => console.error('[XKCD] Periodic sync failed:', err))
  }, SIX_HOURS)
}

