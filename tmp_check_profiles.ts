
import { createAdminClient } from './src/lib/supabase/admin'

async function checkProfiles() {
  const admin = createAdminClient()
  if (!admin) {
    console.error('No admin client')
    return
  }
  const { data, error } = await admin.from('profiles').select('*').limit(1)
  if (error) {
    console.error('Error fetching profile:', error)
  } else {
    console.log('Profile sample:', data[0])
  }
}

checkProfiles()
