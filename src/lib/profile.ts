import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

type Profile = {
  id: string
  username: string
  display_name: string
  bio?: string | null
  avatar_url?: string | null
  created_at?: string
}

const normalizeUsername = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30)

const getFallbackUsername = (userId: string) =>
  `user_${userId.replace(/-/g, '').slice(0, 8)}`

const buildUsername = (user: User) => {
  const candidates = [
    user.user_metadata?.username,
    user.user_metadata?.preferred_username,
    user.email?.split('@')[0],
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const normalized = normalizeUsername(candidate)
    if (normalized.length >= 3) {
      return normalized
    }
  }

  return getFallbackUsername(user.id)
}

const buildDisplayName = (user: User) => {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.preferred_username ||
    user.user_metadata?.username ||
    user.email?.split('@')[0] ||
    'User'
  )
}

/**
 * Ensures a profile exists for the given user, creating one if necessary.
 * This function is safe to call concurrently from multiple tabs/pages.
 *
 * @param supabase - The Supabase client instance
 * @param user - The authenticated user
 * @returns The user's profile, or null if creation failed
 * @throws Error with specific message if profile operations fail critically
 */
export const ensureProfile = async (
  supabase: SupabaseClient,
  user: User
): Promise<Profile | null> => {
  // First, try to fetch existing profile
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (existingProfile) {
    return existingProfile as Profile
  }

  // Only log fetch errors that aren't "no rows returned"
  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('[ensureProfile] Failed to fetch profile:', fetchError)
    throw new Error('Failed to load profile data')
  }

  // Build profile data
  const username = buildUsername(user)
  const displayName = buildDisplayName(user)

  // Use upsert to handle race conditions where another tab/request creates the profile
  // This will succeed even if the profile was just created by another concurrent request
  const { data: upsertedProfile, error: upsertError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        username,
        display_name: displayName,
      },
      {
        onConflict: 'id',
        ignoreDuplicates: false,
      }
    )
    .select('*')
    .single()

  if (upsertedProfile) {
    return upsertedProfile as Profile
  }

  // If upsert failed due to username conflict (unique constraint), try with fallback username
  if (upsertError && upsertError.code === '23505') {
    console.warn('[ensureProfile] Username conflict, retrying with fallback username')

    const fallbackUsername = getFallbackUsername(user.id)
    const { data: fallbackProfile, error: fallbackError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          username: fallbackUsername,
          display_name: displayName,
        },
        {
          onConflict: 'id',
          ignoreDuplicates: false,
        }
      )
      .select('*')
      .single()

    if (fallbackProfile) {
      return fallbackProfile as Profile
    }

    if (fallbackError) {
      console.error('[ensureProfile] Failed to create profile with fallback username:', fallbackError)
      throw new Error('Unable to create profile. Please try again.')
    }
  }

  // If we got here due to some other error, check one more time if profile exists
  // (in case a concurrent request succeeded)
  const { data: finalCheck } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (finalCheck) {
    return finalCheck as Profile
  }

  // Log the original error for debugging
  if (upsertError) {
    console.error('[ensureProfile] Failed to upsert profile:', upsertError)
  }

  return null
}
