/**
 * Image processing utilities
 * 
 * Note: For production, consider using:
 * - Sharp (server-side, requires native deps)
 * - Cloudinary/imgix (hosted services)
 * - Vercel Image Optimization
 * 
 * This implementation uses browser Canvas API for client-side processing
 */

export interface ImageDimensions {
  width: number
  height: number
}

export interface ProcessedImage {
  blob: Blob
  width: number
  height: number
  originalSize: number
  processedSize: number
}

const MAX_WIDTH = 1920
const MAX_HEIGHT = 1080
const THUMBNAIL_SIZE = 400
const JPEG_QUALITY = 0.85

/**
 * Resize and compress an image file
 */
export async function processImage(
  file: File,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    format?: 'jpeg' | 'png' | 'webp'
  } = {}
): Promise<ProcessedImage> {
  const {
    maxWidth = MAX_WIDTH,
    maxHeight = MAX_HEIGHT,
    quality = JPEG_QUALITY,
    format = 'jpeg',
  } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        // Calculate new dimensions
        let { width, height } = img
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Use better quality settings
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        // Convert to blob
        const mimeType = format === 'png' ? 'image/png' : 
                        format === 'webp' ? 'image/webp' : 'image/jpeg'
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'))
              return
            }
            
            resolve({
              blob,
              width,
              height,
              originalSize: file.size,
              processedSize: blob.size,
            })
          },
          mimeType,
          quality
        )
      } catch (err) {
        reject(err)
      }
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Create a thumbnail from an image file
 */
export async function createThumbnail(
  file: File,
  size: number = THUMBNAIL_SIZE
): Promise<ProcessedImage> {
  return processImage(file, {
    maxWidth: size,
    maxHeight: size,
    quality: 0.8,
  })
}

/**
 * Get image dimensions without loading full image
 */
export function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Check if file is a valid image
 */
export function isValidImage(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  return validTypes.includes(file.type)
}

/**
 * Generate blur placeholder (data URL)
 */
export async function generateBlurPlaceholder(file: File): Promise<string> {
  const { blob } = await processImage(file, {
    maxWidth: 10,
    maxHeight: 10,
    quality: 0.1,
  })
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Convert File to base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
