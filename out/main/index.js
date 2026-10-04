"use strict";
const electron = require("electron");
const Database = require("better-sqlite3");
const betterSqlite3 = require("drizzle-orm/better-sqlite3");
const sqliteCore = require("drizzle-orm/sqlite-core");
const migrator = require("drizzle-orm/better-sqlite3/migrator");
const node_path = require("node:path");
const drizzleOrm = require("drizzle-orm");
const zod = require("zod");
const node_fs = require("node:fs");
const DEFAULT_LIST = "todo";
const ITEM_STATUSES = ["open", "doing", "done"];
const PROJECT_STATUSES = ["active", "paused", "done"];
const HIGHLIGHT_START = "";
const HIGHLIGHT_END = "";
const projects = sqliteCore.sqliteTable(
  "projects",
  {
    id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
    name: sqliteCore.text("name").notNull(),
    repoPath: sqliteCore.text("repo_path"),
    status: sqliteCore.text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
    createdAt: sqliteCore.integer("created_at").notNull(),
    updatedAt: sqliteCore.integer("updated_at").notNull()
  },
  (table) => [
    sqliteCore.index("projects_status_idx").on(table.status),
    sqliteCore.index("projects_name_idx").on(table.name)
  ]
);
const items = sqliteCore.sqliteTable(
  "items",
  {
    id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
    /**
     * NULL = Inbox. `onDelete: 'restrict'` is deliberate: the database refuses
     * to drop a project that still owns items, which makes it impossible to
     * silently lose them. Deleting a project must first move its items to the
     * Inbox or delete them explicitly, inside one transaction.
     */
    projectId: sqliteCore.integer("project_id").references(() => projects.id, { onDelete: "restrict" }),
    title: sqliteCore.text("title"),
    content: sqliteCore.text("content"),
    url: sqliteCore.text("url"),
    language: sqliteCore.text("language"),
    filePath: sqliteCore.text("file_path"),
    createdAt: sqliteCore.integer("created_at").notNull(),
    updatedAt: sqliteCore.integer("updated_at").notNull(),
    // Every entry can be ticked done. The column stays nullable only because
    // SQLite cannot add NOT NULL without rebuilding the table (which would drop
    // the FTS triggers); createItem() always sets it.
    status: sqliteCore.text("status", { enum: ITEM_STATUSES }),
    priority: sqliteCore.integer("priority"),
    dueAt: sqliteCore.integer("due_at"),
    doneAt: sqliteCore.integer("done_at")
  },
  (table) => [
    // Project page, and the Inbox query (project_id IS NULL).
    sqliteCore.index("items_project_id_idx").on(table.projectId),
    // Work tracker: Today / Upcoming / All open.
    sqliteCore.index("items_status_due_idx").on(table.status, table.dueAt),
    // Recent-items timeline.
    sqliteCore.index("items_created_at_idx").on(table.createdAt),
    sqliteCore.index("items_updated_at_idx").on(table.updatedAt)
  ]
);
const tags = sqliteCore.sqliteTable(
  "tags",
  {
    id: sqliteCore.integer("id").primaryKey({ autoIncrement: true }),
    name: sqliteCore.text("name").notNull()
  },
  (table) => [sqliteCore.uniqueIndex("tags_name_unique").on(table.name)]
);
const itemTags = sqliteCore.sqliteTable(
  "item_tags",
  {
    itemId: sqliteCore.integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    tagId: sqliteCore.integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" })
  },
  (table) => [
    sqliteCore.primaryKey({ columns: [table.itemId, table.tagId] }),
    // "Show me every item with this tag" needs the reverse lookup too.
    sqliteCore.index("item_tags_tag_id_idx").on(table.tagId)
  ]
);
const scratchpad = sqliteCore.sqliteTable("scratchpad", {
  id: sqliteCore.integer("id").primaryKey(),
  content: sqliteCore.text("content").notNull().default(""),
  /** Where committed lines will be filed. NULL = Inbox. */
  projectId: sqliteCore.integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  updatedAt: sqliteCore.integer("updated_at").notNull()
});
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  itemTags,
  items,
  projects,
  scratchpad,
  tags
}, Symbol.toStringTag, { value: "Module" }));
function openDatabase(file) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  const db = betterSqlite3.drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    close: () => sqlite.close()
  };
}
function runMigrations(handle2, migrationsFolder2) {
  migrator.migrate(handle2.db, { migrationsFolder: migrationsFolder2 });
}
function migrationsFolder(appRoot) {
  return node_path.join(appRoot, "drizzle");
}
function databaseFile(userDataPath) {
  return node_path.join(userDataPath, "devvault.db");
}
let handle$1 = null;
function initDatabase(options) {
  if (handle$1 !== null) return handle$1;
  const opened = openDatabase(databaseFile(options.userDataPath));
  runMigrations(opened, migrationsFolder(options.appRoot));
  handle$1 = opened;
  return handle$1;
}
function getDatabase() {
  if (handle$1 === null) throw new Error("Database not initialised — call initDatabase() first");
  return handle$1;
}
function closeDatabase() {
  handle$1?.close();
  handle$1 = null;
}
const EVENTS = {
  dataChanged: "event:data-changed",
  toggleSearch: "event:toggle-search"
};
const IPC_CHANNELS = [
  "app:health",
  "projects:list",
  "projects:get",
  "projects:create",
  "projects:rename",
  "projects:setStatus",
  "projects:delete",
  "projects:stats",
  "projects:recent",
  "items:list",
  "items:count",
  "items:get",
  "items:create",
  "items:update",
  "items:delete",
  "items:setStatus",
  "items:toggleDone",
  "items:move",
  "items:inboxCount",
  "tags:list",
  "tags:listWithCounts",
  "tags:forItem",
  "tags:forItems",
  "tags:add",
  "tags:remove",
  "search:query",
  "search:count",
  "work:today",
  "work:upcoming",
  "work:allOpen",
  "work:done",
  "work:counts",
  "activity:calendar",
  "capture:save",
  "capture:close",
  "scratchpad:get",
  "scratchpad:save",
  "scratchpad:commit"
];
const LIST_MARKER = /^\s*(\d+[.)]|[a-zA-Z][.)]|[-*.])\s+/;
const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;
const SCHEDULE_PATTERN = /(?:^|\s)@([\p{L}\p{N}:+._-]+)/u;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function parseTimeOfDay(token) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(token.trim());
  if (match === null) return null;
  const rawHours = Number(match[1]);
  const minutes = match[2] === void 0 ? 0 : Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (Number.isNaN(rawHours) || Number.isNaN(minutes)) return null;
  if (minutes > 59) return null;
  let hours = rawHours;
  if (meridiem !== void 0) {
    if (rawHours < 1 || rawHours > 12) return null;
    hours = rawHours % 12;
    if (meridiem === "pm") hours += 12;
  } else {
    if (rawHours > 23) return null;
  }
  return { hours, minutes };
}
function parseDatePart(token, now2) {
  const value = token.toLowerCase();
  const date = new Date(now2);
  if (value === "today" || value === "tod") return date;
  if (value === "tomorrow" || value === "tmr" || value === "tom") {
    date.setDate(date.getDate() + 1);
    return date;
  }
  if (value === "yesterday") {
    date.setDate(date.getDate() - 1);
    return date;
  }
  const weekday = WEEKDAYS.indexOf(value.slice(0, 3));
  if (weekday !== -1 && value.length >= 3 && /^[a-z]+$/.test(value)) {
    const delta = (weekday - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + (delta === 0 ? 7 : delta));
    return date;
  }
  const offset = /^(\d+)([dw])$/.exec(value);
  if (offset !== null) {
    const amount = Number(offset[1]);
    date.setDate(date.getDate() + (offset[2] === "w" ? amount * 7 : amount));
    return date;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (iso !== null) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const parsed = new Date(year, month - 1, day);
    if (parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return parsed;
  }
  return null;
}
function parseSchedule(token, now2 = Date.now()) {
  const [datePart, timePart] = token.split("+");
  if (datePart === void 0 || datePart === "") return null;
  if (timePart === void 0) {
    const date2 = parseDatePart(datePart, now2);
    if (date2 !== null) {
      date2.setHours(12, 0, 0, 0);
      return { at: date2.getTime(), hasTime: false };
    }
    const time2 = parseTimeOfDay(datePart);
    if (time2 !== null) {
      const today = new Date(now2);
      today.setHours(time2.hours, time2.minutes, 0, 0);
      return { at: today.getTime(), hasTime: true };
    }
    return null;
  }
  const date = parseDatePart(datePart, now2);
  const time = parseTimeOfDay(timePart);
  if (date === null || time === null) return null;
  date.setHours(time.hours, time.minutes, 0, 0);
  return { at: date.getTime(), hasTime: true };
}
function parseLine(raw, now2 = Date.now()) {
  const blank = {
    raw,
    marker: null,
    title: "",
    tags: [],
    dueAt: null,
    dueToken: null,
    hasTime: false,
    actionable: false
  };
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.startsWith("//")) return blank;
  let rest = raw;
  let marker = null;
  const markerMatch = LIST_MARKER.exec(rest);
  if (markerMatch !== null) {
    marker = markerMatch[1] ?? null;
    rest = rest.slice(markerMatch[0].length);
  }
  rest = rest.trim();
  const tags2 = [];
  for (const match of rest.matchAll(TAG_PATTERN)) {
    const word = match[1]?.toLowerCase();
    if (word === void 0) continue;
    if (!tags2.includes(word)) tags2.push(word);
  }
  rest = rest.replace(TAG_PATTERN, " ");
  let dueAt = null;
  let dueToken = null;
  let hasTime = false;
  const scheduleMatch = SCHEDULE_PATTERN.exec(rest);
  if (scheduleMatch !== null && scheduleMatch[1] !== void 0) {
    const parsed = parseSchedule(scheduleMatch[1], now2);
    if (parsed !== null) {
      dueAt = parsed.at;
      hasTime = parsed.hasTime;
      dueToken = scheduleMatch[1];
      rest = rest.replace(scheduleMatch[0], " ");
    }
  }
  const title2 = rest.replace(/\s+/g, " ").trim();
  if (title2 === "") {
    return { ...blank, raw, marker, tags: tags2, dueAt, dueToken, hasTime };
  }
  return { raw, marker, title: title2, tags: tags2, dueAt, dueToken, hasTime, actionable: true };
}
function parseBuffer(buffer, now2 = Date.now()) {
  return buffer.split("\n").map((line) => parseLine(line, now2));
}
function endOfLocalDay(now2) {
  const date = new Date(now2);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}
