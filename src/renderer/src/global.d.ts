import type { IpcChannel } from '@shared/ipc-contract'
import type { WorkerEvent } from '@shared/events'

declare global {
  interface Window {
    api: {
      invoke(channel: IpcChannel, arg?: unknown): Promise<unknown>
      onWorkerEvent(callback: (event: WorkerEvent) => void): () => void
    }
  }
}

export {}
