import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// GET: Fetch a single video upload with all details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: upload, error } = await supabase
      .from('video_uploads')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .single()

    if (error || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    return NextResponse.json({ upload })
  } catch (error) {
    console.error('Fetch video upload error:', error)
    return NextResponse.json({ error: 'Failed to fetch upload' }, { status: 500 })
  }
}

// DELETE: Delete a video upload and its storage file
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch upload to get storage path
    const { data: upload, error: fetchError } = await supabase
      .from('video_uploads')
      .select('id, storage_path, storage_provider')
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    // Delete from storage
    if (upload.storage_provider === 'r2') {
      const { deleteR2Object } = await import('@/lib/storage/r2')
      await deleteR2Object(upload.storage_path).catch(e => {
        console.error('R2 delete error:', e)
      })
    } else if (upload.storage_provider === 'supabase') {
      const { error: storageError } = await supabase.storage
        .from('videos')
        .remove([upload.storage_path])

      if (storageError) {
        console.error('Storage delete error:', storageError)
        // Continue anyway - mark as deleted in DB
      }
    }

    // Delete DB record
    const admin = createAdminClient()
    if (admin) {
      await admin
        .from('video_uploads')
        .delete()
        .eq('id', params.id)
    } else {
      await supabase
        .from('video_uploads')
        .delete()
        .eq('id', params.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete video upload error:', error)
    return NextResponse.json({ error: 'Failed to delete upload' }, { status: 500 })
  }
}
// PATCH: Update video upload metadata (status, thumbnail, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { status, thumbnail_data, recorded_at } = await request.json()
    const admin = createAdminClient()

    if (!admin) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // 1. Verify ownership
    const { data: upload, error: fetchError } = await admin
      .from('video_uploads')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (status) updateData.status = status
    if (recorded_at) updateData.recorded_at = recorded_at

    // 2. Handle base64 thumbnail upload if provided
    if (thumbnail_data && thumbnail_data.startsWith('data:image')) {
      try {
        const base64Data = thumbnail_data.split(',')[1]
        const buffer = Buffer.from(base64Data, 'base64')
        const path = `${session.user.id}/thumbnails/${params.id}_fastfix.jpg`
        
        const { uploadBuffer } = await import('@/lib/storage/r2')
        await uploadBuffer(path, buffer, 'image/jpeg')
        updateData.thumbnail_url = path
      } catch (err: any) {
        console.error('[PATCH] Thumbnail upload failed:', err.message)
      }
    }

    // 3. Update DB record
    const { data: updated, error: updateError } = await admin
      .from('video_uploads')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: 'Update failed', details: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, upload: updated })
  } catch (error: any) {
    console.error('Update video upload error:', error)
    return NextResponse.json({ error: 'Failed to update upload', message: error.message }, { status: 500 })
  }
}
