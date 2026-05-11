/**
 * R2 (Cloudflare Object Storage) helpers — Workers-runtime version.
 *
 * Replaces the previous src/lib/storage/r2.ts which used AWS SDK + presign
 * over fetch. Workers have a native R2 binding that's faster, has no API
 * key management, and supports the same multipart pattern the upload flow
 * relies on.
 *
 * Bucket binding name: VIDEOS (declared in wrangler.toml).
 *
 * For presigned URLs (used to let the browser upload directly to R2 and to
 * let the FFmpeg Container Worker read directly), we use the S3-compatible
 * R2 API with a scoped access key. The access key + secret are stored as
 * Worker secrets (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) and signed
 * client-side with the AWS SigV4 algorithm.
 */

import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types'

export interface R2Env {
  VIDEOS: R2Bucket
  CLOUDFLARE_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
}

/**
 * Get an object directly via the R2 binding. Returns null when the object
 * doesn't exist.
 */
export async function getObject(env: R2Env, key: string): Promise<R2ObjectBody | null> {
  return env.VIDEOS.get(key)
}

/**
 * Stream-put an object via the R2 binding. Used server-side for outputs from
 * the FFmpeg Container Worker (transcoded mp4, extracted audio, etc.).
 */
export async function putObject(
  env: R2Env,
  key: string,
  body: ReadableStream | ArrayBuffer | Uint8Array,
  options?: { httpMetadata?: { contentType?: string } },
): Promise<void> {
  await env.VIDEOS.put(key, body as any, options as any)
}

/**
 * Delete an object. Best-effort; ignores not-found.
 */
export async function deleteObject(env: R2Env, key: string): Promise<void> {
  await env.VIDEOS.delete(key)
}

/**
 * Presign a GET URL the browser (or another Worker) can hit directly. Uses
 * the S3-compatible R2 endpoint. The signature is computed inline so we don't
 * need an external SDK.
 *
 * @param ttlSeconds  How long the URL stays valid. Default 3600 (1 hour).
 */
export async function presignGetUrl(
  env: R2Env,
  key: string,
  ttlSeconds: number = 3600,
): Promise<string> {
  return presign(env, 'GET', key, ttlSeconds)
}

/**
 * Presign a PUT URL the browser uploads to (single-part). For multipart,
 * use the explicit multipart API methods.
 */
export async function presignPutUrl(
  env: R2Env,
  key: string,
  ttlSeconds: number = 3600,
): Promise<string> {
  return presign(env, 'PUT', key, ttlSeconds)
}

/**
 * Begin a multipart upload. Returns the upload ID required by subsequent
 * part-upload + complete calls.
 */
export async function createMultipartUpload(
  env: R2Env,
  key: string,
  options?: { httpMetadata?: { contentType?: string } },
): Promise<string> {
  const upload = await env.VIDEOS.createMultipartUpload(key, options)
  return upload.uploadId
}

/**
 * Presign a single part of a multipart upload. The browser PUTs the chunk
 * to this URL; R2 returns an ETag the browser collects.
 */
export async function presignMultipartPartUrl(
  env: R2Env,
  key: string,
  uploadId: string,
  partNumber: number,
  ttlSeconds: number = 3600,
): Promise<string> {
  const params: Record<string, string> = {
    partNumber: String(partNumber),
    uploadId,
  }
  return presign(env, 'PUT', key, ttlSeconds, params)
}

/**
 * Complete a multipart upload by submitting all part ETags.
 */
export async function completeMultipartUpload(
  env: R2Env,
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const upload = env.VIDEOS.resumeMultipartUpload(key, uploadId)
  await upload.complete(
    parts.map(p => ({ partNumber: p.partNumber, etag: p.etag })),
  )
}

/**
 * Abort a multipart upload (cleanup if the browser bailed mid-flow).
 */
export async function abortMultipartUpload(
  env: R2Env,
  key: string,
  uploadId: string,
): Promise<void> {
  const upload = env.VIDEOS.resumeMultipartUpload(key, uploadId)
  await upload.abort()
}

// ─── presigning internals (SigV4) ────────────────────────────────────────────

/**
 * AWS SigV4 presigner for R2's S3-compatible endpoint.
 * Implemented inline so we don't pull in the AWS SDK (~MB) into the Worker.
 */
async function presign(
  env: R2Env,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  key: string,
  ttlSeconds: number,
  extraQuery: Record<string, string> = {},
): Promise<string> {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      'R2 presigning requires R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY ' +
      'Worker secrets. Set with: wrangler secret put R2_ACCESS_KEY_ID',
    )
  }

  const host = `${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
  const region = 'auto'
  const service = 's3'
  const now = new Date()
  const amzDate = formatAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const credential = `${env.R2_ACCESS_KEY_ID}/${credentialScope}`

  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  const queryEntries: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(ttlSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
    ...Object.entries(extraQuery),
  ]
  queryEntries.sort(([a], [b]) => a.localeCompare(b))
  const canonicalQuery = queryEntries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const canonicalRequest = [
    method,
    `/${env.R2_BUCKET_NAME}/${encodedKey}`,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = await deriveSigningKey(env.R2_SECRET_ACCESS_KEY, dateStamp, region, service)
  const signature = await hmacHex(signingKey, stringToSign)

  return `https://${host}/${env.R2_BUCKET_NAME}/${encodedKey}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

function formatAmzDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return bufToHex(hash)
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  return bufToHex(await hmac(key, data))
}

async function deriveSigningKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode('AWS4' + secret), dateStamp)
  const kRegion = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSigning = await hmac(kService, 'aws4_request')
  return kSigning
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}
