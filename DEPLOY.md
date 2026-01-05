# Neolog Deployment Checklist

## Prerequisites

### 1. Supabase Setup
- [ ] Create Supabase project at https://supabase.com
- [ ] Get project URL and anon key
- [ ] Get service role key (for server-side operations)
- [ ] Run the SQL schema (`supabase-schema.sql`) in SQL Editor
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

## Vercel Deployment

### 1. Deploy
- [ ] Push code to GitHub
- [ ] Connect repo to Vercel
- [ ] Add all environment variables
- [ ] Deploy

### 2. Post-Deploy
- [ ] Update Stripe webhook URL to production domain
- [ ] Update Supabase auth redirect URLs
- [ ] Test sign up flow
- [ ] Test posting
- [ ] Test payments (use Stripe test mode first)
- [ ] Set up cron jobs in vercel.json:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/publish-scheduled",
        "schedule": "*/5 * * * *"
      },
      {
        "path": "/api/cron/rss-pull",
        "schedule": "*/30 * * * *"
      },
      {
        "path": "/api/cron/weekly-digest",
        "schedule": "0 9 * * 0"
      }
    ]
  }
  ```

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

## Automation Trigger Endpoint

API-key authenticated trigger endpoint (same Automation API key as above):

- `POST /api/automation/trigger`
  - `{"event":"inbox.create", ...}` (creates an inbox item)
  - `{"event":"rss.pull"}` (pulls RSS sources for that key's user)

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
