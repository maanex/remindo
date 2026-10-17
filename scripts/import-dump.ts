import { Database } from 'bun:sqlite'
import * as fs from 'fs'
import * as path from 'path'
import { initSchema } from '../src/db/schema'

/**
 * Calculates days from 1970-01-01 for any Gregorian civil calendar date.
 * Based on Howard Hinnant's algorithm; supports arbitrary years beyond 9999.
 */
function daysFromCivil(y: bigint, m: bigint, d: bigint): bigint {
  y -= m <= 2n ? 1n : 0n
  const era = (y >= 0n ? y : y - 399n) / 400n
  const yoe = y - era * 400n
  const doy = (153n * (m > 2n ? m - 3n : m + 9n) + 2n) / 5n + d - 1n
  const doe = yoe * 365n + yoe / 4n - yoe / 100n + doy
  return era * 146097n + doe - 719468n
}

/**
 * Parses ISO 8601 / Java ZonedDateTime strings into UTC millisecond timestamps,
 * including formats with timezone offsets (+02:00) and years > 9999 (e.g. +7274749).
 */
export function parseIsoToEpochMs(isoStr: string): bigint {
  const clean = isoStr.replace(/\[.*\]$/, '').trim()
  const m = clean.match(/^([+-]?\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(?:([+-]\d{2}):(\d{2}))?$/)
  if (!m) {
    throw new Error(`Failed to parse timestamp: ${isoStr}`)
  }

  const [_, yStr, moStr, dStr, hStr, miStr, sStr, fracStr, tzSign, tzMi] = m
  const y = BigInt(yStr!)
  const mo = BigInt(moStr!)
  const d = BigInt(dStr!)
  const h = BigInt(hStr!)
  const mi = BigInt(miStr!)
  const s = BigInt(sStr ?? '0')

  let ms = 0n
  if (fracStr) {
    const padded = fracStr.padEnd(3, '0').slice(0, 3)
    ms = BigInt(padded)
  }

  let totalMinutes = h * 60n + mi
  if (tzSign && tzMi) {
    const tzH = BigInt(tzSign.slice(0, 3))
    const tzM = BigInt(tzMi) * (tzSign[0] === '-' ? -1n : 1n)
    totalMinutes -= (tzH * 60n + tzM)
  }

  const days = daysFromCivil(y, mo, d)
  return days * 86400000n + totalMinutes * 60000n + s * 1000n + ms
}

/**
 * Unescapes a MySQL / MariaDB dump string literal.
 */
export function unescapeMySqlString(str: string): string {
  if (str.startsWith("'") && str.endsWith("'")) {
    str = str.slice(1, -1)
  }
  let result = ''
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\' && i + 1 < str.length) {
      i++
      const next = str[i]
      switch (next) {
        case "'": result += "'"; break
        case '"': result += '"'; break
        case '\\': result += '\\'; break
        case 'n': result += '\n'; break
        case 'r': result += '\r'; break
        case 't': result += '\t'; break
        case '0': result += '\0'; break
        case 'Z': result += '\x1a'; break
        default: result += next; break
      }
    } else {
      result += str[i]
    }
  }
  return result
}

export type DumpReminder = {
  id: string
  channel_id: string
  message_id: string
  user_id: string
  timeStr: string
  timeMs: bigint
  content: string | null
  createdAt: number
}

/**
 * Parses raw text from a MariaDB / MySQL dump containing the `reminders` table.
 */
export function parseDumpContent(content: string): DumpReminder[] {
  const reminders: DumpReminder[] = []

  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('(')) continue

    const clean = trimmed.replace(/[,;]$/, '')
    const regex = /^\((\d+),\s*(\d+),\s*(\d+),\s*(-?\d+),\s*'([^']*)',\s*(.*)\)$/s
    const match = clean.match(regex)
    if (!match) continue

    const [_, id, channel_id, message_id, user_id, timeStr, rawContent] = match

    const unescaped = unescapeMySqlString(rawContent!).trim()
    const contentText = unescaped.length > 0 ? unescaped : null
    const timeMs = parseIsoToEpochMs(timeStr!)

    // Derive Discord snowflake creation timestamp (epoch starts at 2015-01-01)
    const createdAt = Number(BigInt(message_id!) >> 22n) + 1420070400000

    reminders.push({
      id: id!,
      channel_id: channel_id!,
      message_id: message_id!,
      user_id: user_id!,
      timeStr: timeStr!,
      timeMs,
      content: contentText,
      createdAt,
    })
  }

  return reminders
}

/**
 * Robust fetch wrapper handling Discord API rate limiting (HTTP 429).
 */
