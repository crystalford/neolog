import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function wipe() {
  console.log('Initiating Memory Wipe...')

  console.log('1. Clearing entity mentions...')
  await supabase.from('entity_mentions').delete().neq('id', 0)

  console.log('2. Clearing entities...')
  // Using a dummy condition that matches all rows
  await supabase.from('entities').delete().neq('name', 'impossible_name_123456')

  console.log('3. Clearing log entries...')
  await supabase.from('log_entries').delete().neq('entry_type', 'impossible_type_123456')

  console.log('4. Removing video files from storage...')
  const { data: uploads } = await supabase.from('video_uploads').select('file_path')
  if (uploads && uploads.length > 0) {
    const paths = uploads.map(u => u.file_path).filter(Boolean) as string[]
    if (paths.length > 0) {
      // Supabase storage remove takes an array of paths
      const { error } = await supabase.storage.from('videos').remove(paths)
      if (error) console.error('Storage wipe error:', error.message)
      else console.log(`   Removed ${paths.length} files from storage bucket.`)
    }
  }

  console.log('5. Clearing video upload records...')
  await supabase.from('video_uploads').delete().neq('title', 'impossible_title_123456')

  console.log('6. Clearing clip sessions...')
  await supabase.from('clip_sessions').delete().neq('title', 'impossible_title_123456')

  console.log('\n✅ Wipe Complete. The system memory is fresh.')
}

wipe().catch(console.error)
