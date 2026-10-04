import { useEffect } from 'react'
import { useAppStore } from '@renderer/store/useAppStore'

/**
 * Global keyboard shortcuts for the main window.
 *
 *   Ctrl/Cmd+K   focus search (switching to the Search view if needed)
 *   Ctrl/Cmd+N   focus the capture box on the current view
 *   Ctrl/Cmd+1-5 jump to Scratchpad / Inbox / Today / All Open / Search
 *
 * Every handler bails out when focus is already in a text field, so typing a
 * note that contains "n" does not trigger anything. The app-wide quick-capture
 * hotkey is separate and lives in the main process (step 11).
 */
export function useShortcuts(): void {
  const setView = useAppStore((state) => state.setView)

  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )
    }

    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return

      switch (event.key.toLowerCase()) {
        case 'k': {
          event.preventDefault()
          setView({ kind: 'search' })
          // The view may still be mounting, so focus on the next frame.
          requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
          })
          return
        }
        case 'n': {
          if (isTyping(event.target)) return
          event.preventDefault()
          document.querySelector<HTMLInputElement>('[data-composer]')?.focus()
          return
        }
        case '1':
          event.preventDefault()
          setView({ kind: 'scratchpad' })
          return
        case '2':
          event.preventDefault()
          setView({ kind: 'inbox' })
          return
        case '3':
          event.preventDefault()
          setView({ kind: 'today' })
          return
        case '4':
          event.preventDefault()
          setView({ kind: 'allTodos' })
          return
        case '5':
          event.preventDefault()
          setView({ kind: 'search' })
          return
        default:
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setView])
}
