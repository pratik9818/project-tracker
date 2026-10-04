import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

/**
 * The main application window.
 *
 * Security posture (see CLAUDE.md): the renderer is treated as untrusted.
 * - contextIsolation: the preload script and the page get separate JS worlds,
 *   so the page cannot reach into preload internals.
 * - nodeIntegration: false — no `require`, no `process` in the page.
 * - sandbox: true — the renderer runs in an OS-level sandbox. Our preload only
 *   needs `ipcRenderer.invoke`, which is still available under sandbox.
 *
 * The window is created once and hidden/shown thereafter. Closing it does NOT
 * destroy it: the app lives in the tray so its global hotkeys keep working, and
 * rebuilding the window on every summon would be visibly slow.
 */
let window: BrowserWindow | null = null

/** Set on quit so the close handler stops intercepting and lets it through. */
let quitting = false

export function markQuitting(): void {
  quitting = true
}

export function getMainWindow(): BrowserWindow {
  if (window !== null && !window.isDestroyed()) return window

  window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'DevVault',
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Avoid a white flash: show only once the first paint is ready.
  window.once('ready-to-show', () => window?.show())

  // Closing hides. Without this the tray icon would still be there but the
  // hotkey would have to rebuild the window from scratch every time.
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    window?.hide()
  })

  // Links with target=_blank open in the user's browser, never in a new
  // Electron window (a new window would not inherit our security settings).
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  loadRenderer(window)
  return window
}

/** Brings the window up and focuses it, creating it if it is not there. */
export function showMainWindow(): void {
  const target = getMainWindow()
  if (target.isMinimized()) target.restore()
  target.show()
  target.focus()
}

/** The hotkey: up and focused -> hide; anything else -> show and focus. */
export function toggleMainWindow(): void {
  const target = getMainWindow()
  if (target.isVisible() && target.isFocused()) {
    target.hide()
    return
  }
  showMainWindow()
}

/**
 * In dev, electron-vite serves the renderer from a Vite dev server and passes
 * the URL in ELECTRON_RENDERER_URL. In a packaged build we load the file that
 * `electron-vite build` emitted into out/renderer/.
 */
function loadRenderer(target: BrowserWindow): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl !== undefined) {
    void target.loadURL(devServerUrl)
  } else {
    void target.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
