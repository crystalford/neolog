/**
 * Intake — what the log does with a thing at the moment it arrives.
 *
 * Two rules from SPEC §0 govern everything here:
 *
 *   3. **Only what was said.** Nothing is inferred or filled in. The log may
 *      ask; it never supplies. Guesses are marked as guesses.
 *   6. **Never ask at input.** One line saying what it did, one undo, silence.
 *
 * So this file is deliberately small. A file's sentence is composed from the
 * file's own facts — its kind, its length, its clock — never written by a
 * model. The only model call at intake is the hold-back check, and it is
 * asked what it SEES, never what something means.
 *
 * LLM-PIPELINE §9, applied: one verb per call · schema-bound · temperature 0
 * · nothing asserted without evidence · the model never decides a publish.
 * Being wrong towards private is the only direction it is safe to be wrong in
 * (SPEC §0.2), so every failure path here holds back rather than publishes.
 */

import { MODELS } from '@/lib/models'
import type { EntryKind, DatePrecision } from '@/lib/log-entry'

export interface IntakeEnv {
  AI: { run: (model: any, args: unknown) => Promise<any> }
}

// ── The hold-back check (SPEC §0.2) ────────────────────────────────────────

export interface HoldBackVerdict {
  held: boolean
  /** What the log saw, in its own words. Never an unnamed reason. */
  saw: string | null
  /** False when the check could not run — the entry is held anyway. */
  checked: boolean
}

/**
 * The five things the log recognises and holds back. Named explicitly in the
 * prompt because an open-ended "is this sensitive?" produces a model's
 * opinion about the operator's life, which is exactly what rule 3 forbids.
 */
const HOLD_BACK_KINDS = [
  'an identity document — a name, a date of birth and a number laid out as a card',
  'a bank or card statement, or a screenshot of an account balance',
  'a medical letter, prescription, or test result',
  'a passport or visa page',
  'a home address written out in full',
].join('\n- ')

const HOLD_BACK_SYSTEM = `You look at one image and report what is visibly on it. You do not interpret, advise, or describe what it might mean to anyone.

Report whether the image shows any of these:
- ${HOLD_BACK_KINDS}

Answer with a single JSON object and nothing else:
{"held": true|false, "saw": "<what is visibly on the image, one short phrase, or null>"}

Rules:
- "saw" describes only what is visible — "a name, a date of birth and a number laid out like a card". Never a reason, never a judgement, never a category name alone.
- If the image is an ordinary photo, a screenshot of software, a landscape, a person, food, a document that is none of the five kinds above: {"held": false, "saw": null}.
- A conference badge, a library card, a loyalty card or a form is NOT an identity document unless it carries a date of birth or a government number.
- If you cannot see the image clearly enough to tell, answer {"held": true, "saw": "could not read this clearly"}.`

/** Pull the first JSON object out of a model response. */
function firstJsonObject(text: string): any | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

/**
 * Look at an uploaded image and decide whether it must be held back.
 *
 * Held-back entries are stored whole and kept out of every feed; the operator
 * can publish one in a tap and the log takes his word for it. Because the
 * failure direction matters, EVERY error path here returns held=true — a
 * check that could not run is not a clean bill of health.
 */
export async function checkHoldBack(
  env: IntakeEnv,
  imageBytes: Uint8Array,
): Promise<HoldBackVerdict> {
  try {
    const res: any = await env.AI.run(MODELS.VISION as any, {
      messages: [
        { role: 'system', content: HOLD_BACK_SYSTEM },
        { role: 'user', content: 'What is visibly on this image?' },
      ],
      image: Array.from(imageBytes),
      temperature: 0,
      max_tokens: 200,
    } as any)

    const text: string = (res?.response ?? res?.result?.response ?? '').toString()
    const parsed = firstJsonObject(text)
    if (!parsed || typeof parsed.held !== 'boolean') {
      // A model that didn't answer the question is not a "no".
      return { held: true, saw: 'could not read this clearly', checked: false }
    }
    return {
      held: parsed.held,
      saw: parsed.held ? (typeof parsed.saw === 'string' && parsed.saw.trim() ? parsed.saw.trim() : 'something that looks like a document') : null,
      checked: true,
    }
  } catch (err: any) {
    console.warn('[intake] hold-back check failed:', err?.message || err)
    return { held: true, saw: 'the check could not run', checked: false }
  }
}

