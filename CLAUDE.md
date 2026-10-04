# DevVault — working rules for Claude

A local-first "project memory" app for developers. Capture anything (text,
snippets, links, later images/video), track todos and bugs, organise everything
by project, and find it again instantly.

**Core promise:** press one hotkey, dump anything, find it again later.
Everything belongs to a project, or sits in the Inbox.

---

## How to work on this repo

- The owner is a solo developer building this slowly, for the long term.
  **Quality and learning beat speed.**
- They want to understand the code. Explain key decisions briefly, keep code
  simple and readable, **avoid clever abstractions**.
- **Give a short plan before writing code, and wait for approval.**
- Work in small steps. After each step, say how to run and verify it.
- **Do not add features that were not asked for.** If something seems missing,
  suggest it at the end instead of building it.
- Ask when something is ambiguous instead of guessing.

## Tech stack — do not substitute without asking

| Concern | Choice |
|---|---|
| Shell | Electron + React + TypeScript via **electron-vite** |
| Database | **SQLite** through **better-sqlite3** (main process only) |
| Schema/migrations | **Drizzle ORM** + drizzle-kit |
| Search | **SQLite FTS5** |
| Styling | **Tailwind CSS** — simple, clean, keyboard-friendly |
| UI state | **Zustand**, kept minimal |
| Tests | **Vitest**, on the data layer |
| Network | **None.** No accounts, no telemetry, no cloud. |

## Architecture rules

1. **Electron security is not negotiable.** `contextIsolation: true`,
   `nodeIntegration: false`, `sandbox: true`. The renderer never touches Node,
   the filesystem, or SQLite.
2. **One bridge only.** A small typed API via `contextBridge` in
   `src/preload/`. `ipcRenderer` itself is never exposed.
3. **Every IPC channel has a typed input and output**, declared in
   `src/shared/ipc.ts`, and **its input is validated with zod in the main
   process** (`src/main/ipc/schemas.ts`) before any database code runs.
4. **All database code lives in the main process**, under `src/main/db/`. The
   renderer reaches it only through IPC.
5. **`src/main/db/` must not import `electron`.** The caller passes the file
   path. This is what lets the whole data layer be unit-tested against
   `:memory:` without booting Electron. Do not break this.
6. **`src/shared/` must not import `electron`, `better-sqlite3`, `drizzle-orm`
   or `zod`** — the renderer bundles it, so anything there ships to the renderer.
   Types that cross the bridge belong in `shared/types.ts`, not beside the
   queries that produce them.
7. **User files go on disk**, under `app.getPath('userData')/attachments/`.
   Store only paths and metadata in SQLite. **Never store blobs in the database.**
8. **Migrations from the start. Never edit the schema by hand.** Change
   `schema.ts`, then run `npm run db:generate`.

## Data model: ONE model, THREE views

Only two real entities: **Project** and **Item**. **There are no item types.**
Every item is an entry in one or more **lists**, and a list is just a tag:
`#todo`, `#bug`, `#nottoday` — whatever name the user types. There is no fixed
set of categories and no separate "Files & Media" section; a link or file is an
optional field on an entry inside a list.

```
projects(id, name, repo_path, status, created_at, updated_at)
  status: active | paused | done        -- "archive" in the UI means 'paused'

items(id, project_id, title, content, url, language, file_path,
      created_at, updated_at,
      status, priority, due_at, done_at)
  project_id NULL  = Inbox
  status/priority/due_at/done_at: apply to EVERY entry (any entry can be done)

tags(id, name)                          -- a list; lowercase, leading '#' stripped
item_tags(item_id, tag_id)              -- an entry can be in several lists
items_fts                               -- FTS5, external content = items
```

Rules that must keep holding:

- **Every entry is in at least one list.** `createItem()` in
  `queries/items.ts` files an entry under `DEFAULT_LIST` (`todo`, in
  `shared/types.ts`) when no list was given. That default lives in one place —
  the parser reports only what was typed. Do not scatter it.
