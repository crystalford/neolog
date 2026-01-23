/**
 * Ghost API Integration
 * 
 * Publishes posts to Ghost blogs
 * Docs: https://ghost.org/docs/admin-api/
 * 
 * Uses Admin API (BYOK - user provides API key)
 */

import jwt from 'jsonwebtoken'

/**
 * Create a Ghost post
 */
export async function createGhostPost(
    config: {
        apiUrl: string // e.g., https://yourblog.ghost.io
        apiKey: string // Admin API key
    },
    post: {
        title: string
        content: string // HTML or Markdown
        excerpt?: string
        tags?: string[]
        coverImage?: string
        status?: 'published' | 'draft'
    }
): Promise<{ id: string; url: string }> {
    // Split API key into ID and secret
    const [id, secret] = config.apiKey.split(':')

    if (!id || !secret) {
        throw new Error('Invalid Ghost API key format')
    }

    // Create JWT token
    const token = jwt.sign(
        {},
        Buffer.from(secret, 'hex'),
        {
            keyid: id,
            algorithm: 'HS256',
            expiresIn: '5m',
            audience: '/admin/',
        }
    )

    // Create post
    const response = await fetch(`${config.apiUrl}/ghost/api/admin/posts/`, {
        method: 'POST',
        headers: {
            'Authorization': `Ghost ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            posts: [
                {
                    title: post.title,
                    html: post.content,
                    custom_excerpt: post.excerpt,
                    tags: post.tags?.map(tag => ({ name: tag })),
                    feature_image: post.coverImage,
                    status: post.status || 'published',
                },
            ],
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.errors?.[0]?.message || 'Failed to create Ghost post')
    }

    const data = await response.json()
    const createdPost = data.posts[0]

    return {
        id: createdPost.id,
        url: createdPost.url,
    }
}

/**
 * Verify Ghost API credentials
 */
export async function verifyGhostCredentials(
    apiUrl: string,
    apiKey: string
): Promise<{ title: string }> {
    const [id, secret] = apiKey.split(':')

    if (!id || !secret) {
        throw new Error('Invalid Ghost API key format')
    }

    const token = jwt.sign(
        {},
        Buffer.from(secret, 'hex'),
        {
            keyid: id,
            algorithm: 'HS256',
            expiresIn: '5m',
            audience: '/admin/',
        }
    )

    const response = await fetch(`${apiUrl}/ghost/api/admin/site/`, {
        headers: {
            'Authorization': `Ghost ${token}`,
        },
    })

    if (!response.ok) {
        throw new Error('Invalid Ghost API credentials')
    }

    const data = await response.json()

    return {
        title: data.site.title,
    }
}