const notDone = drizzleOrm.ne(items.status, "done");
function selectWorkItems(handle2) {
  return handle2.db.select({
    id: items.id,
    projectId: items.projectId,
    title: items.title,
    content: items.content,
    url: items.url,
    language: items.language,
    filePath: items.filePath,
    createdAt: items.createdAt,
    updatedAt: items.updatedAt,
    status: items.status,
    priority: items.priority,
    dueAt: items.dueAt,
    doneAt: items.doneAt,
    projectName: projects.name
  }).from(items).leftJoin(projects, drizzleOrm.eq(projects.id, items.projectId));
}
function todayItems(handle2, now2 = Date.now()) {
  return selectWorkItems(handle2).where(drizzleOrm.and(notDone, drizzleOrm.isNotNull(items.dueAt), drizzleOrm.lte(items.dueAt, endOfLocalDay(now2)))).orderBy(drizzleOrm.asc(items.dueAt), drizzleOrm.asc(drizzleOrm.sql`coalesce(${items.priority}, 99)`), drizzleOrm.asc(items.id)).all();
}
function upcomingItems(handle2, now2 = Date.now()) {
  return selectWorkItems(handle2).where(
    drizzleOrm.and(notDone, drizzleOrm.isNotNull(items.dueAt), drizzleOrm.sql`${items.dueAt} > ${endOfLocalDay(now2)}`)
  ).orderBy(drizzleOrm.asc(items.dueAt), drizzleOrm.asc(drizzleOrm.sql`coalesce(${items.priority}, 99)`), drizzleOrm.asc(items.id)).all();
}
function allOpenItems(handle2) {
  return selectWorkItems(handle2).where(drizzleOrm.and(notDone)).orderBy(
    drizzleOrm.asc(drizzleOrm.sql`coalesce(${items.priority}, 99)`),
    drizzleOrm.asc(drizzleOrm.sql`coalesce(${items.dueAt}, 9e15)`),
    drizzleOrm.desc(items.createdAt)
  ).all();
}
function doneItems(handle2, limit = 200) {
  return selectWorkItems(handle2).where(drizzleOrm.and(drizzleOrm.eq(items.status, "done"))).orderBy(drizzleOrm.desc(drizzleOrm.sql`coalesce(${items.doneAt}, ${items.updatedAt})`), drizzleOrm.desc(items.id)).limit(limit).all();
}
function workCounts(handle2, now2 = Date.now()) {
  const endOfToday = endOfLocalDay(now2);
  const tally = (where) => handle2.db.select({ n: drizzleOrm.sql`count(*)` }).from(items).where(where).get()?.n ?? 0;
  return {
    today: tally(drizzleOrm.and(notDone, drizzleOrm.isNotNull(items.dueAt), drizzleOrm.lte(items.dueAt, endOfToday))),
    upcoming: tally(
      drizzleOrm.and(notDone, drizzleOrm.isNotNull(items.dueAt), drizzleOrm.sql`${items.dueAt} > ${endOfToday}`)
    ),
    open: tally(drizzleOrm.and(notDone)),
    done: tally(drizzleOrm.and(drizzleOrm.eq(items.status, "done")))
  };
}
const WEEKS_BACK = 52;
function localDayKey(date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
function activityCalendar(handle2, now2 = Date.now()) {
  const start = new Date(now2);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() - WEEKS_BACK * 7);
  const indexByDay = /* @__PURE__ */ new Map();
  const today = localDayKey(new Date(now2));
  for (const cursor = new Date(start); ; cursor.setDate(cursor.getDate() + 1)) {
    const key = localDayKey(cursor);
    indexByDay.set(key, indexByDay.size);
    if (key === today) break;
  }
  const rows = handle2.db.select({ doneAt: items.doneAt }).from(items).where(
    drizzleOrm.and(
      drizzleOrm.eq(items.status, "done"),
      drizzleOrm.isNotNull(items.doneAt),
      drizzleOrm.gte(items.doneAt, start.getTime()),
      drizzleOrm.lte(items.doneAt, endOfLocalDay(now2))
    )
  ).all();
  const counts = new Array(indexByDay.size).fill(0);
  for (const { doneAt } of rows) {
    if (doneAt === null) continue;
    const index = indexByDay.get(localDayKey(new Date(doneAt)));
    if (index !== void 0) counts[index] = (counts[index] ?? 0) + 1;
  }
  return {
    startDay: localDayKey(start),
    counts,
    total: rows.length
  };
}
function normalizeTagName(raw) {
  const name = raw.trim().replace(/^#+/, "").trim().toLowerCase();
  if (name.length === 0) throw new Error("Tag name cannot be empty");
  return name;
}
function ensureTag(handle2, rawName) {
  const name = normalizeTagName(rawName);
  const existing = handle2.db.select().from(tags).where(drizzleOrm.eq(tags.name, name)).get();
  if (existing !== void 0) return existing;
  const [created] = handle2.db.insert(tags).values({ name }).returning().all();
  if (created === void 0) throw new Error(`Failed to create tag "${name}"`);
  return created;
}
function addTagToItem(handle2, itemId, rawName) {
  return handle2.db.transaction((tx) => {
    const item = tx.select({ id: items.id }).from(items).where(drizzleOrm.eq(items.id, itemId)).get();
    if (item === void 0) throw new Error(`No item with id ${itemId}`);
    const name = normalizeTagName(rawName);
    const existing = tx.select().from(tags).where(drizzleOrm.eq(tags.name, name)).get();
    const tag = existing ?? (() => {
      const [created] = tx.insert(tags).values({ name }).returning().all();
      if (created === void 0) throw new Error(`Failed to create tag "${name}"`);
      return created;
    })();
    tx.insert(itemTags).values({ itemId, tagId: tag.id }).onConflictDoNothing().run();
    return tag;
  });
}
function removeTagFromItem(handle2, itemId, tagId) {
  return handle2.db.delete(itemTags).where(drizzleOrm.sql`${itemTags.itemId} = ${itemId} and ${itemTags.tagId} = ${tagId}`).run().changes > 0;
}
function tagsForItem(handle2, itemId) {
  return handle2.db.select({ id: tags.id, name: tags.name }).from(itemTags).innerJoin(tags, drizzleOrm.eq(tags.id, itemTags.tagId)).where(drizzleOrm.eq(itemTags.itemId, itemId)).orderBy(drizzleOrm.asc(tags.name)).all();
}
function tagsForItems(handle2, itemIds) {
  if (itemIds.length === 0) return [];
  return handle2.db.select({ itemId: itemTags.itemId, id: tags.id, name: tags.name }).from(itemTags).innerJoin(tags, drizzleOrm.eq(tags.id, itemTags.tagId)).where(drizzleOrm.inArray(itemTags.itemId, [...itemIds])).orderBy(drizzleOrm.asc(itemTags.itemId), drizzleOrm.asc(tags.name)).all();
}
function listTagsWithCounts(handle2, scope = { kind: "all" }) {
  const where = scope.kind === "project" ? drizzleOrm.eq(items.projectId, scope.projectId) : scope.kind === "inbox" ? drizzleOrm.isNull(items.projectId) : void 0;
  return handle2.db.select({ id: tags.id, name: tags.name, itemCount: drizzleOrm.count(itemTags.itemId) }).from(tags).innerJoin(itemTags, drizzleOrm.eq(itemTags.tagId, tags.id)).innerJoin(items, drizzleOrm.eq(items.id, itemTags.itemId)).where(where).groupBy(tags.id, tags.name).orderBy(drizzleOrm.asc(tags.name)).all();
}
function listTags(handle2) {
  return handle2.db.select().from(tags).orderBy(drizzleOrm.asc(tags.name)).all();
}
function deleteOrphanedTags(handle2) {
  return handle2.sqlite.prepare("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM item_tags)").run().changes;
}
function now$2() {
  return Date.now();
}
function scopeCondition(scope) {
  switch (scope.kind) {
    case "all":
      return void 0;
    case "inbox":
      return drizzleOrm.isNull(items.projectId);
    case "project":
      return drizzleOrm.eq(items.projectId, scope.projectId);
  }
}
function createItem(handle2, input) {
  const run = handle2.sqlite.transaction(() => {
    const timestamp2 = now$2();
    const scope = input.scope ?? { kind: "inbox" };
    const status = input.status ?? "open";
    const [row] = handle2.db.insert(items).values({
      projectId: scope.kind === "project" ? scope.projectId : null,
      title: input.title ?? null,
      content: input.content ?? null,
      url: input.url ?? null,
      language: input.language ?? null,
      filePath: null,
      createdAt: timestamp2,
      updatedAt: timestamp2,
      status,
      priority: input.priority ?? null,
      dueAt: input.dueAt ?? null,
      doneAt: status === "done" ? timestamp2 : null
    }).returning().all();
    if (row === void 0) throw new Error("Failed to create item");
    const lists = input.lists !== void 0 && input.lists.length > 0 ? input.lists : [DEFAULT_LIST];
    for (const name of lists) {
      const tag = ensureTag(handle2, name);
      handle2.db.insert(itemTags).values({ itemId: row.id, tagId: tag.id }).onConflictDoNothing().run();
    }
    return row;
  });
  return run();
}
function getItem(handle2, id2) {
  return handle2.db.select().from(items).where(drizzleOrm.eq(items.id, id2)).get() ?? null;
}
function requireItem(handle2, id2) {
  const item = getItem(handle2, id2);
  if (item === null) throw new Error(`No item with id ${id2}`);
  return item;
}
function updateItem(handle2, id2, patch) {
  const existing = requireItem(handle2, id2);
  const [row] = handle2.db.update(items).set({
    title: patch.title !== void 0 ? patch.title : existing.title,
    content: patch.content !== void 0 ? patch.content : existing.content,
    url: patch.url !== void 0 ? patch.url : existing.url,
    language: patch.language !== void 0 ? patch.language : existing.language,
    priority: patch.priority !== void 0 ? patch.priority : existing.priority,
    dueAt: patch.dueAt !== void 0 ? patch.dueAt : existing.dueAt,
    updatedAt: now$2()
  }).where(drizzleOrm.eq(items.id, id2)).returning().all();
  if (row === void 0) throw new Error(`No item with id ${id2}`);
  return row;
}
function setItemStatus(handle2, id2, status) {
  const existing = requireItem(handle2, id2);
  const [row] = handle2.db.update(items).set({
    status,
    doneAt: status === "done" ? existing.doneAt ?? now$2() : null,
    updatedAt: now$2()
  }).where(drizzleOrm.eq(items.id, id2)).returning().all();
  if (row === void 0) throw new Error(`No item with id ${id2}`);
  return row;
}
function toggleItemDone(handle2, id2) {
  const existing = requireItem(handle2, id2);
  return setItemStatus(handle2, id2, existing.status === "done" ? "open" : "done");
}
function moveItem(handle2, id2, scope) {
  if (scope.kind === "all") throw new Error('Cannot move an item to scope "all"');
  requireItem(handle2, id2);
  const [row] = handle2.db.update(items).set({
    projectId: scope.kind === "project" ? scope.projectId : null,
    updatedAt: now$2()
  }).where(drizzleOrm.eq(items.id, id2)).returning().all();
  if (row === void 0) throw new Error(`No item with id ${id2}`);
  return row;
}
function deleteItem(handle2, id2) {
  return handle2.db.delete(items).where(drizzleOrm.eq(items.id, id2)).run().changes > 0;
}
function filterConditions(handle2, filter) {
  const conditions = [];
  const scoped = scopeCondition(filter.scope ?? { kind: "all" });
  if (scoped !== void 0) conditions.push(scoped);
  if (filter.statuses !== void 0 && filter.statuses.length > 0) {
    conditions.push(drizzleOrm.inArray(items.status, [...filter.statuses]));
  }
  if (filter.tagId !== void 0) {
    conditions.push(
      drizzleOrm.inArray(
        items.id,
        handle2.db.select({ id: itemTags.itemId }).from(itemTags).where(drizzleOrm.eq(itemTags.tagId, filter.tagId))
      )
    );
  }
  return conditions;
}
function listItems(handle2, filter = {}) {
  const conditions = filterConditions(handle2, filter);
  const order = filter.orderBy === "updated_desc" ? [drizzleOrm.desc(items.updatedAt), drizzleOrm.desc(items.id)] : [drizzleOrm.desc(items.createdAt), drizzleOrm.desc(items.id)];
  let query = handle2.db.select().from(items).where(conditions.length > 0 ? drizzleOrm.and(...conditions) : void 0).orderBy(...order).$dynamic();
  if (filter.limit !== void 0) query = query.limit(filter.limit);
  if (filter.offset !== void 0) query = query.offset(filter.offset);
  return query.all();
}
function countItems(handle2, filter = {}) {
  const conditions = filterConditions(handle2, filter);
  return handle2.db.select({ n: drizzleOrm.count() }).from(items).where(conditions.length > 0 ? drizzleOrm.and(...conditions) : void 0).get()?.n ?? 0;
}
function now$1() {
  return Date.now();
}
function requireName(raw) {
  const name = raw.trim();
  if (name.length === 0) throw new Error("Project name cannot be empty");
  return name;
}
function createProject(handle2, input) {
  const timestamp2 = now$1();
  const [row] = handle2.db.insert(projects).values({
    name: requireName(input.name),
    repoPath: input.repoPath ?? null,
    status: "active",
    createdAt: timestamp2,
    updatedAt: timestamp2
  }).returning().all();
  if (row === void 0) throw new Error("Failed to create project");
  return row;
}
function getProject(handle2, id2) {
  const row = handle2.db.select().from(projects).where(drizzleOrm.eq(projects.id, id2)).get();
  return row ?? null;
}
function listProjects(handle2, options = {}) {
  const order = drizzleOrm.sql`case ${projects.status} when 'active' then 0 when 'paused' then 1 else 2 end`;
  const query = handle2.db.select().from(projects);
  const rows = options.status === void 0 ? query.orderBy(order, drizzleOrm.asc(projects.name)).all() : query.where(drizzleOrm.eq(projects.status, options.status)).orderBy(drizzleOrm.asc(projects.name)).all();
  return rows;
}
function recentProjects(handle2, limit) {
  return handle2.db.select(drizzleOrm.getTableColumns(projects)).from(projects).innerJoin(items, drizzleOrm.eq(items.projectId, projects.id)).groupBy(projects.id).orderBy(drizzleOrm.desc(drizzleOrm.max(items.createdAt)), drizzleOrm.asc(projects.name)).limit(limit).all();
}
function renameProject(handle2, id2, name) {
  const [row] = handle2.db.update(projects).set({ name: requireName(name), updatedAt: now$1() }).where(drizzleOrm.eq(projects.id, id2)).returning().all();
  if (row === void 0) throw new Error(`No project with id ${id2}`);
  return row;
}
function setProjectStatus(handle2, id2, status) {
  const [row] = handle2.db.update(projects).set({ status, updatedAt: now$1() }).where(drizzleOrm.eq(projects.id, id2)).returning().all();
  if (row === void 0) throw new Error(`No project with id ${id2}`);
  return row;
}
function deleteProject(handle2, id2, mode) {
  return handle2.db.transaction((tx) => {
    const exists = tx.select({ id: projects.id }).from(projects).where(drizzleOrm.eq(projects.id, id2)).get();
    if (exists === void 0) throw new Error(`No project with id ${id2}`);
    let movedToInbox = 0;
    let deletedItems = 0;
    if (mode === "move_to_inbox") {
      movedToInbox = tx.update(items).set({ projectId: null, updatedAt: now$1() }).where(drizzleOrm.eq(items.projectId, id2)).run().changes;
    } else {
      deletedItems = tx.delete(items).where(drizzleOrm.eq(items.projectId, id2)).run().changes;
    }
    tx.delete(projects).where(drizzleOrm.eq(projects.id, id2)).run();
    return { movedToInbox, deletedItems };
  });
}
function projectStats(handle2, id2) {
  const open = handle2.db.select({ n: drizzleOrm.count() }).from(items).where(drizzleOrm.and(drizzleOrm.eq(items.projectId, id2), drizzleOrm.ne(items.status, "done"))).get()?.n ?? 0;
  const done = handle2.db.select({ n: drizzleOrm.count() }).from(items).where(drizzleOrm.and(drizzleOrm.eq(items.projectId, id2), drizzleOrm.eq(items.status, "done"))).get()?.n ?? 0;
  const total = handle2.db.select({ n: drizzleOrm.count() }).from(items).where(drizzleOrm.eq(items.projectId, id2)).get()?.n ?? 0;
  return { open, done, items: total };
}
function inboxCount(handle2) {
  return handle2.db.select({ n: drizzleOrm.count() }).from(items).where(drizzleOrm.isNull(items.projectId)).get()?.n ?? 0;
}
const ROW_ID = 1;
function now() {
  return Date.now();
}
function getScratchpad(handle2) {
  const existing = handle2.db.select().from(scratchpad).where(drizzleOrm.eq(scratchpad.id, ROW_ID)).get();
  if (existing !== void 0) {
    return {
      content: existing.content,
      projectId: existing.projectId,
      updatedAt: existing.updatedAt
    };
  }
  const timestamp2 = now();
  handle2.db.insert(scratchpad).values({ id: ROW_ID, content: "", projectId: null, updatedAt: timestamp2 }).run();
  return { content: "", projectId: null, updatedAt: timestamp2 };
}
function saveScratchpad(handle2, input) {
  getScratchpad(handle2);
  const timestamp2 = now();
  handle2.db.update(scratchpad).set({ content: input.content, projectId: input.projectId, updatedAt: timestamp2 }).where(drizzleOrm.eq(scratchpad.id, ROW_ID)).run();
  return { content: input.content, projectId: input.projectId, updatedAt: timestamp2 };
}
function commitScratchpad(handle2, options = {}) {
  const current = getScratchpad(handle2);
  const lines = parseBuffer(current.content, options.at ?? now());
  const run = handle2.sqlite.transaction(() => {
    const created = [];
    for (const line of lines) {
      if (!line.actionable) continue;
      const item = createItem(handle2, {
        lists: line.tags,
        scope: current.projectId === null ? { kind: "inbox" } : { kind: "project", projectId: current.projectId },
        title: line.title,
        ...line.dueAt !== null ? { dueAt: line.dueAt } : {}
      });
      created.push(item);
    }
    const remaining = lines.filter((line) => !line.actionable).map((line) => line.raw).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
    const timestamp2 = now();
    handle2.db.update(scratchpad).set({ content: remaining, updatedAt: timestamp2 }).where(drizzleOrm.eq(scratchpad.id, ROW_ID)).run();
    return {
      created,
      content: remaining,
      skipped: lines.filter((line) => !line.actionable && line.raw.trim() !== "").length
    };
  });
  return run();
}
function buildMatchQuery(input) {
  const tokens = input.split(/[^\p{L}\p{N}_]+/u).filter((token) => token.length > 0).map((token) => `"${token.replace(/"/g, '""')}"*`);
  if (tokens.length === 0) return null;
  return tokens.join(" ");
}
function toItem(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    content: row.content,
    url: row.url,
    language: row.language,
    filePath: row.file_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    doneAt: row.done_at
  };
}
function buildFilters(options) {
  const clauses = [];
  const params = [];
  const scope = options.scope ?? { kind: "all" };
  if (scope.kind === "inbox") {
    clauses.push("i.project_id IS NULL");
  } else if (scope.kind === "project") {
    clauses.push("i.project_id = ?");
    params.push(scope.projectId);
  }
  if (options.tagId !== void 0) {
    clauses.push("EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)");
    params.push(options.tagId);
  }
  return { sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "", params };
}
function searchItems(handle2, query, options = {}) {
  const match = buildMatchQuery(query);
  if (match === null) return [];
  const filters = buildFilters(options);
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const rows = handle2.sqlite.prepare(
    `SELECT
         i.*,
         highlight(items_fts, 0, ?, ?) AS title_marked,
         snippet(items_fts, 1, ?, ?, '…', 14) AS content_marked,
         bm25(items_fts) AS score
       FROM items_fts
       JOIN items i ON i.id = items_fts.rowid
       WHERE items_fts MATCH ?${filters.sql}
       ORDER BY score
       LIMIT ? OFFSET ?`
  ).all(
    HIGHLIGHT_START,
    HIGHLIGHT_END,
    HIGHLIGHT_START,
    HIGHLIGHT_END,
    match,
    ...filters.params,
    limit,
    offset
  );
  return rows.map((row) => ({
    item: toItem(row),
    titleMarked: row.title_marked,
    contentMarked: row.content_marked,
    score: row.score
  }));
}
function countSearchResults(handle2, query, options = {}) {
  const match = buildMatchQuery(query);
  if (match === null) return 0;
  const filters = buildFilters(options);
  return handle2.sqlite.prepare(
    `SELECT count(*) AS n
         FROM items_fts
         JOIN items i ON i.id = items_fts.rowid
         WHERE items_fts MATCH ?${filters.sql}`
  ).get(match, ...filters.params)?.n ?? 0;
}
let window$1 = null;
const WIDTH = 620;
const HEIGHT = 108;
function getQuickCaptureWindow() {
  if (window$1 !== null && !window$1.isDestroyed()) return window$1;
  window$1 = new electron.BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window$1.setAlwaysOnTop(true, "floating");
  window$1.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window$1.on("blur", () => window$1?.hide());
  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devServerUrl !== void 0) {
    void window$1.loadURL(`${devServerUrl}/quickCapture.html`);
  } else {
    void window$1.loadFile(node_path.join(__dirname, "../renderer/quickCapture.html"));
  }
  return window$1;
}
function showQuickCapture() {
  const target = getQuickCaptureWindow();
  const cursor = electron.screen.getCursorScreenPoint();
  const { workArea } = electron.screen.getDisplayNearestPoint(cursor);
  target.setBounds({
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height / 4),
    width: WIDTH,
    height: HEIGHT
  });
  target.show();
  target.focus();
}
function hideQuickCapture() {
  window$1?.hide();
}
function isQuickCaptureVisible() {
  return window$1 !== null && !window$1.isDestroyed() && window$1.isVisible();
}
const id = zod.z.number().int().positive();
const timestamp = zod.z.number().int().nonnegative();
const itemStatus = zod.z.enum(ITEM_STATUSES);
const projectStatus = zod.z.enum(PROJECT_STATUSES);
const title = zod.z.string().max(500).nullable().optional();
const content = zod.z.string().max(1e6).nullable().optional();
const url = zod.z.string().max(2048).nullable().optional();
const language = zod.z.string().max(32).nullable().optional();
const priority = zod.z.number().int().min(1).max(9).nullable().optional();
const listName = zod.z.string().min(1).max(64);
const itemScope = zod.z.discriminatedUnion("kind", [
  zod.z.object({ kind: zod.z.literal("all") }),
  zod.z.object({ kind: zod.z.literal("inbox") }),
  zod.z.object({ kind: zod.z.literal("project"), projectId: id })
]);
const listItemsFilter = zod.z.object({
  scope: itemScope.optional(),
  statuses: zod.z.array(itemStatus).max(ITEM_STATUSES.length).optional(),
  tagId: id.optional(),
  orderBy: zod.z.enum(["created_desc", "updated_desc"]).optional(),
  limit: zod.z.number().int().min(1).max(5e3).optional(),
  offset: zod.z.number().int().nonnegative().optional()
});
const searchInput = zod.z.object({
  query: zod.z.string().max(500),
  scope: itemScope.optional(),
  tagId: id.optional(),
  limit: zod.z.number().int().min(1).max(500).optional(),
  offset: zod.z.number().int().nonnegative().optional()
});
const SCHEMAS = {
  "app:health": zod.z.void(),
  "projects:list": zod.z.object({ status: projectStatus.optional() }),
  "projects:get": zod.z.object({ id }),
  "projects:create": zod.z.object({
    name: zod.z.string().min(1).max(200),
    repoPath: zod.z.string().max(4096).nullable().optional()
  }),
  "projects:rename": zod.z.object({ id, name: zod.z.string().min(1).max(200) }),
  "projects:setStatus": zod.z.object({ id, status: projectStatus }),
  "projects:delete": zod.z.object({
    id,
    // No default: the caller must have asked the user which one they meant.
    mode: zod.z.enum(["move_to_inbox", "delete_items"])
  }),
  "projects:stats": zod.z.object({ id }),
  "projects:recent": zod.z.object({ limit: zod.z.number().int().min(1).max(50) }),
  "items:list": listItemsFilter,
  "items:count": listItemsFilter,
  "items:get": zod.z.object({ id }),
  "items:create": zod.z.object({
    lists: zod.z.array(listName).max(50).optional(),
    scope: itemScope.optional(),
    title,
    content,
    url,
    language,
    status: itemStatus.optional(),
    priority,
    dueAt: timestamp.nullable().optional()
  }),
  "items:update": zod.z.object({
    id,
    patch: zod.z.object({
      title,
      content,
      url,
      language,
      priority,
      dueAt: timestamp.nullable().optional()
    })
  }),
  "items:delete": zod.z.object({ id }),
  "items:setStatus": zod.z.object({ id, status: itemStatus }),
  "items:toggleDone": zod.z.object({ id }),
  "items:move": zod.z.object({ id, scope: itemScope }),
  "items:inboxCount": zod.z.void(),
  "tags:list": zod.z.void(),
  "tags:listWithCounts": zod.z.object({ scope: itemScope.optional() }),
  "tags:forItem": zod.z.object({ itemId: id }),
  // Matches the largest page items:list can return.
  "tags:forItems": zod.z.object({ itemIds: zod.z.array(id).max(5e3) }),
  "tags:add": zod.z.object({ itemId: id, name: listName }),
  "tags:remove": zod.z.object({ itemId: id, tagId: id }),
  "search:query": searchInput,
  "search:count": searchInput,
  "work:today": zod.z.void(),
  "work:upcoming": zod.z.void(),
  "work:allOpen": zod.z.void(),
  "work:done": zod.z.object({ limit: zod.z.number().int().min(1).max(1e3).optional() }),
  "work:counts": zod.z.void(),
  "activity:calendar": zod.z.void(),
  "capture:save": zod.z.object({ text: zod.z.string().max(2e3) }),
  "capture:close": zod.z.void(),
  "scratchpad:get": zod.z.void(),
  // Generous but bounded: a scratchpad is a working buffer, not a document store.
  "scratchpad:save": zod.z.object({
    content: zod.z.string().max(2e5),
    projectId: id.nullable()
  }),
  "scratchpad:commit": zod.z.void()
};
const registered = /* @__PURE__ */ new Set();
function handle(channel, run) {
  const schema2 = SCHEMAS[channel];
  electron.ipcMain.handle(channel, (_event, raw) => {
    const parsed = schema2.safeParse(raw);
    if (!parsed.success) {
      console.error(`[ipc] invalid payload on ${channel}:`, parsed.error.issues);
      throw new Error(`Invalid request on ${channel}`);
    }
    return run(parsed.data);
  });
  registered.add(channel);
}
function registerIpcHandlers() {
  handle("app:health", () => {
    const { sqlite } = getDatabase();
    const count = (table) => sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    return {
      electronVersion: process.versions.electron,
      sqliteVersion: sqlite.prepare("SELECT sqlite_version() AS v").get().v,
      userDataPath: electron.app.getPath("userData"),
      itemCount: count("items"),
      projectCount: count("projects")
    };
  });
  handle("projects:list", (input) => listProjects(getDatabase(), input));
  handle("projects:get", ({ id: id2 }) => getProject(getDatabase(), id2));
  handle("projects:create", (input) => createProject(getDatabase(), input));
  handle("projects:rename", ({ id: id2, name }) => renameProject(getDatabase(), id2, name));
  handle("projects:setStatus", ({ id: id2, status }) => setProjectStatus(getDatabase(), id2, status));
  handle("projects:delete", ({ id: id2, mode }) => deleteProject(getDatabase(), id2, mode));
  handle("projects:stats", ({ id: id2 }) => projectStats(getDatabase(), id2));
  handle("projects:recent", ({ limit }) => recentProjects(getDatabase(), limit));
  handle("items:list", (filter) => listItems(getDatabase(), filter));
  handle("items:count", (filter) => countItems(getDatabase(), filter));
  handle("items:get", ({ id: id2 }) => getItem(getDatabase(), id2));
  handle("items:create", (input) => createItem(getDatabase(), input));
  handle("items:update", ({ id: id2, patch }) => updateItem(getDatabase(), id2, patch));
  handle("items:delete", ({ id: id2 }) => deleteItem(getDatabase(), id2));
  handle("items:setStatus", ({ id: id2, status }) => setItemStatus(getDatabase(), id2, status));
  handle("items:toggleDone", ({ id: id2 }) => toggleItemDone(getDatabase(), id2));
  handle("items:move", ({ id: id2, scope }) => moveItem(getDatabase(), id2, scope));
  handle("items:inboxCount", () => inboxCount(getDatabase()));
  handle("tags:list", () => listTags(getDatabase()));
  handle("tags:listWithCounts", ({ scope }) => listTagsWithCounts(getDatabase(), scope));
  handle("tags:forItem", ({ itemId }) => tagsForItem(getDatabase(), itemId));
  handle("tags:forItems", ({ itemIds }) => tagsForItems(getDatabase(), itemIds));
  handle("tags:add", ({ itemId, name }) => addTagToItem(getDatabase(), itemId, name));
  handle("tags:remove", ({ itemId, tagId }) => {
    const handleDb = getDatabase();
    const removed = removeTagFromItem(handleDb, itemId, tagId);
    if (removed) deleteOrphanedTags(handleDb);
    return removed;
  });
  handle("search:query", ({ query, ...options }) => searchItems(getDatabase(), query, options));
  handle(
    "search:count",
    ({ query, ...options }) => countSearchResults(getDatabase(), query, options)
  );
  handle("work:today", () => todayItems(getDatabase()));
  handle("work:upcoming", () => upcomingItems(getDatabase()));
  handle("work:allOpen", () => allOpenItems(getDatabase()));
  handle("work:done", ({ limit }) => doneItems(getDatabase(), limit));
  handle("work:counts", () => workCounts(getDatabase()));
  handle("activity:calendar", () => activityCalendar(getDatabase()));
  handle("capture:save", ({ text }) => {
    const parsed = parseLine(text);
    if (!parsed.actionable) return null;
    const item = createItem(getDatabase(), {
      lists: parsed.tags,
      scope: { kind: "inbox" },
      title: parsed.title,
      dueAt: parsed.dueAt
    });
    broadcastDataChanged();
    return item;
  });
  handle("capture:close", () => {
    hideQuickCapture();
  });
  handle("scratchpad:get", () => getScratchpad(getDatabase()));
  handle("scratchpad:save", (input) => saveScratchpad(getDatabase(), input));
  handle("scratchpad:commit", () => {
    const result = commitScratchpad(getDatabase());
    if (result.created.length > 0) broadcastDataChanged();
    return result;
  });
  assertEveryChannelRegistered();
}
function assertEveryChannelRegistered() {
  const missing = IPC_CHANNELS.filter((channel) => !registered.has(channel));
  if (missing.length > 0) {
    throw new Error(`IPC channels declared but not handled: ${missing.join(", ")}`);
  }
}
function broadcastDataChanged() {
  for (const window2 of electron.BrowserWindow.getAllWindows()) {
    window2.webContents.send(EVENTS.dataChanged);
  }
}
const DEFAULTS = {
  loginItemInitialised: false
};
function settingsFile(userDataPath) {
  return node_path.join(userDataPath, "settings.json");
}
function readSettings(userDataPath) {
  const file = settingsFile(userDataPath);
  if (!node_fs.existsSync(file)) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(node_fs.readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULTS };
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}
function writeSettings(userDataPath, settings) {
  const file = settingsFile(userDataPath);
  node_fs.mkdirSync(node_path.dirname(file), { recursive: true });
  node_fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}
