/**
 * Cloudflare R2 storage client.
 *
 * Uses aws4fetch (Cloudflare-Workers-compatible SigV4 signing) instead of
 * @aws-sdk/client-s3, which depends on DOMParser and breaks in edge runtime.
 *
 * Env vars required:
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_ENDPOINT (https://<account_id>.r2.cloudflarestorage.com)
 */

import { AwsClient } from 'aws4fetch'

export const R2_BUCKET = process.env.R2_BUCKET_NAME!
export const PART_SIZE = 50 * 1024 * 1024 // 50MB per part

function getConfig() {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 env vars not configured (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)')
  }

  return {
    endpoint: endpoint.replace(/\/$/, ''),
    accessKeyId,
    secretAccessKey,
    bucket,
  }
}

export function getR2Client(): AwsClient {
  const { accessKeyId, secretAccessKey } = getConfig()
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    region: 'auto',
    service: 's3',
  })
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function objectUrl(key: string): string {
  const { endpoint, bucket } = getConfig()
  return `${endpoint}/${bucket}/${encodeKey(key)}`
}

function extract(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`)
  const m = xml.match(re)
  return m ? m[1] : null
}

/**
 * Start a multipart upload and return presigned PUT URLs for every part.
 */
export async function initiateMultipartUpload(key: string, contentType: string, totalSize: number) {
  const aws = getR2Client()
  const url = `${objectUrl(key)}?uploads=`

  const res = await aws.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`R2 CreateMultipartUpload failed: ${res.status} ${text.slice(0, 500)}`)
  }

  const xml = await res.text()
  const UploadId = extract(xml, 'UploadId')
  if (!UploadId) throw new Error(`R2 did not return an UploadId. Response: ${xml.slice(0, 500)}`)

  const totalParts = Math.ceil(totalSize / PART_SIZE)
  const partUrls = await Promise.all(
    Array.from({ length: totalParts }, (_, i) =>
      presignPartUrl(key, UploadId, i + 1, 86400),
    ),
  )

  return { uploadId: UploadId, key, partUrls, totalParts }
}

async function presignPartUrl(key: string, uploadId: string, partNumber: number, expiresInSec: number): Promise<string> {
  const aws = getR2Client()
  const u = new URL(objectUrl(key))
  u.searchParams.set('partNumber', String(partNumber))
  u.searchParams.set('uploadId', uploadId)
  u.searchParams.set('X-Amz-Expires', String(expiresInSec))

  const signed = await aws.sign(new Request(u.toString(), { method: 'PUT' }), {
    aws: { signQuery: true },
  })
  return signed.url
}

/**
 * Complete a multipart upload after all parts have been uploaded.
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>,
) {
  const aws = getR2Client()
  const url = `${objectUrl(key)}?uploadId=${encodeURIComponent(uploadId)}`

  const sorted = parts.slice().sort((a, b) => a.PartNumber - b.PartNumber)
  const partsXml = sorted
    .map(p => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`)
    .join('')
  const body = `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`

  const res = await aws.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`R2 CompleteMultipartUpload failed: ${res.status} ${text.slice(0, 500)}`)
  }
}

/**
 * Abort an incomplete multipart upload (cleanup for cancelled uploads).
 */
export async function abortMultipartUpload(key: string, uploadId: string) {
  const aws = getR2Client()
  const url = `${objectUrl(key)}?uploadId=${encodeURIComponent(uploadId)}`
  const res = await aws.fetch(url, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`R2 AbortMultipartUpload failed: ${res.status} ${text.slice(0, 500)}`)
  }
}

/**
 * List parts already uploaded for a multipart upload (for resume).
 */
export async function listUploadedParts(key: string, uploadId: string): Promise<Array<{ PartNumber: number; ETag: string; Size?: number }>> {
  const aws = getR2Client()
  const url = `${objectUrl(key)}?uploadId=${encodeURIComponent(uploadId)}`
  const res = await aws.fetch(url, { method: 'GET' })
  if (!res.ok) {
    if (res.status === 404) return []
    const text = await res.text()
    throw new Error(`R2 ListParts failed: ${res.status} ${text.slice(0, 500)}`)
  }
  const xml = await res.text()
  const parts: Array<{ PartNumber: number; ETag: string; Size?: number }> = []
  const partRe = /<Part>([\s\S]*?)<\/Part>/g
  let m: RegExpExecArray | null
  while ((m = partRe.exec(xml))) {
    const block = m[1]
    const partNumber = Number(extract(block, 'PartNumber'))
    const etag = extract(block, 'ETag')
    const size = extract(block, 'Size')
    if (partNumber && etag) {
      parts.push({ PartNumber: partNumber, ETag: etag, Size: size ? Number(size) : undefined })
    }
  }
  return parts
}

/**
 * Generate a presigned GET URL for a private R2 object.
 */
export async function presignDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const aws = getR2Client()
  const u = new URL(objectUrl(key))
  u.searchParams.set('X-Amz-Expires', String(expiresIn))

  const signed = await aws.sign(new Request(u.toString(), { method: 'GET' }), {
    aws: { signQuery: true },
  })
  return signed.url
}

// Alias for the old name used in some routes
export const presignGetUrl = presignDownloadUrl

/**
 * Upload a Buffer directly to R2 (server-side pipeline use).
 */
export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
  const aws = getR2Client()
  const res = await aws.fetch(objectUrl(key), {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer as any,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`R2 PutObject failed: ${res.status} ${text.slice(0, 500)}`)
  }
}

/**
 * Stream upload to R2. Buffers the stream then PUTs in one call.
 * For files >100MB, prefer the multipart upload path from the browser.
 */
export async function uploadStream(key: string, stream: AsyncIterable<any> | ReadableStream, contentType: string) {
  const chunks: Uint8Array[] = []
  if (stream instanceof ReadableStream) {
    const reader = stream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
  } else {
    for await (const chunk of stream as AsyncIterable<any>) {
      chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk))
    }
  }
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.byteLength
  }
  await uploadBuffer(key, Buffer.from(buf), contentType)
}

/**
 * Delete an object from R2.
 */
export async function deleteR2Object(key: string) {
  const aws = getR2Client()
  const res = await aws.fetch(objectUrl(key), { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`R2 DeleteObject failed: ${res.status} ${text.slice(0, 500)}`)
  }
}

/**
 * Generate presigned PUT URLs for specific part numbers (for resuming an upload).
 */
export async function presignResumeParts(
  key: string,
  uploadId: string,
  partNumbers: number[],
): Promise<string[]> {
  return Promise.all(partNumbers.map(n => presignPartUrl(key, uploadId, n, 86400)))
}
