/**
 * Tiny ULID generator — sortable, URL-safe, monotonic IDs.
 *
 * Used as primary keys throughout the D1 schema (TEXT PRIMARY KEY).
 * 26 characters: 10 chars of timestamp (ms since epoch, Crockford base32)
 * + 16 chars of randomness. Lexicographic sort order matches creation order.
 *
 * No external deps. Works in Workers, Pages Functions, and Node.
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32 (no I, L, O, U)
const TIME_LEN = 10
const RANDOM_LEN = 16

function encodeBase32(value: number | bigint, length: number): string {
  let out = ''
  let v = BigInt(value)
  const base = BigInt(ENCODING.length)
  for (let i = 0; i < length; i++) {
    const rem = Number(v % base)
    out = ENCODING[rem] + out
    v = v / base
  }
  return out
}

function randomBase32(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ENCODING[bytes[i] & 0x1f]
  }
  return out
}

/** Generate a new ULID. */
export function ulid(): string {
  return encodeBase32(Date.now(), TIME_LEN) + randomBase32(RANDOM_LEN)
}
