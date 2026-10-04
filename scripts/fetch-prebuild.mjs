/**
 * Downloads a native module's prebuilt binary straight from its GitHub release,
 * trying every DNS answer before giving up.
 *
 * This exists because of a specific, real failure. GitHub's asset host
 * (release-assets.githubusercontent.com) resolves to four IPs, and on some
 * networks one of them refuses connections. Node does not implement Happy
 * Eyeballs for multiple A records by default, so it picks one address and fails
 * if that address is the bad one — which makes `prebuild-install` fail roughly
 * a quarter of the time, or constantly, depending on DNS ordering.
 *
 * So: resolve all addresses, and retry the request against each until one
 * answers. TLS still uses the real hostname via SNI, so the certificate chain
 * is verified normally — this pins the route, not the trust.
 *
 * `scripts/native.mjs` only calls this when `prebuild-install` has already
 * failed.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve4 } from 'node:dns/promises'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const REQUEST_TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 6

/** One attempt against one IP. Resolves to a body, or to a redirect target. */
function attempt(urlString, ip) {
  return new Promise((resolvePromise, reject) => {
    const url = new URL(urlString)
    const req = request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { 'user-agent': 'devvault-setup', accept: '*/*' },
        // Pin the address; TLS still validates against url.hostname.
        lookup: (_hostname, _options, callback) => callback(null, ip, 4),
        timeout: REQUEST_TIMEOUT_MS
      },
      (res) => {
        const status = res.statusCode ?? 0

        if (status >= 300 && status < 400 && res.headers.location !== undefined) {
          res.resume()
          resolvePromise({ redirect: new URL(res.headers.location, urlString).toString() })
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`HTTP ${status}`))
          return
        }

        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolvePromise({ body: Buffer.concat(chunks) }))
        res.on('error', reject)
      }
    )

    req.on('timeout', () => req.destroy(new Error('connect timeout')))
    req.on('error', reject)
    req.end()
  })
}

/** GETs a URL, following redirects, trying every IP of every host it touches. */
async function fetchFollowingRedirects(urlString, log) {
  let current = urlString

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const host = new URL(current).hostname
    const addresses = await resolve4(host)

    let lastError = null
    let redirect = null

    for (const ip of addresses) {
      try {
        const result = await attempt(current, ip)
        if (result.body !== undefined) return result.body
        redirect = result.redirect
        break
      } catch (error) {
        lastError = error
        log(`  ${host} @ ${ip}: ${error.message}`)
      }
    }

    if (redirect !== null) {
      current = redirect
      continue
    }
    throw lastError ?? new Error(`no reachable address for ${host}`)
  }

  throw new Error('too many redirects')
}

/**
 * Downloads and unpacks the prebuilt binary for one module/runtime/ABI,
 * placing it where the module expects (build/Release/).
 *
 * Returns the number of files extracted.
 */
export async function fetchPrebuild({ moduleDir, runtime, abi, log = console.log }) {
  const pkg = require(join(moduleDir, 'package.json'))
  const repo = repositorySlug(pkg)

  const assetName = `${pkg.name}-v${pkg.version}-${runtime}-v${abi}-${process.platform}-${process.arch}.tar.gz`
  const url = `https://github.com/${repo}/releases/download/v${pkg.version}/${assetName}`

  log(`[native] falling back to a direct download with DNS failover`)
  log(`  ${url}`)

  const body = await fetchFollowingRedirects(url, log)
  log(`  downloaded ${body.length.toLocaleString()} bytes`)

  const scratch = await mkdtemp(join(tmpdir(), 'devvault-prebuild-'))
  const archive = join(scratch, assetName)

  try {
    await writeFile(archive, body)

    // Imported here rather than at the top: `tar` is only needed on this
    // fallback path, and only ever runs from a dev script.
    const tar = require('tar')

    let extracted = 0
    await tar.x({
      file: archive,
      cwd: moduleDir,
      // Only the compiled addon. Never let an archive write outside build/.
      filter: (path) => {
        const keep = /^build\/Release\/[^/]+\.node$/.test(path.replace(/\\/g, '/'))
        if (keep) extracted += 1
        return keep
      }
    })

    if (extracted === 0) throw new Error('archive contained no build/Release/*.node file')
    log(`  extracted ${extracted} binary file(s)`)
    return extracted
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/** "git+https://github.com/WiseLibs/better-sqlite3.git" -> "WiseLibs/better-sqlite3" */
function repositorySlug(pkg) {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  if (typeof raw !== 'string') {
    throw new Error(`${pkg.name} has no repository field, cannot locate its releases`)
  }
  const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(raw)
  if (match === null || match[1] === undefined) {
    throw new Error(`cannot parse a GitHub repo out of "${raw}"`)
  }
  return match[1]
}
