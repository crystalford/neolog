/**
 * Verbatim grounding validator for LLM extraction outputs.
 *
 * Enforces the project-wide "voice preservation hard rule": every
 * `take`, `quote`, and `content` field from an extraction pass must
 * contain a 4-word verbatim substring of the source transcript
 * (case- and punctuation-insensitive).
 *
 * Used at two layers:
 *  1. Per-item validation inside extract-unified.ts — items failing
 *     are tagged validated=0 (kept in DB so the operator can see what
 *     was generated, but visually marked as "ungrounded").
 *  2. Aggregate failRate signal used by the auto-tier escalator —
 *     if the cheap-model run produces >15% ungrounded items, the
 *     orchestrator retries with Sonnet.
 *
 * Implementation: build a Set of every 4-gram in the (normalized)
 * transcript, then check every 4-gram in the candidate field against
 * it. O(N+M) where N is transcript length, M is candidate length.
 */

export interface ValidationResult {
  total: number
  valid: number
  invalid: number
  failRate: number
  // Indices of items that failed grounding (caller maps back to source array).
  invalidIndices: number[]
}

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Build the 4-gram lookup set from the transcript. Cache this and reuse
 * across all items in a single extraction run — it's the expensive step.
 */
export function buildTranscriptFourGrams(transcript: string): Set<string> {
  const words = norm(transcript).split(' ').filter(Boolean)
  const set = new Set<string>()
  for (let i = 0; i <= words.length - 4; i++) {
    set.add(words.slice(i, i + 4).join(' '))
  }
  return set
}

/**
 * Check a single field. Returns true if at least one 4-gram from the
 * field appears verbatim in the transcript.
 */
export function isGrounded(field: string, transcriptFourGrams: Set<string>): boolean {
  const words = norm(field).split(' ').filter(Boolean)
  if (words.length < 4) return false
  for (let i = 0; i <= words.length - 4; i++) {
    if (transcriptFourGrams.has(words.slice(i, i + 4).join(' '))) return true
  }
  return false
}

/**
 * Validate an array of items by extracting one or more field values per
 * item via `accessor`. Item passes if ANY of its fields are grounded.
 *
 * Example:
 *   validateGrounded(threads, ['take', 'key_quotes[*]'], fourGrams)
 *
 * For nested fields you provide your own accessor that returns string[].
 */
export function validateGrounded<T>(
  items: T[],
  accessor: (item: T) => string[],
  transcriptFourGrams: Set<string>,
): ValidationResult {
  const invalidIndices: number[] = []
  for (let i = 0; i < items.length; i++) {
    const fields = accessor(items[i]).filter(s => typeof s === 'string' && s.length > 0)
    if (fields.length === 0) {
      invalidIndices.push(i)
      continue
    }
    const anyGrounded = fields.some(f => isGrounded(f, transcriptFourGrams))
    if (!anyGrounded) invalidIndices.push(i)
  }
  return {
    total: items.length,
    valid: items.length - invalidIndices.length,
    invalid: invalidIndices.length,
    failRate: items.length === 0 ? 0 : invalidIndices.length / items.length,
    invalidIndices,
  }
}
