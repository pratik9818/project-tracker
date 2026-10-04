/**
 * Parses one Scratchpad line.
 *
 * Everything is a marker — there are no `todo:` style prefixes. `#` names the
 * list(s) an entry goes in and `@` schedules, and that is the whole syntax.
 *
 *   1. wire the export button #urgent @tomorrow+14:30
 *   2. #bug search drops the last keystroke #regression @fri
 *   a. #nottoday rewrite the importer
 *   .  pick up where I left off @14:00
 *
 * There are no reserved words: `#bug`, `#todo` and `#nottoday` are all just
 * list names the user picked. A line with no `#` at all is filed under
 * DEFAULT_LIST — that default is applied by createItem(), not here, so the
 * parse reports only what was actually typed.
 */

export interface ParsedLine {
  /** The original line, unchanged. */
  raw: string
  /** The list marker as typed ("1.", "a.", "."), or null. */
  marker: string | null
  /** The line with the marker, #lists and @schedule removed. */
  title: string
  /** Lowercased list names (tags), de-duplicated, in the order typed. */
  tags: string[]
  /** Unix ms, or null if no @schedule was given. */
  dueAt: number | null
  /** The @token as typed, so the UI can show what it understood. */
  dueToken: string | null
  /** True when the schedule included a time of day, not just a date. */
  hasTime: boolean
  /** False for blank lines and `//` comments — nothing to create. */
  actionable: boolean
}

/**
 * A leading list marker: `1.` `2)` `a.` `b)` or a bare `.` `-` `*`.
 *
 * Whitespace after the marker is required, so a decimal like `3.14` is never
 * mistaken for item 3.
 */
const LIST_MARKER = /^\s*(\d+[.)]|[a-zA-Z][.)]|[-*.])\s+/

/** `#tag` — not preceded by a word character, so `issue#42` is left alone. */
const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu

/** `@schedule` — may contain `:` and `+` for times and date+time pairs. */
const SCHEDULE_PATTERN = /(?:^|\s)@([\p{L}\p{N}:+._-]+)/u

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export interface TimeOfDay {
  hours: number
  minutes: number
}

/**
 * `14:30`, `9:00`, `9am`, `2pm`, `2:30pm`.
 *
 * Returns null rather than guessing — an unparsed token is left in the title,
 * which is far better than silently scheduling something for the wrong time.
 */
export function parseTimeOfDay(token: string): TimeOfDay | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(token.trim())
  if (match === null) return null

  const rawHours = Number(match[1])
  const minutes = match[2] === undefined ? 0 : Number(match[2])
  const meridiem = match[3]?.toLowerCase()

  if (Number.isNaN(rawHours) || Number.isNaN(minutes)) return null
  if (minutes > 59) return null

  let hours = rawHours
  if (meridiem !== undefined) {
    if (rawHours < 1 || rawHours > 12) return null
    hours = rawHours % 12
    if (meridiem === 'pm') hours += 12
  } else {
    // Without am/pm it must be a real 24-hour value. A bare "9" is ambiguous
    // enough that we only accept it when it could not be anything else.
    if (rawHours > 23) return null
  }

  return { hours, minutes }
}

/** Resolves the date half of a schedule to a local date, time not yet applied. */
function parseDatePart(token: string, now: number): Date | null {
  const value = token.toLowerCase()
  const date = new Date(now)

  if (value === 'today' || value === 'tod') return date
  if (value === 'tomorrow' || value === 'tmr' || value === 'tom') {
    date.setDate(date.getDate() + 1)
    return date
  }
  if (value === 'yesterday') {
    date.setDate(date.getDate() - 1)
    return date
  }

  // A weekday name means the next one coming up, never today.
  const weekday = WEEKDAYS.indexOf(value.slice(0, 3) as (typeof WEEKDAYS)[number])
  if (weekday !== -1 && value.length >= 3 && /^[a-z]+$/.test(value)) {
    const delta = (weekday - date.getDay() + 7) % 7
    date.setDate(date.getDate() + (delta === 0 ? 7 : delta))
    return date
  }

  const offset = /^(\d+)([dw])$/.exec(value)
  if (offset !== null) {
    const amount = Number(offset[1])
    date.setDate(date.getDate() + (offset[2] === 'w' ? amount * 7 : amount))
    return date
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token)
  if (iso !== null) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const parsed = new Date(year, month - 1, day)
    // Reject dates JavaScript would silently roll over, like 2026-02-31.
    if (parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null
    return parsed
  }

  return null
}

