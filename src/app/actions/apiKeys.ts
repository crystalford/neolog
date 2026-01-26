'use server'

import { createClient } from '@/lib/supabase/server'
import { encryptApiKey } from '@/lib/encryption'

export type ApiProvider = 'openai' | 'anthropic' | 'tavily' | 'serpapi'

/**
 * Save or update an API key for the current user
 */
export async function saveApiKey(provider: ApiProvider, apiKey: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, error: 'Not authenticated' }
        }

        const encryptedKey = encryptApiKey(apiKey)

        // Upsert (insert or update)
        const { error } = await supabase
            .from('user_api_keys')
            .upsert({
                user_id: user.id,
                provider,
                encrypted_key: encryptedKey,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,provider'
            })

        if (error) {
            console.error('Save API key error:', error)
            return { success: false, error: error.message }
        }

        return { success: true }
    } catch (error: any) {
        console.error('Save API key error:', error)
        return { success: false, error: error.message }
    }
}

/**
 * Delete an API key
 */
export async function deleteApiKey(provider: ApiProvider): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, error: 'Not authenticated' }
        }

        const { error } = await supabase
            .from('user_api_keys')
            .delete()
            .eq('user_id', user.id)
            .eq('provider', provider)

        if (error) {
            return { success: false, error: error.message }
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Get all API keys for the current user (encrypted, for display purposes)
 */
export async function getApiKeys(): Promise<{ provider: ApiProvider; hasKey: boolean; createdAt: string }[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
        .from('user_api_keys')
        .select('provider, created_at')
        .eq('user_id', user.id)

    return (data || []).map(row => ({
        provider: row.provider as ApiProvider,
        hasKey: true,
        createdAt: row.created_at,
    }))
}
