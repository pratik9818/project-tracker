import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { parseLine } from '@shared/parseLine'
import { DEFAULT_LIST } from '@shared/types'
import './index.css'

/**
 * The quick-capture window: one input, Enter saves, Esc cancels.
 *
 * It deliberately has no chrome and no project picker. The whole value is that
 * it takes under a second — any decision you have to make here is a decision
 * that stops you capturing. Same line syntax as the Scratchpad (`#list`,
 * `@due`), everything lands in the Inbox, and you file it later.
 *
 * The live hint underneath shows which list(s) the line will go in, so the
 * rules are discoverable without documentation.
 */
function QuickCapture(): JSX.Element {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // The window is shown and hidden rather than recreated, so refocus and clear
  // every time it becomes visible again.
  useEffect(() => {
    function onFocus(): void {
      setText('')
      setError(null)
      inputRef.current?.focus()
    }
    window.addEventListener('focus', onFocus)
    inputRef.current?.focus()
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function save(): Promise<void> {
    if (saving) return
    if (!parseLine(text).actionable) {
      // Nothing worth saving — treat Enter as "dismiss".
      void window.api.capture.close()
      return
    }

    setSaving(true)
    try {
      await window.api.capture.save({ text })
      setText('')
      await window.api.capture.close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const preview = parseLine(text)
  const previewLists = preview.tags.length > 0 ? preview.tags : [DEFAULT_LIST]

  return (
    <div className="flex h-full flex-col justify-center px-4">
      <input
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void save()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            void window.api.capture.close()
          }
        }}
        placeholder="Capture anything…"
        className="w-full rounded-md bg-slate-800 px-3 py-2.5 text-base text-slate-100 placeholder:text-slate-500"
      />

      <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
        <span className="text-slate-500">
          {!preview.actionable ? (
            <>
              <Hint>#bug</Hint> or any <Hint>#list</Hint> · <Hint>@tomorrow</Hint> to schedule
            </>
          ) : (
            <>
              Saves to{' '}
              <span className="text-slate-300">
                {previewLists.map((name) => `#${name}`).join(' ')}
              </span>{' '}
              in the Inbox
            </>
          )}
        </span>
        <span className="text-slate-600">Enter saves · Esc cancels</span>
      </div>

      {error !== null && <p className="px-1 pt-1 text-[11px] text-rose-400">{error}</p>}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }): JSX.Element {
  return <code className="rounded bg-slate-800 px-1 text-slate-400">{children}</code>
}

const container = document.getElementById('root')
if (container === null) throw new Error('#root not found in quickCapture.html')

createRoot(container).render(
  <StrictMode>
    <QuickCapture />
  </StrictMode>
)