export async function fetchWithRateLimit(url: string, token: string, retries = 5): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'CluelessBot-Importer/1.0',
      },
    })

    if (res.status === 429) {
      let delayMs = 1000
      const retryAfterHeader = res.headers.get('retry-after')
      if (retryAfterHeader) {
        delayMs = Math.ceil(parseFloat(retryAfterHeader) * 1000) + 100
      } else {
        try {
          const body: any = await res.json()
          if (body.retry_after) {
            delayMs = Math.ceil(body.retry_after * 1000) + 100
          }
        } catch (_) {}
      }
      console.warn(`⏳ Rate limited by Discord API, waiting ${delayMs}ms before retry...`)
      await new Promise(r => setTimeout(r, delayMs))
      continue
    }

    return res
  }

  throw new Error(`Exceeded maximum retries for ${url}`)
}

export type DiscordMessageDetails = {
  authorId?: string
  isAuthorBot?: boolean
  plusReactionUserIds?: string[]
}

const inaccessibleChannels = new Set<string>()

/**
 * Fetches message details and all non-bot users who reacted with ➕ via Discord REST API.
 */
export async function fetchDiscordMessageDetails(
  channelId: string,
  messageId: string,
  token: string
): Promise<DiscordMessageDetails | null> {
  // If the bot lacks access to this channel, avoid hitting Discord API and causing rate limits
  if (inaccessibleChannels.has(channelId)) {
    return null
  }

  try {
    const msgRes = await fetchWithRateLimit(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      token
    )

    if (msgRes.status === 403) {
      inaccessibleChannels.add(channelId)
      console.warn(`⚠️  Channel ${channelId}: 403 Missing Access. Skipping Discord lookups for this channel.`)
      return null
    }

    if (!msgRes.ok) {
      return null
    }

    const msg: any = await msgRes.json()
    const authorId = msg.author?.id
    const isAuthorBot = Boolean(msg.author?.bot)

    const plusReactionUserIds: string[] = []
    const hasPlusReaction = msg.reactions?.some(
      (r: any) => (r.emoji?.name === '➕' || r.emoji?.name === '\u2795') && r.count > 0
    )

    if (hasPlusReaction) {
      const emoji = encodeURIComponent('➕')
      let after: string | undefined = undefined

      while (true) {
        const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${emoji}`)
        url.searchParams.set('limit', '100')
        if (after) {
          url.searchParams.set('after', after)
        }

        const reactRes = await fetchWithRateLimit(url.toString(), token)
        if (!reactRes.ok) break

        const users: any[] = await reactRes.json()
        if (!Array.isArray(users) || users.length === 0) break

        for (const u of users) {
          if (!u.bot && u.id) {
            plusReactionUserIds.push(u.id)
          }
        }

        if (users.length < 100) break
        after = users[users.length - 1].id
      }
    }

    return {
      authorId,
      isAuthorBot,
      plusReactionUserIds,
    }
  } catch (err: any) {
    console.warn(`⚠️ Error fetching Discord message details for ${messageId}: ${err.message}`)
    return null
  }
}

export type ImportOptions = {
  discordToken?: string
  fetchDetails?: (channelId: string, messageId: string) => Promise<DiscordMessageDetails | null>
  concurrency?: number
}

/**
 * Imports parsed reminders into the SQLite database.
 * Automatically subscribes the author and fetches all non-bot users who reacted with ➕.
 */
export async function importRemindersToSqlite(
  db: Database,
  reminders: DumpReminder[],
  options: ImportOptions = {}
): Promise<{ importedReminders: number; importedSubs: number }> {
  initSchema(db)

  const fetcher = options.fetchDetails ?? (
    options.discordToken
      ? (channelId: string, messageId: string) => fetchDiscordMessageDetails(channelId, messageId, options.discordToken!)
      : undefined
  )

  const insertReminder = db.prepare(`
    INSERT OR REPLACE INTO reminder (id, time, title, channel_id, guild_id, source_id, rrule, snooze_count, created_at, triggered_at)
    VALUES ($id, $time, $title, $channel_id, $guild_id, $source_id, $rrule, $snooze_count, $created_at, $triggered_at)
  `)

  const insertSub = db.prepare(`
    INSERT OR IGNORE INTO reminder_sub (reminder_id, user_id)
    VALUES ($reminder_id, $user_id)
  `)

  // Step 1: Collect subscribers for each reminder (fetching from Discord API where available)
  const subscribersMap = new Map<string, Set<string>>()
  const concurrency = options.concurrency ?? 5

  console.log(`🔍 Resolving subscribers (author + ➕ reactions)...`)
  for (let i = 0; i < reminders.length; i += concurrency) {
    const chunk = reminders.slice(i, i + concurrency)
    await Promise.all(
      chunk.map(async item => {
        const subs = new Set<string>()

        // 1. Author from dump if available
        if (item.user_id && item.user_id !== '-1') {
          subs.add(item.user_id)
        }

        // 2. Fetch linked Discord message details if fetcher is configured
        if (fetcher) {
          const details = await fetcher(item.channel_id, item.message_id)
          if (details) {
            // Automatically sub the author (if not a bot)
            if (details.authorId && !details.isAuthorBot) {
              subs.add(details.authorId)
            }

            // Sub all non-bot users who reacted with ➕
            if (details.plusReactionUserIds) {
              for (const uid of details.plusReactionUserIds) {
                subs.add(uid)
              }
            }
          }
        }

        // 3. Fallback if still empty (e.g. user_id was -1 and message was inaccessible)
        if (subs.size === 0) {
          const mention = item.content?.match(/<@!?(\d+)>/)
          if (mention && mention[1]) {
            subs.add(mention[1])
          } else if (item.user_id) {
            subs.add(item.user_id)
          }
        }

        subscribersMap.set(item.id, subs)
      })
    )

    const progress = Math.min(i + concurrency, reminders.length)
    if (progress % 20 === 0 || progress === reminders.length) {
      console.log(`   Progress: ${progress}/${reminders.length} reminders checked`)
    }
  }

  // Step 2: Write all reminders and subscriptions in a single atomic transaction
  let importedReminders = 0
  let importedSubs = 0

  const importTx = db.transaction(() => {
    for (const item of reminders) {
      insertReminder.run({
        $id: item.id,
        $time: item.timeMs,
        $title: item.content,
        $channel_id: item.channel_id,
        $guild_id: null,
        $source_id: item.message_id,
        $rrule: null,
        $snooze_count: 0,
        $created_at: item.createdAt,
        $triggered_at: null,
      })
      importedReminders++

      const subs = subscribersMap.get(item.id) || new Set<string>()
      for (const sub of subs) {
        insertSub.run({
          $reminder_id: item.id,
          $user_id: sub,
        })
        importedSubs++
      }
    }
  })

  importTx()

  return { importedReminders, importedSubs }
}

// CLI Execution
if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: bun run scripts/import-dump.ts [dumpFile] [sqliteDbPath] [--token <token>]`)
    console.log(`Defaults:`)
    console.log(`  dumpFile:     dbdump.txt`)
    console.log(`  sqliteDbPath: process.env.DATABASE_URL or sqlite.db`)
    console.log(`  token:        process.env.DISCORD_API_KEY`)
    process.exit(0)
  }

  let token = process.env.DISCORD_API_KEY || process.env.DISCORD_TOKEN
  const tokenFlagIndex = args.indexOf('--token')
  if (tokenFlagIndex !== -1 && args[tokenFlagIndex + 1]) {
    token = args[tokenFlagIndex + 1]
    args.splice(tokenFlagIndex, 2)
  }

  const dumpFilePath = path.resolve(args[0] || 'dbdump.txt')
  const sqliteDbPath = path.resolve(args[1] || process.env.DATABASE_URL || 'sqlite.db')

  if (!fs.existsSync(dumpFilePath)) {
    console.error(`❌ Dump file not found: ${dumpFilePath}`)
    process.exit(1)
  }

  console.log(`📂 Reading dump file from: ${dumpFilePath}`)
  const rawDump = fs.readFileSync(dumpFilePath, 'utf8')

  console.log(`⚙️  Parsing dump records...`)
  const startTime = performance.now()
  const reminders = parseDumpContent(rawDump)
  console.log(`📋 Found ${reminders.length} reminder entries in dump`)

  if (reminders.length === 0) {
    console.warn(`⚠️  No reminder records found to import.`)
    process.exit(0)
  }

  if (token) {
    console.log(`🔑 Discord API token detected - fetching author & ➕ reactions`)
  } else {
    console.warn(`⚠️  No DISCORD_API_KEY found - skipping Discord reaction lookup (author will default to dump user_id)`)
  }

  console.log(`💾 Opening SQLite database at: ${sqliteDbPath}`)
  const db = new Database(sqliteDbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')

  const { importedReminders, importedSubs } = await importRemindersToSqlite(db, reminders, {
    discordToken: token,
  })

  // Checkpoint WAL so changes are immediately flushed into the main .db file on disk
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);')

  const elapsed = (performance.now() - startTime).toFixed(1)

  console.log(`\n✅ Import completed in ${elapsed}ms:`)
  console.log(`   - Reminders imported:     ${importedReminders}`)
  console.log(`   - Subscriptions imported: ${importedSubs}`)
  db.close()
}
