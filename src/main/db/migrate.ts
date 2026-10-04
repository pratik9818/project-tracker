import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { openDatabase, type DatabaseHandle } from './client'

/**
 * Applies every migration in `migrationsFolder` that has not run yet, in
 * journal order, inside a transaction.
 *
 * Drizzle records applied migrations in its own `__drizzle_migrations` table, so
 * this is safe to call on every app start — including the very first one, which
 * creates the schema from scratch.
 */
export function runMigrations(handle: DatabaseHandle, migrationsFolder: string): void {
  migrate(handle.db, { migrationsFolder })
}

/** Convenience for tests and scripts: a fresh migrated database in one call. */
export function openMigratedDatabase(file: string, migrationsFolder: string): DatabaseHandle {
  const handle = openDatabase(file)
  runMigrations(handle, migrationsFolder)
  return handle
}
