import type { Database } from 'bun:sqlite'

export interface Reminder {
  id: string
  time: number
  title?: string | null
  channel_id: string
  guild_id?: string | null
  source_id?: string | null
  rrule?: string | null
  snooze_count: number
  created_at: number
  triggered_at?: number | null
}

export interface ReminderSub {
  reminder_id: string
  user_id: string
}

export interface TemporaryChannel {
  id: string
  owner_id: string
  guild_id: string
  created_at: number
}

export const schemaSql = `
CREATE TABLE IF NOT EXISTS reminder (
  id TEXT PRIMARY KEY NOT NULL,
  time INTEGER NOT NULL,
  title TEXT,
  channel_id TEXT NOT NULL,
  guild_id TEXT,
  source_id TEXT,
  rrule TEXT,
  snooze_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  triggered_at INTEGER
);

CREATE TABLE IF NOT EXISTS reminder_sub (
  reminder_id TEXT NOT NULL REFERENCES reminder(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY (reminder_id, user_id)
);

CREATE TABLE IF NOT EXISTS temporary_channel (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_time ON reminder(time);
CREATE INDEX IF NOT EXISTS idx_reminder_sub_user ON reminder_sub(user_id);
CREATE INDEX IF NOT EXISTS idx_temporary_channel_owner ON temporary_channel(owner_id);
CREATE INDEX IF NOT EXISTS idx_temporary_channel_guild ON temporary_channel(guild_id);
`

export function initSchema(db: Database) {
  db.exec(schemaSql)
  try {
    db.exec(`ALTER TABLE reminder ADD COLUMN snooze_count INTEGER NOT NULL DEFAULT 0;`)
  } catch (_) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE reminder ADD COLUMN guild_id TEXT;`)
  } catch (_) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE reminder ADD COLUMN triggered_at INTEGER;`)
  } catch (_) {
    // Column already exists
  }
}
