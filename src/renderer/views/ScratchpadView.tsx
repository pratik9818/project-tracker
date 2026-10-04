import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { nextMarker, parseBuffer, parseLine, type ParsedLine } from '@shared/parseLine'
import { DEFAULT_LIST, type Project, type Scratchpad, type Tag } from '@shared/types'
import { ProjectPicker } from '@renderer/components/ProjectPicker'
import { SuggestionList, type Suggestion } from '@renderer/components/SuggestionList'
import { useAsync } from '@renderer/hooks/useAsync'
import { activeToken, caretCoordinates } from '@renderer/lib/caret'
import { useAppStore } from '@renderer/store/useAppStore'

/**
 * The Scratchpad — where a thought lands before it is anything.
 *
 * A plain text buffer, not a list of forms. You type lines, they are parsed
 * live, and nothing becomes a real item until you commit. That ordering is the
 * point: a half-finished line must never turn into data.
 *
 * The terminal look is not decoration — monospace with a fixed line height is
 * what lets the syntax highlighting sit exactly behind the caret.
 */

const SAVE_DEBOUNCE_MS = 400

const DATE_SUGGESTIONS: Suggestion[] = [
  { value: 'today', hint: 'today, midday', kind: 'date' },
  { value: 'tomorrow', hint: 'tomorrow', kind: 'date' },
  { value: 'mon', hint: 'next Monday', kind: 'date' },
  { value: 'tue', hint: 'next Tuesday', kind: 'date' },
  { value: 'wed', hint: 'next Wednesday', kind: 'date' },
  { value: 'thu', hint: 'next Thursday', kind: 'date' },
  { value: 'fri', hint: 'next Friday', kind: 'date' },
  { value: 'sat', hint: 'next Saturday', kind: 'date' },
  { value: 'sun', hint: 'next Sunday', kind: 'date' },
  { value: '3d', hint: 'in 3 days', kind: 'date' },
  { value: '1w', hint: 'in a week', kind: 'date' },
  { value: '09:00', hint: 'today 09:00', kind: 'time' },
  { value: '14:00', hint: 'today 14:00', kind: 'time' },
  { value: '2pm', hint: 'today 14:00', kind: 'time' },
  { value: 'tomorrow+09:00', hint: 'date + time', kind: 'time' }
]

