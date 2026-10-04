import { splitHighlights } from '@shared/types'

/**
 * Renders search-result text with matched spans emphasised.
 *
 * The main process marks matches with two control characters rather than HTML,
 * so this splits on them and renders real elements. No `dangerouslySetInnerHTML`
 * anywhere — a match inside someone's note cannot inject markup.
 */
export function Highlighted({ marked }: { marked: string | null }): JSX.Element | null {
  if (marked === null || marked.length === 0) return null

  return (
    <>
      {splitHighlights(marked).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-sm bg-amber-400/25 px-0.5 text-amber-200">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  )
}
