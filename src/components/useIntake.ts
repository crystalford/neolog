'use client'

/**
 * The intake, as a hook — shared by the log's composer and the full-screen
 * `now` page.
 *
 * Both surfaces do exactly the same thing to a thing you put in: read its
 * own clock in the browser, upload it straight to R2, then post one intake
 * with the keys. Only the chrome around it differs — the composer answers
 * with a receipt line, `now` answers with the slab settling and one word.
 * Keeping the mechanics here means the two can't drift apart, which is what
 * happened to the two feeds the design package spent a week undoing.
 *
 * The rule this enforces on both: uploads start the moment something is
 * attached, so pressing Enter is instant however big the file is, and
 * nothing is ever asked at the moment of input.
 */

import { useCallback, useRef, useState } from 'react'
import type { DatePrecision } from '@/lib/log-entry'

export interface Pending {
  key: string
  file: File
  r2_key?: string
  uploading: boolean
  error?: string
  happened_at?: string
  date_source?: string
  duration_seconds?: number
}

export interface IntakeReceipt {
  line: string
  batch: string
  /** Recordings this act registered — undo has to take these too. */
  vlogIds: string[]
}

export function useIntake(onDone?: () => void) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<Pending[]>([])
  const [recording, setRecording] = useState(false)
  const [sending, setSending] = useState(false)
  const [receipt, setReceipt] = useState<IntakeReceipt | null>(null)
  const recRef = useRef<{ rec: MediaRecorder; started: number } | null>(null)

  /**
   * Attach files. Each one's own clock is read before it leaves the browser
   * — EXIF for an image, media metadata for audio and video — because the
   * operator is never asked to date a file.
   */
  const attach = useCallback(async (files: FileList | File[], durationHint?: number) => {
    const list = Array.from(files)
    if (!list.length) return
    const added: Pending[] = list.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      uploading: true,
      duration_seconds: durationHint,
    }))
    setPending(p => [...p, ...added])

    await Promise.all(added.map(async item => {
      try {
        let happened_at: string | undefined
        let date_source: string | undefined
        let duration_seconds = item.duration_seconds

        if (item.file.type.startsWith('image/')) {
          try {
            const { readExif } = await import('@/lib/photo-client')
            const exif = await readExif(item.file)
            const taken = (exif as any)?.takenAt ?? (exif as any)?.taken_at
            if (taken) {
              const d = new Date(taken)
              if (!isNaN(d.getTime())) { happened_at = d.toISOString(); date_source = 'exif' }
            }
          } catch { /* no EXIF — the server places it and marks it approximate */ }
        }
        if (duration_seconds === undefined
            && (item.file.type.startsWith('audio/') || item.file.type.startsWith('video/'))) {
          duration_seconds = await readMediaDuration(item.file)
        }
        // Deliberately NOT falling back to file.lastModified. That is when
        // the file was last written to a disk — on a download, a copy or an
        // export it is today, and it looks exactly like a real capture date.
        // With no EXIF and no media clock the server places the file by
        // inference and marks it approximate, which is the honest answer.

        const presign = await fetch('/api/v2/log/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: item.file.name, content_type: item.file.type }),
        })
        if (!presign.ok) throw new Error('no upload url')
        const { url, key } = await presign.json() as { url: string; key: string }

        const put = await fetch(url, {
          method: 'PUT',
          body: item.file,
          headers: item.file.type ? { 'Content-Type': item.file.type } : undefined,
        })
        if (!put.ok) throw new Error('upload failed')

        setPending(p => p.map(x => x.key === item.key
          ? { ...x, uploading: false, r2_key: key, happened_at, date_source, duration_seconds }
          : x))
      } catch (err: any) {
        setPending(p => p.map(x => x.key === item.key
          ? { ...x, uploading: false, error: err?.message || 'failed' }
          : x))
      }
    }))
  }, [])

  const removePending = useCallback((key: string) => {
    setPending(p => p.filter(x => x.key !== key))
  }, [])

  /** Talk. The recording becomes a file like any other, then transcribes. */
  const toggleMic = useCallback(async () => {
    if (recording) {
      const r = recRef.current
      if (r) { r.rec.stop(); r.rec.stream.getTracks().forEach(t => t.stop()) }
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data) }
      rec.onstop = () => {
        const started = recRef.current?.started ?? Date.now()
        const secs = Math.round((Date.now() - started) / 1000)
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        const file = new File([blob], `voice-${stamp}.webm`, { type: blob.type })
        void attach([file], secs)
      }
      recRef.current = { rec, started: Date.now() }
      rec.start()
      setRecording(true)
    } catch {
      setRecording(false)
    }
  }, [recording, attach])

  /** Put it in. Returns the receipt, or null if nothing went. */
  const submit = useCallback(async (opts?: {
    happened_at?: string
    date_precision?: DatePrecision
    /** The turn this came out of, when continuing a thread. */
    led_from?: string
  }): Promise<IntakeReceipt | null> => {
    const ready = pending.filter(p => p.r2_key && !p.error)
    if (!text.trim() && !ready.length) return null
    if (pending.some(p => p.uploading)) return null
    setSending(true)
    try {
      const res = await fetch('/api/v2/log/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim() || undefined,
          happened_at: opts?.happened_at,
          date_precision: opts?.date_precision,
          led_from: opts?.led_from,
          files: ready.map(p => ({
            r2_key: p.r2_key,
            original_filename: p.file.name,
            mime: p.file.type,
            bytes: p.file.size,
            happened_at: p.happened_at,
            date_source: p.date_source,
            duration_seconds: p.duration_seconds,
          })),
        }),
      })
      if (!res.ok) return null
      const data = await res.json() as {
        batch_id: string; vlog_ids?: string[]; receipt: { line: string }
      }
      const r: IntakeReceipt = {
        line: data.receipt.line,
        batch: data.batch_id,
        vlogIds: data.vlog_ids || [],
      }
      setText('')
      setPending([])
      setReceipt(r)
      onDone?.()
      return r
    } finally {
      setSending(false)
    }
  }, [text, pending, onDone])

  /** The receipt's undo — takes the whole act with it. */
  const undo = useCallback(async (batch?: string) => {
    const id = batch ?? receipt?.batch
    if (!id) return
    const params = new URLSearchParams({ batch: id })
    const vlogs = receipt?.vlogIds || []
    if (vlogs.length) params.set('vlogs', vlogs.join(','))
    await fetch(`/api/v2/log/intake?${params}`, { method: 'DELETE' })
    setReceipt(null)
    onDone?.()
  }, [receipt, onDone])

  const canSend =
    (text.trim().length > 0 || pending.some(p => p.r2_key))
    && !pending.some(p => p.uploading)
    && !sending

  const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0

  return {
    text, setText,
    pending, attach, removePending,
    recording, toggleMic,
    sending, canSend, wordCount,
    submit, receipt, setReceipt, undo,
  }
}

/** Read a media file's duration in the browser, so the sentence can say it. */
export function readMediaDuration(file: File): Promise<number | undefined> {
  return new Promise(resolve => {
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio')
    const url = URL.createObjectURL(file)
    let done = false
    const finish = (v?: number) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      resolve(v)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () => finish(isFinite(el.duration) ? el.duration : undefined)
    el.onerror = () => finish(undefined)
    el.src = url
    setTimeout(() => finish(undefined), 4000)
  })
}