- **A line with several `#words` is in all of those lists.** No word is
  reserved; `#bug` is not special to the code.
- **`items.status` is always set by `createItem()`** (default `open`). The
  column stays nullable only because SQLite cannot add NOT NULL without
  rebuilding the table, which would drop the FTS triggers.
- **Deleting a project must NOT silently delete its items.** `items.project_id`
  is `ON DELETE RESTRICT`, so the database itself refuses. `deleteProject`
  requires an explicit `'move_to_inbox' | 'delete_items'` and does it in one
  transaction.
- **Keep `items` ready for an `embeddings` table later** (keyed by `item_id`),
  without changing `items`.

### The three views — all just filtered queries over `items`

1. **Capture and search:** global search box, timeline of recent items, filters
   by list / project.
2. **Work tracker:** Today / Upcoming / All open / Done, across all projects and
   all lists, each row labelled with its project name.
   **Today = overdue + due today**, most overdue first.
3. **Project view:** an **All** tab plus the project's **4 biggest lists** as
   tabs (`VISIBLE_LIST_TABS`), every other list in a **More ▾** dropdown (all
   from `listTagsWithCounts(scope)`), plus quick stats (open vs done). Adding from a list tab files into that list when no `#list` is typed.

Sidebar: `Scratchpad | Inbox | Today | All Open | Search | Activity | Projects ▸`

**Activity** is a GitHub-style contribution graph of entries closed per local
day (`done_at`, any list) over 53 weeks. The grid shape (start Sunday, one count
per day) is computed in `queries/activity.ts` so it is tested; the renderer only
lays the array out 7 rows to a column.

### The Scratchpad (the default view)

A one-row `scratchpad` table holding raw text. **It is deliberately not an
item**: uncommitted text must stay out of search, the counts and the work
tracker. Committing parses each line and creates items, then removes those lines
from the buffer so a second commit cannot duplicate them.

- The line syntax lives in `src/shared/parseLine.ts`. **Only two sigils**:
  `#` names the list(s) — every `#word` is a list, none is reserved — and `@`
  schedules. There are deliberately no `todo:` style prefixes. The same parser
  drives the Scratchpad, the Composer and quick capture. **No `#list` means
  `#todo`** (applied by `createItem()`).
- A leading list marker (`1.` `a)` `-`) is presentation only and is stripped.
  `nextMarker()` drives Shift+Enter continuation. The marker regex requires
  trailing whitespace so `3.14` is never read as item 3.
- `@` accepts a date, a bare time (meaning today), or `date+time`. Date-only
  lands at **local midday**; a weekday always means the next one, never today.
  An unparsed `@token` is left in the title rather than dropped.
- The editor's syntax highlighting renders from the **same parse** the commit
  uses, so there is no second implementation to drift.
- `scratchpad.project_id` is `ON DELETE SET NULL`, not RESTRICT: deleting a
  project must never be blocked by the scratchpad.
- Dates resolve to **local midday** so a timezone/DST shift cannot move the day.
  A weekday name always means the next one, never today.
- The buffer autosaves on a debounce and is NOT re-read on `dataVersion` —
  re-reading mid-sentence would clobber what the user is typing.

## Tray, lifecycle and global hotkeys

The app is **resident in the tray**; closing the main window hides it. This is
load-bearing: `globalShortcut` only works while the process runs, so quitting
with the last window would kill the hotkeys.

Consequences that are easy to break:

- `window-all-closed` must NOT quit. Quit lives in the tray menu, and it calls
  `markQuitting()` first — otherwise the window's `close` handler just hides
  it again and the app can never exit.
- The main and quick-capture windows are **created once and shown/hidden**, not
  rebuilt per summon. Rebuilding is visibly slow and the whole promise is
  "press a key, start typing".
- Launch-at-login is applied **once**, tracked in `settings.json` in userData.
  Re-applying it on every start would override the user unchecking the tray box.
- Accelerators live in one place: `ACCELERATORS` in `src/main/shortcuts.ts`.
  Never a bare letter — a global shortcut is swallowed system-wide, so `O`
  alone would stop the letter O reaching every other app.
