
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkLogs() {
  const { data: uploads, error: uError } = await supabase
    .from('video_uploads')
    .select('id, file_name, created_at, recorded_at, status')
    .order('created_at', { ascending: false })
    .limit(5)

  if (uError) {
    console.error('Error fetching uploads:', uError)
    return
  }

  for (const u of uploads) {
    console.log(`--- Upload: ${u.file_name} (${u.id}) ---`)
    console.log(`Status: ${u.status}`)
    console.log(`Created: ${u.created_at}`)
    console.log(`Recorded: ${u.recorded_at}`)
    
    const { data: logs, error: lError } = await supabase
      .from('processing_logs')
      .select('step, status, message, created_at')
      .eq('video_upload_id', u.id)
      .order('created_at', { ascending: true })

    if (lError) {
      console.error('Error fetching logs:', lError)
      continue
    }

    logs.forEach(l => {
      console.log(`  [${l.step}] ${l.status}: ${l.message || ''}`)
    })
    console.log('\n')
  }
}

checkLogs()
