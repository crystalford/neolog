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
            .select('platform, access_token, platform_metadata')
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
                } else if (connection.platform === 'hashnode') {
                    const { publishToHashnode } = await import('@/lib/syndication/hashnode')

                    // Extract API key and publication ID from stored token
                    const [apiKey, publicationId] = connection.access_token.split('|||')

                    if (!apiKey || !publicationId) {
                        throw new Error('Invalid Hashnode connection data')
                    }

                    const result = await publishToHashnode(
                        {
                            title: post.title,
                            content: post.content || '',
                            tags,
                            canonicalUrl,
                            coverImage: post.cover_image_url || undefined,
                        },
                        apiKey,
                        publicationId
                    )
                    platformPostId = result.id
                    platformUrl = result.url
                } else if (connection.platform === 'linkedin') {
                    const { publishToLinkedIn } = await import('@/lib/syndication/linkedin')

                    // Get platform user ID from connection
                    const { data: conn } = await supabase
                        .from('syndication_connections')
                        .select('platform_user_id')
                        .eq('user_id', session.user.id)
                        .eq('platform', 'linkedin')
                        .single()

                    if (!conn?.platform_user_id) {
                        throw new Error('LinkedIn user ID not found')
                    }

                    const result = await publishToLinkedIn(
                        {
                            title: post.title,
                            excerpt: post.excerpt || post.title,
                            url: canonicalUrl,
                            coverImage: post.cover_image_url || undefined,
                        },
                        connection.access_token,
                        conn.platform_user_id
                    )
                    platformPostId = result.id
                    platformUrl = result.url
                } else if (connection.platform === 'bluesky') {
                    const { createBlueskyPost } = await import('@/lib/syndication/bluesky')

                    // Extract credentials from stored token
                    const [identifier, password] = connection.access_token.split('|||')

                    if (!identifier || !password) {
                        throw new Error('Invalid Bluesky connection data')
                    }

                    const postText = post.excerpt
                        ? `${post.title}\n\n${post.excerpt}`
                        : post.title

                    const result = await createBlueskyPost(
                        { identifier, password },
                        {
                            text: postText,
                            url: canonicalUrl,
                        }
                    )
                    platformPostId = result.uri
                    platformUrl = result.url
                } else if (connection.platform === 'reddit') {
                    const { submitRedditLink } = await import('@/lib/syndication/reddit')

                    // Extract access token and refresh token
                    const [accessToken] = connection.access_token.split('|||')

                    // Get subreddit from metadata (user would select this in UI)
                    const subreddit = connection.platform_metadata?.subreddit || 'test'

                    const result = await submitRedditLink(
                        accessToken,
                        subreddit,
                        post.title,
                        canonicalUrl
                    )
                    platformPostId = result.id
                    platformUrl = result.url
                } else if (connection.platform === 'twitter') {
                    const { createTweet } = await import('@/lib/syndication/twitter')

                    // Extract Twitter credentials
                    const [apiKey, apiSecret, accessToken, accessSecret] = connection.access_token.split('|||')

                    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
                        throw new Error('Invalid Twitter connection data')
                    }

                    const tweetText = post.excerpt
                        ? `${post.title}\n\n${post.excerpt}\n\n${canonicalUrl}`
                        : `${post.title}\n\n${canonicalUrl}`

                    const result = await createTweet(
                        { apiKey, apiSecret, accessToken, accessSecret },
                        tweetText
                    )
                    platformPostId = result.id
                    platformUrl = result.url
                } else if (connection.platform === 'mastodon') {
                    const { createMastodonStatus } = await import('@/lib/syndication/mastodon')

                    // Extract instance and access token
                    const [instance, accessToken] = connection.access_token.split('|||')

                    if (!instance || !accessToken) {
                        throw new Error('Invalid Mastodon connection data')
                    }

                    const statusText = post.excerpt
                        ? `${post.title}\n\n${post.excerpt}\n\n${canonicalUrl}`
                        : `${post.title}\n\n${canonicalUrl}`

                    const result = await createMastodonStatus(
                        instance,
                        accessToken,
                        statusText
                    )
                    platformPostId = result.id
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
