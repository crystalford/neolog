#!/usr/bin/env node

import 'dotenv/config'

const BASE_URL = process.env.NEOLOG_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const API_KEY = process.env.NEOLOG_API_KEY || process.env.NEOLOG_AUTOMATION_KEY

if (!API_KEY) {
  console.error('Missing NEOLOG_API_KEY (or NEOLOG_AUTOMATION_KEY).')
  process.exit(1)
}

const args = process.argv.slice(2)
const username = args.find((a) => a.startsWith('--username='))?.split('=')[1] || ''
const limit = args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '200'
const maxUpserts = args.find((a) => a.startsWith('--maxUpserts='))?.split('=')[1] || '25'

const url = new URL('/api/agent/embeddings/backfill', BASE_URL)
url.searchParams.set('limit', limit)
url.searchParams.set('maxUpserts', maxUpserts)
if (username) url.searchParams.set('username', username)

const res = await fetch(url.toString(), {
  method: 'POST',
  headers: {
    'x-api-key': API_KEY,
    accept: 'application/json',
  },
})

const text = await res.text()
if (!res.ok) {
  console.error(`Request failed (${res.status}): ${text}`)
  process.exit(1)
}

console.log(text)
