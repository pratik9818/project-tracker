/**
 * Where is the caret, in pixels, inside a textarea?
 *
 * The browser does not expose this, so the standard trick is to build a hidden
 * div that copies every style affecting layout, fill it with the text up to the
 * caret, and measure a marker span placed at the end. Fragile-sounding, but it
 * is exact as long as the copied properties cover everything that wraps text.
 *
 * Only needed so the suggestion popup can appear at the caret rather than in a
 * fixed corner, which is the difference between it feeling built-in and feeling
 * bolted on.
 */

/** Everything that can affect where a glyph lands. */
const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
  'tabSize'
] as const

export interface CaretPosition {
  /** Pixels from the top of the textarea's padding box, already scroll-adjusted. */
  top: number
  left: number
  /** The line height, so a caller can offset below the current line. */
  lineHeight: number
}

export function caretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number
): CaretPosition {
  const computed = window.getComputedStyle(textarea)

  const mirror = document.createElement('div')
  mirror.setAttribute('aria-hidden', 'true')
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  // The mirror must wrap exactly as the textarea does.
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'

  for (const property of MIRRORED_PROPERTIES) {
    mirror.style[property] = computed[property]
  }

  mirror.textContent = textarea.value.slice(0, position)

  // A zero-width marker whose box is where the caret sits.
  const marker = document.createElement('span')
  marker.textContent = '​'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const top = marker.offsetTop
  const left = marker.offsetLeft
  document.body.removeChild(mirror)

  const lineHeight = Number.parseFloat(computed.lineHeight) || 18

  return {
    top: top - textarea.scrollTop,
    left: left - textarea.scrollLeft,
    lineHeight
  }
}

export interface ActiveToken {
  /** '#' or '@'. */
  sigil: '#' | '@'
  /** What has been typed after the sigil, possibly empty. */
  query: string
  /** Index of the sigil in the textarea value. */
  start: number
  /** Index just past the typed query (the caret). */
  end: number
}

/**
 * The `#…` or `@…` token the caret is currently inside, if any.
 *
 * Requires the sigil to start a word — so `issue#42` and an email address never
 * pop a suggestion list open mid-sentence.
 */
export function activeToken(value: string, caret: number): ActiveToken | null {
  let index = caret - 1

  while (index >= 0) {
    const char = value[index]
    if (char === undefined) return null

    if (char === '#' || char === '@') {
      const before = index === 0 ? ' ' : value[index - 1]
      if (before !== undefined && !/\s/.test(before)) return null
      return {
        sigil: char,
        query: value.slice(index + 1, caret),
        start: index,
        end: caret
      }
    }

    // A token never contains whitespace, so stop at the first one.
    if (/\s/.test(char)) return null
    index -= 1
  }

  return null
}
