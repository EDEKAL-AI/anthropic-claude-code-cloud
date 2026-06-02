import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = {
  '@shared': resolve('src/shared')
}

export default defineConfig({
  main: {
    // Native (better-sqlite3) and CJS-interop-sensitive deps must be externalized,
    // not bundled. They are listed as runtime `dependencies` so they ship in node_modules.
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // The Baileys worker is a separate entry. It runs as a utilityProcess and
          // MUST resolve to a real file path in the packaged app (asarUnpack covers it).
          worker: resolve('src/worker/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: sharedAlias },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    }
  }
})
