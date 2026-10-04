/**
 * Seeds the database with generated data, then benchmarks search against it.
 *
 * The point is the quality bar: "search over 10,000 generated items stays
 * fast". This script is how that gets measured rather than assumed.
 *
 *   npm run seed                 # 10,000 items into the app's real database
 *   npm run seed -- 50000        # more
 *   npm run seed -- --reset      # wipe existing data first
 *   npm run seed -- --db ./x.db  # somewhere else, leaving your real data alone
 *
 * It talks to the same db/ module the app does. It does not import electron, so
 * the userData path is reconstructed the same way Electron derives it.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { openDatabase } from '../src/main/db/client'
import { runMigrations } from '../src/main/db/migrate'
import { databaseFile, migrationsFolder } from '../src/main/db/paths'
import { countSearchResults, searchItems } from '../src/main/db/queries/search'
import { ITEM_STATUSES } from '../src/shared/types'

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Options {
  count: number
  dbPath: string
  reset: boolean
}

/**
 * Mirrors Electron's `app.getPath('userData')` for an app named "devvault".
 * Kept in one place so it is obvious this is a reconstruction, not the real
 * thing — the app itself always asks Electron.
 */
function electronUserDataPath(appName = 'devvault'): string {
  if (process.platform === 'win32') {
    return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), appName)
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', appName)
  }
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), appName)
}

function parseArgs(argv: string[]): Options {
  let count = 10_000
  let dbPath: string | null = null
  let reset = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--reset') {
      reset = true
    } else if (arg === '--db') {
      const next = argv[i + 1]
      if (next === undefined) throw new Error('--db needs a path')
      dbPath = resolve(next)
      i += 1
    } else if (arg !== undefined && /^\d+$/.test(arg)) {
      count = Number(arg)
    } else if (arg !== undefined) {
      throw new Error(`Unrecognised argument: ${arg}`)
    }
  }

  if (dbPath === null) {
    const userData = electronUserDataPath()
    if (!existsSync(userData)) mkdirSync(userData, { recursive: true })
    dbPath = databaseFile(userData)
  }

  return { count, dbPath, reset }
}

// ---------------------------------------------------------------------------
// Generated content
// ---------------------------------------------------------------------------

/**
 * Seeded PRNG (mulberry32) rather than Math.random, so two runs produce the
 * same data and a timing comparison means something.
 */
function makeRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PROJECT_NAMES = [
  'DevVault',
  'Portfolio site',
  'Rust CLI experiments',
  'Home server',
  'Invoice tool',
  'Scraper rewrite',
  'Game jam entry',
  'Dotfiles',
  'API gateway',
  'Data pipeline',
  'Mobile client',
  'Compiler toy'
]

const TOPICS = [
  'postgres',
  'sqlite',
  'electron',
  'typescript',
  'react',
  'tailwind',
  'docker',
  'kubernetes',
  'nginx',
  'redis',
  'webpack',
  'vite',
  'eslint',
  'prettier',
  'github actions',
  'migrations',
  'indexes',
  'transactions',
  'websockets',
  'oauth',
  'jwt',
  'caching',
  'profiling',
  'memory leak',
  'race condition',
  'deadlock',
  'pagination',
  'rate limiting',
  'retries',
  'backpressure'
]

const VERBS = [
  'figure out',
  'rewrite',
  'investigate',
  'document',
  'benchmark',
  'refactor',
  'simplify',
  'cache',
  'instrument',
  'delete'
]

const NOUNS = [
  'the query planner',
  'the migration runner',
  'the preload bridge',
  'the search index',
  'the build step',
  'the retry logic',
  'the error boundary',
  'the config loader',
  'the worker pool',
  'the import path'
]

const LANGUAGES = ['ts', 'tsx', 'sql', 'sh', 'json', 'rs', 'py', 'go']

const TAG_NAMES = [
  'ops',
  'urgent',
  'idea',
  'reading',
  'perf',
  'security',
  'refactor',
  'question',
  'snippet',
  'later'
]

/** The main list each generated entry goes in, and how common each one is. */
const LIST_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['note', 30],
  ['snippet', 20],
  ['link', 12],
  ['todo', 26],
  ['bug', 12]
]

function pick<T>(random: () => number, list: readonly T[]): T {
  const value = list[Math.floor(random() * list.length)]
  if (value === undefined) throw new Error('pick() from an empty list')
  return value
}

function pickList(random: () => number): string {
  const total = LIST_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [list, weight] of LIST_WEIGHTS) {
    roll -= weight
    if (roll <= 0) return list
  }
  return 'note'
}

