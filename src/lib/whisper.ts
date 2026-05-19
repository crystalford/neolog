/**
 * Workers AI Whisper invocation with format auto-detection.
 *
 * Background: @cf/openai/whisper-large-v3-turbo has been observed to
 * reject `audio: Array.from(bytes)` for large inputs with:
 *     5006: required properties at '/' are 'audio':
 *     Type mismatch of '/audio', 'string' not in 'object'
 *
 * This happens because the AI binding auto-base64-encodes arrays past a
 * size threshold (~10 MB serialized), and the new model schema requires
 * `audio` to be an OBJECT (e.g. `{ body: bytes }`), not a primitive.
 *
 * We try shapes in order — the first that doesn't throw the 5006 error
 * wins. The successful shape is cached per Worker isolate so subsequent
 * calls go straight to the working format.
 *
 * Order matters: object/body wrapper first (the schema's preferred form),
 * then Array.from (works for small chunks on the older models), then
 * base64 string (last resort for the older `@cf/openai/whisper` model).
 */

type AiBinding = { run: (model: string, input: any, opts?: any) => Promise<any> }

const MODEL = '@cf/openai/whisper-large-v3-turbo'

type Shape = 'object-body' | 'object-content' | 'array' | 'base64'
let preferredShape: Shape | null = null

const ORDER: Shape[] = ['object-body', 'array', 'object-content', 'base64']

export async function runWhisper(ai: AiBinding, bytes: Uint8Array): Promise<any> {
  const shapes: Shape[] = preferredShape
    ? [preferredShape, ...ORDER.filter(s => s !== preferredShape)]
    : ORDER

  let lastErr: any
  for (const shape of shapes) {
    try {
      const input = buildInput(shape, bytes)
      const result = await ai.run(MODEL, input as any)
      preferredShape = shape
      return result
    } catch (err: any) {
      lastErr = err
      const msg = String(err?.message ?? err ?? '')
      // Only continue on the specific schema-mismatch error. Other failures
      // (network, rate-limit, malformed audio) shouldn't burn through every
      // shape because the result is the same.
      if (!/5006|required propert|Type mismatch|not in 'object'|not in 'array'/i.test(msg)) {
        throw err
      }
      // try next shape
    }
  }
  throw new Error(
    `Whisper failed across all input shapes (${bytes.byteLength} bytes). ` +
    `Last error: ${lastErr?.message ?? lastErr}`,
  )
}

function buildInput(shape: Shape, bytes: Uint8Array): unknown {
  switch (shape) {
    case 'object-body':
      // Newer Whisper schema — `audio` is an object with a `body` field
      // that carries the binary. The binding handles Uint8Array → binary
      // serialization without the array → base64 conversion.
      return { audio: { body: bytes } }
    case 'object-content':
      // Alternate object wrapper observed in some Workers AI tutorials.
      return { audio: { content: Array.from(bytes) } }
    case 'array':
      // Old format — works for small chunks on legacy models.
      return { audio: Array.from(bytes) }
    case 'base64':
      // Last resort: explicit base64 string wrapped in the canonical object.
      return { audio: { data: bytesToBase64(bytes), mimeType: 'audio/wav' } }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // btoa requires a string; do it in chunks to avoid argument-count limits.
  let out = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[])
  }
  return btoa(out)
}
