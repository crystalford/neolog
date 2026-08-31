/**
 * Client-side photo prep — runs in the browser before upload.
 *
 * Two jobs:
 *   1. Read EXIF DateTimeOriginal + orientation from the ORIGINAL file bytes
 *      (before canvas conversion strips metadata). Minimal inline parser —
 *      no dependency. Only DateTimeOriginal (0x9003) and Orientation (0x0112).
 *   2. Decode the file (HEIC included — the browser handles it) onto a canvas
 *      with orientation applied, and export a display JPEG + a small thumbnail.
 *      This sidesteps server-side HEIC entirely: whatever the browser can
 *      show, it can draw to canvas and re-encode as JPEG.
 *
 * Mirrors the video thumbnail-capture pattern in CapturePanel.tsx
 * (canvas.toBlob → base64), extended to still images with EXIF.
 */

export interface PhotoExif {
  takenAt: string | null      // ISO string, or null
  orientation: number         // 1-8 EXIF orientation, default 1
}

export interface PreparedPhoto {
  displayBlob: Blob           // JPEG for R2
  thumbnailBase64: string     // small JPEG, base64 (no data: prefix) for register body
  width: number               // display dimensions after orientation
  height: number
  takenAt: string | null
  takenAtSource: 'exif' | 'file_mtime' | 'upload_time_default'
}

const DISPLAY_MAX = 2048      // longest edge of the stored display JPEG
const THUMB_MAX = 480
const DISPLAY_QUALITY = 0.86
const THUMB_QUALITY = 0.72

/**
 * Read EXIF taken-at + orientation from a JPEG/HEIC file. Best-effort;
 * returns { takenAt: null, orientation: 1 } when there's no EXIF.
 */
export async function readExif(file: File): Promise<PhotoExif> {
  try {
    // Only need the head of the file — EXIF lives in the first APP1 segment.
    const head = await file.slice(0, 256 * 1024).arrayBuffer()
    const view = new DataView(head)
    if (view.byteLength < 12) return { takenAt: null, orientation: 1 }

    // JPEG: 0xFFD8. Walk markers to find APP1 (0xFFE1) "Exif".
    if (view.getUint16(0) !== 0xFFD8) {
      // Not a JPEG (could be HEIC). We skip EXIF parse for non-JPEG here —
      // HEIC EXIF is in a different box structure; fall back to file mtime.
      return { takenAt: null, orientation: 1 }
    }
    let offset = 2
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset)
      const size = view.getUint16(offset + 2)
      if (marker === 0xFFE1) {
        // APP1 — check for "Exif\0\0"
        const exifStart = offset + 4
        if (view.getUint32(exifStart) === 0x45786966) { // "Exif"
          return parseExifTiff(view, exifStart + 6)
        }
      }
      if ((marker & 0xFF00) !== 0xFF00) break
      offset += 2 + size
    }
  } catch { /* fall through */ }
  return { takenAt: null, orientation: 1 }
}

function parseExifTiff(view: DataView, tiffStart: number): PhotoExif {
  let taken: string | null = null
  let orientation = 1
  try {
    const little = view.getUint16(tiffStart) === 0x4949 // "II"
    const rd16 = (o: number) => view.getUint16(o, little)
    const rd32 = (o: number) => view.getUint32(o, little)

    const ifd0 = tiffStart + rd32(tiffStart + 4)
    const readIfd = (ifdOffset: number): number => {
      const count = rd16(ifdOffset)
      let exifSubIfd = 0
      for (let i = 0; i < count; i++) {
        const entry = ifdOffset + 2 + i * 12
        const tag = rd16(entry)
        if (tag === 0x0112) orientation = rd16(entry + 8) || 1        // Orientation
        if (tag === 0x8769) exifSubIfd = tiffStart + rd32(entry + 8)  // Exif IFD pointer
        if (tag === 0x9003 || tag === 0x0132) {                       // DateTimeOriginal / DateTime
          const valOffset = tiffStart + rd32(entry + 8)
          taken = readExifDate(view, valOffset) || taken
        }
      }
      return exifSubIfd
    }

    const sub = readIfd(ifd0)
    if (sub) readIfd(sub)
  } catch { /* best effort */ }
  return { takenAt: taken, orientation }
}

/** EXIF dates are "YYYY:MM:DD HH:MM:SS" ASCII. Convert to ISO. */
function readExifDate(view: DataView, offset: number): string | null {
  try {
    let s = ''
    for (let i = 0; i < 19; i++) {
      const c = view.getUint8(offset + i)
      if (c === 0) break
      s += String.fromCharCode(c)
    }
    const m = s.match(/^(\d{4}):(\d{2}):(\d{2})\s(\d{2}):(\d{2}):(\d{2})$/)
    if (!m) return null
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

/**
 * Decode → orient → export a display JPEG + thumbnail. Returns everything the
 * upload flow needs. Throws only if the browser can't decode the file at all.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const exif = await readExif(file)

  const bitmap = await loadBitmap(file)
  const { canvas, width, height } = drawOriented(bitmap, exif.orientation, DISPLAY_MAX)
  const displayBlob = await canvasToBlob(canvas, DISPLAY_QUALITY)

  // Thumbnail from the already-oriented display canvas.
  const thumbCanvas = downscale(canvas, THUMB_MAX)
  const thumbBlob = await canvasToBlob(thumbCanvas, THUMB_QUALITY)
  const thumbnailBase64 = await blobToBase64(thumbBlob)

  let takenAt = exif.takenAt
  let takenAtSource: PreparedPhoto['takenAtSource'] = 'exif'
  if (!takenAt) {
    if (file.lastModified) {
      takenAt = new Date(file.lastModified).toISOString()
      takenAtSource = 'file_mtime'
    } else {
      takenAt = new Date().toISOString()
      takenAtSource = 'upload_time_default'
    }
  }

  return { displayBlob, thumbnailBase64, width, height, takenAt, takenAtSource }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap decodes HEIC on browsers that support it (iOS Safari
  // does). Fall back to an <img> element for the rest.
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Browser could not decode this image'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function drawOriented(
  src: ImageBitmap | HTMLImageElement,
  orientation: number,
  maxEdge: number,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const sw = (src as any).width as number
  const sh = (src as any).height as number
  // Orientations 5-8 swap width/height.
  const swap = orientation >= 5 && orientation <= 8
  const rawW = swap ? sh : sw
  const rawH = swap ? sw : sh
  const scale = Math.min(1, maxEdge / Math.max(rawW, rawH))
  const outW = Math.round(rawW * scale)
  const outH = Math.round(rawH * scale)

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')!
  // Apply the EXIF orientation transform.
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, outW, 0); break
    case 3: ctx.transform(-1, 0, 0, -1, outW, outH); break
    case 4: ctx.transform(1, 0, 0, -1, 0, outH); break
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break
    case 6: ctx.transform(0, 1, -1, 0, outW, 0); break
    case 7: ctx.transform(0, -1, -1, 0, outW, outH); break
    case 8: ctx.transform(0, -1, 1, 0, 0, outH); break
    default: break
  }
  const drawW = swap ? outH : outW
  const drawH = swap ? outW : outH
  ctx.drawImage(src as any, 0, 0, drawW, drawH)
  return { canvas, width: outW, height: outH }
}

function downscale(canvas: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height))
  if (scale === 1) return canvas
  const out = document.createElement('canvas')
  out.width = Math.round(canvas.width * scale)
  out.height = Math.round(canvas.height * scale)
  out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('canvas.toBlob returned null')),
      'image/jpeg',
      quality,
    )
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result || '')
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    reader.onerror = () => reject(new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}
