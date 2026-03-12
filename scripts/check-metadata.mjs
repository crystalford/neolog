
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debug() {
  const { data, error } = await supabase
    .from('video_uploads')
    .select('id, file_name, recorded_at, meta')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error:', error)
    return
  }

  data.forEach(u => {
    console.log(`--- Upload: ${u.file_name} ---`)
    console.log(`ID: ${u.id}`)
    console.log(`Recorded At: ${u.recorded_at}`)
    console.log(`Raw Metadata Diagnostic:`, JSON.stringify(u.meta?.raw_metadata_diagnostic, null, 2))
    console.log('\n')
  })
}

debug()
