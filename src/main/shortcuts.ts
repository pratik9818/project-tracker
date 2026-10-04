import { globalShortcut } from 'electron'
import { EVENTS } from '../shared/ipc'
import { getMainWindow, showMainWindow, toggleMainWindow } from './windows/mainWindow'
import { hideQuickCapture, isQuickCaptureVisible, showQuickCapture } from './windows/quickCapture'

/**
 * The two app-wide hotkeys, in one place so they are easy to change.
 *
 * Why not a bare letter: a global shortcut is swallowed system-wide, so
 * registering "O" would mean you could never type the letter O in any other
 * application. Modifiers are not decoration here, they are what makes a global
 * hotkey usable at all.
 *
 * These only work while the process is running — which is why the app lives in
 * the tray rather than quitting with its last window.
 */
export const ACCELERATORS = {
  /** Show / hide the main window. */
  mainWindow: 'CommandOrControl+Shift+O',
  /** Show the one-line capture box. */
  quickCapture: 'CommandOrControl+Shift+Space',
  /** Toggle the search palette. Only while the main window is focused. */
  searchPalette: 'Alt+Space'
} as const

export interface ShortcutRegistration {
  accelerator: string
  registered: boolean
}

/**
 * Registers both hotkeys and reports what actually took.
 *
 * `globalShortcut.register` returns false when another application already owns
 * the combination, and it does so silently. The caller surfaces that rather
 * than leaving the user pressing a key that will never do anything.
 */
export function registerGlobalShortcuts(): ShortcutRegistration[] {
  const results: ShortcutRegistration[] = []

  results.push({
    accelerator: ACCELERATORS.mainWindow,
    registered: globalShortcut.register(ACCELERATORS.mainWindow, toggleMainWindow)
  })

  results.push({
    accelerator: ACCELERATORS.quickCapture,
    registered: globalShortcut.register(ACCELERATORS.quickCapture, () => {
      // Pressing it again while it is up should put it away.
      if (isQuickCaptureVisible()) hideQuickCapture()
      else showQuickCapture()
    })
  })

  for (const result of results) {
    if (!result.registered) {
      console.warn(
        `[shortcuts] ${result.accelerator} is already taken by another app — that hotkey will not work.`
      )
    }
  }

  return results
}

/**
 * Alt+Space for the search palette, held only while the main window has focus.
 *
 * Why not a normal keydown in the page: on Windows, Alt+Space opens the window
 * menu (Restore / Move / Close) and the keydown never reaches the page — not
 * even Electron's before-input-event sees it. A registered hotkey is handled
 * before that, so it is the only way to claim the combo.
 *
 * Why only while focused: as a permanent global shortcut it would take
 * Alt+Space away from every other app. Registering on focus and releasing on
 * blur keeps it ours only while DevVault is the window you are typing in.
 */
export function bindSearchPaletteShortcut(): void {
  const window = getMainWindow()
  const accelerator = ACCELERATORS.searchPalette

  function claim(): void {
    if (globalShortcut.isRegistered(accelerator)) return
    const registered = globalShortcut.register(accelerator, () => {
      getMainWindow().webContents.send(EVENTS.toggleSearch)
    })
    if (!registered) {
      // Usually PowerToys Run, which also defaults to Alt+Space.
      console.warn(`[shortcuts] ${accelerator} is taken by another app — the search palette hotkey will not work.`)
    }
  }

  window.on('focus', claim)
  window.on('blur', () => globalShortcut.unregister(accelerator))
  // The window may already have focus, in which case no focus event will come.
  if (window.isFocused()) claim()
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}

export { showMainWindow }
