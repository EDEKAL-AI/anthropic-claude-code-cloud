import { create } from 'zustand'
import type { Account } from '@shared/models'
import type { WorkerEvent } from '@shared/events'
import { api } from './lib/api'

interface PairingInfo {
  qr?: string
  code?: string
}

interface AppState {
  accounts: Account[]
  pairing: Record<string, PairingInfo> // accountId -> qr/code
  eventStreamInitialized: boolean
  refreshAccounts: () => Promise<void>
  initEventStream: () => void
}

export const useStore = create<AppState>((set, get) => ({
  accounts: [],
  pairing: {},
  eventStreamInitialized: false,

  refreshAccounts: async () => {
    const accounts = await api.accounts.list()
    set({ accounts })
  },

  initEventStream: () => {
    // Idempotent: React.StrictMode mounts effects twice in dev, and this would otherwise
    // attach a duplicate listener that double-counts pairing/status events.
    if (get().eventStreamInitialized) return
    set({ eventStreamInitialized: true })
    window.api.onWorkerEvent((event: WorkerEvent) => {
      switch (event.type) {
        case 'qr':
          set((s) => ({ pairing: { ...s.pairing, [event.accountId]: { qr: event.qr } } }))
          break
        case 'pairingCode':
          set((s) => ({ pairing: { ...s.pairing, [event.accountId]: { code: event.code } } }))
          break
        case 'status':
          // status changed -> refresh accounts and clear pairing once linked
          void get().refreshAccounts()
          if (event.status === 'linked') {
            set((s) => {
              const next = { ...s.pairing }
              delete next[event.accountId]
              return { pairing: next }
            })
          }
          break
      }
    })
  }
}))
