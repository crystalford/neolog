export const runtime = 'edge'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/video-upload/prepare
 * 
 * Ensures the 'videos' bucket exists in Supabase Storage.
 * Called by the frontend before starting a TUS upload to prevent 404 errors.
 */
export async function GET() {
  try {
    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ 
        error: 'Admin client not available. Check SUPABASE_SERVICE_ROLE_KEY.' 
      }, { status: 500 })
    }

    // Check if bucket exists
    const { data: buckets, error: listError } = await admin.storage.listBuckets()
    
    if (listError) {
      console.error('Error listing buckets:', listError)
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

    const videoBucketExists = buckets.some(b => b.name === 'videos')

    const bucketConfig = {
      public: false,
      allowedMimeTypes: ['video/*', 'audio/*', 'text/plain'],
      fileSizeLimit: 5368709120 // 5GB (Supabase Pro max)
    }

    if (!videoBucketExists) {
      console.log('Videos bucket missing. Creating it now...')
      const { error: createError } = await admin.storage.createBucket('videos', bucketConfig)
      if (createError) {
        console.error('Error creating bucket:', createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
      return NextResponse.json({ message: 'Videos bucket created successfully', status: 'created' })
    }

    // Always sync bucket config to pick up limit increases
    const { error: updateError } = await admin.storage.updateBucket('videos', bucketConfig)
    if (updateError) {
      console.error('Error updating bucket config:', updateError)
      // Non-fatal — bucket still works, just may have old limit
    }

    return NextResponse.json({ message: 'Videos bucket ready', status: 'ready' })
  } catch (error: any) {
    console.error('Infrastructure check failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
