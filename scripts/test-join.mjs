
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role to bypass auth for test

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testFetch() {
  const { data, error } = await supabase
    .from('log_entries')
    .select('*, video_uploads!source_upload_id(transcript_segments, analysis)')
    .limit(5)

  if (error) {
    console.error('QUERY ERROR:', error)
  } else {
    console.log('QUERY SUCCESS, entries found:', data?.length)
    if (data && data.length > 0) {
      console.log('Sample entry:', JSON.stringify(data[0], null, 2))
    }
  }
}

testFetch()