- `globalShortcut.register` returns false silently when a combo is taken; the
  startup path surfaces that in a dialog rather than leaving a dead key.
- Quick capture writes from its own window, so handlers that change data
  broadcast `EVENTS.dataChanged` and open windows re-query. Without it the main
  window shows stale counts.

## Testing gotcha

`npx vitest` skips the `pretest` ABI swap and dies with an opaque
`ERR_DLOPEN_FAILED`. `vitest.globalSetup.ts` now catches that and says what to
do. **Use `npm test`.**

## Conventions worth preserving

- **Timestamps are Unix milliseconds** (`Date.now()`) in SQLite INTEGER columns,
  so the renderer can do `new Date(ms)` with no conversion.
- **`ItemScope` is an explicit tagged union** (`all` / `inbox` / `project`).
  Never use a nullable `projectId` to mean both "no filter" and "the Inbox".
- **Search input is never passed raw to FTS5.** `buildMatchQuery` quotes each
  token and appends `*`; otherwise `"`, `^`, `(`, `NOT` etc. throw syntax errors
  on half-typed queries.
- **Search highlights are marker-delimited text, not HTML.** FTS5 wraps matches
  in `HIGHLIGHT_START`/`HIGHLIGHT_END` (U+0002/U+0003) and the renderer splits
  on them with `splitHighlights()`. **Never return HTML for highlighting** and
  never use `dangerouslySetInnerHTML` on user content.
- **`now` is a parameter** in the work-tracker queries, so day-boundary logic is
  testable without mocking the clock.
- TypeScript strict mode. No `any` unless justified in a comment.
  (`exactOptionalPropertyTypes` is deliberately **off** — it fights zod's
  `.optional()` inference everywhere.)

## Native module note (important)

`better-sqlite3` is a native module, and **Node and Electron are built against
different V8 ABIs**. One checkout serves both:

- `npm test` runs under Node → needs the Node-ABI binary
- `npm run dev` runs under Electron → needs the Electron-ABI binary

`scripts/native.mjs` swaps them. `pretest`/`preseed` call it with `node`,
`predev`/`prestart` with `electron`. Each ABI's binary is stashed side by side
after first download, so every later switch is an offline file copy.

Two things that bite:

- **Any new Node-side entry point needs a `pre<script>` hook** calling
  `native:node`, or it will die with `ERR_DLOPEN_FAILED` /
  `NODE_MODULE_VERSION` whenever the Electron binary happens to be active.
- **Windows locks a loaded native module**, so the swap fails while the app is
  running. `swapIn()` turns that `EBUSY` into "close the app first".

`scripts/fetch-prebuild.mjs` is a fallback for when `prebuild-install` cannot
reach GitHub's asset host: that host has four A records and some networks refuse
one of them, and Node does not fail over between DNS answers. The fallback tries
every address, keeping normal TLS verification via SNI.

## Phase 1 scope

Built: scaffold + security, SQLite/Drizzle/FTS5 migrations, projects, items as
entries in user-named lists (types were removed in migrations 0003/0004 — old
types were carried over as lists), done/due/priority on every entry, typed IPC
with zod, search, seed script.

Still to build: the three views and sidebar, quick capture (global hotkey
`CommandOrControl+Shift+Space`), export to JSON + Markdown, keyboard shortcuts,
README.

## Explicitly OUT of scope — do not build

Cloud sync, accounts, AI features, OCR, embeddings, image/video handling, git
integration, calendar, Kanban boards, Gantt charts, plugins, auto-update.

Keep module boundaries clean so these stay possible later, but **do not
implement them.**

## Commands

```bash
npm run dev          # run the app (switches to the Electron-ABI binary first)
npm run build        # typecheck + build all three bundles
npm test             # data-layer tests (switches to the Node-ABI binary first)
npm run typecheck    # tsc for the node and web projects
npm run db:generate  # regenerate migrations after editing schema.ts
npm run seed         # 10k generated items + a search benchmark
```
