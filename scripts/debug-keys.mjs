
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

async function checkKeys() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  const { data: keys, error } = await supabase
    .from('integration_keys')
    .select('provider, label, is_active, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching keys:', error)
    return
  }

  console.log('--- Integration Keys ---')
  keys?.forEach(k => {
    console.log(`Provider: ${k.provider} | Active: ${k.is_active} | Label: ${k.label} | Created: ${k.created_at}`)
  })
}

checkKeys()
