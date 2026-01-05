# Neolog Deployment Checklist

## Prerequisites

### 1. Supabase Setup
- [ ] Create Supabase project at https://supabase.com
- [ ] Get project URL and anon key
- [ ] Get service role key (for server-side operations)
- [ ] Run the SQL schema (`supabase-schema.sql`) in SQL Editor
- [ ] Run migrations in `supabase/migrations/` (including `add_onboarded_at.sql` for onboarding gating)
  - [ ] Usage tracking + caps: `add_provider_usage.sql`, `add_usage_caps.sql`
  - [ ] Video avatar jobs: `add_video_brief_jobs.sql`
  - [ ] Syndication + visuals: `add_syndication.sql`, `add_og_variants.sql`
  - [ ] Feed source settings: `add_feed_source_auto_convert.sql` (optional per-feed auto-convert + destination publication)
  - [ ] Asset Vault: `add_assets_vault.sql` (assets table + RLS)
  - [ ] Post ↔ Asset links: `add_post_assets.sql` (attach vault assets to drafts)
  - [ ] Capture-first asset fields: `expand_assets_capture_fields.sql` (title/source/url + quote/fragment types)
- [ ] Enable Email auth in Authentication > Providers
- [ ] (Optional) Enable OAuth providers (Google, GitHub)
- [ ] Create storage bucket named `images` with public access
- [ ] Set up storage policies:
  ```sql
  -- Allow authenticated users to upload
  CREATE POLICY "Users can upload images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.uid() IS NOT NULL);
  
  -- Allow public read access
  CREATE POLICY "Public can view images" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');
  ```

### 2. Stripe Setup
- [ ] Create Stripe account at https://stripe.com
- [ ] Get publishable key and secret key
- [ ] Enable Connect for creator payouts
- [ ] Set up webhook endpoint: `https://your-domain.com/api/stripe/webhook`
- [ ] Add webhook events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `account.updated` (for Connect)
- [ ] Get webhook signing secret

### 3. Resend Setup (Email)
- [ ] Create Resend account at https://resend.com
- [ ] Get API key
- [ ] Verify your sending domain
- [ ] Set FROM_EMAIL to your verified domain

### 4. Environment Variables

