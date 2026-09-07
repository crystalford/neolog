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

import { callChat } from '@/lib/llm'
import { getObject, type R2Env } from '@/lib/r2'
import type { EntryKind, DatePrecision } from '@/lib/log-entry'

export interface IntakeEnv extends R2Env {
  // Structural, not the `Ai` global: callers whose `Ai` resolves against a
  // different lib context (DOM `Response` vs the Workers one) are otherwise
  // unassignable here, over a `gateway()` method nothing in this file calls.
  AI: { run: (model: any, args: any) => Promise<any> }
  ANTHROPIC_API_KEY?: string
}

// ── The hold-back check (SPEC §0.2) ────────────────────────────────────────

export interface HoldBackVerdict {
  held: boolean
  /**
   * What the log saw, as a NOUN PHRASE — the row renders "It looks like
   * {saw}." A verb phrase there produced "It looks like the check could not
   * run.", which is broken English and, worse, describes the log's own
   * failure as something it saw on the picture.
   *
   * Null when it is held for a reason that is not a sighting; `why` carries
   * that instead.
   */
  saw: string | null
  /** Why it is held when nothing was seen — the log's own state, said plainly. */
  why: string | null
  /** A plain description of the picture, so an image entry has a line. */
  description: string | null
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

const HOLD_BACK_SYSTEM = `You look at one image and report what is visibly on it. You do not interpret, advise, or say what it might mean to anyone.

Return ONE JSON object and nothing else:
{"description":"<one plain sentence: what is in the picture>","held":true|false,"saw":"<what is visibly on it, one short phrase, or null>"}

Set "held" to true only if the image shows one of these:
- ${HOLD_BACK_KINDS}

Rules:
- "saw" describes only what is visible — "a name, a date of birth and a number laid out like a card". Never a reason, never a judgement, never a category name on its own. Use null when held is false.
- "description" is always filled in: one factual sentence. No guessing who a specific person is — say "a person", "two people".
- An ordinary photo, a screenshot of software, a landscape, food, or a document that is none of the five kinds above: held is false.
- A conference badge, a library card, a loyalty card or a form is NOT an identity document unless it carries a date of birth or a government number.
- If you cannot see the image clearly enough to tell, set held to true and saw to "could not read this clearly".`

/** Pull the first JSON object out of a model response. */
function firstJsonObject(text: string): any | null {
  const cleaned = (text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++
    else if (cleaned[i] === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

/** Display JPEGs are small; an enormous original is not worth the memory. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024

/**
 * Look at an uploaded image and decide whether it must be held back.
 *
 * The call shape is the one `src/lib/vision.ts` already uses in production:
 * a base64 data URI in an `image_url` content part, through `callChat` with
 * the `scout` model key. An earlier version of this function passed
 * `{ image: Array.from(bytes) }`, which Llama 4 Scout does not accept — the
 * model never saw the picture, so every uploaded image stayed held forever
 * while appearing to have been checked.
 *
 * Because the failure direction matters, EVERY error path returns held=true.
 * A check that could not run is not a clean bill of health.
 */
export async function checkHoldBack(
  env: IntakeEnv,
  r2Key: string,
  mimeType = 'image/jpeg',
): Promise<HoldBackVerdict> {
  let dataUri: string
  try {
    const obj = await getObject(env, r2Key)
    if (!obj) {
      return { held: true, saw: null, why: 'The file could not be read.', description: null, checked: false }
    }
    const buf = await obj.arrayBuffer()
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      return { held: true, saw: null, why: 'It is too large to look at.', description: null, checked: false }
    }
    dataUri = `data:${mimeType};base64,${bytesToBase64(new Uint8Array(buf))}`
  } catch (err: any) {
    console.warn('[intake] hold-back read failed:', err?.message || err)
    return { held: true, saw: null, why: 'The file could not be read.', description: null, checked: false }
  }

  try {
    const res = await callChat(env as any, {
      model: 'scout',
      system: HOLD_BACK_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is visibly on this image?' },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      }] as any,
      maxTokens: 300,
      temperature: 0,
    })
    const parsed = firstJsonObject(res.text)
    if (!parsed || typeof parsed.held !== 'boolean') {
      // A model that did not answer the question is not a "no".
      return { held: true, saw: null, why: 'It could not be read clearly enough to tell.', description: null, checked: false }
    }
    const description = typeof parsed.description === 'string' && parsed.description.trim()
      ? parsed.description.trim()
      : null
    return {
      held: parsed.held,
      saw: parsed.held
        ? (typeof parsed.saw === 'string' && parsed.saw.trim() ? parsed.saw.trim() : 'something laid out like a document')
        : null,
      why: null,
      description,
      checked: true,
    }
  } catch (err: any) {
    console.warn('[intake] hold-back check failed:', err?.message || err)
    return { held: true, saw: null, why: 'The check could not run.', description: null, checked: false }
  }
}

/** Base64 without blowing the stack on a large buffer. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
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