function sentence(random: () => number, words: number): string {
  const parts: string[] = []
  for (let i = 0; i < words; i += 1) {
    parts.push(random() < 0.5 ? pick(random, TOPICS) : pick(random, NOUNS))
  }
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000

function main(): void {
  const options = parseArgs(process.argv.slice(2))

  console.log(`database : ${options.dbPath}`)
  console.log(`items    : ${options.count.toLocaleString()}`)
  console.log(`reset    : ${options.reset}`)
  console.log()

  const handle = openDatabase(options.dbPath)
  runMigrations(handle, migrationsFolder(process.cwd()))

  if (options.reset) {
    // Order matters: item_tags and items before projects, because
    // items.project_id is ON DELETE RESTRICT.
    handle.sqlite.exec('DELETE FROM item_tags; DELETE FROM items; DELETE FROM tags; DELETE FROM projects;')
    console.log('existing data cleared')
  }

  const random = makeRandom(20260103)
  const now = Date.now()

  const insertProject = handle.sqlite.prepare(
    'INSERT INTO projects (name, repo_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  const insertItem = handle.sqlite.prepare(
    `INSERT INTO items
       (project_id, title, content, url, language, created_at, updated_at, status, priority, due_at, done_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertTag = handle.sqlite.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)')
  const tagIdByName = handle.sqlite.prepare<[string], { id: number }>(
    'SELECT id FROM tags WHERE name = ?'
  )
  const insertItemTag = handle.sqlite.prepare(
    'INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)'
  )

  // One transaction for the whole seed. Without this, each INSERT would be its
  // own durable commit and 10,000 rows would take minutes instead of a second.
  const seed = handle.sqlite.transaction(() => {
    const projectIds: number[] = []
    for (const name of PROJECT_NAMES) {
      const createdAt = now - Math.floor(random() * 400) * DAY
      const status = random() < 0.15 ? 'paused' : random() < 0.1 ? 'done' : 'active'
      const result = insertProject.run(
        name,
        random() < 0.6 ? `D:/code/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : null,
        status,
        createdAt,
        createdAt
      )
      projectIds.push(Number(result.lastInsertRowid))
    }

    const tagIds: number[] = []
    for (const name of TAG_NAMES) {
      insertTag.run(name)
      const row = tagIdByName.get(name)
      if (row !== undefined) tagIds.push(row.id)
    }

    const listTagId = new Map<string, number>()
    for (const [name] of LIST_WEIGHTS) {
      insertTag.run(name)
      const row = tagIdByName.get(name)
      if (row !== undefined) listTagId.set(name, row.id)
    }

    for (let n = 0; n < options.count; n += 1) {
      const list = pickList(random)
      // ~20% of items live in the Inbox, the rest belong to a project.
      const projectId = random() < 0.2 ? null : pick(random, projectIds)
      const createdAt = now - Math.floor(random() * 365) * DAY - Math.floor(random() * DAY)

      // Every entry can be done. Work-like lists get priorities and due dates.
      const isWork = list === 'todo' || list === 'bug'
      const status = isWork ? pick(random, ITEM_STATUSES) : 'open'
      let priority: number | null = null
      let dueAt: number | null = null
      const doneAt = status === 'done' ? createdAt + Math.floor(random() * 30) * DAY : null

      if (isWork) {
        priority = random() < 0.5 ? 1 + Math.floor(random() * 3) : null
        if (random() < 0.6) {
          // Spread due dates from three weeks ago to three weeks out, so
          // Today / Upcoming / overdue all have something in them.
          dueAt = now + Math.floor((random() - 0.5) * 42) * DAY
        }
      }

      const title = isWork
        ? `${pick(random, VERBS)} ${pick(random, NOUNS)}`
        : `${pick(random, TOPICS)} ${pick(random, NOUNS)}`

      const inserted = insertItem.run(
        projectId,
        title,
        sentence(random, 8 + Math.floor(random() * 30)),
        list === 'link' ? `https://example.com/${pick(random, TOPICS).replace(/ /g, '-')}` : null,
        list === 'snippet' ? pick(random, LANGUAGES) : null,
        createdAt,
        createdAt,
        status,
        priority,
        dueAt,
        doneAt
      )

      const itemId = Number(inserted.lastInsertRowid)

      const mainList = listTagId.get(list)
      if (mainList !== undefined) insertItemTag.run(itemId, mainList)

      const tagCount = Math.floor(random() * 3)
      for (let t = 0; t < tagCount; t += 1) {
        insertItemTag.run(itemId, pick(random, tagIds))
      }
    }
  })

  const startedAt = performance.now()
  seed()
  const seedMs = performance.now() - startedAt

  const totals = handle.sqlite
    .prepare<[], { items: number; projects: number; tags: number }>(
      `SELECT
         (SELECT count(*) FROM items)    AS items,
         (SELECT count(*) FROM projects) AS projects,
         (SELECT count(*) FROM tags)     AS tags`
    )
    .get()

  console.log()
  console.log(`seeded in ${seedMs.toFixed(0)} ms`)
  console.log(
    `totals   : ${totals?.items.toLocaleString()} items, ${totals?.projects} projects, ${totals?.tags} tags`
  )

  benchmarkSearch(handle)
  handle.close()
}

/**
 * Times the queries the UI actually runs while someone types, including the
 * one-character case that would be the slowest prefix scan.
 */
function benchmarkSearch(handle: ReturnType<typeof openDatabase>): void {
  const queries = ['p', 'po', 'pos', 'post', 'postgres', 'memory leak', 'race cond', 'nonexistentxyz']

  console.log()
  console.log('search timings (50 runs each, limit 50)')
  console.log('  query              hits    median    p95')

  for (const query of queries) {
    const timings: number[] = []
    let hits = 0

    for (let run = 0; run < 50; run += 1) {
      const startedAt = performance.now()
      const results = searchItems(handle, query, { limit: 50 })
      timings.push(performance.now() - startedAt)
      hits = results.length
    }

    timings.sort((a, b) => a - b)
    const median = timings[Math.floor(timings.length / 2)] ?? 0
    const p95 = timings[Math.floor(timings.length * 0.95)] ?? 0
    const total = countSearchResults(handle, query)

    console.log(
      `  ${query.padEnd(18)} ${String(total).padStart(5)}  ${median.toFixed(2).padStart(7)}ms ${p95
        .toFixed(2)
        .padStart(6)}ms  (showing ${hits})`
    )
  }
}

main()
