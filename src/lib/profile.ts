import type { User } from '@supabase/supabase-js'

type SupabaseClient = {
  from: (table: string) => any
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

export const ensureProfile = async (supabase: SupabaseClient, user: User) => {
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (existingProfile) {
    return existingProfile
  }

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('Failed to load profile:', fetchError)
  }

  const username = buildUsername(user)
  const displayName = buildDisplayName(user)

  const { data: createdProfile, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      username,
      display_name: displayName,
    })
    .select('*')
    .single()

  if (createdProfile) {
    return createdProfile
  }

  if (insertError) {
    const { data: existingAfterInsert } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (existingAfterInsert) {
      return existingAfterInsert
    }

    const fallbackUsername = getFallbackUsername(user.id)
    const { data: fallbackProfile, error: fallbackError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        username: fallbackUsername,
        display_name: displayName,
      })
      .select('*')
      .single()

    if (fallbackProfile) {
      return fallbackProfile
    }

    if (fallbackError) {
      console.error('Failed to create profile:', fallbackError)
    }
  }

  return null
}