export function ScratchpadView(): JSX.Element {
  const refresh = useAppStore((state) => state.refresh)
  const dataVersion = useAppStore((state) => state.dataVersion)

  const [content, setContent] = useState('')
  const [projectId, setProjectId] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [committing, setCommitting] = useState(false)
  const [lastCommit, setLastCommit] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestIndex, setSuggestIndex] = useState(0)
  const [suggestAt, setSuggestAt] = useState<{ top: number; left: number } | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)

  const projects = useAsync<Project[]>(() => window.api.projects.list({}), [dataVersion])
  const tags = useAsync<Tag[]>(() => window.api.tags.list(), [dataVersion])

  // Load once. Deliberately not keyed on dataVersion: re-reading mid-sentence
  // would clobber what the user is typing.
  useEffect(() => {
    void window.api.scratchpad
      .get()
      .then((pad: Scratchpad) => {
        setContent(pad.content)
        setProjectId(pad.projectId)
        setLoaded(true)
        textareaRef.current?.focus()
      })
      .catch((cause: unknown) => setError(String(cause)))
  }, [])

  const save = useCallback((nextContent: string, nextProjectId: number | null) => {
    setStatus('saving')
    void window.api.scratchpad
      .save({ content: nextContent, projectId: nextProjectId })
      .then(() => setStatus('saved'))
      .catch((cause: unknown) => setError(String(cause)))
  }, [])

  // Debounced autosave: the buffer is the user's working memory, so losing it
  // to a crash or a quit is not acceptable.
  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => save(content, projectId), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [content, projectId, loaded, save])

  const lines = useMemo(() => parseBuffer(content), [content])
  const actionable = lines.filter((line) => line.actionable)

  // Ctrl+S: ask which project, then commit there. Listened for on the window
  // (not just the textarea) so it works wherever focus is on this view. The
  // buffer itself already autosaves, so with nothing to commit it does nothing.
  const hasActionable = actionable.length > 0
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      // Opening the picker moves focus out of the textarea, and its onBlur
      // closes any open #/@ suggestion list.
      if (!pickerOpen && hasActionable) setPickerOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pickerOpen, hasActionable])

  // ---- suggestions -------------------------------------------------------

  const closeSuggestions = useCallback(() => {
    setSuggestions([])
    setSuggestAt(null)
    setSuggestIndex(0)
  }, [])

  const updateSuggestions = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea === null) return

    const token = activeToken(textarea.value, textarea.selectionStart)
    if (token === null || textarea.selectionStart !== textarea.selectionEnd) {
      closeSuggestions()
      return
    }

    const query = token.query.toLowerCase()
    let options: Suggestion[]

    if (token.sigil === '#') {
      // Every existing list. A new name needs no suggestion — typing it creates it.
      options = (tags.data ?? []).map((tag) => ({ value: tag.name, hint: 'list', kind: 'tag' }))
    } else {
      options = DATE_SUGGESTIONS
    }

    const matches = options.filter((option) => option.value.toLowerCase().startsWith(query))
    if (matches.length === 0) {
      closeSuggestions()
      return
    }

    const caret = caretCoordinates(textarea, token.start)
    setSuggestions(matches.slice(0, 40))
    setSuggestIndex(0)
    setSuggestAt({ top: caret.top + caret.lineHeight + 4, left: caret.left })
  }, [tags.data, closeSuggestions])

  function applySuggestion(suggestion: Suggestion): void {
    const textarea = textareaRef.current
    if (textarea === null) return

    const token = activeToken(textarea.value, textarea.selectionStart)
    if (token === null) return

    const before = textarea.value.slice(0, token.start)
    const after = textarea.value.slice(token.end)
    const inserted = `${token.sigil}${suggestion.value} `
    const next = `${before}${inserted}${after}`

    setContent(next)
    closeSuggestions()

    // Put the caret just past what we inserted, after React has re-rendered.
    const caretAt = before.length + inserted.length
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(caretAt, caretAt)
    })
  }

  // ---- editing -----------------------------------------------------------

  /** Shift+Enter: new line carrying the next marker in the current style. */
  function insertNextMarker(): void {
    const textarea = textareaRef.current
    if (textarea === null) return

    const caret = textarea.selectionStart
    const lineStart = textarea.value.lastIndexOf('\n', caret - 1) + 1
    const currentLine = textarea.value.slice(lineStart, caret)
    const marker = nextMarker(parseLine(currentLine).marker)

    const insertion = `\n${marker} `
    const next = textarea.value.slice(0, caret) + insertion + textarea.value.slice(caret)
    setContent(next)

    const caretAt = caret + insertion.length
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(caretAt, caretAt)
    })
  }

  /**
   * Commits into `target` — the "file into" project unless the Ctrl+S picker
   * chose another one, in which case that choice also becomes the new default.
   */
  async function commit(target: number | null = projectId): Promise<void> {
    if (actionable.length === 0 || committing) return
    setCommitting(true)
    setError(null)
    setProjectId(target)
    try {
      // Flush the pending edit so the commit sees the latest text and target.
      await window.api.scratchpad.save({ content, projectId: target })
      const result = await window.api.scratchpad.commit()
      setContent(result.content)
      setLastCommit(
        `Committed ${result.created.length} ${result.created.length === 1 ? 'item' : 'items'}`
      )
      refresh()
      textareaRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCommitting(false)
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // The suggestion list owns these keys while it is open.
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSuggestIndex((index) => (index + 1) % suggestions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSuggestIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey)) {
        const picked = suggestions[suggestIndex]
        if (picked !== undefined) {
          event.preventDefault()
          applySuggestion(picked)
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSuggestions()
        return
      }
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void commit()
      return
    }

    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      insertNextMarker()
    }
  }

  /** Keep the highlight layer locked to the textarea's scroll. */
  function syncScroll(): void {
    const textarea = textareaRef.current
    if (textarea === null) return
    if (highlightRef.current !== null) {
      highlightRef.current.scrollTop = textarea.scrollTop
      highlightRef.current.scrollLeft = textarea.scrollLeft
    }
    closeSuggestions()
  }

  const projectName =
    projectId === null
      ? 'Inbox'
      : (projects.data ?? []).find((project) => project.id === projectId)?.name ?? 'Inbox'

  return (
    <div className="flex h-full flex-col bg-[#0a0e14]">
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-2.5">
        <label className="ml-auto flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-600">file into</span>
          <select
            value={projectId ?? ''}
            onChange={(event) =>
              setProjectId(event.target.value === '' ? null : Number(event.target.value))
            }
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
          >
            <option value="">Inbox</option>
            {(projects.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void commit()}
          disabled={actionable.length === 0 || committing}
          className="rounded bg-emerald-600 px-3 py-1 font-mono text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-30"
        >
          commit {actionable.length > 0 ? actionable.length : ''} → {projectName}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* A highlight layer with a transparent textarea on top, so the caret
            and selection stay native while the text looks syntax-aware. */}
        <div className="relative min-w-0 flex-1">
          <pre
            ref={highlightRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-3 font-mono text-[13px] leading-[22px]"
          >
            {lines.map((line, index) => (
              <HighlightedLine key={index} line={line} />
            ))}
          </pre>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyUp={updateSuggestions}
            onClick={updateSuggestions}
            onBlur={closeSuggestions}
            onScroll={syncScroll}
            onKeyDown={onKeyDown}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            className="absolute inset-0 resize-none whitespace-pre-wrap break-words bg-transparent px-3 py-3 font-mono text-[13px] leading-[22px] text-transparent caret-emerald-400 placeholder:text-slate-700 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          {suggestAt !== null && (
            <SuggestionList
              suggestions={suggestions}
              activeIndex={suggestIndex}
              top={suggestAt.top}
              left={suggestAt.left}
              onPick={applySuggestion}
            />
          )}
        </div>
      </div>

      {pickerOpen && (
        <ProjectPicker
          onPick={(target) => {
            setPickerOpen(false)
            void commit(target)
          }}
          onClose={() => {
            setPickerOpen(false)
            textareaRef.current?.focus()
          }}
        />
      )}

      <footer className="flex items-center gap-4 border-t border-slate-800 px-4 py-2 font-mono text-[11px] text-slate-600">
        <Legend />
        <span className="ml-auto">
          {error !== null ? (
            <span className="text-rose-400">{error}</span>
          ) : lastCommit !== null ? (
            <span className="text-emerald-500">{lastCommit}</span>
          ) : status === 'saving' ? (
            'saving…'
          ) : status === 'saved' ? (
            'saved'
          ) : (
            ''
          )}
        </span>
        <span>shift+enter new line · ctrl+enter commits · ctrl+s commits to…</span>
      </footer>
    </div>
  )
}

