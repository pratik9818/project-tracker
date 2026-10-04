import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HIGHLIGHT_END, HIGHLIGHT_START, splitHighlights } from '../../../shared/types'
import type { DatabaseHandle } from '../client'
import { createItem, deleteItem, updateItem } from '../queries/items'
import { createProject } from '../queries/projects'
import { addTagToItem } from '../queries/tags'
import { buildMatchQuery, countSearchResults, searchItems } from '../queries/search'
import { testDatabase } from './helpers'

function titles(handle: DatabaseHandle, query: string, options = {}): string[] {
  return searchItems(handle, query, options).map((result) => result.item.title ?? '')
}

describe('buildMatchQuery', () => {
  it('quotes each word and makes it a prefix match', () => {
    expect(buildMatchQuery('export')).toBe('"export"*')
    expect(buildMatchQuery('json export')).toBe('"json"* "export"*')
  })

  it('neutralises FTS5 operators instead of erroring on them', () => {
    expect(buildMatchQuery('NOT a OR b')).toBe('"NOT"* "a"* "OR"* "b"*')
    expect(buildMatchQuery('foo: bar^')).toBe('"foo"* "bar"*')
    expect(buildMatchQuery('a "quoted" thing')).toBe('"a"* "quoted"* "thing"*')
    expect(buildMatchQuery('(unbalanced')).toBe('"unbalanced"*')
  })

  it('returns null when there is nothing to search for', () => {
    expect(buildMatchQuery('')).toBeNull()
    expect(buildMatchQuery('   ')).toBeNull()
    expect(buildMatchQuery('!!! ???')).toBeNull()
  })
})

describe('splitHighlights', () => {
  it('splits marked text into plain and matched segments', () => {
    const marked = `a ${HIGHLIGHT_START}match${HIGHLIGHT_END} here`

    expect(splitHighlights(marked)).toEqual([
      { text: 'a ', match: false },
      { text: 'match', match: true },
      { text: ' here', match: false }
    ])
  })

  it('handles text with no markers at all', () => {
    expect(splitHighlights('nothing special')).toEqual([{ text: 'nothing special', match: false }])
  })

  it('handles a marker at the very start', () => {
    expect(splitHighlights(`${HIGHLIGHT_START}hit${HIGHLIGHT_END} tail`)).toEqual([
      { text: 'hit', match: true },
      { text: ' tail', match: false }
    ])
  })
})

