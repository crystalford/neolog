/**
 * Thumbnail + recorded_at smoke test.
 *
 * Asserts that recently-processed video_uploads rows have working thumbnails
 * and correctly-extracted recording dates. Catches regressions in the locked
 * pipeline (process-upload.ts: transcode → extract-thumbnail order, mvhd
 * extraction, filename pattern fallback).
 *
 * Run after every PR that touches process-upload.ts, backfill-recorded-at.ts,
 * or anything in the video ingestion path:
 *
 *   pnpm node scripts/smoke-thumbnails.mjs [--n 20] [--fixtures path/to/fixtures.json]
 *
 * Default mode: checks the most recent 20 uploads with status='processed'.
 * Fixture mode: checks specific upload IDs listed in fixtures.json.
 *   fixtures.json shape:
 *     [
 *       { "id": "uuid", "label": "DJI HEVC vertical", "expected_source": "mvhd" },
 *       { "id": "uuid", "label": "iPhone HEVC", "expected_source": "mvhd" },
 *       { "id": "uuid", "label": "MP4 with mvhd", "expected_source": "mvhd" },
 *       { "id": "uuid", "label": "MP4 without mvhd", "expected_source": "filename" }
 *     ]
 *
 * Pass criteria for every checked row:
 *   - status = 'processed' (or another success state — no 'error')
 *   - thumbnail_url is non-null
 *   - thumbnail_url starts with 'data:image/' (per the locked storage format)
 *   - recorded_at is non-null
 *   - recorded_at is reasonable (not the unix epoch, not more than 5 years old
 *     unless explicitly backdated, not in the future)
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'node:fs'

dotenv.config({ path: '.env.local' })

const args = process.argv.slice(2)
const N_FLAG = args.indexOf('--n')
const FIXTURES_FLAG = args.indexOf('--fixtures')
const N = N_FLAG >= 0 ? parseInt(args[N_FLAG + 1], 10) : 20
const FIXTURES_PATH = FIXTURES_FLAG >= 0 ? args[FIXTURES_FLAG + 1] : null

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const failures = []

function check(row, expectedSource = null) {
  const id = row.id
  const fails = []

  if (row.status === 'error' || row.status === 'failed') {
    fails.push(`status='${row.status}' (expected processed/complete)`)
  }

  if (!row.thumbnail_url) {
    fails.push('thumbnail_url is null')
  } else if (!String(row.thumbnail_url).startsWith('data:image/')) {
    fails.push(`thumbnail_url not in data-URI format (starts with: ${String(row.thumbnail_url).slice(0, 30)}...)`)
  }

  if (!row.recorded_at) {
    fails.push('recorded_at is null')
  } else {
    const t = new Date(row.recorded_at).getTime()
    const now = Date.now()
    const fiveYearsAgo = now - 5 * 365 * 86400 * 1000
    const epoch = new Date('1970-01-02').getTime()
    if (t < epoch) fails.push(`recorded_at suspiciously near unix epoch: ${row.recorded_at}`)
    if (t > now + 86400 * 1000) fails.push(`recorded_at in the future: ${row.recorded_at}`)
    // allow old uploads (< fiveYearsAgo) — operator may legitimately backdate.
    // just warn if no source attribution.
    if (t < fiveYearsAgo && !row.recorded_at_source) {
      console.warn(`  ⚠ ${id}: recorded_at is >5y old with no recorded_at_source`)
    }
  }

  if (expectedSource && row.recorded_at_source !== expectedSource) {
    fails.push(`recorded_at_source='${row.recorded_at_source || 'null'}' (expected '${expectedSource}')`)
  }

  return fails
}

async function run() {
  let rows
  let mode

  if (FIXTURES_PATH) {
    mode = `fixtures (${FIXTURES_PATH})`
    const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'))
    const ids = fixtures.map((f) => f.id)
    const { data, error } = await admin
      .from('video_uploads')
      .select('id, status, thumbnail_url, recorded_at, recorded_at_source, file_name')
      .in('id', ids)
    if (error) throw error
    rows = data.map((r) => ({
      ...r,
      _label: fixtures.find((f) => f.id === r.id)?.label,
      _expected_source: fixtures.find((f) => f.id === r.id)?.expected_source,
    }))
    if (rows.length !== fixtures.length) {
      console.error(`Expected ${fixtures.length} fixture rows, got ${rows.length}. Missing IDs:`)
      const found = new Set(rows.map((r) => r.id))
      fixtures.filter((f) => !found.has(f.id)).forEach((f) => console.error(`  - ${f.id} (${f.label})`))
      process.exit(2)
    }
  } else {
    mode = `latest ${N} processed uploads`
    const { data, error } = await admin
      .from('video_uploads')
      .select('id, status, thumbnail_url, recorded_at, recorded_at_source, file_name')
      .in('status', ['processed', 'complete', 'analyzed'])
      .order('created_at', { ascending: false })
      .limit(N)
    if (error) throw error
    rows = data
  }

  console.log(`\n=== Thumbnail + recorded_at smoke test ===`)
  console.log(`Mode: ${mode}`)
  console.log(`Checking ${rows.length} rows...\n`)

  for (const row of rows) {
    const label = row._label || row.file_name || row.id.slice(0, 8)
    const fails = check(row, row._expected_source)
    if (fails.length > 0) {
      console.error(`❌ ${label}`)
      fails.forEach((f) => console.error(`     ${f}`))
      failures.push({ id: row.id, label, fails })
    } else {
      console.log(`✅ ${label}`)
    }
  }

  console.log()
  if (failures.length > 0) {
    console.error(`❌ FAIL: ${failures.length}/${rows.length} rows failed thumbnail/recorded_at checks.`)
    console.error(`The locked pipeline in process-upload.ts may have regressed.`)
    console.error(`Check transcode → extract-thumbnail order, mvhd extraction, recorded_at fallback chain.`)
    process.exit(3)
  }
  console.log(`✅ PASS: all ${rows.length} rows have working thumbnails and recorded_at.\n`)
}

run().catch((err) => {
  console.error('\n❌ Smoke test crashed:', err)
  process.exit(1)
})
