import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

/**
 * Opens the SQLite database.
 *
 * This module imports NOTHING from `electron` on purpose. The caller supplies
 * the file path, so the exact same code runs three ways:
 *   - the app:   openDatabase(join(app.getPath('userData'), 'devvault.db'))
 *   - tests:     openDatabase(':memory:')
 *   - seeding:   openDatabase('./tmp/seed.db')
 * That is what makes the data layer unit-testable without booting Electron.
 */
export interface DatabaseHandle {
  /** Raw handle — needed for FTS5 queries, which Drizzle cannot express. */
  readonly sqlite: Database.Database
  /** Typed query builder for the normal tables. */
  readonly db: BetterSQLite3Database<typeof schema>
  close(): void
}

export function openDatabase(file: string): DatabaseHandle {
  const sqlite = new Database(file)

  // WAL lets reads continue while a write is in flight. Ignored for :memory:.
  sqlite.pragma('journal_mode = WAL')
  // NORMAL is the usual WAL pairing: durable across app crashes, and only at
  // risk from an OS-level power loss. Much faster than FULL.
  sqlite.pragma('synchronous = NORMAL')
  // SQLite defaults foreign keys OFF. Without this, the ON DELETE RESTRICT that
  // protects items from a project delete would not be enforced at all.
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  return {
    sqlite,
    db,
    close: () => sqlite.close()
  }
}
