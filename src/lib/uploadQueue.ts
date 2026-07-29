// Offline photo-upload queue (Slice 14). No Background Sync API (DECISIONS
// 014): failed/offline uploads are stored in IndexedDB and flushed the next
// time the app is foregrounded with connectivity. IndexedDB stores Blobs
// natively, so photos survive an app kill.

import { supabase } from './supabase'
import type { Database } from '../types/database'

type FileKind = Database['public']['Enums']['file_kind']

const DB_NAME = 'eternal-upload-queue'
const STORE = 'uploads'

interface QueuedUpload {
  id: string
  jobId: string
  kind: FileKind
  filename: string
  blob: Blob
  userId: string
  queuedAt: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = fn(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function enqueueUpload(input: {
  jobId: string
  kind: FileKind
  file: File
  userId: string
}): Promise<void> {
  const item: QueuedUpload = {
    id: crypto.randomUUID(),
    jobId: input.jobId,
    kind: input.kind,
    filename: input.file.name,
    blob: input.file,
    userId: input.userId,
    queuedAt: new Date().toISOString(),
  }
  await tx('readwrite', (store) => store.add(item))
}

export async function queuedCount(): Promise<number> {
  return tx('readonly', (store) => store.count())
}

/** Upload everything in the queue; leaves failures queued for next time. */
export async function flushQueue(): Promise<{ flushed: number; remaining: number }> {
  const items = await tx<QueuedUpload[]>('readonly', (store) => store.getAll())
  let flushed = 0
  for (const item of items) {
    try {
      const path = `jobs/${item.jobId}/${item.id}-${item.filename}`
      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(path, item.blob, { upsert: true })
      if (uploadError) throw uploadError
      const { error: insertError } = await supabase.from('files').insert({
        job_id: item.jobId,
        kind: item.kind,
        storage_path: path,
        filename: item.filename,
        size_bytes: item.blob.size,
        uploaded_by: item.userId,
      })
      if (insertError) throw insertError
      await tx('readwrite', (store) => store.delete(item.id))
      flushed++
    } catch {
      // Still offline or failing — stays queued.
    }
  }
  return { flushed, remaining: items.length - flushed }
}

/** Wire the flush triggers once at startup. */
export function installQueueFlusher(onFlush?: (result: { flushed: number; remaining: number }) => void) {
  const run = () => {
    if (navigator.onLine) {
      void flushQueue().then((result) => {
        if (result.flushed > 0) onFlush?.(result)
      })
    }
  }
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run()
  })
  run()
}
