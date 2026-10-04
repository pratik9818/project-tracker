import { useEffect, useRef } from 'react'

export interface Suggestion {
  /** The text inserted after the sigil. */
  value: string
  /** What it means, shown on the right. */
  hint: string
  kind: 'tag' | 'date' | 'time'
}

const KIND_STYLES: Record<Suggestion['kind'], string> = {
  tag: 'text-sky-400',
  date: 'text-amber-400',
  time: 'text-amber-300'
}

/**
 * The completion popup for `#` and `@`.
 *
 * Positioned at the caret rather than in a corner, so it reads as part of the
 * line you are writing. Keyboard handling lives in the editor, because the
 * textarea must keep focus the whole time — a popup that steals focus would
 * break typing, which is the one thing this view cannot afford.
 */
export function SuggestionList({
  suggestions,
  activeIndex,
  top,
  left,
  onPick
}: {
  suggestions: Suggestion[]
  activeIndex: number
  top: number
  left: number
  onPick: (suggestion: Suggestion) => void
}): JSX.Element | null {
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the highlighted row in view as the user arrows past the fold.
  useEffect(() => {
    const active = listRef.current?.children[activeIndex]
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (suggestions.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute z-20 max-h-56 w-64 overflow-y-auto rounded border border-slate-700 bg-[#0d1219] py-1 shadow-xl"
      style={{ top, left }}
      role="listbox"
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={`${suggestion.kind}-${suggestion.value}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          // The textarea must not lose focus, so take the click before blur.
          onMouseDown={(event) => {
            event.preventDefault()
            onPick(suggestion)
          }}
          className={`flex w-full items-baseline justify-between gap-3 px-2.5 py-1 text-left font-mono text-xs ${
            index === activeIndex ? 'bg-slate-800' : 'hover:bg-slate-800/50'
          }`}
        >
          <span className={KIND_STYLES[suggestion.kind]}>{suggestion.value}</span>
          <span className="shrink-0 text-[10px] text-slate-600">{suggestion.hint}</span>
        </button>
      ))}
    </div>
  )
}
