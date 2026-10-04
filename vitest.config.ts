import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Tests cover the data layer only (main/db and shared). They run in plain Node
 * against an in-memory SQLite database — no Electron, no renderer, no IPC.
 * That is possible because db/ never imports `electron`.
 */
export default defineConfig({
  test: {
    // Checks the native-module ABI before anything loads better-sqlite3.
    globalSetup: ["./vitest.globalSetup.ts"],
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // better-sqlite3 is a native module; forks keep each test file in its own
    // process so a crash in one cannot take the whole run down.
    pool: 'forks'
  },
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  }
})
