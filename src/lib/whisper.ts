/**
 * Workers AI Whisper invocation with format auto-detection.
 *
 * `@cf/openai/whisper-large-v3-turbo` rejects every JSON-encoded shape we
 * pass with:
 *     5006: required properties at '/' are 'audio':
 *     Type mismatch of '/audio', 'string' not in 'object'
 *
 * That error means the binding is converting whatever we pass into a
 * base64 STRING at `/audio`, but the model's schema requires the value
 * at `/audio` to be a typed binary OBJECT (Blob / ArrayBuffer / stream).
 *
 * This helper tries every plausible shape — including binary-native
 * forms (Blob, ArrayBuffer) that the binding shouldn't have to convert.
 * The first shape that doesn't throw the schema error wins and is cached
 * per Worker isolate so subsequent calls go straight to the right form.
 *
 * Per-shape errors are captured and re-thrown together so when ALL
 * shapes fail the operator sees the distinct failure of each attempt.
 */

type AiBinding = { run: (model: string, input: any, opts?: any) => Promise<any> }

const MODEL = '@cf/openai/whisper-large-v3-turbo'

interface ShapeAttempt {
  name: string
  build: (bytes: Uint8Array) => unknown
}

function asAB(bytes: Uint8Array): ArrayBuffer {
  // Copy into a fresh ArrayBuffer to satisfy strict TS types that don't
  // accept SharedArrayBuffer / ArrayBufferLike at Blob/Whisper boundaries.
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  return ab
}

const SHAPES: ShapeAttempt[] = [
  { name: 'blob',           build: bytes => ({ audio: new Blob([asAB(bytes)], { type: 'audio/wav' }) }) },
  { name: 'arraybuffer',    build: bytes => ({ audio: asAB(bytes) }) },
  { name: 'object-body',    build: bytes => ({ audio: { body: asAB(bytes) } }) },
  { name: 'object-data',    build: bytes => ({ audio: { data: Array.from(bytes) } }) },
  { name: 'object-content', build: bytes => ({ audio: { content: Array.from(bytes) } }) },
  { name: 'array',          build: bytes => ({ audio: Array.from(bytes) }) },
  { name: 'raw-uint8',      build: bytes => ({ audio: bytes }) },
  { name: 'object-blob',    build: bytes => ({ audio: { blob: new Blob([asAB(bytes)], { type: 'audio/wav' }) } }) },
]

let preferredShapeName: string | null = null

export async function runWhisper(ai: AiBinding, bytes: Uint8Array): Promise<any> {
  const ordered = preferredShapeName
    ? [
        SHAPES.find(s => s.name === preferredShapeName)!,
        ...SHAPES.filter(s => s.name !== preferredShapeName),
      ]
    : SHAPES

  const attempts: { shape: string; err: string }[] = []

  for (const shape of ordered) {
    try {
      const input = shape.build(bytes)
      const result = await ai.run(MODEL, input as any)
      preferredShapeName = shape.name
      return result
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? '')
      attempts.push({ shape: shape.name, err: msg.slice(0, 240) })
      // Only continue on the documented schema-mismatch errors. Other
      // failures (network, rate-limit, malformed audio) shouldn't burn
      // through every shape because the result is the same.
      if (!/5006|required propert|Type mismatch|not in 'object'|not in 'array'|not in 'string'/i.test(msg)) {
        // Non-schema failure — fall through but stop early after a couple
        // identical errors to avoid wasting time.
        if (attempts.length >= 2) break
      }
    }
  }
  throw new Error(
    `Whisper failed across all input shapes (${bytes.byteLength} bytes). Per-shape errors:\n` +
    attempts.map(a => `  • ${a.shape}: ${a.err}`).join('\n'),
  )
}
