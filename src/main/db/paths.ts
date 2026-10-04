import { join } from 'node:path'

/**
 * Where the migration SQL files live.
 *
 * In dev and in tests the repo root is the cwd, so `./drizzle` is correct.
 * When we add packaging (not Phase 1) the folder has to be shipped as an
 * extra resource and this is the single place that changes.
 */
export function migrationsFolder(appRoot: string): string {
  return join(appRoot, 'drizzle')
}

/** The database file inside Electron's userData folder. */
export function databaseFile(userDataPath: string): string {
  return join(userDataPath, 'devvault.db')
}
