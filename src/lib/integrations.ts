import { createClient } from '@/lib/supabase/server'

export const decryptIntegrationKey = (encryptedKey: string, iv: string) => {
  // Legacy decryption silenced to support Edge Runtime.
  // Falls back to managed keys in ai-provider.ts.
  return null
}

type SupabaseClientLike = {
  from: (table: string) => any
}

export const getActiveIntegrationKeyWithClient = async (
  supabase: SupabaseClientLike,
  userId: string,
  provider: string
) => {
  const { data } = await supabase
    .from('integration_keys')
    .select('encrypted_key, iv')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return decryptIntegrationKey(data.encrypted_key, data.iv)
}

export const getActiveIntegrationKey = async (userId: string, provider: string) => {
  const supabase = createClient()
  return getActiveIntegrationKeyWithClient(supabase, userId, provider)
}

export const getIntegrationKey = getActiveIntegrationKey
