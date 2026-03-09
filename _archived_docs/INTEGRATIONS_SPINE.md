# Integrations Spine (ChatGPT / Claude / Gemini)

This doc translates the “full landscape” into a single, minimal integration backbone you can ship now.

## The spine idea
All assistants can do the same 4 things via Neolog:
1) **Capture** → save an asset (vault)
2) **Search** → find prior assets
3) **Reference** → read canonical terms (lexicon)
4) **Check** → validate terms used in a draft against the lexicon

Everything else (plugins, extensions, orchestration) is just UX around these primitives.

## Why start with Claude MCP
- You already have an MCP server scaffold in [scripts/mcp/server.mjs](scripts/mcp/server.mjs).
- MCP gives you a native “tool use” loop without waiting on platform approvals.
- The same endpoints can later power ChatGPT Actions, Gemini extensions, browser extensions, mobile shortcuts.

## Implemented endpoints (today)
### Vault
- `POST /api/vault/add` (already existed)
- `GET /api/vault/search` (added)

### Lexicon (Canonical Terms)
- `GET /api/lexicon/terms` (added)
- `POST /api/lexicon/terms` (added)
- `POST /api/lexicon/terms/check` (added)
- `POST /api/lexicon/terms/propose-version` (added)

### Series (Research Stacks)
- `POST /api/series/create-stack` (added) — create a Series and optionally create 3 draft posts (infographic + essay + research dump)

## Implemented MCP tools (today)
The MCP server now exposes:
- `neolog_vault_add`
- `neolog_vault_search`
- `neolog_terms_list`
- `neolog_term_get`
- `neolog_terms_check`
- `neolog_term_propose_version`
- `neolog_series_create_stack`

Plus the existing post/draft tools (`neolog_ingest_draft`, `neolog_update_draft`, etc).

## Auth model (one consistent pattern)
- For assistants/integrations: send `x-api-key` (Neolog automation key).
- For logged-in UI usage: rely on Supabase session (RLS).

This lets you ship tools safely without giving assistants broad database access.

### Creating an automation key
You can generate an automation key from the app UI:
1) Run the app and sign in.
2) Open `/settings`.
3) Create an API key (this calls `POST /api/keys/create`).

Use the returned `neo_...` value as `NEOLOG_API_KEY` for MCP (or as the `x-api-key` header for direct API calls).

### Running the MCP server locally
The MCP server expects your Next.js app to be reachable (default `http://localhost:3000`).

PowerShell:
- `$env:NEOLOG_BASE_URL = 'http://127.0.0.1:3000'`
- `$env:NEOLOG_API_KEY = 'neo_...'`
- `node scripts/mcp/server.mjs`

## “Semantic check” in MVP (pragmatic)
A full drift detector is hard.
MVP semantic check should be deterministic:
- The assistant extracts candidate terms it used (or the user provides them).
- Call `neolog_terms_check`.
- If missing terms exist: either switch to existing term(s) or propose a new term.

## Next steps to unlock the bigger vision
1) Add a UI panel in-dashboard: “Lexicon” (list/create/lock/deprecate terms).
2) Add an “Attach terms to post” mechanism (post ↔ term references).
3) Add instantiation tracking (canonical post → platform instances).
4) Add analytics rollups: performance by term and by instantiation type.

## Supabase migration
Canonical terms are introduced via:
- [supabase/migrations/add_canonical_terms.sql](supabase/migrations/add_canonical_terms.sql)

Deploy it via your normal Supabase migration flow.
