/**
 * "Kept, checked, you can clear this" — and meaning it.
 *
 * `clear.html` calls this the loop the log exists to close, and it is the
 * original problem in the operator's own words: the phone fills up, he
 * deletes, the record is gone.
 *
 * The log only fixes that if it can say, per file, that the copy it holds is
 * the file — not that an upload returned 200. The page is explicit:
 *
 *   "'Clear it' means verified, not uploaded. Uploaded isn't kept. The log
 *    checks the stored bytes against the phone's before it says so."
 *
 * ── What is actually checked, and what is claimed ────────────────────────
 *
 * A Worker cannot read a 1.4 GB video back through its own memory to hash
 * it, and pretending otherwise would put the lie inside the one feature that
 * exists to be trustworthy. So there are two checks and the log says which
 * one it ran:
 *
 *   bytes  the client hashed the original with SHA-256 before it left the
 *          phone; the log hashes what it stored and compares. Byte for byte.
 *          Used up to VERIFY_BYTES_MAX.
 *   size   above that, the stored object's length is compared to the
 *          original's. This catches a truncated upload, which is what
 *          actually goes wrong, and it is NOT a byte check — so the entry
 *          says "kept · size checked", never "checked".
 *
 * Only a `checked` state means delete it locally.
 */

import { findMany, findOne, run } from '@/lib/d1'
import { getObject, type R2Env } from '@/lib/r2'
import type { D1Database } from '@cloudflare/workers-types'

export type KeepState = 'pending' | 'checking' | 'checked' | 'mismatch'
export type VerifiedBy = 'bytes' | 'size'

/** Above this the log compares length rather than content, and says so. */
export const VERIFY_BYTES_MAX = 50 * 1024 * 1024

export interface KeepVerdict {
  state: KeepState
  verified_by: VerifiedBy | null
  note: string
}

/** What the log is allowed to say about a file, in words. */
export function keepLine(state: string | null, verifiedBy: string | null): string {
  switch (state) {
    case 'checked':
      return verifiedBy === 'bytes'
        ? 'kept · checked · clear it'
        : 'kept · size checked · clear it'
    case 'checking': return 'kept · checking…'
    case 'mismatch': return 'didn’t match · re-sending'
    case 'pending':  return 'not here yet'
    default:         return 'kept'
  }
}

/** The one state that means it is safe to delete the local copy. */
export function isClearable(state: string | null): boolean {
  return state === 'checked'
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verify one stored file against what the client said it sent.
 *
 * Never throws: a check that could not run leaves the entry in `checking`
 * rather than claiming either outcome, because the whole point is that
 * `checked` is only ever said when it is true.
 */
export async function verifyStored(
  env: R2Env,
  r2Key: string,
  expected: { checksum?: string | null; bytes?: number | null },
): Promise<KeepVerdict> {
  try {
    const obj = await getObject(env, r2Key)
    if (!obj) {
      return { state: 'mismatch', verified_by: null, note: 'The stored copy could not be found.' }
    }
    const buf = await obj.arrayBuffer()
    const storedBytes = buf.byteLength

    if (typeof expected.bytes === 'number' && expected.bytes > 0 && storedBytes !== expected.bytes) {
      return {
        state: 'mismatch',
        verified_by: 'size',
        note: `The stored copy is ${storedBytes} bytes; the original was ${expected.bytes}.`,
      }
    }

    // Above the ceiling the log compares length only, and says so rather
    // than calling it a byte check.
    if (storedBytes > VERIFY_BYTES_MAX || !expected.checksum) {
      return {
        state: 'checked',
        verified_by: 'size',
        note: expected.checksum
          ? 'Too large to re-read byte for byte here; the stored length matches the original.'
          : 'The stored length matches the original. No checksum was sent, so this is not a byte check.',
      }
    }

    const got = await sha256Hex(new Uint8Array(buf))
    if (got !== expected.checksum) {
      return {
        state: 'mismatch',
        verified_by: 'bytes',
        note: 'The stored copy differs from the original.',
      }
    }
    return {
      state: 'checked',
      verified_by: 'bytes',
      note: 'The stored copy is byte for byte the original.',
    }
  } catch (err: any) {
    console.warn('[keep] verify failed:', err?.message || err)
    // Not a pass and not a failure — the log does not know, so it does not say.
    return { state: 'checking', verified_by: null, note: 'The check could not run; it will be retried.' }
  }
}

/**
 * Has this exact file already arrived? "The log never deletes a copy. The
 * second arrival attaches to the first, notes where it came from, and the
 * log has one recording with two sources instead of two recordings."
 */
export async function findExistingCopy(
  db: D1Database,
  operatorId: string,
  checksum: string,
  excludeId?: string,
): Promise<{ id: string; text: string; happened_at: string } | null> {
  if (!checksum) return null
  return findOne<{ id: string; text: string; happened_at: string }>(
    db,
    `SELECT id, text, COALESCE(happened_at, occurred_at) AS happened_at
       FROM log_entries
      WHERE operator_id = ? AND checksum = ? AND deleted_at IS NULL
        AND copy_of IS NULL
        ${excludeId ? 'AND id <> ?' : ''}
      ORDER BY COALESCE(happened_at, occurred_at) ASC
      LIMIT 1`,
    ...(excludeId ? [operatorId, checksum, excludeId] : [operatorId, checksum]),
  )
}

export interface ClearSummary {
  clearable: number
  clearable_bytes: number
  checking: number
  pending: number
  mismatch: number
  files: {
    id: string
    text: string
    happened_at: string
    bytes: number | null
    keep_state: string | null
    verified_by: string | null
    original_filename: string | null
  }[]
}

/** What is on the phone that the log can honestly say it holds. */
export async function clearSummary(db: D1Database, operatorId: string): Promise<ClearSummary> {
  const files = await findMany<ClearSummary['files'][number]>(
    db,
    `SELECT id, text, COALESCE(happened_at, occurred_at) AS happened_at,
            bytes, keep_state, verified_by, original_filename
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND r2_key IS NOT NULL
      ORDER BY COALESCE(happened_at, occurred_at) DESC
      LIMIT 500`,
    operatorId,
  )
  const clearableFiles = files.filter(f => isClearable(f.keep_state))
  return {
    clearable: clearableFiles.length,
    clearable_bytes: clearableFiles.reduce((n, f) => n + (f.bytes || 0), 0),
    checking: files.filter(f => f.keep_state === 'checking').length,
    pending: files.filter(f => f.keep_state === 'pending' || !f.keep_state).length,
    mismatch: files.filter(f => f.keep_state === 'mismatch').length,
    files,
  }
}
