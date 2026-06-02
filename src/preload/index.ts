// Secure bridge. Exposes a minimal, allowlisted API to the renderer via contextBridge —
// never the raw ipcRenderer. `invoke` only forwards channels that exist in the shared
// contract; `onWorkerEvent` subscribes to the single push channel.

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type IpcChannel } from '@shared/ipc-contract'
import type { WorkerEvent } from '@shared/events'

const allowed = new Set<string>(IPC_CHANNELS)

const api = {
  invoke(channel: IpcChannel, arg?: unknown): Promise<unknown> {
    if (!allowed.has(channel)) {
      return Promise.reject(new Error(`blocked IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, arg)
  },
  onWorkerEvent(callback: (event: WorkerEvent) => void): () => void {
    const listener = (_e: unknown, event: WorkerEvent): void => callback(event)
    ipcRenderer.on('worker:event', listener)
    return () => ipcRenderer.removeListener('worker:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
