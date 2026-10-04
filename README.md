# DevVault

A local-first **project memory** app for developers.

Press one hotkey, dump anything — a thought, a snippet, a link, a bug you just
hit — and find it again later. Everything belongs to a project, or sits in the
Inbox until you file it.

No accounts. No cloud. No telemetry. The app makes **no network calls at all**;
your data is one SQLite file on your own disk, and there is an export button so
it is never locked in.

> **Status: Phase 1, in progress.** Data layer, search, IPC, the three views,
> the tray, and quick capture are built. Export is the main thing left — see
> [Build status](#build-status).

---

## Setup

Requires **Node 22 LTS** (see [Node version](#node-version) for why).

```bash
npm install
npm run dev
```

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Start the app with hot reload |
| `npm run build` | Typecheck, then build the main, preload and renderer bundles |
| `npm start` | Run the built app |
| `npm test` | Data-layer tests (Vitest, in-memory SQLite) |
| `npm run typecheck` | `tsc` over the node and web projects |
| `npm run db:generate` | Regenerate migrations after editing `schema.ts` |
| `npm run seed` | Generate 10,000 items and benchmark search |
| `npm run icon:tray` | Regenerate `resources/tray.png` |

Your data lives in `app.getPath('userData')/devvault.db` — on Windows that is
`%APPDATA%\devvault\devvault.db`. The app prints the exact path on its status
screen.

### Node version

`better-sqlite3` is a native module, and **Node and Electron are compiled
against different V8 ABIs**, so one checkout needs two binaries:

- `npm test` runs under Node → the Node-ABI build
- `npm run dev` runs under Electron → the Electron-ABI build

`scripts/native.mjs` handles this. `pretest`/`preseed` swap in the Node binary,
`predev`/`prestart` swap in the Electron one, and each is stashed side by side
after its first download so every switch afterwards is an offline file copy.

> **Close the app before running `npm test`.** Windows locks a loaded native
> module, so the swap cannot replace a binary the running app is holding open.
> The script says so rather than failing with a bare `EBUSY`.

Both binaries come from better-sqlite3's prebuilds, published as GitHub release
assets — **no C++ compiler required**.

`scripts/fetch-prebuild.mjs` exists because of one specific failure: GitHub's
asset host resolves to four IPs, and on some networks one of them refuses
connections. Node does not do Happy Eyeballs across multiple A records, so it
picks one address and fails if that is the bad one — which makes
`prebuild-install` fail intermittently or permanently depending on DNS order.
The fallback retries against every address, with TLS still validating the real
hostname via SNI. It only runs after `prebuild-install` has already failed.

If both paths fail, install Visual Studio Build Tools so it can compile from
source instead.

Node 22 is the target because better-sqlite3 12.x requires Node 20+ and ships
prebuilds for Node 22 and for every Electron ABI we need.

---

## Architecture

Three processes, with a hard wall between them.

```
┌─ main process ───────────────────────────────┐
│  src/main/                                   │
│    db/        SQLite + Drizzle + FTS5        │  <- the ONLY place
│      schema.ts, client.ts, migrate.ts        │     that touches data
│      queries/ projects, items, tags,         │
│               search, work                   │
│    ipc/       handlers + zod schemas         │  <- validates everything
│    windows/   main window, quick capture     │
└──────────────────────┬───────────────────────┘
                       │  typed IPC, zod-validated
┌─ preload ────────────┴───────────────────────┐
│  src/preload/index.ts                        │  <- contextBridge, the one
│    exposes window.api and nothing else       │     and only bridge
└──────────────────────┬───────────────────────┘
                       │
┌─ renderer ───────────┴───────────────────────┐
│  src/renderer/   React + Tailwind + Zustand  │  <- no Node, no fs, no SQL
│    components/ views/ store/                 │
└──────────────────────────────────────────────┘

  src/shared/   types.ts + ipc.ts — imported by all three,
                so it must stay free of runtime dependencies
```

### Security posture

The renderer is treated as untrusted.

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- A Content-Security-Policy with no remote origins, matching the local-first
  promise
- `ipcRenderer` is never exposed — the page gets a fixed set of typed functions
- Every IPC input is parsed by a zod schema **before** any database code runs,
  with length caps so a runaway renderer cannot flood SQLite
- External links open in the system browser, never in an Electron window
- `<webview>` attachment is refused
- Search highlighting returns **marker-delimited text, not HTML**, so a match
  inside user content can never inject markup

### Why the data layer has no `electron` import

`src/main/db/` never imports `electron`; the caller passes the database path.
That one rule is what lets all 183 tests run in-process against `:memory:`,
and lets `npm run seed` use the exact same code the app does.

---

## Data model: one model, three views

There are only two real entities: **Project** and **Item**. Todos and bugs are
*not* separate tables — they are Items with a `type`. That is the central idea:
a note you jotted down becomes a todo by changing one column, keeping the same
row, the same id, its tags, and its place in the search index.

```sql
projects(
  id, name, repo_path,
  status,             -- active | paused | done   ("archive" = paused)
  created_at, updated_at
)

items(
  id,
  project_id,         -- NULL = Inbox
  type,               -- note | snippet | link | image | video | todo | bug
  title, content,
  url,                -- link items
  language,           -- snippet items ("ts", "sql", ...)
  file_path,          -- image/video (Phase 2); never blobs in the database
  created_at, updated_at,

  -- todo and bug ONLY; NULL for every other type:
  status,             -- open | doing | done
  priority,           -- lower = more urgent
  due_at, done_at
)

tags(id, name)                -- lowercase, leading '#' stripped
item_tags(item_id, tag_id)

items_fts                     -- FTS5 over title + content,
                              -- external content = items, synced by triggers
```

Timestamps are Unix **milliseconds** so the renderer can do `new Date(ms)`
directly.

### Deleting a project never loses items

`items.project_id` is `ON DELETE RESTRICT`, so **the database itself refuses**
to drop a project that still owns items. Deletion requires an explicit choice —
*move them to the Inbox* or *delete them too* — and performs it in a single
transaction. Silently losing a user's notes is not a failure mode this schema
permits.

### Full-text search

`items_fts` is an FTS5 **external-content** table: it stores only the inverted
index and reads the original text back from `items`. The text therefore exists
in exactly one place and cannot drift. Three triggers keep the index in sync on
insert, delete, and updates to `title`/`content` — the update trigger is scoped
`UPDATE OF title, content`, so toggling a todo's status does no search work at
all.

What the user types is never passed raw to FTS5. Each token is quoted and given
a `*` suffix, which neutralises operators like `"`, `^`, `(` and `NOT` (they
would otherwise throw a syntax error on almost every keystroke) and gives prefix
matching, so `expo` already finds `export`.

**Measured at 10,000 generated items** (`npm run seed`):

| query | matches | median | p95 |
|---|---|---|---|
| `postgres` | 3,152 | 6.2 ms | 8.7 ms |
| `memory leak` | 3,187 | 7.7 ms | 8.5 ms |
| `p` (worst case, single char) | 9,941 | 24 ms | 28 ms |
| no match | 0 | 0.3 ms | 0.5 ms |

### Ready for later, not built now

An `embeddings` table can be added later keyed by `item_id` without touching
`items`. `file_path` already exists for Phase 2 media. Neither is implemented.

---

## Project tracking

Everything in DevVault is organised around projects, and a project is a
first-class thing you track over time rather than just a folder label.

**A project has:**

- a **name**, and an optional **repo path** pointing at the checkout on disk
- a **status** — `active`, `paused` or `done`. "Archiving" a project sets it to
  `paused`: it keeps every item and stays fully searchable, it just drops to the
  bottom of the sidebar. Nothing is hidden or lost.

**Every item belongs to exactly one project, or to the Inbox.** `project_id`
being `NULL` *is* the Inbox — it is not a special project, so nothing has to be
set up before you can capture something. You file it later, or never.

**Per-project quick stats.** Each project reports `open` / `done` / `items`:
how much work is outstanding, how much is finished, and how much is attached to
the project in total. Only todos and bugs count as work — notes and snippets are
counted in `items` but never inflate the open/done numbers.

**The project page** gathers everything about one project behind four tabs:
Todos, Bugs, Notes & Snippets, Files & Media — each one a filtered query over
the same `items` table, not a separate store.

**Cross-project tracking.** The work tracker (Today / Upcoming / All open /
Done) deliberately ignores project boundaries and shows work from everywhere,
each row labelled with its project name, so "what should I do now" never
requires visiting twelve project pages. Today means **overdue plus due today**,
most overdue first.

**Moving work between projects** is a single `project_id` update — an item can
move from the Inbox into a project, or between projects, without copying
anything or losing its tags, history, or search entry.

---

## The Scratchpad

**The view the app opens on.** Not the Inbox — DevVault should land ready to be
typed into, not showing you a list of things you already captured.

A plain text buffer with a terminal look: monospace, line numbers, syntax
coloured as you type. One line per thing. Nothing becomes a real item until you
**commit** (`Ctrl/Cmd + Enter`), so a half-finished thought can never turn into
data you have to clean up later.

```
1. wire the export button #urgent @tomorrow+14:30
2. #bug search drops the last keystroke #regression @fri
3. #note just a loose thought
a. #snippet the incantation I always forget
.  standup @09:30

// lines starting with // are kept, never committed
```

There are only two sigils to remember: **`#` classifies, `@` schedules.**

| | |
|---|---|
| `1.` `2.` · `a.` `b.` · `.` `-` `*` | list marker — stripped, purely visual |
| `#todo` `#task` `#bug` `#fix` `#note` `#snippet` `#code` `#link` | **reserved** — set the type, never become tags |
| any other `#word` | a tag |
| `@today` `@tomorrow` `@fri` `@3d` `@1w` `@2026-01-20` | a due date (lands at midday) |
| `@14:30` `@9am` `@2:30pm` | **today** at that time |
| `@tomorrow+09:00` `@2026-01-20+2pm` | a date *and* a time |
| `//` at the start | ignored, stays in the buffer |

**The default type is `todo`** — a numbered list is a list of things to do, so
a bare line means exactly that. Write `#note` to opt out.

Markers are stripped from the stored title, so `1. wire the export button
#urgent @tomorrow+14:30` saves the title *"wire the export button"* — tagged,
scheduled, and nothing else.

### Typing in it

- **Shift+Enter** starts the next line with the next marker in your style —
  `1.` → `2.`, `c)` → `d)`, a bullet repeats, nothing at all starts at `1.`
- **Typing `#` or `@` opens a completion list** at the caret: reserved type
  words and your existing tags for `#`, dates and times for `@`. Arrow keys
  move, Tab or Enter accepts, Esc dismisses.
- **Ctrl/Cmd+Enter** commits everything pending

Details worth knowing:

- **The buffer autosaves** (debounced) and survives restarts. It is your working
  memory; losing it to a crash would be unforgivable.
- **It is not stored in `items`.** A one-row `scratchpad` table keeps raw text
  out of search, out of the counts and out of the work tracker until you commit.
- **Committing removes the committed lines**, so pressing commit twice cannot
  duplicate anything. Comments and blanks stay.
- **The top bar picks the target project.** Everything in one commit is filed
  there; default is the Inbox.
- A weekday like `@fri` always means the *next* one — never today.
- Date-only schedules land at local midday, so a timezone or DST shift cannot
  slide them onto the previous day.
- An `@token` that is not understood is **left in the title** rather than
  dropped, so you never silently lose what you typed.

## Always available: tray and global hotkeys

DevVault runs in the system tray and does not quit when you close its window.
That is not decoration — **a global hotkey only works while a process is
running**, so something has to stay resident for the keys below to do anything.
Closing the window hides it; **Quit** is in the tray menu.

| Keys | Works from | Action |
|---|---|---|
| `Ctrl/Cmd + Shift + O` | anywhere | Show the main window, or hide it if it is already focused |
| `Ctrl/Cmd + Shift + Space` | anywhere | Quick capture: one line, Enter saves, Esc cancels |

It starts at login by default (hidden, straight to the tray) so the hotkeys
survive a reboot. There is a **Start DevVault at login** checkbox in the tray
menu; the default is applied once on first run and never forced again.

If another application already owns one of the combinations,
`globalShortcut.register` fails silently — so the app checks the result and
tells you at startup instead of leaving you pressing a dead key.

### Why not a bare letter

A global shortcut is swallowed system-wide. Registering `O` on its own would
mean the letter O no longer reaches your editor, your browser, or anything else.
Modifiers are what make a global hotkey usable at all.

### Quick capture

One input, no type picker, no project picker — any decision you have to make is
a decision that stops you capturing. The type comes from a prefix and everything
lands in the Inbox:

| You type | You get |
|---|---|
| `fix the exporter` | a note |
| `todo: fix the exporter` | a todo |
| `[] fix the exporter` | a todo |
| `bug: crash on open` | a bug |

The marker is stripped from the title, and a live hint under the box shows what
it parsed to, so the rules are discoverable without reading this.

## Keyboard shortcuts (main window)

| Keys | Action |
|---|---|
| `Ctrl/Cmd + K` | Go to Search and focus the box |
| `Ctrl/Cmd + N` | Focus the capture box on the current view |
| `Ctrl/Cmd + 1..5` | Scratchpad / Inbox / Today / All Todos / Search |
| `Ctrl/Cmd + Enter` | Commit the Scratchpad · save the open item editor |
| `Esc` | Close the editor |

## Build status

Phase 1, step by step:

- [x] 1 — Scaffold: electron-vite + React + TS + Tailwind, secure preload
- [x] 2 — SQLite + Drizzle + migrations + FTS5 table and triggers
- [x] 3 — Projects: create, rename, archive, delete with the Inbox choice
- [x] 4 — Data-layer test harness
- [x] 5 — Items: CRUD, listing, move, status, note→todo conversion
- [x] 6 — Tags: add, remove, counts, filter by tag
- [x] 7 — Typed IPC for every channel, zod-validated in the main process
- [x] 8 — Seed script + search benchmark
- [x] 9 — Renderer shell: sidebar, routing, Zustand store
- [x] 10 — The three views
- [x] 11 — Quick capture: global hotkey + always-on-top input
- [ ] 12 — Export to JSON and Markdown
- [x] + — Scratchpad: terminal-style capture buffer (default view)
- [x] 13 — Keyboard shortcuts
- [ ] 14 — Finish the docs

**183 tests** cover the data layer: migrations and FTS trigger sync, project
CRUD and both delete modes, item CRUD, the todo/bug field invariant, note→todo
conversion, tags, search behaviour and ranking, the work-tracker day boundaries,
IPC input validation, the capture and Scratchpad line parsers, and Scratchpad
commit behaviour.

### Out of scope for Phase 1

Cloud sync, accounts, AI features, OCR, embeddings, image/video handling, git
integration, calendar, Kanban boards, Gantt charts, plugins, auto-update.
