import type { DatabaseHandle } from './client'
import { openDatabase } from './client'
import { runMigrations } from './migrate'
import { databaseFile, migrationsFolder } from './paths'

export type { DatabaseHandle } from './client'
export { openDatabase } from './client'
export { runMigrations, openMigratedDatabase } from './migrate'
export { databaseFile, migrationsFolder } from './paths'

let handle: DatabaseHandle | null = null

/**
 * Opens and migrates the app database once, then hands the same instance to
 * every IPC handler. Called from main/index.ts after app.whenReady().
 *
 * The Electron-specific paths are resolved by the caller, not here, so this
 * module still has no dependency on `electron`.
 */
export function initDatabase(options: { userDataPath: string; appRoot: string }): DatabaseHandle {
  if (handle !== null) return handle
  const opened = openDatabase(databaseFile(options.userDataPath))
  runMigrations(opened, migrationsFolder(options.appRoot))
  handle = opened
  return handle
}

/** Throws if called before initDatabase — a bug, not a user-facing error. */
export function getDatabase(): DatabaseHandle {
  if (handle === null) throw new Error('Database not initialised — call initDatabase() first')
  return handle
}

export function closeDatabase(): void {
  handle?.close()
  handle = null
}
