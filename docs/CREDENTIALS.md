# Credentials — what's set up where

**Read this before asking the operator to "verify" or "add" any credential.** All of these have been configured and confirmed working. If something's broken, it's a code bug, not missing credentials.

## 1. Cloudflare User API Token — `neolog-bootstrap`

**Where:** https://dash.cloudflare.com/profile/api-tokens → `neolog-bootstrap`
**Used by:** GitHub Actions bootstrap workflow (`.github/workflows/bootstrap-cloudflare.yml`)
**Stored as:** `CLOUDFLARE_API_TOKEN` GitHub repo secret
**Permissions:**
- Account → Workers Scripts → Edit
- Account → Workers R2 Storage → Edit
- Account → Cloudflare D1 → Edit
- Account → Cloudflare Pages → Edit
- Account → Access: Apps and Policies → Edit
- Account → Workers AI → Edit
- Account → Cloudflare Containers → Edit
- Account → Account Settings → Read

If this token gets modified or rolled, the bootstrap workflow fails. Restore the perms above.

## 2. R2 Access Key + Secret (for SigV4 presigning)

**Where:** https://dash.cloudflare.com/eda2e9bbd9acc42699027cfdcb50f998/r2/api-tokens
**This is a SEPARATE token system from #1.** It lives under R2 → Manage R2 API Tokens, not under User → API Tokens.

**Permissions:** Object Read & Write on bucket `neolog-videos` (or all buckets).
**Stored as:**
- `R2_ACCESS_KEY_ID` GitHub repo secret + Pages Variables/Secrets
- `R2_SECRET_ACCESS_KEY` GitHub repo secret + Pages Variables/Secrets

Bootstrap workflow propagates these from GitHub to Pages on each run.

The current Access Key ID begins with `b57d17d836a9466fd06cd03c18eaad1e` (visible in browser DevTools network panel during upload, harmless to share — the secret is what matters).

## 3. Anthropic API Key

**Where:** https://console.anthropic.com/settings/keys
**Stored as:** `ANTHROPIC_API_KEY` in GitHub repo secrets + Pages Variables/Secrets.
**Used by:** the extraction passes (threads, clips, creative, entities) when the operator picks Premium or Max tier.

## 4. Cloudflare Account ID

**Value:** `eda2e9bbd9acc42699027cfdcb50f998`
**Stored as:** `CLOUDFLARE_ACCOUNT_ID` GitHub secret AND Pages Variables/Secrets.

The Pages copy was originally missed by the bootstrap; commit `2b9ccd6` added a propagation step. Both places must have it for R2 presigning to work.

## 5. Operator email

**Value:** `chrisrobtelford@gmail.com`
**Stored as:** `OPERATOR_EMAIL` GitHub secret. Used to configure the Cloudflare Access "allow only this email" policy.

## 6. Cloudflare Access cookie identity

**Auto-handled.** Cloudflare Access drops a `CF_Authorization` JWT cookie on every authenticated request to `neolog.ai`. The Pages worker reads the email from the JWT payload (see `src/lib/access.ts:readEmail`). No manual configuration needed beyond the Access app the bootstrap creates.

## Things that are NOT credentials and don't need to be re-asked

- The R2 bucket itself (`neolog-videos`) already exists with 11.67 GB of vlogs preserved across rebuilds.
- The D1 database (`neolog`, id `d9db2aeb-c47b-4611-a2ba-96720939205b`) is provisioned.
- The Pages project (`neolog`) is provisioned with the custom domain `neolog.ai` attached.
- The Workflow worker (`neolog-process-upload`) is deployed.
- The FFmpeg Container worker (`neolog-ffmpeg`) is deployed.
- The Access app for `neolog.ai` is configured.

## When something breaks

Before asking the operator to "verify" a credential:
1. Read the actual error — usually a CORS / 403 / 401 / 404 tells you where to look in **code**, not in credentials.
2. Check the relevant `.ts` for bugs in signing, header parsing, query building.
3. Only ask for a credential check as a LAST resort, and when you do, name the EXACT token + dashboard URL.
