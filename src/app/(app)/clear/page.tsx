'use client'

/**
 * Safe to clear your phone.
 *
 * `clear.html` calls this "the loop the log exists to close", and it is the
 * original problem in the operator's own words: the phone fills up, he
 * deletes, the record is gone.
 *
 * The log only fixes that if it can say, per file, "kept, checked, you can
 * clear this" — and mean it. So this page shows four states and is careful
 * that only one of them means delete it locally:
 *
 *   not here yet   still uploading or queued. Don't touch it on the phone.
 *   kept · checking stored; the log is confirming the copy.
 *   kept · checked  stored and verified. The only state that means clear it.
 *   didn't match    the copy differs. Never clear a file in this state.
 *
 * The page also says WHICH check ran. A byte check and a length check are
 * not the same promise, and claiming the stronger one would put a lie inside
 * the one feature that exists to be trusted.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { keepLine, isClearable } from '@/lib/keep'
import { stampFor } from '@/lib/log-entry'

interface FileRow {
  id: string
  text: string
  happened_at: string
  bytes: number | null
  keep_state: string | null
  verified_by: string | null
  original_filename: string | null
}

interface Summary {
  clearable: number
  clearable_bytes: number
  checking: number
  pending: number
  mismatch: number
  files: FileRow[]
}

function size(b: number | null): string {
  if (!b) return ''
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${Math.round(b / 1e3)} KB`
}

export default function ClearPage() {
  const [s, setS] = useState<Summary | null>(null)
  const [checking, setChecking] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/clear', { cache: 'no-store' })
      if (res.ok) setS(await res.json() as Summary)
    } catch { setS(null) }
  }, [])
  useEffect(() => { void load() }, [load])

  const recheck = useCallback(async () => {
    setChecking(true)
    try {
      // Paged, because verification reads each object back. Keep going while
      // the server says there is more.
      for (;;) {
        const res = await fetch('/api/v2/clear', { method: 'POST' })
        if (!res.ok) break
        const r = await res.json() as { remaining: boolean; looked_at: number }
        if (!r.remaining || r.looked_at === 0) break
      }
      await load()
    } finally { setChecking(false) }
  }, [load])

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb"><Link href="/">the log</Link></div>

        <div className="pghead">
          <h1>Safe to clear your phone.</h1>
          <div className="pgmeta">
            <span>
              This is the original problem: the phone fills up, you delete, the
              record is gone. The log fixes it only if it can say, per file,
              &ldquo;kept, checked, you can clear this&rdquo; — and mean it.
            </span>
          </div>
        </div>

        {s && (
          <>
            <div className="pgpara" style={{ marginTop: 22 }}>
              {s.clearable > 0 ? (
                <>
                  <b>{s.clearable} {s.clearable === 1 ? 'file is' : 'files are'} kept and checked
                  {s.clearable_bytes > 0 ? ` — ${size(s.clearable_bytes)}` : ''}.</b>{' '}
                  Those are safe to delete from the phone. Everything else on this
                  page is not.
                </>
              ) : (
                <>Nothing has been verified yet. Until the log has checked a
                file, do not delete it from the phone.</>
              )}
              <span className="who">
                &ldquo;Clear it&rdquo; means verified, not uploaded. Uploaded
                isn&rsquo;t kept — the log compares what it stored against what
                the phone sent before it says so.
              </span>
            </div>

            <div className="bar" style={{ position: 'static' }}>
              <div className="f">
                <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>
                  {s.checking} checking · {s.pending} not here yet · {s.mismatch} didn&rsquo;t match
                </span>
              </div>
              <div className="r">
                <button className="on" onClick={() => void recheck()} disabled={checking}>
                  {checking ? 'checking…' : 'check the rest'}
                </button>
              </div>
            </div>

            {s.files.map(f => (
              <Link className="en" href={`/entry/${f.id}`} key={f.id}>
                <div className="t">{stampFor(f.happened_at, 'exact')}</div>
                <div>
                  <div className="x">
                    <span className="s">
                      {f.original_filename || f.text}
                    </span>
                    <span className="tags">
                      {f.bytes ? <i>{size(f.bytes)}</i> : null}
                      <i className={isClearable(f.keep_state) ? 'pub' : f.keep_state === 'mismatch' ? 'held' : undefined}>
                        {keepLine(f.keep_state, f.verified_by)}
                      </i>
                    </span>
                  </div>
                  {/* Which check ran, said plainly. A byte check and a length
                      check are different promises. */}
                  {isClearable(f.keep_state) && (
                    <div className="more">
                      {f.verified_by === 'bytes'
                        ? 'The stored copy is byte for byte the original.'
                        : 'Too large to re-read byte for byte here, so the stored length was compared to the original. That catches a truncated upload; it is not a byte check.'}
                    </div>
                  )}
                  {f.keep_state === 'mismatch' && (
                    <div className="more">
                      The copy the log holds is not the file you sent. Do not
                      delete this from the phone.
                    </div>
                  )}
                </div>
              </Link>
            ))}

            {s.files.length === 0 && (
              <div className="none">No files in the log yet.</div>
            )}
          </>
        )}

        <footer className="ft">
          <span>neolog · what is safe to clear</span>
          <span className="r">
            <Link href="/">the log</Link>
            <Link href="/export">export</Link>
          </span>
        </footer>
      </div>
    </Shell>
  )
}
