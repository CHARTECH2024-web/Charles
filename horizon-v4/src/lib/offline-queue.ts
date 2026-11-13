/**
 * Offline entry queue for the Cahier.
 *
 * A sale typed without network is kept on the device and replayed as soon as
 * the connection returns, so a shop never loses a transaction.
 */

const STORAGE_KEY = 'horizon.cahier.queue.v1'

export type QueuedEntry = {
  id: string
  queuedAt: number
  label: string
  payload: {
    type: 'sale' | 'expense' | 'debt'
    label: string
    amount: number
    note?: string
    category?: string
    occurredAt?: number
    quantity?: number
    shopId?: string
    contactId?: string
    productId?: string
    debtDirection?: 'receivable' | 'payable'
  }
}

function read(): QueuedEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueuedEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(items: QueuedEntry[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event('horizon:cahier-queue'))
}

export function listQueued(): QueuedEntry[] {
  return read()
}

export function enqueueEntry(entry: Omit<QueuedEntry, 'id' | 'queuedAt'>): QueuedEntry {
  const queued: QueuedEntry = {
    ...entry,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
  }
  write([...read(), queued])
  return queued
}

export function removeQueued(id: string): void {
  write(read().filter((item) => item.id !== id))
}

/** Replays every queued entry through the given sender. Returns synced count. */
export async function flushQueue(
  send: (payload: QueuedEntry['payload']) => Promise<{ ok: boolean }>,
): Promise<{ synced: number; failed: number }> {
  const items = read()
  if (items.length === 0) return { synced: 0, failed: 0 }
  let synced = 0
  let failed = 0
  for (const item of items) {
    try {
      const result = await send(item.payload)
      if (result.ok) {
        removeQueued(item.id)
        synced += 1
      } else {
        // Rejected payloads will never succeed: drop them instead of looping.
        removeQueued(item.id)
        failed += 1
      }
    } catch {
      failed += 1
    }
  }
  return { synced, failed }
}

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}
