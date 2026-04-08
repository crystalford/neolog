export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    console.log(`[RESET] Initiating full data wipe for user: ${userId}`)

    // 1. Clear mentions
    await supabase.from('entity_mentions').delete().eq('user_id', userId)

    // 2. Clear entities
    await supabase.from('entities').delete().eq('user_id', userId)

    // 3. Clear logs
    await supabase.from('log_entries').delete().eq('user_id', userId)

    // 4. Get storage paths for cleanup
    const { data: uploads } = await supabase
      .from('video_uploads')
      .select('file_path')
      .eq('user_id', userId)

    if (uploads && uploads.length > 0) {
      const paths = uploads.map(u => u.file_path).filter(Boolean) as string[]
      if (paths.length > 0) {
        await supabase.storage.from('videos').remove(paths)
      }
    }

    // 5. Clear video uploads
    await supabase.from('video_uploads').delete().eq('user_id', userId)

    // 6. Clear clip sessions
    await supabase.from('clip_sessions').delete().eq('user_id', userId)

    // 7. Clear neural signals
    await supabase.from('neural_signals').delete().eq('user_id', userId)

    // 8. Clear assets (inventory)
    await supabase.from('assets').delete().eq('user_id', userId)

    return NextResponse.json({ message: 'Memory wiped successfully' })
  } catch (error: any) {
    console.error('[RESET] Wipe failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