// ── Placing a file by its own clock ────────────────────────────────────────

export interface FilePlacement {
  happened_at: string
  date_precision: DatePrecision
  /** Where the date came from — shown on the entry so the operator can correct it. */
  placed_by: 'exif' | 'media' | 'filename' | 'client' | 'arrival'
}

/**
 * Decide when a file happened, from the file itself.
 *
 * The operator is never asked to date a file (SPEC §1). The client reads EXIF
 * and MP4 metadata before upload and sends what it found; the server decides
 * what to believe and, crucially, records how sure it is. A file with no
 * usable clock is placed at its arrival time and marked `approx` — placed by
 * inference, and it says so on the row.
 */
export function placeFile(input: {
  clientDate?: string | null
  clientSource?: string | null
  filename?: string | null
  arrivedAt: string
}): FilePlacement {
  const { clientDate, clientSource, filename, arrivedAt } = input

  if (clientDate) {
    const d = new Date(clientDate)
    if (!isNaN(d.getTime())) {
      const src = (clientSource || '').toLowerCase()
      if (src === 'exif') return { happened_at: d.toISOString(), date_precision: 'exact', placed_by: 'exif' }
      if (src === 'mvhd' || src === 'media' || src === 'pre_extracted') {
        return { happened_at: d.toISOString(), date_precision: 'exact', placed_by: 'media' }
      }
      if (src === 'filename') return { happened_at: d.toISOString(), date_precision: 'day', placed_by: 'filename' }
      // A date the client found but couldn't attribute — believed to the day.
      return { happened_at: d.toISOString(), date_precision: 'day', placed_by: 'client' }
    }
  }

  // Last resort: the filename, read on the server.
  if (filename) {
    const m = matchFilenameDate(filename)
    if (m) return { happened_at: m, date_precision: 'day', placed_by: 'filename' }
  }

  return { happened_at: arrivedAt, date_precision: 'approx', placed_by: 'arrival' }
}

/**
 * The filename patterns the pipeline already covers, in the order the locked
 * `recorded-at.ts` fallback uses them. Kept in step with that file — if a
 * pattern is added there, add it here.
 */
export function matchFilenameDate(filename: string): string | null {
  const name = filename.replace(/\.[a-z0-9]+$/i, '')
  const iso = (y: string, mo: string, d: string, h = '00', mi = '00', s = '00') => {
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    if (isNaN(dt.getTime())) return null
    if (+y < 1990 || +y > 2100) return null
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null
    return dt.toISOString()
  }
  let m: RegExpMatchArray | null

  // YYYY-MM-DDTHH:MM:SS  /  YYYY-MM-DD_HH-MM-SS
  m = name.match(/(\d{4})-(\d{2})-(\d{2})[T_ ](\d{2})[:-](\d{2})[:-](\d{2})/)
  if (m) return iso(m[1], m[2], m[3], m[4], m[5], m[6])
  // YYYYMMDD_HHMMSS
  m = name.match(/(\d{4})(\d{2})(\d{2})[_T](\d{2})(\d{2})(\d{2})/)
  if (m) return iso(m[1], m[2], m[3], m[4], m[5], m[6])
  // YYYYMMDDHHMMSS — 14 consecutive digits (DJI Mimo)
  m = name.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?!\d)/)
  if (m) return iso(m[1], m[2], m[3], m[4], m[5], m[6])
  // YYYY-MM-DD
  m = name.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return iso(m[1], m[2], m[3])
  // YYYYMMDD
  m = name.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/)
  if (m) return iso(m[1], m[2], m[3])
  return null
}

// ── What kind of entry a thing is ──────────────────────────────────────────

/**
 * The kind of an entry, from what arrived — not from what a model thinks it
 * is about. Seven kinds, and every branch here is mechanical.
 */
export function kindForUpload(mime: string | null, held: boolean): EntryKind {
  if (held) return 'paperwork'
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'seen'
  if (m.startsWith('video/')) return 'made'
  if (m.startsWith('audio/')) return 'said'
  return 'made'
}

/** "3.4 MB" · "812 KB" — for the chip and the manifest. */
export function fileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${Math.round(bytes / 1e3)} KB`
}
