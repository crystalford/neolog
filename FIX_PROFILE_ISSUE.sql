-- Fix Profile Loading Issues
-- Run this in your Supabase SQL Editor if you're getting profile errors

-- 1. Check if your profile exists
SELECT id, username, display_name, created_at
FROM public.profiles
WHERE id = auth.uid();

-- If no results, your profile doesn't exist. Let's create it:

-- 2. Create profile for current user (if doesn't exist)
INSERT INTO public.profiles (id, username, display_name)
SELECT
  auth.uid(),
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'username'),
    'user_' || substring(auth.uid()::text, 1, 8)
  ),
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'full_name'),
    (auth.jwt() -> 'user_metadata' ->> 'name'),
    'User'
  )
WHERE auth.uid() IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 3. Verify RLS policies allow profile creation
-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles';

-- 4. Ensure RLS policy allows users to create their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 5. Ensure RLS policy allows users to view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- 6. Ensure RLS policy allows users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 7. Verify profile was created/exists
SELECT id, username, display_name, created_at
FROM public.profiles
WHERE id = auth.uid();

-- You should see your profile now!
