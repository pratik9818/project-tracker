import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/ipc'
import { SCHEMAS } from '../schemas'

/**
 * These tests guard the trust boundary. The renderer is untrusted, so a
 * malformed payload must be rejected before it can reach any database code.
 */

describe('IPC schema coverage', () => {
  it('has a schema for every channel in the contract', () => {
    const missing = IPC_CHANNELS.filter((channel) => SCHEMAS[channel] === undefined)
    expect(missing).toEqual([])
  })

  it('declares no schema for a channel that is not in the contract', () => {
    const extra = Object.keys(SCHEMAS).filter(
      (key) => !IPC_CHANNELS.includes(key as (typeof IPC_CHANNELS)[number])
    )
    expect(extra).toEqual([])
  })
})

describe('IPC input validation', () => {
  it('accepts a well-formed payload', () => {
    expect(SCHEMAS['projects:create'].safeParse({ name: 'Alpha' }).success).toBe(true)
    expect(
      SCHEMAS['items:create'].safeParse({ title: 'Do it', status: 'open' }).success
    ).toBe(true)
    expect(SCHEMAS['items:list'].safeParse({}).success).toBe(true)
  })

  it('rejects a missing required field', () => {
    expect(SCHEMAS['projects:create'].safeParse({}).success).toBe(false)
    expect(SCHEMAS['projects:get'].safeParse({}).success).toBe(false)
    expect(SCHEMAS['items:setStatus'].safeParse({ id: 1 }).success).toBe(false)
  })

  it('accepts list names, and rejects an empty or oversized one', () => {
    expect(SCHEMAS['items:create'].safeParse({ lists: ['bug', 'nottoday'] }).success).toBe(true)
    expect(SCHEMAS['items:create'].safeParse({ lists: [''] }).success).toBe(false)
    expect(SCHEMAS['items:create'].safeParse({ lists: ['x'.repeat(65)] }).success).toBe(false)
  })

  it('rejects an id that is not a positive integer', () => {
    for (const id of [0, -1, 1.5, '1', null, undefined, NaN]) {
      expect(SCHEMAS['items:get'].safeParse({ id }).success).toBe(false)
    }
    expect(SCHEMAS['items:get'].safeParse({ id: 1 }).success).toBe(true)
  })

  it('rejects a value outside an enum', () => {
    expect(SCHEMAS['items:setStatus'].safeParse({ id: 1, status: 'maybe' }).success).toBe(false)
    expect(SCHEMAS['projects:setStatus'].safeParse({ id: 1, status: 'archived' }).success).toBe(
      false
    )
  })

  it('requires an explicit delete mode, so items are never dropped by default', () => {
    expect(SCHEMAS['projects:delete'].safeParse({ id: 1 }).success).toBe(false)
    expect(SCHEMAS['projects:delete'].safeParse({ id: 1, mode: 'wipe' }).success).toBe(false)
    expect(SCHEMAS['projects:delete'].safeParse({ id: 1, mode: 'move_to_inbox' }).success).toBe(
      true
    )
    expect(SCHEMAS['projects:delete'].safeParse({ id: 1, mode: 'delete_items' }).success).toBe(true)
  })

  it('rejects an empty project or tag name', () => {
    expect(SCHEMAS['projects:create'].safeParse({ name: '' }).success).toBe(false)
    expect(SCHEMAS['projects:rename'].safeParse({ id: 1, name: '' }).success).toBe(false)
    expect(SCHEMAS['tags:add'].safeParse({ itemId: 1, name: '' }).success).toBe(false)
  })

  it('caps field lengths so a runaway renderer cannot flood the database', () => {
    expect(SCHEMAS['items:create'].safeParse({ title: 'x'.repeat(500) }).success).toBe(
      true
    )
    expect(SCHEMAS['items:create'].safeParse({ title: 'x'.repeat(501) }).success).toBe(
      false
    )
    expect(
      SCHEMAS['items:create'].safeParse({ content: 'x'.repeat(1_000_001) }).success
    ).toBe(false)
    expect(SCHEMAS['search:query'].safeParse({ query: 'x'.repeat(501) }).success).toBe(false)
  })

  it('caps the result limit so one call cannot ask for everything', () => {
    expect(SCHEMAS['search:query'].safeParse({ query: 'a', limit: 500 }).success).toBe(true)
    expect(SCHEMAS['search:query'].safeParse({ query: 'a', limit: 501 }).success).toBe(false)
    expect(SCHEMAS['items:list'].safeParse({ limit: 5001 }).success).toBe(false)
    expect(SCHEMAS['items:list'].safeParse({ limit: 0 }).success).toBe(false)
  })

  it('validates the nested item scope', () => {
    expect(SCHEMAS['items:move'].safeParse({ id: 1, scope: { kind: 'inbox' } }).success).toBe(true)
    expect(
      SCHEMAS['items:move'].safeParse({ id: 1, scope: { kind: 'project', projectId: 2 } }).success
    ).toBe(true)
    // kind=project without a projectId must not slip through.
    expect(SCHEMAS['items:move'].safeParse({ id: 1, scope: { kind: 'project' } }).success).toBe(
      false
    )
    expect(SCHEMAS['items:move'].safeParse({ id: 1, scope: { kind: 'elsewhere' } }).success).toBe(
      false
    )
  })

  it('accepts an empty search string, so clearing the box is not an error', () => {
    expect(SCHEMAS['search:query'].safeParse({ query: '' }).success).toBe(true)
  })

  it('accepts undefined for the no-argument channels', () => {
    for (const channel of ['app:health', 'tags:list', 'work:today', 'work:counts'] as const) {
      expect(SCHEMAS[channel].safeParse(undefined).success).toBe(true)
    }
  })

  it('rejects a priority outside the usable range', () => {
    expect(SCHEMAS['items:create'].safeParse({ priority: 1 }).success).toBe(true)
    expect(SCHEMAS['items:create'].safeParse({ priority: 0 }).success).toBe(false)
    expect(SCHEMAS['items:create'].safeParse({ priority: 10 }).success).toBe(false)
  })
})
