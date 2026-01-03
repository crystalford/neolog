# Neolog Deployment Guide (Beginner Friendly)

This guide assumes you've never deployed a web app before. We'll go step by step.

---

## PHASE 1: Prerequisites (Do These First)

### 1.1 Create a GitHub Account (if you don't have one)
- Go to https://github.com
- Click "Sign up"
- Follow the prompts

**Video tutorial:** https://www.youtube.com/watch?v=QUtk-Uuq9nE (2 min)

### 1.2 Install Git on Your Computer
- **Mac:** Open Terminal, type `git --version`. If not installed, it will prompt you to install.
- **Windows:** Download from https://git-scm.com/download/win

**Video tutorial:** https://www.youtube.com/watch?v=4xqVv2lTo40 (5 min)

### 1.3 Install Node.js
- Go to https://nodejs.org
- Download the **LTS** version (the one on the left)
- Run the installer

To verify, open Terminal/Command Prompt and type:
```
node --version
```
You should see something like `v20.x.x`

**Video tutorial:** https://www.youtube.com/watch?v=JINE4D0Syqw (3 min)

### 1.4 Install VS Code (Code Editor)
- Go to https://code.visualstudio.com
- Download and install

**Video tutorial:** https://www.youtube.com/watch?v=cu_ykIfBprI (5 min)

---

## PHASE 2: Get the Code Ready

### 2.1 Unzip the Neolog Code
1. Find the `neolog.zip` file you downloaded
2. Right-click → Extract All (Windows) or double-click (Mac)
3. You should now have a folder called `neolog`

### 2.2 Open in VS Code
1. Open VS Code
2. File → Open Folder
3. Select the `neolog` folder
4. You should see all the files in the left sidebar

### 2.3 Create a GitHub Repository
1. Go to https://github.com/new
2. Repository name: `neolog` (or whatever you want)
3. Keep it **Private** (you can make it public later)
4. DON'T check any boxes (no README, no .gitignore)
5. Click "Create repository"
6. You'll see a page with commands - keep this open

