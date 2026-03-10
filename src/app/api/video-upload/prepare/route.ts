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

    if (!videoBucketExists) {
      console.log('Videos bucket missing. Creating it now...')
      const { error: createError } = await admin.storage.createBucket('videos', {
        public: false,
        allowedMimeTypes: ['video/*', 'audio/*', 'text/plain'],
        fileSizeLimit: 524288000 // 500MB (adjust as needed)
      })

      if (createError) {
        console.error('Error creating bucket:', createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
      
      return NextResponse.json({ message: 'Videos bucket created successfully', status: 'created' })
    }

    return NextResponse.json({ message: 'Videos bucket ready', status: 'ready' })
  } catch (error: any) {
    console.error('Infrastructure check failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
