export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateApiKey, recordApiUsage, checkRateLimit } from '@/lib/api/keys'

/**
 * Create a new post via API
 * POST /api/v1/posts
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now()
    let keyId: string | null = null

    try {
        // Extract API key from Authorization header
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Missing or invalid Authorization header' } },
                { status: 401 }
            )
        }

        const apiKey = authHeader.substring(7) // Remove "Bearer "

        // Validate API key
        const validation = await validateApiKey(apiKey)
        if (!validation) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key' } },
                { status: 401 }
            )
        }

        const { userId, keyId: validatedKeyId } = validation
        keyId = validatedKeyId

        // Check rate limit
        const withinLimit = await checkRateLimit(keyId, 100) // 100 requests/hour
        if (!withinLimit) {
            await recordApiUsage(keyId, '/api/v1/posts', 'POST', 429)
            return NextResponse.json(
                { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded. Try again later.' } },
                {
                    status: 429,
                    headers: { 'Retry-After': '3600' } // 1 hour
                }
            )
        }

        // Parse request body
        const body = await request.json()
        const {
            title,
            content,
            contentType = 'html',
            excerpt,
            slug,
            tags = [],
            coverImage,
            status = 'published',
            publishedAt,
            canonicalUrl,
            metadata = {}
        } = body

        // Validation
        if (!title || typeof title !== 'string') {
            await recordApiUsage(keyId, '/api/v1/posts', 'POST', 400)
            return NextResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Title is required' } },
                { status: 400 }
            )
        }

        if (!content || typeof content !== 'string') {
            await recordApiUsage(keyId, '/api/v1/posts', 'POST', 400)
            return NextResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Content is required' } },
                { status: 400 }
            )
        }

        // Get user's publication
        const supabase = createClient()
        const { data: publications } = await supabase
            .from('publications')
            .select('id, slug')
            .eq('owner_id', userId)
            .limit(1)

        if (!publications || publications.length === 0) {
            await recordApiUsage(keyId, '/api/v1/posts', 'POST', 400)
            return NextResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'No publication found. Create a publication first.' } },
                { status: 400 }
            )
        }

        const publication = publications[0]

        // Generate slug if not provided
        const generateSlug = (text: string) => {
            return text
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .slice(0, 80)
        }

        let finalSlug = slug || generateSlug(title)

        // Ensure unique slug
        const { data: existingPost } = await supabase
            .from('posts')
            .select('id')
            .eq('author_id', userId)
            .eq('slug', finalSlug)
            .limit(1)

        if (existingPost && existingPost.length > 0) {
            finalSlug = `${finalSlug}-${Date.now().toString(36)}`
        }

        // Create post
        const postData: any = {
            author_id: userId,
            publication_id: publication.id,
            title,
            content,
            content_html: content,
            content_type: contentType,
            slug: finalSlug,
            excerpt: excerpt || null,
            cover_image_url: coverImage || null,
            canonical_url: canonicalUrl || null,
            status,
            api_source: metadata.source || 'api',
            api_metadata: metadata,
        }

        if (status === 'published') {
            postData.published_at = publishedAt || new Date().toISOString()
        }

        const { data: post, error: postError } = await supabase
            .from('posts')
            .insert(postData)
            .select('id, slug, status, published_at')
            .single()

        if (postError || !post) {
            console.error('Post creation error:', postError)
            await recordApiUsage(keyId, '/api/v1/posts', 'POST', 500)
            return NextResponse.json(
                { error: { code: 'SERVER_ERROR', message: 'Failed to create post' } },
                { status: 500 }
            )
        }

        // Handle tags
        if (tags.length > 0) {
            await supabase.rpc('set_post_tags', {
                p_post_id: post.id,
                p_tag_names: tags,
            })
        }

        // Build post URL
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'neolog.com'
        const postUrl = `https://${baseUrl}/${publication.slug}/${post.slug}`

        // Record successful API usage
        await recordApiUsage(keyId, '/api/v1/posts', 'POST', 201)

        return NextResponse.json({
            id: post.id,
            slug: post.slug,
            url: postUrl,
            status: post.status,
            publishedAt: post.published_at,
        }, { status: 201 })

    } catch (error: any) {
        console.error('API error:', error)
        if (keyId) {
            await recordApiUsage(keyId, '/api/v1/posts', 'POST', 500)
        }
        return NextResponse.json(
            { error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' } },
            { status: 500 }
        )
    }
}

/**
 * List posts via API
 * GET /api/v1/posts
 */
export async function GET(request: NextRequest) {
    try {
        // Extract API key
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
            await recordApiUsage(keyId, '/api/v1/posts', 'GET', 429)
            return NextResponse.json(
                { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
                { status: 429 }
            )
        }

        // Get query params
        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status') || 'all'
        const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100)
        const offset = parseInt(searchParams.get('offset') || '0')

        // Build query
        const supabase = createClient()
        let query = supabase
            .from('posts')
            .select('id, title, slug, excerpt, status, published_at, created_at')
            .eq('author_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (status !== 'all') {
            query = query.eq('status', status)
        }

        const { data: posts, error } = await query

        if (error) {
            await recordApiUsage(keyId, '/api/v1/posts', 'GET', 500)
            return NextResponse.json(
                { error: { code: 'SERVER_ERROR', message: 'Failed to fetch posts' } },
                { status: 500 }
            )
        }

        await recordApiUsage(keyId, '/api/v1/posts', 'GET', 200)

        return NextResponse.json({
            posts: posts || [],
            pagination: {
                limit,
                offset,
                total: posts?.length || 0,
            }
        })

    } catch (error) {
        console.error('API error:', error)
        return NextResponse.json(
            { error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' } },
            { status: 500 }
        )
    }
}