### 2.4 Push Code to GitHub
1. In VS Code, open the Terminal (View → Terminal or Ctrl+`)
2. Make sure you're in the neolog folder (you should see `neolog` in the terminal path)
3. Run these commands ONE BY ONE:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/neolog.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

If it asks for your GitHub credentials, enter them.

**Video tutorial for this whole process:** https://www.youtube.com/watch?v=RGOj5yH7evk (30 min, but very thorough)

---

## PHASE 3: Set Up Supabase (Database)

### 3.1 Create Supabase Account
1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub (easiest)

### 3.2 Create a New Project
1. Click "New project"
2. **Name:** neolog
3. **Database Password:** Generate a strong one and SAVE IT SOMEWHERE (you'll need it later)
4. **Region:** Pick the closest to your users
5. Click "Create new project"
6. Wait 2-3 minutes for it to set up

### 3.3 Get Your API Keys
1. In your Supabase project, click the **Settings** icon (gear) in the left sidebar
2. Click **API**
3. You'll see:
   - **Project URL** - copy this (starts with https://xxxxx.supabase.co)
   - **anon public** key - copy this
   - **service_role** key - click to reveal, then copy (KEEP THIS SECRET)

**Save all three somewhere safe (like a notes app). You'll need them soon.**

### 3.4 Run the Database Schema
This creates all the tables Neolog needs.

1. In Supabase, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Go back to VS Code
4. Open the file `supabase-schema.sql`
5. Select ALL the text (Ctrl+A or Cmd+A)
6. Copy it (Ctrl+C or Cmd+C)
7. Go back to Supabase SQL Editor
8. Paste the text (Ctrl+V or Cmd+V)
9. Click **Run** (green button)
10. Wait for it to complete (might take 30 seconds)
11. You should see "Success. No rows returned" - that's good!

### 3.5 Set Up Storage (for images)
1. In Supabase, click **Storage** in the left sidebar
2. Click **New bucket**
3. Name: `images`
4. Check **Public bucket**
5. Click **Create bucket**

### 3.6 Set Up Auth
1. Click **Authentication** in the left sidebar
2. Click **Providers**
3. Make sure **Email** is enabled
4. (Optional) Enable Google/GitHub login by clicking on them and following the setup

**Video tutorial for Supabase:** https://www.youtube.com/watch?v=dU7GwCOgvNY (15 min)

---

## PHASE 4: Set Up Vercel (Hosting)

### 4.1 Create Vercel Account
1. Go to https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel to access your GitHub

### 4.2 Import Your Project
1. On Vercel dashboard, click "Add New..." → "Project"
2. Find your `neolog` repository and click "Import"
3. **STOP HERE** - don't click Deploy yet!

### 4.3 Add Environment Variables
Before deploying, you need to add your secret keys.

1. Scroll down to "Environment Variables"
2. Add these one by one (click "Add" after each):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key |
| `NEXT_PUBLIC_APP_URL` | `https://your-project-name.vercel.app` (you'll update this later) |
| `CRON_SECRET` | Make up a random string (like `my-secret-cron-key-12345`) |

3. Now click **Deploy**
4. Wait 2-3 minutes for it to build

### 4.4 Check Your Site
1. Once deployed, Vercel will show you a URL like `https://neolog-xxxxx.vercel.app`
2. Click it!
3. You should see the Neolog homepage

**If you see an error, that's okay - we'll fix it.**

**Video tutorial for Vercel:** https://www.youtube.com/watch?v=2HBIzEx6IZA (10 min)

---

## PHASE 5: Test Basic Functionality

### 5.1 Update the APP_URL
1. Go to your Vercel project → Settings → Environment Variables
2. Find `NEXT_PUBLIC_APP_URL`
3. Update it to your actual Vercel URL (like `https://neolog-xxxxx.vercel.app`)
4. Click Save
5. Go to Deployments → Click the three dots on the latest → Redeploy

### 5.2 Test Sign Up
1. Go to your site
2. Click "Get Started" or "Sign Up"
3. Enter an email and password
4. Check your email for a confirmation link
5. Click the link
6. You should be logged in!

### 5.3 Test Creating a Post
1. Click "Write" or the pen icon
2. Add a title
3. Write some content
4. Click Publish
5. It should publish and redirect you to the post

---

## PHASE 6: Set Up Stripe (Payments) - Optional for Now

You can skip this phase and add payments later. The platform works without it.

### 6.1 Create Stripe Account
1. Go to https://stripe.com
2. Click "Start now"
3. Sign up and verify your email

### 6.2 Get Your Keys
1. In Stripe Dashboard, make sure "Test mode" is ON (toggle in the top right)
2. Click Developers → API keys
3. Copy the **Publishable key** (starts with pk_test_)
4. Click "Reveal" on Secret key and copy it (starts with sk_test_)

### 6.3 Add to Vercel
Go to Vercel → Settings → Environment Variables and add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Your pk_test_xxx key |
| `STRIPE_SECRET_KEY` | Your sk_test_xxx key |

### 6.4 Set Up Webhook
1. In Stripe, go to Developers → Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://your-site.vercel.app/api/stripe/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click "Add endpoint"
6. Click on your new endpoint
7. Click "Reveal" on Signing secret
8. Copy it and add to Vercel as `STRIPE_WEBHOOK_SECRET`

### 6.5 Redeploy
After adding all variables, redeploy on Vercel.

---

## PHASE 7: Set Up Email (Resend) - Optional for Now

Again, you can skip this and add later.

### 7.1 Create Resend Account
1. Go to https://resend.com
2. Sign up

### 7.2 Get API Key
1. Go to API Keys
2. Create a new key
3. Copy it

### 7.3 Add to Vercel
Add these environment variables:

| Name | Value |
|------|-------|
| `RESEND_API_KEY` | Your Resend API key |
| `FROM_EMAIL` | `onboarding@resend.dev` (for testing) |

For production email, you'll need to verify your domain in Resend.

---

## Troubleshooting

### "Application error" on Vercel
1. Go to your Vercel project
2. Click "Deployments"
3. Click on the latest deployment
4. Click "Logs"
5. Look for red error messages
6. Common issues:
   - Missing environment variable → Add it and redeploy
   - Database error → Check your Supabase schema ran correctly

### Can't sign up
1. Check Supabase → Authentication → Settings
2. Make sure "Enable email confirmations" is how you want it
3. Check spam folder for confirmation email

### Stuck? Ask for help!
- Take a screenshot of any error
- Note what step you were on
- Ask me and I'll help debug

---

## Next Steps After Deployment

Once everything is working:

1. **Get a custom domain** (optional)
   - Buy a domain (Namecheap, Google Domains, etc.)
   - Add it in Vercel → Settings → Domains

2. **Make yourself admin**
   - Go to Supabase → SQL Editor
   - Run: `UPDATE profiles SET is_admin = true WHERE username = 'your-username';`

3. **Switch Stripe to live mode** (when ready for real payments)
   - Get live keys from Stripe
   - Update environment variables
   - Update webhook to use live endpoint

4. **Set up error tracking** (recommended)
   - Create account at sentry.io
   - Add their Next.js SDK

---

## Summary Checklist

- [ ] Phase 1: Prerequisites installed
- [ ] Phase 2: Code on GitHub
- [ ] Phase 3: Supabase set up
- [ ] Phase 4: Deployed on Vercel
- [ ] Phase 5: Basic functionality works
- [ ] Phase 6: Stripe (optional)
- [ ] Phase 7: Email (optional)

Take it one phase at a time. There's no rush.
