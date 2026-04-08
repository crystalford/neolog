export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateApiKey, recordApiUsage, checkRateLimit } from '@/lib/api/keys'

export const dynamic = 'force-dynamic'

/**
 * Get a specific post
 * GET /api/v1/posts/:id
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Missing or invalid Authorization header' } },
                { status: 401 }
            )
        }

        const apiKey = authHeader.substring(7)
        const validation = await validateApiKey(apiKey)

        if (!validation) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key' } },
                { status: 401 }
            )
        }

        const { userId, keyId } = validation

        // Check rate limit
        const withinLimit = await checkRateLimit(keyId, 100)
        if (!withinLimit) {
            await recordApiUsage(keyId, `/api/v1/posts/${params.id}`, 'GET', 429)
            return NextResponse.json(
                { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
                { status: 429 }
            )
        }

        const supabase = createClient()
        const { data: post, error } = await supabase
            .from('posts')
            .select('id, title, content, excerpt, slug, status, published_at, created_at, cover_image_url, canonical_url')
            .eq('id', params.id)
            .eq('author_id', userId)
            .single()

        if (error || !post) {
            await recordApiUsage(keyId, `/api/v1/posts/${params.id}`, 'GET', 404)
            return NextResponse.json(
                { error: { code: 'POST_NOT_FOUND', message: 'Post not found' } },
                { status: 404 }
            )
        }

        await recordApiUsage(keyId, `/api/v1/posts/${params.id}`, 'GET', 200)
        return NextResponse.json({ post })

    } catch (error) {
        console.error('API error:', error)
        return NextResponse.json(
            { error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' } },
            { status: 500 }
        )
    }
}

/**
 * Update a post
 * PATCH /api/v1/posts/:id
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Missing or invalid Authorization header' } },
                { status: 401 }
            )
        }

        const apiKey = authHeader.substring(7)
        const validation = await validateApiKey(apiKey)

        if (!validation) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key' } },
                { status: 401 }
            )
        }

        const { userId, keyId } = validation

        // Check rate limit
        const withinLimit = await checkRateLimit(keyId, 100)
        if (!withinLimit) {
            await recordApiUsage(keyId, `/api/v1/posts/${params.id}`, 'PATCH', 429)
            return NextResponse.json(
                { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
                { status: 429 }
            )
        }

        const body = await request.json()
        const {
            title,
            content,
            excerpt,
            slug,
            tags,
            coverImage,
            status,
            publishedAt,
            canonicalUrl,
            metadata
        } = body

        // Build update object (only include provided fields)
        const updateData: any = {}
        if (title !== undefined) updateData.title = title
        if (content !== undefined) {
            updateData.content = content
            updateData.content_html = content
        }
        if (excerpt !== undefined) updateData.excerpt = excerpt
        if (slug !== undefined) updateData.slug = slug
        if (coverImage !== undefined) updateData.cover_image_url = coverImage
        if (canonicalUrl !== undefined) updateData.canonical_url = canonicalUrl
        if (status !== undefined) updateData.status = status
        if (publishedAt !== undefined) updateData.published_at = publishedAt
        if (metadata !== undefined) updateData.api_metadata = metadata

        const supabase = createClient()
        const { data: post, error } = await supabase
            .from('posts')
            .update(updateData)
            .eq('id', params.id)
            .eq('author_id', userId)
            .select('id, slug, status, published_at')
            .single()

        if (error || !post) {
            await recordApiUsage(keyId, `/api/v1/posts/${params.id}`, 'PATCH', 404)
            return NextResponse.json(
                { error: { code: 'POST_NOT_FOUND', message: 'Post not found or update failed' } },
                { status: 404 }
            )
        }

        // Update tags if provided
        if (tags && Array.isArray(tags)) {
            await supabase.rpc('set_post_tags', {
                p_post_id: params.id,
                p_tag_names: tags,
            })
        }

        await recordApiUsage(keyId, `/api/v1/posts/${params.id}`, 'PATCH', 200)
        return NextResponse.json({
            id: post.id,
            slug: post.slug,
            status: post.status,
            publishedAt: post.published_at,
        })

    } catch (error) {
        console.error('API error:', error)
        return NextResponse.json(
            { error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' } },
            { status: 500 }
        )
    }
}

/**
 * Delete a post
 * DELETE /api/v1/posts/:id
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Missing or invalid Authorization header' } },
                { status: 401 }
            )
        }

        const apiKey = authHeader.substring(7)
        const validation = await validateApiKey(apiKey)

        if (!validation) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key' } },
                { status: 401 }
            )
        }

        const { userId, keyId } = validation

        // Check rate limit
        const withinLimit = await checkRateLimit(keyId, 100)
        if (!withinLimit) {
            await recordApiUsage(keyId, `/api/v1/posts/${params.id}`, 'DELETE', 429)
            return NextResponse.json(
                { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
                { status: 429 }
            )
        }

        const supabase = createClient()
        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', params.id)
            .eq('author_id', userId)

        if (error) {
            await recordApiUsage(keyId, `/api/v1/posts/${params.id}`, 'DELETE', 404)
            return NextResponse.json(
                { error: { code: 'POST_NOT_FOUND', message: 'Post not found' } },
                { status: 404 }
            )
        }

        await recordApiUsage(keyId, `/api/v1/posts/${params.id}`, 'DELETE', 204)
        return new NextResponse(null, { status: 204 })

    } catch (error) {
        console.error('API error:', error)
        return NextResponse.json(
            { error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' } },
            { status: 500 }
        )
    }
}