`);
}
let window = null;
let quitting = false;
function markQuitting() {
  quitting = true;
}
function getMainWindow() {
  if (window !== null && !window.isDestroyed()) return window;
  window = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: "DevVault",
    backgroundColor: "#0b0f14",
    autoHideMenuBar: true,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.once("ready-to-show", () => window?.show());
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    window?.hide();
  });
  window.webContents.setWindowOpenHandler(({ url: url2 }) => {
    void electron.shell.openExternal(url2);
    return { action: "deny" };
  });
  loadRenderer(window);
  return window;
}
function showMainWindow() {
  const target = getMainWindow();
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
}
function toggleMainWindow() {
  const target = getMainWindow();
  if (target.isVisible() && target.isFocused()) {
    target.hide();
    return;
  }
  showMainWindow();
}
function loadRenderer(target) {
  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devServerUrl !== void 0) {
    void target.loadURL(devServerUrl);
  } else {
    void target.loadFile(node_path.join(__dirname, "../renderer/index.html"));
  }
}
const ACCELERATORS = {
  /** Show / hide the main window. */
  mainWindow: "CommandOrControl+Shift+O",
  /** Show the one-line capture box. */
  quickCapture: "CommandOrControl+Shift+Space",
  /** Toggle the search palette. Only while the main window is focused. */
  searchPalette: "Alt+Space"
};
function registerGlobalShortcuts() {
  const results = [];
  results.push({
    accelerator: ACCELERATORS.mainWindow,
    registered: electron.globalShortcut.register(ACCELERATORS.mainWindow, toggleMainWindow)
  });
  results.push({
    accelerator: ACCELERATORS.quickCapture,
    registered: electron.globalShortcut.register(ACCELERATORS.quickCapture, () => {
      if (isQuickCaptureVisible()) hideQuickCapture();
      else showQuickCapture();
    })
  });
  for (const result of results) {
    if (!result.registered) {
      console.warn(
        `[shortcuts] ${result.accelerator} is already taken by another app — that hotkey will not work.`
      );
    }
  }
  return results;
}
function bindSearchPaletteShortcut() {
  const window2 = getMainWindow();
  const accelerator = ACCELERATORS.searchPalette;
  function claim() {
    if (electron.globalShortcut.isRegistered(accelerator)) return;
    const registered2 = electron.globalShortcut.register(accelerator, () => {
      getMainWindow().webContents.send(EVENTS.toggleSearch);
    });
    if (!registered2) {
      console.warn(`[shortcuts] ${accelerator} is taken by another app — the search palette hotkey will not work.`);
    }
  }
  window2.on("focus", claim);
  window2.on("blur", () => electron.globalShortcut.unregister(accelerator));
  if (window2.isFocused()) claim();
}
function unregisterGlobalShortcuts() {
  electron.globalShortcut.unregisterAll();
}
let tray = null;
function createTray(appRoot) {
  if (tray !== null && !tray.isDestroyed()) return tray;
  const icon = electron.nativeImage.createFromPath(node_path.join(appRoot, "resources", "tray.png"));
  tray = new electron.Tray(icon);
  tray.setToolTip("DevVault");
  tray.setContextMenu(
    electron.Menu.buildFromTemplate([
      {
        label: "Open DevVault",
        accelerator: ACCELERATORS.mainWindow,
        click: () => showMainWindow()
      },
      {
        label: "Quick capture",
        accelerator: ACCELERATORS.quickCapture,
        click: () => showQuickCapture()
      },
      { type: "separator" },
      {
        label: "Start DevVault at login",
        type: "checkbox",
        checked: electron.app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => setOpenAtLogin(menuItem.checked)
      },
      { type: "separator" },
      {
        label: "Quit DevVault",
        click: () => {
          markQuitting();
          electron.app.quit();
        }
      }
    ])
  );
  tray.on("click", () => showMainWindow());
  return tray;
}
function destroyTray() {
  tray?.destroy();
  tray = null;
}
function setOpenAtLogin(enabled) {
  electron.app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: enabled ? ["--hidden"] : []
  });
}
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.quit();
}
electron.app.on("second-instance", () => {
  showMainWindow();
});
const startHidden = process.argv.includes("--hidden");
void electron.app.whenReady().then(() => {
  try {
    initDatabase({ userDataPath: electron.app.getPath("userData"), appRoot: electron.app.getAppPath() });
  } catch (error) {
    electron.dialog.showErrorBox(
      "DevVault could not open its database",
      error instanceof Error ? `${error.message}

