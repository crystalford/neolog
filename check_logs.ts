
import { createAdminClient } from './src/lib/supabase/admin'

async function run() {
  const admin = createAdminClient()
  if (!admin) {
    console.error('No admin client')
    return
  }

  const { data: logs, error } = await admin
    .from('processing_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching logs:', error)
    return
  }

  console.log('--- RECENT LOGS ---')
  logs.forEach(l => {
    console.log(`[${l.created_at}] ${l.video_upload_id} | ${l.step} | ${l.status} | ${l.message || ''}`)
  })
}

run().catch(console.error)
