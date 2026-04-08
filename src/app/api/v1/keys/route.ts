export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiKey, revokeApiKey } from '@/lib/api/keys'

/**
 * Create a new API key
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { name } = await request.json()

        if (!name || typeof name !== 'string') {
            return NextResponse.json(
                { error: 'Name is required' },
                { status: 400 }
            )
        }

        const { key, keyId } = await createApiKey(session.user.id, name)

        return NextResponse.json({
            id: keyId,
            key, // Full key shown only once
            name,
            message: 'Save this key securely. You won\'t be able to see it again.',
        })
    } catch (error: any) {
        console.error('Create API key error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create API key' },
            { status: 500 }
        )
    }
}

/**
 * List user's API keys
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: keys, error } = await supabase
            .from('api_keys')
            .select('id, name, key_prefix, created_at, last_used_at, is_active')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })

        if (error) {
            throw error
        }

        return NextResponse.json({ keys: keys || [] })
    } catch (error: any) {
        console.error('List API keys error:', error)
        return NextResponse.json(
            { error: 'Failed to list API keys' },
            { status: 500 }
        )
    }
}

/**
 * Revoke an API key
 */
export async function DELETE(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { keyId } = await request.json()

        if (!keyId) {
            return NextResponse.json(
                { error: 'Key ID is required' },
                { status: 400 }
            )
        }

        await revokeApiKey(keyId, session.user.id)

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Revoke API key error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to revoke API key' },
            { status: 500 }
        )
    }
}
