/**
 * RLS smoke test — asserts zero leakage between two test operators.
 *
 * Run after every migration that adds a new user-data table:
 *   pnpm node scripts/smoke-rls.mjs <table_name> [<owner_column>]
 *
 * Examples:
 *   pnpm node scripts/smoke-rls.mjs threads operator_id
 *   pnpm node scripts/smoke-rls.mjs entities operator_id
 *   pnpm node scripts/smoke-rls.mjs video_uploads operator_id
 *
 * The script:
 * 1. Creates two ephemeral users via service role (or reuses existing test users)
 * 2. Inserts a row owned by user A (using service role to bypass RLS for setup)
 * 3. Authenticates as user B and queries the table
 * 4. Asserts user B sees ZERO rows owned by user A
 * 5. Cleans up the test row
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Test user emails: smoke-rls-a@neolog.local, smoke-rls-b@neolog.local
 * (created on first run, reused after).
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const TABLE = process.argv[2]
const OWNER_COL = process.argv[3] || 'operator_id'

if (!TABLE) {
  console.error('Usage: pnpm node scripts/smoke-rls.mjs <table_name> [<owner_column>]')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const TEST_PASSWORD = 'smoke-rls-test-password-Q1!aA'
const USER_A_EMAIL = 'smoke-rls-a@neolog.local'
const USER_B_EMAIL = 'smoke-rls-b@neolog.local'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function ensureUser(email) {
  // Try to find existing user via list (paginated)
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 })
  if (listErr) throw listErr
  const existing = list.users.find((u) => u.email === email)
  if (existing) return existing

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (createErr) throw createErr
  return created.user
}

async function signInAs(email) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })
  if (error) throw error
  return { client, session: data.session }
}

async function run() {
  console.log(`\n=== RLS smoke test: ${TABLE} (owner column: ${OWNER_COL}) ===\n`)

  console.log('1. Ensuring test users exist...')
  const userA = await ensureUser(USER_A_EMAIL)
  const userB = await ensureUser(USER_B_EMAIL)
  console.log(`   user A: ${userA.id}`)
  console.log(`   user B: ${userB.id}`)

  console.log('\n2. Inserting probe row owned by user A (via service role)...')
  const probeMarker = `smoke-rls-probe-${Date.now()}`
  const insertPayload = { [OWNER_COL]: userA.id }

  // Try a few common probe fields. The script doesn't know the table's
  // required columns, so we attempt minimal insert and surface any failure
  // for the operator to fill in via env override.
  if (process.env.SMOKE_RLS_EXTRA_FIELDS) {
    Object.assign(insertPayload, JSON.parse(process.env.SMOKE_RLS_EXTRA_FIELDS))
  }

  const { data: inserted, error: insertErr } = await admin
    .from(TABLE)
    .insert(insertPayload)
    .select()
    .single()

  if (insertErr) {
    console.error(`   Insert failed: ${insertErr.message}`)
    console.error(`   You may need to set SMOKE_RLS_EXTRA_FIELDS to satisfy NOT NULL constraints, e.g.:`)
    console.error(`   SMOKE_RLS_EXTRA_FIELDS='{"topic":"probe","video_upload_id":"00000000-..."}' pnpm node scripts/smoke-rls.mjs ${TABLE}`)
    process.exit(2)
  }
  const probeId = inserted.id
  console.log(`   inserted row id: ${probeId}`)

  console.log('\n3. Signing in as user B and querying table...')
  const { client: clientB } = await signInAs(USER_B_EMAIL)
  const { data: leaked, error: queryErr } = await clientB
    .from(TABLE)
    .select('id')
    .eq('id', probeId)

  if (queryErr) {
    // PostgREST often returns an error for RLS-denied — that's also fine.
    console.log(`   user B query returned error (acceptable): ${queryErr.code} ${queryErr.message}`)
  }

  const leakedCount = leaked?.length || 0
  if (leakedCount > 0) {
    console.error(`\n❌ FAIL: user B saw ${leakedCount} row(s) owned by user A.`)
    console.error(`   This is an RLS leak. Fix the policies on ${TABLE} before proceeding.`)
    await admin.from(TABLE).delete().eq('id', probeId)
    process.exit(3)
  }

  console.log(`\n4. Cleanup: deleting probe row ${probeId}...`)
  await admin.from(TABLE).delete().eq('id', probeId)

  console.log(`\n✅ PASS: ${TABLE} RLS isolates ${OWNER_COL} correctly.\n`)
}

run().catch((err) => {
  console.error('\n❌ Smoke test crashed:', err)
  process.exit(1)
})