${error.stack ?? ""}` : String(error)
    );
    electron.app.exit(1);
    return;
  }
  registerIpcHandlers();
  createTray(electron.app.getAppPath());
  const userDataPath = electron.app.getPath("userData");
  const settings = readSettings(userDataPath);
  if (!settings.loginItemInitialised) {
    setOpenAtLogin(true);
    writeSettings(userDataPath, { ...settings, loginItemInitialised: true });
  }
  const shortcuts = registerGlobalShortcuts();
  const failed = shortcuts.filter((entry) => !entry.registered);
  if (failed.length > 0) {
    electron.dialog.showMessageBox({
      type: "warning",
      title: "Some hotkeys are unavailable",
      message: "Another application already owns these shortcuts:",
      detail: `${failed.map((entry) => `  ${entry.accelerator}`).join("\n")}

DevVault still works; those keys just will not summon it.`
    });
  }
  if (startHidden) {
    getMainWindow();
  } else {
    showMainWindow();
  }
  bindSearchPaletteShortcut();
  electron.app.on("activate", () => showMainWindow());
});
electron.app.on("window-all-closed", () => {
});
electron.app.on("before-quit", () => {
  markQuitting();
});
electron.app.on("will-quit", () => {
  unregisterGlobalShortcuts();
  destroyTray();
  closeDatabase();
});
electron.app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
});
