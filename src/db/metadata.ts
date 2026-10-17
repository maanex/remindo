import { db } from './sqlite'

export function getMetadata(key: string): string | null {
  const row = db.query(`SELECT value FROM bot_metadata WHERE key = $key`).get({ $key: key }) as { value: string } | null
  return row ? row.value : null
}

export function setMetadata(key: string, value: string): void {
  db.query(`
    INSERT OR REPLACE INTO bot_metadata (key, value)
    VALUES ($key, $value)
  `).run({ $key: key, $value: value })
}
