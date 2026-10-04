import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

/**
 * The quick-capture window: one text input, always on top.
 *
 * It is created once and then shown/hidden rather than created and destroyed,
 * so summoning it is instant — building a BrowserWindow takes long enough to
 * feel like a stutter, and the whole promise is "press a key, start typing".
 *
 * It hides on blur, so clicking away dismisses it like a system palette.
 */
let window: BrowserWindow | null = null

const WIDTH = 620
const HEIGHT = 108

export function getQuickCaptureWindow(): BrowserWindow {
  if (window !== null && !window.isDestroyed()) return window

  window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Float above full-screen windows too, otherwise the hotkey appears to do
  // nothing when something is maximised over it.
  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Click away = dismiss, the way a system palette behaves.
  window.on('blur', () => window?.hide())

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl !== undefined) {
    void window.loadURL(`${devServerUrl}/quickCapture.html`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/quickCapture.html'))
  }

  return window
}

/**
 * Shows the window centred on whichever display the pointer is on — on a
 * multi-monitor desk it should appear where you are looking, not always on the
 * primary screen.
 */
export function showQuickCapture(): void {
  const target = getQuickCaptureWindow()
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)

  target.setBounds({
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height / 4),
    width: WIDTH,
    height: HEIGHT
  })

  target.show()
  target.focus()
}

export function hideQuickCapture(): void {
  window?.hide()
}

export function isQuickCaptureVisible(): boolean {
  return window !== null && !window.isDestroyed() && window.isVisible()
}
