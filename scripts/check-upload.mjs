import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function checkUpload() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local')
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data, error } = await supabase
    .from('video_uploads')
    .select('id, file_name, status, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Error fetching uploads:', error)
    return
  }

  if (data && data.length > 0) {
    const u = data[0]
    console.log(`\n--- LATEST UPLOAD STATUS ---`)
    console.log(`File:   ${u.file_name}`)
    console.log(`Status: ${u.status}`)
    console.log(`Error:  ${u.error_message || 'None'}`)
    console.log(`----------------------------\n`)
  } else {
    console.log('No video uploads found!')
  }
}

checkUpload()
