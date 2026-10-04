import { app, dialog } from 'electron'
import { closeDatabase, initDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { readSettings, writeSettings } from './settings'
import {
  bindSearchPaletteShortcut,
  registerGlobalShortcuts,
  unregisterGlobalShortcuts
} from './shortcuts'
import { getMainWindow, markQuitting, showMainWindow } from './windows/mainWindow'
import { createTray, destroyTray, setOpenAtLogin } from './windows/tray'

// Single instance only: a second launch should focus the existing window rather
// than open a second app writing to the same SQLite file.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  showMainWindow()
})

/**
 * Started by the login item, so stay in the tray instead of opening a window.
 * Booting into a window every morning would be obnoxious.
 */
const startHidden = process.argv.includes('--hidden')

void app.whenReady().then(() => {
  // The database must be open and migrated before any window can ask it a
  // question. If this fails the app is unusable, so say why and quit instead of
  // showing an empty window.
  try {
    initDatabase({ userDataPath: app.getPath('userData'), appRoot: app.getAppPath() })
  } catch (error) {
    dialog.showErrorBox(
      'DevVault could not open its database',
      error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error)
    )
    app.exit(1)
    return
  }

  registerIpcHandlers()
  createTray(app.getAppPath())

  // Launch at login defaults to on, because hotkeys that stop working after a
  // reboot would defeat the point of the tray. Applied ONCE: after that the
  // tray checkbox is the user's to set, and we must not keep overriding it.
  const userDataPath = app.getPath('userData')
  const settings = readSettings(userDataPath)
  if (!settings.loginItemInitialised) {
    setOpenAtLogin(true)
    writeSettings(userDataPath, { ...settings, loginItemInitialised: true })
  }

  const shortcuts = registerGlobalShortcuts()
  const failed = shortcuts.filter((entry) => !entry.registered)
  if (failed.length > 0) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Some hotkeys are unavailable',
      message: 'Another application already owns these shortcuts:',
      detail: `${failed.map((entry) => `  ${entry.accelerator}`).join('\n')}\n\nDevVault still works; those keys just will not summon it.`
    })
  }

  if (startHidden) {
    // Build the window now so the first hotkey press is instant, but leave it
    // hidden. `show: false` is already the default in getMainWindow.
    getMainWindow()
  } else {
    showMainWindow()
  }

  bindSearchPaletteShortcut()

  // macOS: clicking the dock icon should bring the window back.
  app.on('activate', () => showMainWindow())
})

/**
 * Closing the last window no longer quits: the app lives in the tray so its
 * global hotkeys keep working. Quit is in the tray menu.
 */
app.on('window-all-closed', () => {
  // Deliberately empty — see above.
})

app.on('before-quit', () => {
  markQuitting()
})

// Flush WAL, release the hotkeys and the tray icon on the way out.
app.on('will-quit', () => {
  unregisterGlobalShortcuts()
  destroyTray()
  closeDatabase()
})

// Defence in depth: never let renderer content attach a <webview>.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})
