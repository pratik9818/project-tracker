import { describe, expect, it } from 'vitest'
import { nextMarker, parseBuffer, parseLine, parseSchedule, parseTimeOfDay } from '../parseLine'

/** A fixed Thursday at 10:00, so weekday and time maths is deterministic. */
const THURSDAY = new Date(2026, 0, 15, 10, 0, 0, 0).getTime()

function dayOf(ms: number | null): string {
  if (ms === null) return 'null'
  const d = new Date(ms)
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
}

function timeOf(ms: number | null): string {
  if (ms === null) return 'null'
  const d = new Date(ms)
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}

describe('parseTimeOfDay', () => {
  it('reads 24-hour times', () => {
    expect(parseTimeOfDay('14:30')).toEqual({ hours: 14, minutes: 30 })
    expect(parseTimeOfDay('09:00')).toEqual({ hours: 9, minutes: 0 })
    expect(parseTimeOfDay('23:59')).toEqual({ hours: 23, minutes: 59 })
  })

  it('reads am/pm times', () => {
    expect(parseTimeOfDay('9am')).toEqual({ hours: 9, minutes: 0 })
    expect(parseTimeOfDay('2pm')).toEqual({ hours: 14, minutes: 0 })
    expect(parseTimeOfDay('2:30pm')).toEqual({ hours: 14, minutes: 30 })
    expect(parseTimeOfDay('12am')).toEqual({ hours: 0, minutes: 0 })
    expect(parseTimeOfDay('12pm')).toEqual({ hours: 12, minutes: 0 })
  })

  it('rejects impossible times', () => {
    expect(parseTimeOfDay('25:00')).toBeNull()
    expect(parseTimeOfDay('10:75')).toBeNull()
    expect(parseTimeOfDay('13pm')).toBeNull()
    expect(parseTimeOfDay('nonsense')).toBeNull()
  })
})

describe('parseSchedule', () => {
  it('reads relative days at midday', () => {
    expect(dayOf(parseSchedule('today', THURSDAY)?.at ?? null)).toBe('2026-01-15')
    expect(dayOf(parseSchedule('tomorrow', THURSDAY)?.at ?? null)).toBe('2026-01-16')
    expect(timeOf(parseSchedule('tomorrow', THURSDAY)?.at ?? null)).toBe('12:00')
    expect(parseSchedule('tomorrow', THURSDAY)?.hasTime).toBe(false)
  })

  it('reads a weekday as the next one coming up', () => {
    expect(dayOf(parseSchedule('fri', THURSDAY)?.at ?? null)).toBe('2026-01-16')
    expect(dayOf(parseSchedule('thu', THURSDAY)?.at ?? null)).toBe('2026-01-22')
  })

  it('reads day and week offsets', () => {
    expect(dayOf(parseSchedule('3d', THURSDAY)?.at ?? null)).toBe('2026-01-18')
    expect(dayOf(parseSchedule('2w', THURSDAY)?.at ?? null)).toBe('2026-01-29')
  })

  it('reads an explicit date', () => {
    expect(dayOf(parseSchedule('2026-03-09', THURSDAY)?.at ?? null)).toBe('2026-03-09')
  })

  it('treats a bare time as today at that time', () => {
    const result = parseSchedule('14:30', THURSDAY)

    expect(dayOf(result?.at ?? null)).toBe('2026-01-15')
    expect(timeOf(result?.at ?? null)).toBe('14:30')
    expect(result?.hasTime).toBe(true)
  })

  it('combines a date and a time with +', () => {
    const result = parseSchedule('tomorrow+09:00', THURSDAY)

    expect(dayOf(result?.at ?? null)).toBe('2026-01-16')
    expect(timeOf(result?.at ?? null)).toBe('09:00')
    expect(result?.hasTime).toBe(true)
  })

  it('combines an explicit date with a time', () => {
    const result = parseSchedule('2026-03-09+2pm', THURSDAY)

    expect(dayOf(result?.at ?? null)).toBe('2026-03-09')
    expect(timeOf(result?.at ?? null)).toBe('14:00')
  })

  it('combines a weekday with a time', () => {
    const result = parseSchedule('fri+9am', THURSDAY)

    expect(dayOf(result?.at ?? null)).toBe('2026-01-16')
    expect(timeOf(result?.at ?? null)).toBe('09:00')
  })

  it('returns null for anything it cannot resolve', () => {
    expect(parseSchedule('someday', THURSDAY)).toBeNull()
    expect(parseSchedule('tomorrow+99:99', THURSDAY)).toBeNull()
    expect(parseSchedule('', THURSDAY)).toBeNull()
  })
})

