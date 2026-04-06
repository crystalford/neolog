/**
 * Cloudflare R2 storage client (S3-compatible).
 *
 * All video files are stored here. Supabase is only used for database + auth.
 *
 * Env vars required:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_ENDPOINT (https://<account_id>.r2.cloudflarestorage.com)
 */

import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const R2_BUCKET = process.env.R2_BUCKET_NAME!
export const PART_SIZE = 50 * 1024 * 1024 // 50MB per part

export function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 env vars not configured (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })
}

/**
 * Start a multipart upload and return presigned PUT URLs for every part.
 * All URLs are generated server-side in one call (pure crypto, no R2 network per part).
 */
export async function initiateMultipartUpload(key: string, contentType: string, totalSize: number) {
  const client = getR2Client()

  const { UploadId } = await client.send(new CreateMultipartUploadCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  }))

  if (!UploadId) throw new Error('R2 did not return an UploadId')

  const totalParts = Math.ceil(totalSize / PART_SIZE)
  const partUrls = await Promise.all(
    Array.from({ length: totalParts }, (_, i) =>
      getSignedUrl(client, new UploadPartCommand({
        Bucket: R2_BUCKET,
        Key: key,
        UploadId,
        PartNumber: i + 1,
      }), { expiresIn: 86400 }) // 24h — enough for slow / paused uploads
    )
  )

  return { uploadId: UploadId, key, partUrls, totalParts }
}

/**
 * Complete a multipart upload after all parts have been uploaded.
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>,
) {
  const client = getR2Client()
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: R2_BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }))
}

/**
 * Abort an incomplete multipart upload (cleanup for cancelled uploads).
 */
export async function abortMultipartUpload(key: string, uploadId: string) {
  const client = getR2Client()
  await client.send(new AbortMultipartUploadCommand({
    Bucket: R2_BUCKET,
    Key: key,
    UploadId: uploadId,
  }))
}

/**
 * List parts already uploaded for a multipart upload (for resume).
 */
export async function listUploadedParts(key: string, uploadId: string) {
  const client = getR2Client()
  const { Parts } = await client.send(new ListPartsCommand({
    Bucket: R2_BUCKET,
    Key: key,
    UploadId: uploadId,
  }))
  return Parts ?? []
}

/**
 * Generate a presigned GET URL for a private R2 object.
 * Default expiry: 1 hour.
 */
export async function presignGetUrl(key: string, expiresIn = 3600): Promise<string> {
  const client = getR2Client()
  return getSignedUrl(client, new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn })
    .catch(async () => {
      // HeadObject for presigning isn't universally supported — fall back to GetObject
      const { GetObjectCommand } = await import('@aws-sdk/client-s3')
      return getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn })
    })
}

/**
 * Generate a presigned GET URL using GetObject (preferred for playback).
 */
export async function presignDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')
  const client = getR2Client()
  return getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn })
}

/**
 * Upload a Buffer directly to R2 (for server-side pipeline use, e.g. storing transcoded MP4).
 */
export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
  const client = getR2Client()
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
}

/**
 * Handle streaming upload directly to R2 using chunking without keeping the entire file in memory.
 */
export async function uploadStream(key: string, stream: AsyncIterable<any> | ReadableStream, contentType: string) {
  const { Upload } = await import('@aws-sdk/lib-storage')
  const client = getR2Client()
  const upload = new Upload({
    client,
    params: {
      Bucket: R2_BUCKET,
      Key: key,
      Body: stream,
      ContentType: contentType,
    },
  })
  await upload.done()
}

/**
 * Delete an object from R2.
 */
export async function deleteR2Object(key: string) {
  const client = getR2Client()
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}

/**
 * Generate presigned PUT URLs for specific part numbers (for resuming an upload).
 */
export async function presignResumeParts(
  key: string,
  uploadId: string,
  partNumbers: number[],
): Promise<string[]> {
  const client = getR2Client()
  return Promise.all(
    partNumbers.map(partNumber =>
      getSignedUrl(client, new UploadPartCommand({
        Bucket: R2_BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }), { expiresIn: 86400 })
    )
  )
}
