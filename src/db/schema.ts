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

export interface BotMetadata {
  key: string
  value: string
}

export interface XkcdComic {
  num: number
  title: string
  safe_title: string
  img: string
  alt: string
  transcript?: string | null
  year?: string | null
  month?: string | null
  day?: string | null
  link?: string | null
  news?: string | null
  extra?: string | null
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

CREATE TABLE IF NOT EXISTS bot_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS xkcd_comic (
  num INTEGER PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  safe_title TEXT NOT NULL,
  img TEXT NOT NULL,
  alt TEXT NOT NULL,
  transcript TEXT,
  year TEXT,
  month TEXT,
  day TEXT,
  link TEXT,
  news TEXT,
  extra TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS xkcd_comic_fts USING fts5(
  num UNINDEXED,
  title,
  safe_title,
  alt,
  transcript,
  extra,
  content='xkcd_comic',
  content_rowid='num'
);

CREATE TRIGGER IF NOT EXISTS xkcd_comic_ai AFTER INSERT ON xkcd_comic BEGIN
  INSERT INTO xkcd_comic_fts(rowid, num, title, safe_title, alt, transcript, extra)
  VALUES (new.num, new.num, new.title, new.safe_title, new.alt, new.transcript, new.extra);
END;

CREATE TRIGGER IF NOT EXISTS xkcd_comic_ad AFTER DELETE ON xkcd_comic BEGIN
  INSERT INTO xkcd_comic_fts(xkcd_comic_fts, rowid, num, title, safe_title, alt, transcript, extra)
  VALUES('delete', old.num, old.num, old.title, old.safe_title, old.alt, old.transcript, old.extra);
END;

CREATE TRIGGER IF NOT EXISTS xkcd_comic_au AFTER UPDATE ON xkcd_comic BEGIN
  INSERT INTO xkcd_comic_fts(xkcd_comic_fts, rowid, num, title, safe_title, alt, transcript, extra)
  VALUES('delete', old.num, old.num, old.title, old.safe_title, old.alt, old.transcript, old.extra);
  INSERT INTO xkcd_comic_fts(rowid, num, title, safe_title, alt, transcript, extra)
  VALUES (new.num, new.num, new.title, new.safe_title, new.alt, new.transcript, new.extra);
END;

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
  try {
    const ftsCols = db.query<any, []>("SELECT sql FROM sqlite_master WHERE name='xkcd_comic_fts'").get()
    if (ftsCols?.sql && !ftsCols.sql.includes('extra')) {
      db.exec(`
        DROP TRIGGER IF EXISTS xkcd_comic_ai;
        DROP TRIGGER IF EXISTS xkcd_comic_ad;
        DROP TRIGGER IF EXISTS xkcd_comic_au;
        DROP TABLE IF EXISTS xkcd_comic_fts;
        CREATE VIRTUAL TABLE xkcd_comic_fts USING fts5(
          num UNINDEXED,
          title,
          safe_title,
          alt,
          transcript,
          extra,
          content='xkcd_comic',
          content_rowid='num'
        );
        CREATE TRIGGER xkcd_comic_ai AFTER INSERT ON xkcd_comic BEGIN
          INSERT INTO xkcd_comic_fts(rowid, num, title, safe_title, alt, transcript, extra)
          VALUES (new.num, new.num, new.title, new.safe_title, new.alt, new.transcript, new.extra);
        END;
        CREATE TRIGGER xkcd_comic_ad AFTER DELETE ON xkcd_comic BEGIN
          INSERT INTO xkcd_comic_fts(xkcd_comic_fts, rowid, num, title, safe_title, alt, transcript, extra)
          VALUES('delete', old.num, old.num, old.title, old.safe_title, old.alt, old.transcript, old.extra);
        END;
        CREATE TRIGGER xkcd_comic_au AFTER UPDATE ON xkcd_comic BEGIN
          INSERT INTO xkcd_comic_fts(xkcd_comic_fts, rowid, num, title, safe_title, alt, transcript, extra)
          VALUES('delete', old.num, old.num, old.title, old.safe_title, old.alt, old.transcript, old.extra);
          INSERT INTO xkcd_comic_fts(rowid, num, title, safe_title, alt, transcript, extra)
          VALUES (new.num, new.num, new.title, new.safe_title, new.alt, new.transcript, new.extra);
        END;
        INSERT INTO xkcd_comic_fts(rowid, num, title, safe_title, alt, transcript, extra)
        SELECT num, num, title, safe_title, alt, transcript, extra FROM xkcd_comic;
      `)
    }
  } catch (_) {
    // Migration handled
  }
}