export interface ParsedSchedule {
  at: number
  hasTime: boolean
}

/**
 * Resolves a whole `@token` into a timestamp.
 *
 *   @today            today at midday
 *   @tomorrow         tomorrow at midday
 *   @fri              next Friday at midday
 *   @3d  @2w          relative offsets
 *   @2026-01-20       an explicit date
 *   @14:30  @2pm      TODAY at that time
 *   @tomorrow+09:00   a date and a time
 *
 * Date-only schedules land at **local midday**, never midnight, so a timezone
 * or daylight-saving shift can never slide them onto the previous day.
 */
export function parseSchedule(token: string, now: number = Date.now()): ParsedSchedule | null {
  const [datePart, timePart] = token.split('+')
  if (datePart === undefined || datePart === '') return null

  // Only one part: a date if it reads as one, otherwise a time for today.
  if (timePart === undefined) {
    const date = parseDatePart(datePart, now)
    if (date !== null) {
      date.setHours(12, 0, 0, 0)
      return { at: date.getTime(), hasTime: false }
    }

    const time = parseTimeOfDay(datePart)
    if (time !== null) {
      const today = new Date(now)
      today.setHours(time.hours, time.minutes, 0, 0)
      return { at: today.getTime(), hasTime: true }
    }

    return null
  }

  const date = parseDatePart(datePart, now)
  const time = parseTimeOfDay(timePart)
  if (date === null || time === null) return null

  date.setHours(time.hours, time.minutes, 0, 0)
  return { at: date.getTime(), hasTime: true }
}

export function parseLine(raw: string, now: number = Date.now()): ParsedLine {
  const blank: ParsedLine = {
    raw,
    marker: null,
    title: '',
    tags: [],
    dueAt: null,
    dueToken: null,
    hasTime: false,
    actionable: false
  }

  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.startsWith('//')) return blank

  // 1. The list marker, which is presentation only.
  let rest = raw
  let marker: string | null = null
  const markerMatch = LIST_MARKER.exec(rest)
  if (markerMatch !== null) {
    marker = markerMatch[1] ?? null
    rest = rest.slice(markerMatch[0].length)
  }
  rest = rest.trim()

  // 2. #words: every one is a list name.
  const tags: string[] = []

  for (const match of rest.matchAll(TAG_PATTERN)) {
    const word = match[1]?.toLowerCase()
    if (word === undefined) continue
    if (!tags.includes(word)) tags.push(word)
  }
  rest = rest.replace(TAG_PATTERN, ' ')

  // 3. @schedule. Only the first recognised one counts.
  let dueAt: number | null = null
  let dueToken: string | null = null
  let hasTime = false
  const scheduleMatch = SCHEDULE_PATTERN.exec(rest)
  if (scheduleMatch !== null && scheduleMatch[1] !== undefined) {
    const parsed = parseSchedule(scheduleMatch[1], now)
    if (parsed !== null) {
      dueAt = parsed.at
      hasTime = parsed.hasTime
      dueToken = scheduleMatch[1]
      rest = rest.replace(scheduleMatch[0], ' ')
    }
  }

  const title = rest.replace(/\s+/g, ' ').trim()
  if (title === '') {
    return { ...blank, raw, marker, tags, dueAt, dueToken, hasTime }
  }

  return { raw, marker, title, tags, dueAt, dueToken, hasTime, actionable: true }
}

export function parseBuffer(buffer: string, now: number = Date.now()): ParsedLine[] {
  return buffer.split('\n').map((line) => parseLine(line, now))
}

/**
 * The marker that should follow `marker` in the same list style.
 *
 * `1.` -> `2.`, `c)` -> `d)`, a bare bullet repeats itself, and nothing at all
 * starts a numbered list at 1.
 */
export function nextMarker(marker: string | null): string {
  if (marker === null) return '1.'

  const numeric = /^(\d+)([.)])$/.exec(marker)
  if (numeric !== null) return `${Number(numeric[1]) + 1}${numeric[2]}`

  const alpha = /^([a-zA-Z])([.)])$/.exec(marker)
  if (alpha !== null) {
    const letter = alpha[1] ?? 'a'
    // Wrap z -> a rather than running off the end of the alphabet.
    const next = letter === 'z' ? 'a' : letter === 'Z' ? 'A' : String.fromCharCode(letter.charCodeAt(0) + 1)
    return `${next}${alpha[2]}`
  }

  return marker
}
