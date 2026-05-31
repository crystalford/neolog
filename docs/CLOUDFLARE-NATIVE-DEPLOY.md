# Moving deploys off GitHub Actions → Cloudflare native builds

**Status: reference / not yet executed.** This removes GitHub Actions from the
deploy path so app deploys run on Cloudflare's own build infrastructure (no
Actions minutes). Do this deliberately — it touches the live `neolog.ai`
deploy. Verify the site stays up at each step.

## Why this is optional, not urgent

The GitHub billing block was caused by the heavy transcode/thumbnail **runners**
(hours of video compute), which have already been deleted. Routine deploys use
~1-2 min each against a ~2,000 min/month free allowance, so they cost
effectively nothing. This migration saves pennies; its only real value is
reducing GitHub dependence. Don't treat it as a fix for the cost issue — that's
already handled.

## The catch with the existing Pages project

`neolog` Pages was created as a **direct-upload** project (via
`wrangler pages deploy`). Cloudflare does not let you convert a direct-upload
project to a Git-connected one in place. You have two options:

### Option A — Connect Git to a NEW Pages project, then move the domain (clean, ~30 min)
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick `crystalford/neolog`, production branch `main` (or the active branch).
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `npx @cloudflare/next-on-pages@1`
   - **Build output directory:** `.vercel/output/static`
   - **Root directory:** `/`
4. Settings → Functions → **Compatibility flags:** add `nodejs_compat`.
   Compatibility date: `2024-09-23` or later.
5. Re-add the bindings the app needs (Settings → Functions → Bindings) — copy
   them from the current `neolog` project so nothing is missed:
   - **D1:** `DB` → database `neolog`
   - **R2:** `VIDEOS` → bucket `neolog-videos`
   - **Workers AI:** `AI`
   - **Service bindings:** `FFMPEG` → `neolog-ffmpeg`, `PIPELINE` → `neolog-pipeline`
   - **Env vars / secrets:** `ANTHROPIC_API_KEY`, `HEARTBEAT_TOKEN`,
     `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`,
     `R2_BUCKET_NAME`, plus any others currently on `neolog`.
6. Trigger a build (push or "Retry deployment"). Confirm the preview URL works
   end-to-end (sign in, a vlog plays, the admin endpoints respond).
7. Only then: Custom Domains → move `neolog.ai` from the old project to the new
   one. (Brief cutover; the old project keeps serving until you switch.)
8. Delete the old `deploy.yml` Pages workflow (below) so nothing double-deploys.

### Option B — Keep direct-upload, just stop auto-running Actions (lower effort, still uses Actions on manual trigger)
Not a true migration — only useful if you decide the Git move isn't worth it.
Leave `deploy.yml` but change its trigger to `workflow_dispatch` only, so it
never auto-fires; deploy manually when needed. (Still GitHub Actions, but rare.)

## Workers (pipeline + ffmpeg container)

These can't use Pages Git integration. Cloudflare now has **Workers Builds**
(Workers & Pages → the worker → Settings → Builds → Connect to Git) which is the
equivalent for Workers — but the ffmpeg one is a container/Docker build and is
heavier to wire up. Recommendation: leave the two workers on the existing
`deploy-workers.yml` (they deploy rarely and cheaply) unless you specifically
want them off Actions too.

## Repo change to make AFTER Cloudflare native Pages is confirmed working
Disable the Actions Pages deploy so it doesn't fight the Cloudflare build:
- Change `.github/workflows/deploy.yml` `on:` to `workflow_dispatch:` only
  (keep it as a manual fallback), OR delete it.

Do NOT make this change until the Cloudflare-native build is verified, or you'll
have no deploy path.