const PLACEHOLDER = `1. wire the export button #urgent @tomorrow+14:30
2. #bug search drops the last keystroke #regression @fri
3. #note just a loose thought
a. #snippet the incantation I always forget
.  standup @09:30

// lines starting with // are kept, never committed`

/**
 * One line, coloured by what it parsed to.
 *
 * Rendered from the same parse the commit uses, so what you see really is what
 * you will get — there is no second implementation of the syntax to drift.
 */
function HighlightedLine({ line }: { line: ParsedLine }): JSX.Element {
  if (line.raw.trim() === '') return <div> </div>
  if (!line.actionable && line.raw.trim().startsWith('//')) {
    return <div className="text-slate-700">{line.raw}</div>
  }

  const tokens = line.raw.split(/(\s+)/)
  let markerConsumed = line.marker === null

  return (
    <div>
      {tokens.map((token, index) => {
        if (!markerConsumed && token === line.marker) {
          markerConsumed = true
          return (
            <span key={index} className="text-slate-600">
              {token}
            </span>
          )
        }
        return (
          <span key={index} className={tokenClass(token)}>
            {token}
          </span>
        )
      })}
    </div>
  )
}

function tokenClass(token: string): string {
  if (/^#[\p{L}\p{N}_-]+$/u.test(token)) return 'text-sky-400'
  if (/^@[\p{L}\p{N}:+._-]+$/u.test(token)) return 'text-amber-400'
  return 'text-slate-200'
}

function Legend(): JSX.Element {
  return (
    <span className="flex items-center gap-3">
      <span>
        <span className="text-slate-500">1.</span> list
      </span>
      <span>
        <span className="text-sky-400">#bug</span> list
      </span>
      <span>
        <span className="text-amber-400">@tomorrow+14:30</span> due
      </span>
      <span className="text-slate-700">// ignored</span>
      <span className="text-slate-700">no #list → #{DEFAULT_LIST}</span>
    </span>
  )
}
