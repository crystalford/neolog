# 🚀 Setup Required - Action Items for You

I've implemented a major update with **multi-publication support** (Substack-style dashboard) and fixed the posting functionality. Here's what you need to do on your end to get everything working:

---

## 📋 CRITICAL: Database Migration Required

### 1. Run the Publications Migration

**File:** `supabase/migrations/add_publications.sql`

This migration creates:
- `publications` table (for multi-blog support)
- `publication_members` table (for team collaboration)
- Adds `publication_id` column to `posts` table
- Adds `publication_id` column to `email_subscribers` table
- Creates all necessary indexes and RLS policies

**How to run:**

#### Option A: Using Supabase CLI (Recommended)
```bash
# If you have supabase CLI installed
supabase db push

# Or apply the specific migration
supabase migration up
```

#### Option B: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the entire contents of `supabase/migrations/add_publications.sql`
4. Paste and execute

#### Option C: Using psql (if you have direct database access)
```bash
psql postgresql://[your-connection-string] < supabase/migrations/add_publications.sql
```

---

## ⚠️ IMPORTANT: Existing Data Migration

### 2. Migrate Existing Posts

If you have existing posts in your database, they won't have a `publication_id`. You have two options:

#### Option A: Create a default publication for existing posts

Run this SQL in your Supabase SQL Editor:

```sql
-- Step 1: Create a default publication for each user who has posts
INSERT INTO public.publications (owner_id, name, slug, description, is_active)
SELECT DISTINCT
  p.author_id,
  COALESCE(pr.display_name, pr.username, 'My Blog'),
  COALESCE(pr.username, 'blog-' || substr(md5(random()::text), 1, 8)),
  'My default publication',
  true
FROM public.posts p
LEFT JOIN public.profiles pr ON p.author_id = pr.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.publications pub WHERE pub.owner_id = p.author_id
);

-- Step 2: Assign all existing posts to their author's first publication
UPDATE public.posts
SET publication_id = (
  SELECT id
  FROM public.publications
  WHERE owner_id = posts.author_id
  LIMIT 1
)
WHERE publication_id IS NULL;
```

#### Option B: Delete existing posts and start fresh

If you don't have important existing posts:

```sql
DELETE FROM public.posts WHERE publication_id IS NULL;
```

---

## 🎨 What's New

### Multi-Publication System
- **Publications Dashboard:** `/publications` - Manage all your blogs
- **Publication Switcher:** In the header next to the Write button
- **Per-Publication Settings:** Each publication can have its own branding, domain, etc.
- **Team Collaboration:** Invite members to your publications (structure in place)

### How It Works
1. Users can create multiple publications (like Substack)
2. Each publication is like a separate blog with its own:
   - Name, logo, and branding colors
   - Custom domain support
   - Subscriber list
   - Analytics
   - Posts
3. Switch between publications using the dropdown in the header
4. All posts belong to a specific publication

---

## 🔧 Testing the Posting Flow

After running the migration, test posting:

1. **Go to /publications**
   - Create your first publication
   - Fill in: Name, Slug, Description

2. **Click "Write" in the header**
   - You should see the publication switcher
   - Select your publication
   - Write and publish a post

3. **Verify it published successfully**
   - Should redirect to the published post
   - Check `/dashboard` to see your posts

---

## 🐛 Troubleshooting

### "Publishing fails" or "Failed to publish: ..."

**Check 1: RLS Policies**
Make sure the RLS policy for posts allows publication_id:

```sql
-- Check existing policy
SELECT * FROM pg_policies WHERE tablename = 'posts';

-- If needed, update insert policy to allow publication_id
DROP POLICY IF EXISTS "Users can create posts" ON public.posts;

CREATE POLICY "Users can create posts"
  ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);
```

**Check 2: Required Columns**
Verify the posts table has all required columns:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'posts'
AND column_name IN ('publication_id', 'author_id', 'title', 'content', 'slug', 'status');
```

### "No publications yet" warning on /write

This is CORRECT behavior! You must:
1. Go to `/publications`
2. Click "Create Publication"
3. Then you can write posts

### Publication switcher not showing

Check browser console for errors. Make sure:
- You're logged in
- You have at least one publication
- The publications query is working

---

## 📊 Database Schema Overview

### New Tables

#### `publications`
- Multi-blog support
- Each user can have unlimited publications
- Customizable branding, domains, settings

#### `publication_members`
- Team collaboration (owner, admin, editor, writer roles)
- Invite system ready to be wired up

### Modified Tables

#### `posts`
- Added `publication_id` (references publications table)
- Posts now belong to publications, not just users

#### `email_subscribers`
- Added `publication_id`
- Subscribers subscribe to specific publications

---

## 🎯 Next Steps

After setup:

1. ✅ Run database migration
2. ✅ Migrate existing posts (or delete them)
3. ✅ Create your first publication
4. ✅ Test writing and publishing a post
5. 🚀 You're ready to go!

### Future Enhancements You Can Build:

- Custom domains per publication
- Team member invitations UI
- Publication-specific analytics
- Publication-specific subscriber management
- Import posts into specific publications
- Cross-publication posting

---

## 🆘 Still Having Issues?

Check these common problems:

1. **Posts table doesn't exist**
   - Make sure main schema is applied first
   - This migration adds to existing tables

2. **RLS blocking insert/update**
   - Check RLS policies on posts table
   - Verify auth.uid() matches author_id

3. **Supabase connection issues**
   - Check `.env.local` has correct Supabase URL and keys
   - Verify Supabase project is running

4. **Frontend errors**
   - Clear browser cache and localStorage
   - Check browser console for API errors
   - Verify build succeeded (`npm run build`)

---

## 📝 Summary

**What I did:**
- ✅ Created multi-publication system (like Substack)
- ✅ Fixed posting functionality to work with publications
- ✅ Added publication switcher to header
- ✅ Created publications management UI
- ✅ Updated write page to require publication selection
- ✅ Added all necessary database tables and migrations

**What you need to do:**
1. Run the database migration
2. Migrate existing posts (or delete them)
3. Create your first publication
4. Start writing!

The publishing should now work end-to-end once you complete these steps.
