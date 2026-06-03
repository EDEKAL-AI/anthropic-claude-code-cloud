// Minimal in-memory TTL cache implementing the shape Baileys expects for its
// msgRetryCounterCache (CacheStore), and reused for the getMessage retry buffer. Avoids a
// third-party cache dependency whose API surface varies between versions.

interface Entry<V> {
  value: V
  expires: number
}

export class SimpleCache<V = unknown> {
  private store = new Map<string, Entry<V>>()

  constructor(private ttlMs = 10 * 60_000) {}

  get<T = V>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (entry.expires < Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as unknown as T
  }

  set<T = V>(key: string, value: T): void {
    this.store.set(key, { value: value as unknown as V, expires: Date.now() + this.ttlMs })
  }

  del(key: string): void {
    this.store.delete(key)
  }

  flushAll(): void {
    this.store.clear()
  }
}
