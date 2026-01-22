import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { publishToDevTo } from '@/lib/syndication/devto'

/**
 * Publish a post to selected platforms
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { postId, platforms } = await request.json()

        if (!postId || !Array.isArray(platforms) || platforms.length === 0) {
            return NextResponse.json(
                { error: 'Post ID and platforms are required' },
                { status: 400 }
            )
        }

        // Get post details
        const { data: post, error: postError } = await supabase
            .from('posts')
            .select('id, title, content, excerpt, cover_image_url, slug, publication_id, publication:publications(slug)')
            .eq('id', postId)
            .eq('author_id', session.user.id)
            .single()

        if (postError || !post) {
            return NextResponse.json(
                { error: 'Post not found' },
                { status: 404 }
            )
        }

        // Get post tags
        const { data: tagRows } = await supabase
            .from('post_tags')
            .select('tag:tags(name)')
            .eq('post_id', postId)

        const tags = (tagRows || []).map((row: any) => row.tag?.name).filter(Boolean)

        // Build canonical URL
        const publicationSlug = (post.publication as any)?.slug
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'neolog.com'
        const canonicalUrl = `https://${baseUrl}/${publicationSlug}/${post.slug}`

        // Get user's connections
        const { data: connections } = await supabase
            .from('syndication_connections')
            .select('platform, access_token')
            .eq('user_id', session.user.id)
            .eq('is_active', true)
            .in('platform', platforms)

        if (!connections || connections.length === 0) {
            return NextResponse.json(
                { error: 'No active connections for selected platforms' },
                { status: 400 }
            )
        }

        const results = []

        // Publish to each platform
        for (const connection of connections) {
            try {
                let platformPostId: string | null = null
                let platformUrl: string | null = null

                if (connection.platform === 'devto') {
                    const result = await publishToDevTo(
                        {
                            title: post.title,
                            content: post.content || '',
                            tags,
                            canonicalUrl,
                            excerpt: post.excerpt || undefined,
                            coverImage: post.cover_image_url || undefined,
                        },
                        connection.access_token
                    )
                    platformPostId = result.id.toString()
                    platformUrl = result.url
                }

                // Record syndication
                await supabase
                    .from('syndication_posts')
                    .upsert({
                        post_id: postId,
                        platform: connection.platform,
                        platform_post_id: platformPostId,
                        platform_url: platformUrl,
                        status: 'published',
                        published_at: new Date().toISOString(),
                    }, {
                        onConflict: 'post_id,platform'
                    })

                results.push({
                    platform: connection.platform,
                    status: 'published',
                    url: platformUrl,
                })
            } catch (error: any) {
                console.error(`${connection.platform} publish error:`, error)

                // Record failure
                await supabase
                    .from('syndication_posts')
                    .upsert({
                        post_id: postId,
                        platform: connection.platform,
                        status: 'failed',
                        error_message: error.message,
                    }, {
                        onConflict: 'post_id,platform'
                    })

                results.push({
                    platform: connection.platform,
                    status: 'failed',
                    error: error.message,
                })
            }
        }

        return NextResponse.json({ results })
    } catch (error) {
        console.error('Publish error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
