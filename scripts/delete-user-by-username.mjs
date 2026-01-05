#!/usr/bin/env node

import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

function usage(exitCode = 1) {
  console.log(
    [
      'Usage:',
      '  node scripts/delete-user-by-username.mjs <username> --yes',
      '',
      'Required env vars:',
      '  NEXT_PUBLIC_SUPABASE_URL',
      '  SUPABASE_SERVICE_ROLE_KEY',
      '',
      'Example:',
      '  node scripts/delete-user-by-username.mjs chrisrobtelford --yes',
    ].join('\n')
  )
  process.exit(exitCode)
}

const args = process.argv.slice(2)
const username = args.find((a) => !a.startsWith('-'))
const yes = args.includes('--yes')

if (!username || !yes) {
  usage(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  usage(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  const normalized = String(username).toLowerCase()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, username')
    .eq('username', normalized)
    .maybeSingle()

  if (profileError) {
    console.error('Failed to look up profile:', profileError)
    process.exit(1)
  }

  if (!profile) {
    console.error(`No profile found for username: ${normalized}`)
    process.exit(2)
  }

  console.log(`Deleting auth user ${profile.id} (@${profile.username}) ...`)

  const { error: deleteError } = await admin.auth.admin.deleteUser(profile.id)
  if (deleteError) {
    console.error('Failed to delete auth user:', deleteError)
    process.exit(1)
  }

  console.log('Delete requested. Content should cascade via FK deletes (profiles/posts/etc).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
