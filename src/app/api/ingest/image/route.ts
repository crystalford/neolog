export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { url, fileName, metadata = {} } = await req.json()
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // 1. Create a log entry for the image capture
    const { data: logEntry, error: logError } = await supabase
      .from('log_entries')
      .insert({
        user_id: session.user.id,
        content: `Uploaded neural image: ${fileName}`,
        entry_type: 'capture',
        logged_at: new Date().toISOString(),
        meta: {
          thumbnail_url: url,
          fileName
        }
      })
      .select()
      .single()

    if (logError) throw logError

    // 2. Register Signal
    const { data: signal, error: signalError } = await supabase
      .from('neural_signals')
      .insert({
        user_id: session.user.id,
        signal_type: 'image',
        url,
        metadata: {
          original_name: fileName,
          ...metadata
        },
        source_log_id: logEntry.id,
        is_training_ready: false
      })
      .select()
      .single()

    if (signalError) throw signalError

    // 3. Trigger Inngest to refine/grade the signal
    await inngest.send({
      name: 'neural/refine-signal',
      data: {
        signalId: signal.id,
        userId: session.user.id,
        type: 'image',
        url
      }
    })

    return NextResponse.json({ 
      success: true, 
      signalId: signal.id,
      logEntryId: logEntry.id
    })
  } catch (err: any) {
    console.error('Image ingestion error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
