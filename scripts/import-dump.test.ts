import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import * as fs from 'fs'
import {
  parseIsoToEpochMs,
  unescapeMySqlString,
  parseDumpContent,
  importRemindersToSqlite,
  type DumpReminder,
} from './import-dump'
import type { Reminder, ReminderSub } from '../src/db/schema'

describe('scripts/import-dump', () => {
  describe('parseIsoToEpochMs', () => {
    it('parses standard ISO date with UTC offset', () => {
      const iso = '2026-10-21T21:22:53.677408947+02:00[Europe/Berlin]'
      const expected = BigInt(Date.parse('2026-10-21T21:22:53.677+02:00'))
      expect(parseIsoToEpochMs(iso)).toBe(expected)
    })

    it('parses ISO date without seconds and subseconds', () => {
      const iso = '2081-09-03T00:00+02:00[Europe/Berlin]'
      const expected = BigInt(Date.parse('2081-09-03T00:00:00+02:00'))
      expect(parseIsoToEpochMs(iso)).toBe(expected)
    })

    it('parses year 3021 and 9999 accurately', () => {
      const iso3021 = '3021-04-13T12:47:03.398756139+02:00[Europe/Berlin]'
      expect(parseIsoToEpochMs(iso3021)).toBe(33175219623398n)

      const iso9999 = '9999-12-01T01:57:15.562509563+01:00[Europe/Berlin]'
      expect(parseIsoToEpochMs(iso9999)).toBe(253399625835562n)
    })

    it('parses extreme years > 9999 (e.g. +48688, +7274749, +280683)', () => {
      const iso48688 = '+48688-03-30T19:02:46.147296169+02:00[Europe/Berlin]'
      const ms48688 = parseIsoToEpochMs(iso48688)
      expect(ms48688 > 0n).toBe(true)

      const iso7274749 = '+7274749-04-02T23:09:05.456551199+02:00[Europe/Berlin]'
      const ms7274749 = parseIsoToEpochMs(iso7274749)
      expect(ms7274749).toBe(229506745756145456n)

      const iso280683 = '+280683-02-17T08:05:26.505647975+01:00[Europe/Berlin]'
      const ms280683 = parseIsoToEpochMs(iso280683)
      expect(ms280683 > 0n).toBe(true)
    })
  })

  describe('unescapeMySqlString', () => {
    it('unescapes quotes and special characters', () => {
      expect(unescapeMySqlString("'hello world'")).toBe('hello world')
      expect(unescapeMySqlString("'It\\'s a test'")).toBe("It's a test")
      expect(unescapeMySqlString("'Line 1\\nLine 2'")).toBe("Line 1\nLine 2")
      expect(unescapeMySqlString("'Tab\\there'")).toBe("Tab\there")
      expect(unescapeMySqlString("'Backslash\\\\here'")).toBe("Backslash\\here")
      expect(unescapeMySqlString("'\\\"Quoted\\\"'")).toBe('"Quoted"')
    })
  })

  describe('importRemindersToSqlite subscriber logic', () => {
    it('subscribes author and fetches non-bot ➕ reactions', async () => {
      const sampleReminders: DumpReminder[] = [
        {
          id: '101',
          channel_id: 'chan_1',
          message_id: 'msg_1',
          user_id: 'author_user_1',
          timeStr: '2028-01-01T00:00+01:00',
          timeMs: 1830384000000n,
          content: 'Test Reminder 1',
          createdAt: 1700000000000,
        },
      ]

      const memDb = new Database(':memory:')
      memDb.exec('PRAGMA foreign_keys = ON;')

      // Mock fetcher returning author and ➕ reactions with bots
      const mockFetch = async (channelId: string, messageId: string) => {
        expect(channelId).toBe('chan_1')
        expect(messageId).toBe('msg_1')
        return {
          authorId: 'author_user_1',
          isAuthorBot: false,
          plusReactionUserIds: ['reactor_user_2', 'reactor_user_3'],
        }
      }

      const result = await importRemindersToSqlite(memDb, sampleReminders, {
        fetchDetails: mockFetch,
      })

      expect(result.importedReminders).toBe(1)
      expect(result.importedSubs).toBe(3) // author_user_1 + reactor_user_2 + reactor_user_3

      const subs = memDb.query('SELECT user_id FROM reminder_sub WHERE reminder_id = ? ORDER BY user_id ASC').all('101') as Array<{ user_id: string }>
      expect(subs.map(s => s.user_id)).toEqual(['author_user_1', 'reactor_user_2', 'reactor_user_3'])

      memDb.close()
    })

    it('excludes bot users from ➕ reaction subscriptions and author if bot', async () => {
      const sampleReminders: DumpReminder[] = [
        {
          id: '102',
          channel_id: 'chan_2',
          message_id: 'msg_2',
          user_id: 'real_author_from_dump',
          timeStr: '2028-01-01T00:00+01:00',
          timeMs: 1830384000000n,
          content: 'Test Reminder 2',
          createdAt: 1700000000000,
        },
      ]

      const memDb = new Database(':memory:')
      memDb.exec('PRAGMA foreign_keys = ON;')

      // Message author was a bot (e.g. zGPB confirming the reminder), reactions only have 1 human
      const mockFetch = async () => {
        return {
          authorId: 'bot_id',
          isAuthorBot: true,
          plusReactionUserIds: ['human_reactor_1'],
        }
      }

      const result = await importRemindersToSqlite(memDb, sampleReminders, {
        fetchDetails: mockFetch,
      })

      expect(result.importedReminders).toBe(1)
      expect(result.importedSubs).toBe(2) // real_author_from_dump + human_reactor_1

      const subs = memDb.query('SELECT user_id FROM reminder_sub WHERE reminder_id = ? ORDER BY user_id ASC').all('102') as Array<{ user_id: string }>
      expect(subs.map(s => s.user_id)).toEqual(['human_reactor_1', 'real_author_from_dump'])

      memDb.close()
    })

    it('falls back to author when message details fetch fails', async () => {
      const sampleReminders: DumpReminder[] = [
        {
          id: '103',
          channel_id: 'chan_private',
          message_id: 'msg_deleted',
          user_id: 'fallback_author',
          timeStr: '2028-01-01T00:00+01:00',
          timeMs: 1830384000000n,
          content: 'Fallback Reminder',
          createdAt: 1700000000000,
        },
      ]

      const memDb = new Database(':memory:')
      memDb.exec('PRAGMA foreign_keys = ON;')

      const mockFetch = async () => null

      const result = await importRemindersToSqlite(memDb, sampleReminders, {
        fetchDetails: mockFetch,
      })

      expect(result.importedReminders).toBe(1)
      expect(result.importedSubs).toBe(1)

      const subs = memDb.query('SELECT user_id FROM reminder_sub WHERE reminder_id = ?').all('103') as Array<{ user_id: string }>
      expect(subs[0]!.user_id).toBe('fallback_author')

      memDb.close()
    })

    it('correctly parses and imports entire dbdump.txt into empty sqlite', async () => {
      const content = fs.readFileSync('dbdump.txt', 'utf8')
      const reminders = parseDumpContent(content)

      expect(reminders.length).toBe(88)

      const memDb = new Database(':memory:')
      memDb.exec('PRAGMA foreign_keys = ON;')

      const result = await importRemindersToSqlite(memDb, reminders)
      expect(result.importedReminders).toBe(88)
      expect(result.importedSubs).toBe(88)

      const rowCount = memDb.query('SELECT COUNT(*) as c FROM reminder').get() as { c: number }
      const subCount = memDb.query('SELECT COUNT(*) as c FROM reminder_sub').get() as { c: number }
      expect(rowCount.c).toBe(88)
      expect(subCount.c).toBe(88)

      // Verify specific row with user_id -1 and mention
      const row259 = memDb.query('SELECT * FROM reminder WHERE id = $id').get({ $id: '259240920' }) as Reminder
      expect(row259).not.toBeNull()
      expect(row259.title).toBe('<@229645063406223360>')
      expect(row259.channel_id).toBe('790565721406701578')
      expect(row259.source_id).toBe('831480599948427305')
      expect(row259.time).toBe(33175219623398)
      expect(row259.created_at).toBe(1618310823190)

      const sub259 = memDb.query('SELECT * FROM reminder_sub WHERE reminder_id = $id').all({ $id: '259240920' }) as ReminderSub[]
      expect(sub259).toHaveLength(1)
      expect(sub259[0]!.user_id).toBe('229645063406223360')

      // Verify empty content row has null title
      const row1868 = memDb.query('SELECT * FROM reminder WHERE id = $id').get({ $id: '1868513212' }) as Reminder
      expect(row1868.title).toBeNull()

      memDb.close()
    })
  })
})
