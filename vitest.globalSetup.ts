import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Fails fast if the wrong better-sqlite3 binary is in place.
 *
 * `npm test` swaps in the Node-ABI build via its `pretest` hook, but running
 * `npx vitest` directly skips that — and the failure is an opaque
 * ERR_DLOPEN_FAILED about NODE_MODULE_VERSION, repeated once per test file.
 * One clear message up front is worth the twenty lines.
 */
export default function setup(): void {
  const marker = resolve('node_modules/better-sqlite3/build/Release/.devvault-abi')
  if (!existsSync(marker)) return

  const active = readFileSync(marker, 'utf8').trim()
  const nodeAbi = require('node-abi') as { getAbi: (v: string, r: string) => string }
  const expected = `node-v${nodeAbi.getAbi(process.versions.node, 'node')}`

  if (active !== expected) {
    throw new Error(
      [
        '',
        `better-sqlite3 is currently built for "${active}", but these tests run under Node (${expected}).`,
        '',
        'Run `npm test` instead of `npx vitest` — its pretest hook swaps the binary.',
        'Or swap it yourself: npm run native:node',
        ''
      ].join('\n')
    )
  }
}
