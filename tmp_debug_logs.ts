
import { createAdminClient } from './src/lib/supabase/admin'

async function debugLogs() {
  const admin = createAdminClient()
  if (!admin) {
    console.error('No admin client')
    return
  }

  console.log('--- Recent Log Entries ---')
  const { data: entries, error: entriesError } = await admin
    .from('log_entries')
    .select('id, title, logged_at, source_upload_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (entriesError) console.error(entriesError)
  else console.table(entries)

  console.log('--- Recent Pipeline Logs ---')
  const { data: plogs, error: plogError } = await admin
    .from('pipeline_logs')
    .select('id, step, status, message, created_at, video_upload_id')
    .order('created_at', { ascending: false })
    .limit(20)

  if (plogError) console.error(plogError)
  else console.table(plogs)
}

debugLogs()
