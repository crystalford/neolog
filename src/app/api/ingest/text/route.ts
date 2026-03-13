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

    const { content } = await req.json()
    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    // 1. Create a log entry for the text dump
    const { data: logEntry, error: logError } = await supabase
      .from('log_entries')
      .insert({
        user_id: session.user.id,
        content: content,
        entry_type: 'note',
        logged_at: new Date().toISOString()
      })
      .select()
      .single()

    if (logError) throw logError

    // 2. Trigger Inngest to process the text
    await inngest.send({
      name: 'ingest/process-text',
      data: {
        logEntryId: logEntry.id,
        content: content,
        userId: session.user.id
      }
    })

    return NextResponse.json({ 
      message: 'Ingestion sequence initialized',
      logEntryId: logEntry.id
    })
  } catch (error: any) {
    console.error('[INGEST_ERROR]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
