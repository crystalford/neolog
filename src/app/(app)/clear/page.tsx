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
import { Rail } from '@/components/Rail'
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

  // Everything the log cannot yet vouch for. `clear.html`'s warn line counts
  // exactly these three: a file still going up, one being checked, and one
  // whose bytes did not match. None of them may leave the phone.
  const unverified = s ? s.checking + s.pending + s.mismatch : 0

  const STATE_CLASS: Record<string, string> = {
    checked: 'ok', checking: 'chk', pending: 'wait', mismatch: 'warn',
  }

  return (
    <Shell>
      <div className="logpage pg-clear">
        <div className="back"><Link href="/">← the log</Link></div>

        <div className="grid">
          <main>
            <section className="top">
              <h1>Safe to <b>clear your phone.</b></h1>
              <p>
                This is the original problem: the phone fills up, you delete,
                the record is gone. The log fixes it only if it can say, per
                file, <b>&ldquo;kept, checked, you can clear this&rdquo;</b> —
                and mean it.
              </p>
            </section>

            {s && (
              <>
                <div className="big">
                  {s.clearable > 0 ? (
                    <>
                      <b>{s.clearable} {s.clearable === 1 ? 'file is' : 'files are'} kept and checked
                      {s.clearable_bytes > 0 ? ` — ${size(s.clearable_bytes)}` : ''}.</b>{' '}
                      Those are safe to delete from the phone. Everything else
                      on this page is not.
                    </>
                  ) : (
                    <>Nothing has been verified yet. Until the log has checked
                    a file, do not delete it from the phone.</>
                  )}
                </div>

                {/* `clear.html` names the four states and what each one
                    permits. The whole page turns on the difference between
                    "uploaded" and "checked", so the difference is written
                    out rather than implied by a colour. */}
                <div className="sh">
                  <span>The four states</span>
                  <b>only one means delete it locally</b>
                </div>
                <div className="states">
                  <div className="row">
                    <span className="s wait">Not here yet</span>
                    <span>Still uploading, or queued. Don&rsquo;t touch it on the phone.</span>
                  </div>
                  <div className="row">
                    <span className="s chk">Kept · checking</span>
                    <span>Stored. The log is confirming the copy is byte-for-byte the original.</span>
                  </div>
                  <div className="row">
                    <span className="s ok">Kept · checked · clear it</span>
                    <span>Stored, verified, in the export. <b>The only state that means delete locally.</b></span>
                  </div>
                  <div className="row">
                    <span className="s warn">Didn&rsquo;t match</span>
                    <span>The copy differs from the original. The log re-sends on its own and says so. Never clear one of these.</span>
                  </div>
                </div>

                <div className="sh">
                  <span>Your files</span>
                  <b>
                    {s.checking} checking · {s.pending} not here yet · {s.mismatch} didn&rsquo;t match
                    {'  '}
                    <button onClick={() => void recheck()} disabled={checking}>
                      {checking ? 'checking…' : 'check the rest'}
                    </button>
                  </b>
                </div>

                {s.files.map(f => (
                  <Link className="fl" href={`/entry/${f.id}`} key={f.id}>
                    <span className="d">{stampFor(f.happened_at, 'exact')}</span>
                    <span className="x">
                      {f.original_filename || f.text}
                      {f.bytes ? <i>{size(f.bytes)}</i> : null}
                      {/* Which check ran, said plainly. A byte check and a
                          length check are different promises, and claiming
                          the stronger one would put a lie inside the one
                          feature that exists to be trusted. */}
                      {isClearable(f.keep_state) && (
                        <i>
                          {f.verified_by === 'bytes'
                            ? 'byte for byte'
                            : 'length checked, not byte for byte'}
                        </i>
                      )}
                      {f.keep_state === 'mismatch' && (
                        <i>the copy is not the file you sent — do not delete it</i>
                      )}
                    </span>
                    <span className={`s ${STATE_CLASS[f.keep_state || 'pending'] || 'wait'}`}>
                      {keepLine(f.keep_state, f.verified_by)}
                    </span>
                  </Link>
                ))}

                {s.files.length === 0 && (
                  <div className="none">No files in the log yet.</div>
                )}
              </>
            )}
          </main>

          {/* `clear.html`'s phone, in the rail — `.ph` holding a `.scr`.
              Every rule for it has been in globals.css since the page was
              built and nothing rendered one: the page put a `.big` line in
              the main column instead, so the surface whose whole job is to
              say "these are safe to delete" said it in prose beside a list.

              Every figure here is one `clearSummary` already returns. None
              is computed twice and none is estimated. */}
          <aside className="ph">
            <div className="scr">
              {s ? (
                <>
                  <div className="big">
                    <b>{s.clearable}</b> {s.clearable === 1 ? 'file is' : 'files are'}
                    <br />safely in the log.
                  </div>
                  <div className="sub">
                    Each one stored, checked against the original, and in your
                    export.
                    {s.clearable_bytes > 0 && (
                      <> Clearing them from this phone frees{' '}
                        <b style={{ color: 'var(--fg)' }}>{size(s.clearable_bytes)}</b>.</>
                    )}
                  </div>

                  <div className="row">
                    <span>Safe to clear</span>
                    <b>{s.clearable}{s.clearable_bytes > 0 ? ` · ${size(s.clearable_bytes)}` : ''}</b>
                  </div>
                  <div className="row"><span>Still checking</span><b>{s.checking}</b></div>
                  <div className="row"><span>Still uploading</span><b>{s.pending}</b></div>
                  <div className="row"><span>Didn&rsquo;t match · re-sending</span><b>{s.mismatch}</b></div>

                  {unverified > 0 && (
                    <div className="warn">
                      The {unverified} that {unverified === 1 ? 'is' : 'are'} not
                      verified stay on the phone. They&rsquo;ll show here when
                      they are.
                    </div>
                  )}

                  {/* ⚠️ A verdict, not a control, and the wording says so.
                      The design reads "Clear the 312 from this phone", which
                      is an imperative — and the log cannot touch his phone.
                      A bone-on-ink block that looks pressable and does
                      nothing is an affordance with no destination, on the
                      one page that exists to be trusted. "Safe to clear" is
                      the same sentence as a verdict, which is what the log
                      actually has to offer. */}
                  <div className="btn">
                    {s.clearable > 0
                      ? <>Safe to clear {s.clearable} from this phone</>
                      : <>Nothing is safe to clear yet</>}
                  </div>
                  <div className="no">Nothing is removed from the log.</div>
                </>
              ) : (
                <div className="sub">Checking what is kept.</div>
              )}
            </div>
          </aside>
        </div>

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
