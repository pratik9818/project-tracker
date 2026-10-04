import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * A tiny settings file in the user-data folder.
 *
 * It exists for one thing right now: remembering that we have already applied
 * the default launch-at-login setting. Without that, every start would re-enable
 * it and the tray checkbox could never be turned off.
 *
 * Deliberately not in SQLite — these are app preferences, not user content, and
 * they must be readable before the database is open.
 */
export interface Settings {
  /** True once the login-item default has been applied, so we stop forcing it. */
  loginItemInitialised: boolean
}

const DEFAULTS: Settings = {
  loginItemInitialised: false
}

export function settingsFile(userDataPath: string): string {
  return join(userDataPath, 'settings.json')
}

export function readSettings(userDataPath: string): Settings {
  const file = settingsFile(userDataPath)
  if (!existsSync(file)) return { ...DEFAULTS }

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(parsed as Partial<Settings>) }
  } catch {
    // A corrupt settings file must never stop the app starting.
    return { ...DEFAULTS }
  }
}

export function writeSettings(userDataPath: string, settings: Settings): void {
  const file = settingsFile(userDataPath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`)
}
