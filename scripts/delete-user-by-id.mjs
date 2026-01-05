#!/usr/bin/env node

import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load env vars for local scripts (Next.js loads these automatically, Node scripts do not).
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

function usage(exitCode = 1) {
  console.log(
    [
      'Usage:',
      '  node scripts/delete-user-by-id.mjs <userId> --yes',
      '',
      'Required env vars:',
      '  NEXT_PUBLIC_SUPABASE_URL',
      '  SUPABASE_SERVICE_ROLE_KEY',
      '',
      'Example:',
      '  node scripts/delete-user-by-id.mjs 00000000-0000-0000-0000-000000000000 --yes',
    ].join('\n')
  )
  process.exit(exitCode)
}

const args = process.argv.slice(2)
const userId = args.find((a) => !a.startsWith('-'))
const yes = args.includes('--yes')

if (!userId || !yes) {
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
  console.log(`Deleting auth user ${userId} ...`)

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
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
