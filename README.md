# neolog

**An AI video-essay studio you talk into.** Three doors into making something:

- **Subjects** — concepts the system finds you keep circling in your own recordings, *named for you* (often using terms-of-art you didn't have a word for).
- **Topics** — anything you want to make a video about. The system researches it on the open web and drafts a script in your voice.
- **Spark** — type one thought; get a 30–60 second vertical short ready to post.

Every output is written in your voice. Two layers learn you — *how you write* (cadence, register, intellectual moves) and *what you care about* (recurring fascinations, the lens you bring) — both refreshed automatically from your past vlogs. **After your first batch of recordings you can stop uploading entirely** — your existing corpus is voice training forever, and the open web supplies any new substance.

The whole pipeline runs on Cloudflare. One bill. No third-party SaaS.

---

## How it works

```
                          YOU TALK (vlogs)           OR     YOU TYPE (topics)        OR     YOU SPARK (a thought)
                                │                                  │                                │
                                ▼                                  ▼                                ▼
                          Whisper transcribes              Browser Run crawls                Profile-aware concept seed
                                │                          sources you paste or               drawn from your mind
                                ▼                          Brave Search finds                       │
                          Threads + entities                       │                                ▼
                          + clip candidates                        ▼                          Short script (~30-60s)
                                │                          Research brief                          │
                                ▼                                  │                                │
                    ┌─►   Librarian names the subjects ◄────────────┴─── (operator profile)        │
                    │     you keep circling                                                         │
                    │           │                                                                  │
                    │           ▼                                                                  │
                    │     Skeleton (beat structure)                                                │
                    │     ── operator approves ──                                                   │
                    │           │                                                                  │
                    │           ▼                                                                  │
                    └─► Script in your voice  ◄─── voice-shape (cadence) + operator-profile (mind) ◄┘
                                │
                                ▼
                  Voiceover ── recorded OR synthesized via your cloned voice (MiniMax 2.8)
                                │
                                ▼
                  AI b-roll per beat (Flux still → Wan 2.7 motion, or Grok Imagine direct + audio)
                                │
                                ▼
                  FFmpeg renders to MP4 (16:9 for essays, 9:16 for shorts)
                                │
                                ▼
                                Published
```

## What's in the masthead

| Surface | What it is |
|---|---|
| **Subjects** | Named concepts the librarian surfaced from your vlogs — themes, tensions, evolutions, open-loops. Each → script / post / clips / short. |
| **Topics** | Spark composer (bang out a short) + the new-topic form for full essays. Topic detail page does the research + drafts the script. |
| **Vlogs** | Your raw recordings. Upload via four bad-wifi-friendly modes (full / compressed / slideshow / audio-only). |
| **Published** | The accumulating body of work — anything in `state='published'`. |

Plus **Settings** for voice cloning, model preferences, API keys (incl. optional Brave Search), and the in-house podcast feed.

## Stack — all Cloudflare

| Layer | Service |
|---|---|
| Framework | Next.js 15 App Router on `@cloudflare/next-on-pages` |
| Hosting | Cloudflare Pages |
| Database | Cloudflare D1 (SQLite at the edge) |
| Storage | Cloudflare R2 (videos, audio, generated images & clips, render output) |
| Auth | Cloudflare Access (one-time PIN to operator email) |
| Async work | Cloudflare Workflows + a Durable Object pipeline that broadcasts progress over WebSocket |
| Video processing | Cloudflare Container Worker running FFmpeg |
| Web research | Cloudflare Browser Run `/crawl` (markdown extraction); Brave Search API optional for auto-finding sources |
| Hard-reasoning LLM | Workers AI `gpt-oss-120b` (with `reasoning: { effort }` dial), Llama 3.3 70B auto-fallback |
| Extraction LLM | Workers AI Llama 3.3 70B (`free` tier default); Claude Sonnet 4.6 (`premium`/`max`, paid opt-in) |
| Image generation | Workers AI Flux 1 Schnell |
| Image-to-video | Workers AI Wan 2.7 (Ken Burns FFmpeg fallback) |
| Text-to-video with native audio | Workers AI Grok Imagine Video |
| Voice cloning | Workers AI MiniMax Speech 2.8 Turbo |
| Voice presets | Workers AI Deepgram Aura-2 |
| Transcription | Workers AI Whisper-large-v3-turbo |

## Deploying / running

This is a single-operator app. The setup is documented in `docs/CLOUDFLARE-NATIVE-DEPLOY.md` and runs end-to-end via the GitHub Actions workflow at `.github/workflows/bootstrap-cloudflare.yml`. The workflow provisions D1, R2, Workers, Workflows, Container, Access, and Pages bindings — idempotent, safe to re-run.

After a push to `main`:
1. The Pages project rebuilds and deploys automatically.
2. The bootstrap workflow re-runs to keep bindings in sync.
3. Sign in via Cloudflare Access at the configured domain.

That's it. No local terminal, no manual wrangler steps for routine work.

## Project history (one line)

`neolog 1.0`: an ActivityPub-federated blog (decommissioned). `neolog 2.0`: a personal-vlog-extraction-and-cluster-cultivation system on Supabase/Inngest (also dead). `neolog as it stands today`: an AI video-essay studio on Cloudflare, with three input modes (Subjects / Topics / Spark) and a "knows me" layer (voice-shape + operator-profile) that injects your mind and voice into every prompt.

For internal architecture and code conventions, see [CLAUDE.md](./CLAUDE.md).

For full system reference (infrastructure facts, credentials map, the post-upload pipeline in detail), see [SYSTEM_REFERENCE.md](./SYSTEM_REFERENCE.md).
