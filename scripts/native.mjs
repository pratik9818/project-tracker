/**
 * Puts the right `better_sqlite3.node` binary in place.
 *
 * better-sqlite3 is a native module, and Node and Electron are built against
 * different V8 ABIs. One checkout has to serve both:
 *   - `npm test`     runs under this machine's Node -> needs the Node ABI build
 *   - `npm run dev`  runs inside Electron           -> needs the Electron ABI build
 * Loading the wrong one fails with ERR_DLOPEN_FAILED / NODE_MODULE_VERSION.
 *
 * So `pretest` calls this with "node", and `predev`/`prestart` with "electron".
 *
 * Both come from better-sqlite3's published prebuilds, so no C++ compiler is
 * needed. Once fetched, each ABI's binary is kept side by side in build/Release
 * as `better_sqlite3-<runtime>-v<abi>.node`, and switching is a local file copy
 * that needs no network. A marker file records which one is currently active,
 * so repeat runs are instant no-ops.
 *
 *   node scripts/native.mjs node|electron
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchPrebuild } from './fetch-prebuild.mjs'

const require = createRequire(import.meta.url)
const nodeAbi = require('node-abi')

const ROOT = process.cwd()
const MODULE_DIR = join(ROOT, 'node_modules', 'better-sqlite3')
const RELEASE_DIR = join(MODULE_DIR, 'build', 'Release')
const ACTIVE = join(RELEASE_DIR, 'better_sqlite3.node')
const MARKER = join(RELEASE_DIR, '.devvault-abi')
const PREBUILD_INSTALL = join(ROOT, 'node_modules', 'prebuild-install', 'bin.js')

const runtime = process.argv[2]
if (runtime !== 'node' && runtime !== 'electron') {
  console.error('usage: node scripts/native.mjs node|electron')
  process.exit(1)
}

const targetVersion =
  runtime === 'node'
    ? process.versions.node
    : require(join(ROOT, 'node_modules', 'electron', 'package.json')).version

const abi = nodeAbi.getAbi(targetVersion, runtime)
const tag = `${runtime}-v${abi}`
const stashed = join(RELEASE_DIR, `better_sqlite3-${tag}.node`)

const activeTag = existsSync(MARKER) ? readFileSync(MARKER, 'utf8').trim() : null

// Already active? Nothing to do.
if (activeTag === tag && existsSync(ACTIVE)) {
  process.exit(0)
}

// Before replacing the active binary, keep a copy of it under its own ABI name
// so we can switch back later without re-downloading.
if (activeTag !== null && existsSync(ACTIVE)) {
  const previous = join(RELEASE_DIR, `better_sqlite3-${activeTag}.node`)
  if (!existsSync(previous)) copyFileSync(ACTIVE, previous)
}

/**
 * Copies a stashed binary into place.
 *
 * Windows keeps a loaded DLL locked, so this fails with EBUSY if DevVault is
 * running — the app is holding the very file we are trying to replace. That is
 * a confusing error on its own, so explain the actual fix.
 */
function swapIn(source) {
  try {
    copyFileSync(source, ACTIVE)
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      console.error(
        [
          '',
          `[native] Cannot switch better-sqlite3 to ${tag}: the binary is in use.`,
          '',
          'DevVault is probably still running, and Windows locks a loaded native',
          'module. Close the app (or stop `npm run dev`) and try again.',
          ''
        ].join('\n')
      )
      process.exit(1)
    }
    throw error
  }
}

// Already fetched this ABI before: just swap it in.
if (existsSync(stashed)) {
  swapIn(stashed)
  writeFileSync(MARKER, `${tag}\n`)
  console.log(`[native] better-sqlite3 -> ${tag} (from local stash)`)
  process.exit(0)
}

console.log(`[native] better-sqlite3 -> fetching ${runtime} ${targetVersion} (ABI ${abi})`)

try {
  // Fast path: prebuild-install, which also fills the shared npm cache.
  execFileSync(
    process.execPath,
    [PREBUILD_INSTALL, '--runtime', runtime, '--target', targetVersion, '--tag-prefix', 'v'],
    { cwd: MODULE_DIR, stdio: 'inherit' }
  )
} catch {
  // prebuild-install resolves a single IP and gives up if that one address is
  // unreachable. Retry ourselves against every address. See fetch-prebuild.mjs.
  try {
    await fetchPrebuild({ moduleDir: MODULE_DIR, runtime, abi })
  } catch (error) {
    // Restore whatever was active before, so a failed fetch never leaves the
    // checkout with a binary that does not match the marker.
    const previous = join(RELEASE_DIR, `better_sqlite3-${activeTag}.node`)
    if (activeTag !== null && existsSync(previous)) copyFileSync(previous, ACTIVE)

    console.error(
      [
        '',
        `[native] Could not fetch a prebuilt better-sqlite3 for ${runtime} ${targetVersion} (ABI ${abi}).`,
        `  ${error.message}`,
        '',
        'Prebuilt binaries are published as GitHub release assets:',
        '  https://github.com/WiseLibs/better-sqlite3/releases',
        'If that download is blocked on your network, retry — or install',
        'Visual Studio Build Tools so it can be compiled from source instead.',
        ''
      ].join('\n')
    )
    process.exit(1)
  }
}

copyFileSync(ACTIVE, stashed)
writeFileSync(MARKER, `${tag}\n`)
