import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { ACCELERATORS } from '../shortcuts'
import { markQuitting, showMainWindow } from './mainWindow'
import { showQuickCapture } from './quickCapture'

/**
 * The system-tray presence.
 *
 * This is what makes the global hotkeys work when no window is open: a hotkey
 * is registered by a running process, so something has to stay running. The
 * tray icon is also the only remaining way to quit, since closing the window
 * now hides it.
 */
let tray: Tray | null = null

export function createTray(appRoot: string): Tray {
  if (tray !== null && !tray.isDestroyed()) return tray

  const icon = nativeImage.createFromPath(join(appRoot, 'resources', 'tray.png'))
  tray = new Tray(icon)
  tray.setToolTip('DevVault')

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open DevVault',
        accelerator: ACCELERATORS.mainWindow,
        click: () => showMainWindow()
      },
      {
        label: 'Quick capture',
        accelerator: ACCELERATORS.quickCapture,
        click: () => showQuickCapture()
      },
      { type: 'separator' },
      {
        label: 'Start DevVault at login',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => setOpenAtLogin(menuItem.checked)
      },
      { type: 'separator' },
      {
        label: 'Quit DevVault',
        click: () => {
          // Without this the window's close handler would just hide it again
          // and the app would never actually exit.
          markQuitting()
          app.quit()
        }
      }
    ])
  )

  // Clicking the icon is the obvious way to get the window back.
  tray.on('click', () => showMainWindow())

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

/**
 * Launch at login.
 *
 * `openAsHidden` matters: starting at login should put DevVault in the tray
 * ready for the hotkey, not throw a window in your face every time you boot.
 */
export function setOpenAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: enabled ? ['--hidden'] : []
  })
}

export function isOpenAtLogin(): boolean {
  return app.getLoginItemSettings().openAtLogin
}
