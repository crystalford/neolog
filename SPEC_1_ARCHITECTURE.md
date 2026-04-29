# Neolog — Architecture & Tech Stack

## What It Is
A life-log and content production system. You record yourself talking — brain dumps, vlogs, voice notes — and Neolog turns that into:
- A permanent searchable record of your thinking
- An accumulating knowledge graph (entities, ideas, patterns, energy)
- Edited video assembled from your best moments
- Scripts written from your content, recorded in chunks with a teleprompter
- Social posts surfaced automatically

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router |
| Runtime | Cloudflare Pages — `export const runtime = 'edge'` on every route + page |
| Package manager | pnpm (NOT npm) |
| Database | Supabase (Postgres + RLS) |
| Storage | Cloudflare R2 (preferred) or AWS S3 |
| Uploads | Multipart direct to R2 via presigned URLs (never through API routes) |
| Async jobs | Inngest |
| Transcription | Groq whisper-large-v3-turbo (primary) / Replicate Whisper (fallback) |
| AI | Claude claude-haiku-4-5 for analysis, claude-sonnet-4-6 for content gen |
| Video processing | Replicate fofr/toolkit |
| Auth | Supabase Auth |
| Styling | Inline styles with C color object — no Tailwind, no CSS variables |
| Font | JetBrains Mono (monospace), Syne (headlines) |

## Design System

```typescript
const C = {
  bg:           '#070706',
  bgSurface:    '#0e0d0b',
  bgRaised:     '#141210',
  border:       '#1e1b16',
  borderBright: '#2c2820',
  amber:        '#C8902A',
  amberDim:     '#7a5618',
  amberBright:  '#E8A840',
  amberGlow:    'rgba(200,144,42,0.09)',
  textPrimary:  '#EDE3CC',
  textSecond:   '#9A8E78',
  textDim:      '#5A5040',
  textDimmer:   '#2e2820',
  green:        '#4A8A60',
  blue:         '#4870A8',
  red:          '#8A4040',
}
```

- Labels: fontSize 9, letterSpacing 3, textTransform uppercase
- Active nav: borderLeft 2px solid amber + amberGlow background
- Dark amber terminal aesthetic throughout

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
REPLICATE_API_TOKEN
X_CLIENT_ID
X_CLIENT_SECRET
```

Users supply Anthropic / OpenAI / ElevenLabs / Replicate / Groq keys via Settings. Resolved per-user at runtime via lib/ai-provider.ts.

## API Key Resolution (lib/ai-provider.ts)

Priority order:
1. User-configured key from integration_keys table (is_active = true)
2. Managed key from server env vars IF user.is_pro = true

Providers: openai, anthropic, groq, elevenlabs, replicate, resend, r2, heygen, synthesia

## Sidebar Navigation

Main: Home, Videos, Timeline, Posts, Studio, Edit, System, Settings
Experimental: Brain (entities/knowledge graph)

Status footer: live indicator, session count badge, voice clone status, sign out

## What Is NOT a Priority

- Character / Avatar / LoRA training — files exist, do not build further
- Voice clone — Inngest stub exists, do not build further
- HeyGen / Synthesia — API routes exist, do not build further
- Legacy writing platform (posts, publications, newsletters, ActivityPub) — exists, do not touch
