import type { DevVaultApi } from './index'

declare global {
  interface Window {
    api: DevVaultApi
  }
}

export {}
