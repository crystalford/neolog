export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

// Simple image optimization using canvas resize
// In production, you'd use Sharp or a service like Cloudinary/imgix

const MAX_WIDTH = 1920
const MAX_HEIGHT = 1080
const THUMBNAIL_SIZE = 400
const QUALITY = 0.85

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const run = await startJobRun('upload.image', { user_id: session.user.id })
      runId = run.id
    } catch {
      // best-effort
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      finalErrorMessage = 'No file provided'
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    finalMeta = {
      user_id: session.user.id,
      file_type: file.type,
      file_size: file.size,
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      finalErrorMessage = 'Invalid file type'
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }

    // Check file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      finalErrorMessage = 'File too large (max 10MB)'
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate unique filename
    const timestamp = Date.now()
    const ext = file.type.split('/')[1]
    const filename = `${session.user.id}/${timestamp}.${ext}`
    const thumbnailFilename = `${session.user.id}/${timestamp}_thumb.${ext}`

    // Upload original to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('images')
      .upload(filename, buffer, {
        contentType: file.type,
        cacheControl: '31536000', // 1 year cache
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      finalErrorMessage = 'Upload failed'
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(filename)

    // For now, we'll use the original as both optimized and thumbnail
    // In production, you'd process these server-side with Sharp
    const optimizedUrl = publicUrl
    const thumbnailUrl = publicUrl

    // Record in database
    const { data: imageRecord } = await supabase
      .from('images')
      .insert({
        user_id: session.user.id,
        original_url: publicUrl,
        optimized_url: optimizedUrl,
        thumbnail_url: thumbnailUrl,
        size_bytes: file.size,
        format: ext,
      })
      .select()
      .single()

    finalStatus = 'success'
    finalMeta = { ...finalMeta, image_id: imageRecord?.id || null }
    return NextResponse.json({
      url: publicUrl,
      optimizedUrl,
      thumbnailUrl,
      id: imageRecord?.id,
    })
  } catch (error) {
    console.error('Image upload error:', error)
    finalErrorMessage = 'Upload failed'
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}

// GET endpoint to serve optimized images with caching
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const width = parseInt(searchParams.get('w') || '0')
  const quality = parseInt(searchParams.get('q') || '75')

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  // In production, this would fetch the image, resize it, and return
  // For now, just redirect to the original
  return NextResponse.redirect(url)
}