describe('search', () => {
  let handle: DatabaseHandle

  beforeEach(() => {
    handle = testDatabase()
  })

  afterEach(() => {
    handle.close()
  })

  it('finds an item by a word in its title', () => {
    createItem(handle, { title: 'Postgres indexes', content: 'GIN and BRIN' })
    createItem(handle, { title: 'Redis notes', content: 'expiry' })

    expect(titles(handle, 'postgres')).toEqual(['Postgres indexes'])
  })

  it('finds an item by a word in its content', () => {
    createItem(handle, { title: 'Database notes', content: 'about GIN indexes' })

    expect(titles(handle, 'gin')).toEqual(['Database notes'])
  })

  it('matches on a prefix, so it works while still typing', () => {
    createItem(handle, { title: 'Ship the export button' })

    expect(titles(handle, 'exp')).toEqual(['Ship the export button'])
    expect(titles(handle, 'e')).toEqual(['Ship the export button'])
  })

  it('requires every term to match', () => {
    createItem(handle, { title: 'Postgres indexes' })
    createItem(handle, { title: 'Postgres triggers' })

    expect(titles(handle, 'postgres')).toHaveLength(2)
    expect(titles(handle, 'postgres trig')).toEqual(['Postgres triggers'])
  })

  it('is case-insensitive and ignores diacritics', () => {
    createItem(handle, { title: 'Café notes' })

    expect(titles(handle, 'CAFE')).toEqual(['Café notes'])
    expect(titles(handle, 'café')).toEqual(['Café notes'])
  })

  it('returns nothing for an empty or punctuation-only query', () => {
    createItem(handle, { title: 'Something' })

    expect(searchItems(handle, '')).toEqual([])
    expect(searchItems(handle, '   ')).toEqual([])
    expect(countSearchResults(handle, '')).toBe(0)
  })

  it('does not throw on input full of FTS operators', () => {
    createItem(handle, { title: 'Operators' })

    expect(() => searchItems(handle, 'NOT OR AND * " ( ) : ^')).not.toThrow()
    expect(titles(handle, 'NOT OR AND * " ( ) : ^')).toEqual([])
  })

  it('marks the matched span in the title', () => {
    createItem(handle, { title: 'Postgres indexes' })

    const [result] = searchItems(handle, 'postgres')
    expect(result?.titleMarked).toBe(`${HIGHLIGHT_START}Postgres${HIGHLIGHT_END} indexes`)
    expect(splitHighlights(result?.titleMarked ?? '')).toEqual([
      { text: 'Postgres', match: true },
      { text: ' indexes', match: false }
    ])
  })

  it('marks the matched span inside a content snippet', () => {
    createItem(handle, {
      title: 'Long note',
      content: 'some preamble and then the word elephant appears here'
    })

    const [result] = searchItems(handle, 'elephant')
    expect(result?.contentMarked).toContain(`${HIGHLIGHT_START}elephant${HIGHLIGHT_END}`)
  })

  it('never emits HTML, so highlights cannot inject markup', () => {
    createItem(handle, { title: 'script tag danger', content: '<script>alert(1)</script>' })

    const [result] = searchItems(handle, 'script')
    expect(result?.titleMarked).not.toContain('<mark>')
    expect(result?.titleMarked).not.toContain('<b>')
    // The user's own text is returned verbatim, not escaped and not executed.
    expect(result?.item.content).toBe('<script>alert(1)</script>')
  })

  it('ranks a title match above a body-only match', () => {
    createItem(handle, { title: 'Incidental', content: 'kubernetes mentioned once' })
    createItem(handle, { title: 'Kubernetes', content: 'kubernetes kubernetes' })

    expect(titles(handle, 'kubernetes')[0]).toBe('Kubernetes')
  })

  it('filters results by scope', () => {
    const project = createProject(handle, { name: 'Alpha' })
    createItem(handle, { title: 'shared word inbox' })
    createItem(handle, {
      title: 'shared word project',
      scope: { kind: 'project', projectId: project.id }
    })

    expect(titles(handle, 'shared')).toHaveLength(2)
    expect(titles(handle, 'shared', { scope: { kind: 'inbox' } })).toEqual(['shared word inbox'])
    expect(titles(handle, 'shared', { scope: { kind: 'project', projectId: project.id } })).toEqual([
      'shared word project'
    ])
  })

  it('filters results by tag', () => {
    const tagged = createItem(handle, { title: 'tagged deploy note' })
    createItem(handle, { title: 'untagged deploy note' })
    const tag = addTagToItem(handle, tagged.id, 'ops')

    expect(titles(handle, 'deploy')).toHaveLength(2)
    expect(titles(handle, 'deploy', { tagId: tag.id })).toEqual(['tagged deploy note'])
  })

  it('pages results and reports the full total', () => {
    for (let n = 1; n <= 5; n += 1) {
      createItem(handle, { title: `paging note ${n}` })
    }

    expect(countSearchResults(handle, 'paging')).toBe(5)
    expect(searchItems(handle, 'paging', { limit: 2 })).toHaveLength(2)
    expect(searchItems(handle, 'paging', { limit: 2, offset: 4 })).toHaveLength(1)
  })

  it('reflects edits and deletions immediately', () => {
    const item = createItem(handle, { title: 'original wording' })
    expect(titles(handle, 'original')).toHaveLength(1)

    updateItem(handle, item.id, { title: 'revised wording' })
    expect(titles(handle, 'original')).toHaveLength(0)
    expect(titles(handle, 'revised')).toHaveLength(1)

    deleteItem(handle, item.id)
    expect(titles(handle, 'revised')).toHaveLength(0)
  })
})
