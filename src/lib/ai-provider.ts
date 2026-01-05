import { createClient } from '@/lib/supabase/server'
import { getActiveIntegrationKey, getActiveIntegrationKeyWithClient } from '@/lib/integrations'

type ProviderKeySource = 'user' | 'managed'

type ProviderKeyResult = {
  key: string
  source: ProviderKeySource
}

const getManagedKey = (provider: string) => {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY || ''
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY || ''
    case 'perplexity':
      return process.env.PERPLEXITY_API_KEY || ''
    case 'grok':
      return process.env.GROK_API_KEY || ''
    case 'x':
      return process.env.X_BEARER_TOKEN || ''
    case 'groq':
      return process.env.GROQ_API_KEY || ''
    case 'elevenlabs':
      return process.env.ELEVENLABS_API_KEY || ''
    case 'replicate':
      return process.env.REPLICATE_API_TOKEN || ''
    case 'resend':
      return process.env.RESEND_API_KEY || ''
    case 'posthog':
      return process.env.POSTHOG_PROJECT_API_KEY || ''
    case 'r2':
      return process.env.R2_ACCESS_KEY_ID || ''
    case 'heygen':
      return process.env.HEYGEN_API_KEY || ''
    case 'synthesia':
      return process.env.SYNTHESIA_API_KEY || ''
    default:
      return ''
  }
}

type SupabaseClientLike = {
  from: (table: string) => any
}

export const resolveProviderKeyWithClient = async (
  supabase: SupabaseClientLike,
  userId: string,
  provider: string
): Promise<ProviderKeyResult | null> => {
  const userKey = await getActiveIntegrationKeyWithClient(supabase, userId, provider)
  if (userKey) {
    return { key: userKey, source: 'user' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', userId)
    .maybeSingle()

  if (!profile?.is_pro) {
    return null
  }

  const managedKey = getManagedKey(provider)
  if (!managedKey) {
    return null
  }

  return { key: managedKey, source: 'managed' }
}

export const resolveProviderKey = async (
  userId: string,
  provider: string
): Promise<ProviderKeyResult | null> => {
  const supabase = createClient()
  return resolveProviderKeyWithClient(supabase, userId, provider)
}
