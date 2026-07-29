import { useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { formatDateTime } from '../../../lib/format'
import {
  FILE_KINDS,
  fileDownloadUrl,
  useDeleteFile,
  useJobFiles,
  useUploadFile,
} from '../api'
import type { FileKind } from '../api'

const KIND_LABELS: Record<FileKind, string> = {
  measure: 'Measure',
  drawing: 'Drawing',
  slab_photo: 'Slab photo',
  site_photo: 'Site photo',
  contract: 'Contract',
  invoice: 'Invoice',
  other: 'Other',
}

export function JobFiles({ jobId }: { jobId: string }) {
  const { session } = useAuth()
  const { data: files, isPending, isError, error } = useJobFiles(jobId)
  const upload = useUploadFile(jobId)
  const deleteFile = useDeleteFile(jobId)
  const [kind, setKind] = useState<FileKind>('site_photo')
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = async (picked: FileList | null) => {
    if (!picked?.[0] || !session) return
    await upload.mutateAsync({ file: picked[0], kind, userId: session.user.id })
    if (inputRef.current) inputRef.current.value = ''
  }

  const download = async (path: string) => {
    const url = await fileDownloadUrl(path)
    window.open(url, '_blank')
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Files</h2>
      <div className="mb-3 flex items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as FileKind)}
          className="rounded border border-stone-300 px-2 py-1.5 text-sm"
        >
          {FILE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          type="file"
          onChange={(e) => void onPick(e.target.files)}
          className="text-sm"
        />
        {upload.isPending && <span className="text-sm text-stone-500">Uploading…</span>}
      </div>
      {upload.isError && (
        <p className="mb-2 text-sm text-red-600">Upload failed. {upload.error.message}</p>
      )}
      {deleteFile.isError && (
        <p className="mb-2 text-sm text-red-600">Delete failed. {deleteFile.error.message}</p>
      )}
      {isPending && <p className="py-2 text-sm text-stone-500">Loading files…</p>}
      {isError && <p className="py-2 text-sm text-red-600">Could not load files. {error.message}</p>}
      {files && files.length === 0 && (
        <p className="py-2 text-sm text-stone-500">No files uploaded.</p>
      )}
      <ul className="divide-y divide-stone-100">
        {files?.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <button
                onClick={() => void download(f.storage_path)}
                className="block max-w-full truncate text-left font-medium text-stone-900 hover:text-amber-700 hover:underline"
              >
                {f.filename ?? f.storage_path}
              </button>
              <p className="text-xs text-stone-400">
                {KIND_LABELS[f.kind]} · {formatDateTime(f.created_at)}
              </p>
            </div>
            <button
              onClick={() => {
                if (window.confirm(`Delete ${f.filename ?? 'this file'}? This cannot be undone.`))
                  deleteFile.mutate(f.id)
              }}
              disabled={deleteFile.isPending}
              className="shrink-0 text-xs text-stone-400 hover:text-red-600 disabled:opacity-50"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
