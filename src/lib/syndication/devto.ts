/**
 * Dev.to API Integration
 * 
 * Publishes articles to Dev.to using their REST API
 * Docs: https://developers.forem.com/api/
 */

export interface DevToArticle {
    title: string
    body_markdown: string
    published: boolean
    tags?: string[]
    canonical_url?: string
    description?: string
    cover_image?: string
}

export interface DevToResponse {
    id: number
    url: string
    title: string
    published_at: string
}

/**
 * Publish an article to Dev.to
 */
export async function publishToDevTo(
    article: {
        title: string
        content: string // markdown
        tags: string[]
        canonicalUrl: string
        excerpt?: string
        coverImage?: string
    },
    apiKey: string
): Promise<DevToResponse> {
    const payload: DevToArticle = {
        title: article.title,
        body_markdown: article.content,
        published: true,
        tags: article.tags.slice(0, 4), // Dev.to allows max 4 tags
        canonical_url: article.canonicalUrl,
        description: article.excerpt,
        cover_image: article.coverImage,
    }

    const response = await fetch('https://dev.to/api/articles', {
        method: 'POST',
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ article: payload }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || `Dev.to API error: ${response.status}`)
    }

    return response.json()
}

/**
 * Get user info from Dev.to (to verify API key)
 */
export async function getDevToUser(apiKey: string) {
    const response = await fetch('https://dev.to/api/users/me', {
        headers: {
            'api-key': apiKey,
        },
    })

    if (!response.ok) {
        throw new Error('Invalid Dev.to API key')
    }

    return response.json()
}

/**
 * Update an existing Dev.to article
 */
export async function updateDevToArticle(
    articleId: number,
    article: {
        title: string
        content: string
        tags: string[]
        canonicalUrl: string
        excerpt?: string
        coverImage?: string
    },
    apiKey: string
): Promise<DevToResponse> {
    const payload: DevToArticle = {
        title: article.title,
        body_markdown: article.content,
        published: true,
        tags: article.tags.slice(0, 4),
        canonical_url: article.canonicalUrl,
        description: article.excerpt,
        cover_image: article.coverImage,
    }

    const response = await fetch(`https://dev.to/api/articles/${articleId}`, {
        method: 'PUT',
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ article: payload }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || `Dev.to API error: ${response.status}`)
    }

    return response.json()
}
