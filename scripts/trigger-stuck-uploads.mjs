import { createClient } from '@supabase/supabase-js'
import { Inngest } from 'inngest'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function triggerStuckUploads() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const inngestEventKey = process.env.INNGEST_EVENT_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local')
    return
  }
  
  if (!inngestEventKey) {
    console.error('Missing INNGEST_EVENT_KEY in .env.local')
    return
  }

  console.log('Connecting to Supabase...')
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Find uploads stuck in 'uploaded' state
  const { data: stuckUploads, error } = await supabase
    .from('video_uploads')
    .select('id, file_name, user_id, status, created_at')
    .eq('status', 'uploaded')

  if (error) {
    console.error('Error fetching stuck uploads:', error)
    return
  }

  if (!stuckUploads || stuckUploads.length === 0) {
    console.log('No stuck video uploads found (nothing in "uploaded" state)!')
    return
  }

  console.log(`Found ${stuckUploads.length} stuck upload(s). Connecting to Inngest...`)
  
  // Initialize Inngest client to trigger events
  const inngest = new Inngest({ 
    id: "neolog-scripts", 
    eventKey: inngestEventKey 
  })

  // Trigger processing for each stuck upload
  for (const upload of stuckUploads) {
    console.log(`\nTriggering processing for: ${upload.file_name} (ID: ${upload.id})`)
    
    try {
      await inngest.send({
        name: 'video-upload/process',
        data: { 
          video_upload_id: upload.id, 
          user_id: upload.user_id 
        },
      })
      console.log('✅ Inngest event sent successfully!')
    } catch (err) {
      console.error('❌ Failed to send Inngest event:', err.message || err)
    }
  }
  
  console.log('\nDone triggering stuck uploads!')
}

triggerStuckUploads()
