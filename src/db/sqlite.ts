import { Database } from 'bun:sqlite'
import { initSchema } from './schema'

const dbPath = process.env.DATABASE_URL || (process.env.NODE_ENV === 'test' ? ':memory:' : 'sqlite.db')
export const db = new Database(dbPath)

// Enable WAL journal mode for performance & concurrent access
db.exec('PRAGMA journal_mode = WAL;')
// Enable foreign keys constraint enforcement in SQLite
db.exec('PRAGMA foreign_keys = ON;')

// Ensure tables exist
initSchema(db)

export default db
