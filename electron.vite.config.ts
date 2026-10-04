import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Three separate builds. `externalizeDepsPlugin` keeps node_modules out of the
// main/preload bundles, which matters for native modules like better-sqlite3:
// they must stay as real require() calls, not be inlined by Rollup.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer')
      }
    },
    build: {
      rollupOptions: {
        // Two pages: the main window and the always-on-top quick-capture box.
        input: {
          index: resolve('src/renderer/index.html'),
          quickCapture: resolve('src/renderer/quickCapture.html')
        }
      }
    }
  }
})
