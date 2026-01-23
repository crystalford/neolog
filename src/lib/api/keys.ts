/**
 * API Key Management Utilities
 * 
 * Handles generation, hashing, and validation of API keys
 */

import { createClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

/**
 * Generate a new API key
 * Format: neo_<32 random chars>
 */
export function generateApiKey(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let key = 'neo_'

    // Generate 32 random characters
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    return key
}

/**
 * Hash an API key for storage
 */
export async function hashApiKey(key: string): Promise<string> {
    return bcrypt.hash(key, 10)
}

/**
 * Get key prefix for display (first 12 chars)
 */
export function getKeyPrefix(key: string): string {
    return key.substring(0, 12) + '...'
}

/**
 * Validate an API key and return the associated user
 */
export async function validateApiKey(key: string): Promise<{ userId: string; keyId: string } | null> {
    if (!key || !key.startsWith('neo_')) {
        return null
    }

    const supabase = createClient()

    // Get all active API keys (we need to check hash)
    const { data: keys, error } = await supabase
        .from('api_keys')
        .select('id, user_id, key_hash')
        .eq('is_active', true)
        .is('revoked_at', null)

    if (error || !keys || keys.length === 0) {
        return null
    }

    // Check each key hash
    for (const apiKey of keys) {
        const isValid = await bcrypt.compare(key, apiKey.key_hash)
        if (isValid) {
            // Update last_used_at
            await supabase
                .from('api_keys')
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', apiKey.id)

            return {
                userId: apiKey.user_id,
                keyId: apiKey.id,
            }
        }
    }

    return null
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(userId: string, name: string): Promise<{ key: string; keyId: string }> {
    const supabase = createClient()

    const key = generateApiKey()
    const keyHash = await hashApiKey(key)
    const keyPrefix = getKeyPrefix(key)

    const { data, error } = await supabase
        .from('api_keys')
        .insert({
            user_id: userId,
            name,
            key_hash: keyHash,
            key_prefix: keyPrefix,
            is_active: true,
        })
        .select('id')
        .single()

    if (error || !data) {
        throw new Error('Failed to create API key')
    }

    return {
        key, // Return full key only once
        keyId: data.id,
    }
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<void> {
    const supabase = createClient()

    const { error } = await supabase
        .from('api_keys')
        .update({
            is_active: false,
            revoked_at: new Date().toISOString(),
        })
        .eq('id', keyId)
        .eq('user_id', userId)

    if (error) {
        throw new Error('Failed to revoke API key')
    }
}

/**
 * Record API usage for rate limiting
 */
export async function recordApiUsage(
    keyId: string,
    endpoint: string,
    method: string,
    statusCode: number
): Promise<void> {
    const supabase = createClient()

    await supabase
        .from('api_usage')
        .insert({
            api_key_id: keyId,
            endpoint,
            method,
            status_code: statusCode,
        })
}

/**
 * Check rate limit for an API key
 * Returns true if within limit, false if exceeded
 */
export async function checkRateLimit(keyId: string, limit: number = 100): Promise<boolean> {
    const supabase = createClient()

    // Count requests in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count, error } = await supabase
        .from('api_usage')
        .select('*', { count: 'exact', head: true })
        .eq('api_key_id', keyId)
        .gte('created_at', oneHourAgo)

    if (error) {
        console.error('Rate limit check error:', error)
        return true // Allow on error
    }

    return (count || 0) < limit
}