describe('parseLine', () => {
  it('reports no lists for a bare line (createItem applies the default)', () => {
    const line = parseLine('wire the export button', THURSDAY)

    expect(line.tags).toEqual([])
    expect(line.title).toBe('wire the export button')
    expect(line.actionable).toBe(true)
  })

  it('treats every #word as a list name — there are no reserved words', () => {
    expect(parseLine('#bug it crashes', THURSDAY)).toMatchObject({
      title: 'it crashes',
      tags: ['bug']
    })
    expect(parseLine('#todo explicit', THURSDAY).tags).toEqual(['todo'])
    expect(parseLine('#nottoday later', THURSDAY).tags).toEqual(['nottoday'])
  })

  it('accepts a #list anywhere in the line', () => {
    expect(parseLine('it crashes on open #bug', THURSDAY)).toMatchObject({
      tags: ['bug'],
      title: 'it crashes on open'
    })
  })

  it('keeps every #list, in the order typed', () => {
    const line = parseLine('#bug it crashes #regression #urgent', THURSDAY)

    expect(line.tags).toEqual(['bug', 'regression', 'urgent'])
    expect(line.title).toBe('it crashes')
  })

  it('lowercases and de-duplicates lists', () => {
    expect(parseLine('thing #Alpha #alpha #BETA', THURSDAY).tags).toEqual(['alpha', 'beta'])
  })

  describe('list markers', () => {
    it('strips a numeric marker', () => {
      const line = parseLine('1. wire the export button', THURSDAY)

      expect(line.marker).toBe('1.')
      expect(line.title).toBe('wire the export button')
    })

    it('strips alphabetic and bullet markers', () => {
      expect(parseLine('a. first', THURSDAY)).toMatchObject({ marker: 'a.', title: 'first' })
      expect(parseLine('b) second', THURSDAY)).toMatchObject({ marker: 'b)', title: 'second' })
      expect(parseLine('. bullet', THURSDAY)).toMatchObject({ marker: '.', title: 'bullet' })
      expect(parseLine('- dash', THURSDAY)).toMatchObject({ marker: '-', title: 'dash' })
      expect(parseLine('* star', THURSDAY)).toMatchObject({ marker: '*', title: 'star' })
    })

    it('does not mistake a decimal for a marker', () => {
      const line = parseLine('3.14 is pi', THURSDAY)

      expect(line.marker).toBeNull()
      expect(line.title).toBe('3.14 is pi')
    })

    it('combines a marker with lists and a schedule', () => {
      const line = parseLine('2. #bug search drops keys #regression @fri+9am', THURSDAY)

      expect(line.marker).toBe('2.')
      expect(line.title).toBe('search drops keys')
      expect(line.tags).toEqual(['bug', 'regression'])
      expect(dayOf(line.dueAt)).toBe('2026-01-16')
      expect(timeOf(line.dueAt)).toBe('09:00')
    })
  })

  describe('scheduling', () => {
    it('reads @tomorrow and removes it from the title', () => {
      const line = parseLine('ship it @tomorrow', THURSDAY)

      expect(line.title).toBe('ship it')
      expect(dayOf(line.dueAt)).toBe('2026-01-16')
      expect(line.hasTime).toBe(false)
    })

    it('reads a bare time as today', () => {
      const line = parseLine('standup @09:30', THURSDAY)

      expect(dayOf(line.dueAt)).toBe('2026-01-15')
      expect(timeOf(line.dueAt)).toBe('09:30')
      expect(line.hasTime).toBe(true)
    })

    it('reads date+time', () => {
      const line = parseLine('deploy @2026-01-20+14:30', THURSDAY)

      expect(dayOf(line.dueAt)).toBe('2026-01-20')
      expect(timeOf(line.dueAt)).toBe('14:30')
    })

    it('leaves an unrecognised @token in the title rather than losing it', () => {
      const line = parseLine('email @someone about it', THURSDAY)

      expect(line.dueAt).toBeNull()
      expect(line.title).toBe('email @someone about it')
    })

    it('schedules an entry in any list', () => {
      const line = parseLine('#note remember this @tomorrow', THURSDAY)

      expect(line.tags).toEqual(['note'])
      expect(dayOf(line.dueAt)).toBe('2026-01-16')
      expect(line.title).toBe('remember this')
    })
  })

  it('does not treat a mid-word # or @ as a marker', () => {
    const line = parseLine('issue#42 for name@example.com', THURSDAY)

    expect(line.tags).toEqual([])
    expect(line.dueAt).toBeNull()
    expect(line.title).toBe('issue#42 for name@example.com')
  })

  it('marks blanks and // comments as not actionable', () => {
    expect(parseLine('', THURSDAY).actionable).toBe(false)
    expect(parseLine('   ', THURSDAY).actionable).toBe(false)
    expect(parseLine('// a note to self', THURSDAY).actionable).toBe(false)
  })

  it('marks a line of nothing but markers as not actionable', () => {
    expect(parseLine('#bug @fri', THURSDAY).actionable).toBe(false)
    expect(parseLine('1.    ', THURSDAY).actionable).toBe(false)
  })

  it('keeps the raw line for the editor to line up against', () => {
    expect(parseLine('1.  spaced  ', THURSDAY).raw).toBe('1.  spaced  ')
  })
})

describe('nextMarker', () => {
  it('increments a numbered marker', () => {
    expect(nextMarker('1.')).toBe('2.')
    expect(nextMarker('9.')).toBe('10.')
    expect(nextMarker('3)')).toBe('4)')
  })

  it('increments a lettered marker', () => {
    expect(nextMarker('a.')).toBe('b.')
    expect(nextMarker('c)')).toBe('d)')
    expect(nextMarker('A.')).toBe('B.')
  })

  it('wraps z round to a rather than running past the alphabet', () => {
    expect(nextMarker('z.')).toBe('a.')
    expect(nextMarker('Z.')).toBe('A.')
  })

  it('repeats a bullet', () => {
    expect(nextMarker('-')).toBe('-')
    expect(nextMarker('*')).toBe('*')
    expect(nextMarker('.')).toBe('.')
  })

  it('starts a numbered list when there is no marker yet', () => {
    expect(nextMarker(null)).toBe('1.')
  })
})

describe('parseBuffer', () => {
  it('returns one entry per line', () => {
    const lines = parseBuffer('1. one\n\n2. #note two\n// comment', THURSDAY)

    expect(lines).toHaveLength(4)
    expect(lines.map((line) => line.actionable)).toEqual([true, false, true, false])
    expect(lines[0]?.title).toBe('one')
    expect(lines[2]?.tags).toEqual(['note'])
  })
})