Create `.env.local` with:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Resend (Email)
RESEND_API_KEY=re_xxxxx
FROM_EMAIL=hello@yourdomain.com

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Cron Secret (generate random string)
CRON_SECRET=xxxxx
```

Notes:
- `SUPABASE_SERVICE_ROLE_KEY` is required for server-side automation endpoints (headless inbox webhook, automation triggers, and cron RSS pull).
- `CRON_SECRET` is required to secure `/api/cron/*` routes.

Optional:
- `RSS_AUTO_CONVERT_TO_DRAFTS` when set to `true` (or `1`) makes `/api/cron/rss-pull` automatically convert newly pulled RSS inbox items into draft posts.

## Vercel Deployment

### 1. Deploy
- [ ] Push code to GitHub
- [ ] Connect repo to Vercel
- [ ] Add all environment variables
- [ ] Deploy

### 2. Post-Deploy
- [ ] Update Stripe webhook URL to production domain
- [ ] Update Supabase auth redirect URLs
- [ ] Test sign up flow (OAuth)
  - Sign up with Google → should land on `/onboarding`
  - Choose a username → should reach `/dashboard`
  - Refresh `/dashboard` → should not redirect back to onboarding
- [ ] Test posting
- [ ] Test payments (use Stripe test mode first)
### Cron jobs

Vercel Cron Jobs are plan-gated. If you're on the Hobby plan, keep the cron routes but trigger them from an external scheduler (GitHub Actions, cron-job.org, UptimeRobot, etc.) using `CRON_SECRET`.

Recommended (free): GitHub Actions scheduled cron

- A workflow is included at `.github/workflows/neolog-cron.yml`.
- Set GitHub repo secrets:
  - `NEOLOG_BASE_URL` (example: `https://your-app.vercel.app`)
  - `CRON_SECRET` (must match the env var in your deployment)
- The workflow calls:
  - `/api/cron/publish-scheduled` (every 5 minutes)
  - `/api/cron/rss-pull` (every 15 minutes)
  - `/api/cron/weekly-digest` (weekly)

Cron routes:
- `/api/cron/publish-scheduled`
- `/api/cron/rss-pull`
- `/api/cron/weekly-digest`

## Headless Inbox Webhook (Automation)

Neolog supports API-key authenticated ingestion into a user's Inbox. Create an "Automation API key" in the dashboard settings, then call:

- `POST /api/inbox/webhook`
  - Auth header: `Authorization: Bearer neo_...`
  - Body (example):
    ```json
    {
      "sourceType": "webhook",
      "title": "Interesting link",
      "canonicalUrl": "https://example.com/article",
      "sourceUrl": "https://example.com/article",
      "rawData": { "tags": ["ai", "writing"] }
    }
    ```

## Drop Box: Draft Webhook (Interoperability)

Neolog also exposes a higher-level draft “drop box” endpoint for external AI workbenches.

- `POST /api/webhooks/draft`
  - Auth header: `Authorization: Bearer neo_...`
  - Stores a provenance-first inbox artifact (convert to a draft from the Inbox UI)
  - Body (example):
    ```json
    {
      "title": "Outline: Supply Chain for Intellectuals",
      "content": "# Idea\n\n...",
      "content_type": "markdown",
      "tags": ["writing", "systems"],
      "source_tool": "Google AI Studio",
      "canonical_url": "https://example.com/notes",
      "source_url": "https://example.com/notes",
      "meta": { "provenance": { "tool": "Google AI Studio" } }
    }
    ```

## Asset API: Vault Add (Interoperability)

After applying the `add_assets_vault.sql` migration, scripts can capture provenance-first assets.

- `POST /api/vault/add`
  - Auth: either `Authorization: Bearer neo_...` (automation key) OR a logged-in user session cookie
  - Body (example):
    ```json
    {
      "type": "prompt",
      "content": "Write a 7-tweet thread explaining X.",
      "tags": ["threads", "prompt"],
      "meta": { "source": "manual", "created_in": "Cursor" }
    }
    ```

## Capture Webhook: /api/capture (Capture-First)

After applying `expand_assets_capture_fields.sql`, Neolog supports a dedicated capture endpoint aligned with the “Dump Box” model.

- `POST /api/capture`
  - Auth: either `Authorization: Bearer neo_...` (automation key) OR a logged-in user session cookie
  - Response: `{ "ok": true, "id": "<asset_id>" }`

- `POST /api/v1/capture` (alias)
  - Same auth + request body as `/api/capture`
  - Response (v3.1-friendly): `{ "asset_id": "<asset_id>", "vault_url": "https://<host>/vault/<asset_id>" }`
  - Auth: either `Authorization: Bearer neo_...` (automation key) OR a logged-in user session cookie
  - Body (example):
    ```json
    {
      "type": "quote",
      "title": "McLuhan on the medium",
      "content": "The medium is the message.",
      "tags": ["mcluhan", "media"],
      "source": "Claude Chat",
      "source_url": "https://..."
    }
    ```

## Automation Trigger Endpoint

API-key authenticated trigger endpoint (same Automation API key as above):

- `POST /api/automation/trigger`
  - `{"event":"inbox.create", ...}` (creates an inbox item)
  - `{"event":"rss.pull"}` (pulls RSS sources for that key's user)

## Automation: Required Vercel Env Vars

To use the headless webhook, automation triggers, and cron RSS pull in production, set these in Vercel → Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

After changing env vars, redeploy (Vercel Deployments → Redeploy) so the new values take effect.

### 3. Make Yourself Admin
```sql
UPDATE profiles SET is_admin = true WHERE username = 'your-username';
```

## Testing Checklist

- [ ] Sign up / Login
- [ ] Complete onboarding
- [ ] Create a post (draft)
- [ ] Publish post
- [ ] View post page
- [ ] Subscribe to a user
- [ ] Comment on post
- [ ] Upvote / React
- [ ] Bookmark post
- [ ] Fork post
- [ ] Search
- [ ] Dark mode toggle
- [ ] Mobile navigation
- [ ] Create subscription tier
- [ ] Process payment (test mode)
- [ ] Create reading list
- [ ] Create series
- [ ] Import from Substack/Medium
- [ ] Export data

## Admin Utilities (Local)

Delete a test account (and cascade-delete its posts/content) using the service role key:

- Command: `npm run delete:user -- <username> --yes`
- Requires env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

If your database permissions block username lookup, delete by user id instead:

- Find the user's UID in Supabase → Authentication → Users
- Command: `npm run delete:user:id -- <userId> --yes`

## Optional Enhancements

- [ ] Set up Sentry for error tracking
- [ ] Set up Plausible/PostHog for analytics
- [ ] Configure CDN for images (Cloudinary/imgix)
- [ ] Set up uptime monitoring
- [ ] Configure custom domain
- [ ] Set up transactional email monitoring

## Go Live

- [ ] Switch Stripe to live mode
- [ ] Update all test keys to production keys
- [ ] Enable rate limiting in production
- [ ] Monitor error logs for first 24 hours
- [ ] Announce launch! 🚀
