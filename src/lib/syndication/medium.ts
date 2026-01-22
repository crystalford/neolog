/**
 * Medium API Integration
 * 
 * Publishes articles to Medium using their REST API
 * Docs: https://github.com/Medium/medium-api-docs
 * 
 * Requires OAuth 2.0 authentication
 */

const MEDIUM_API_URL = 'https://api.medium.com/v1'

export interface MediumPost {
    title: string
    contentFormat: 'html' | 'markdown'
    content: string
    tags?: string[]
    canonicalUrl?: string
    publishStatus: 'public' | 'draft' | 'unlisted'
}

export interface MediumPostResponse {
    id: string
    title: string
    authorId: string
    url: string
    canonicalUrl: string
    publishStatus: string
    publishedAt: number
    license: string
    licenseUrl: string
}

/**
 * Get Medium user info (to verify token and get user ID)
 */
export async function getMediumUser(accessToken: string) {
    const response = await fetch(`${MEDIUM_API_URL}/me`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error('Invalid Medium access token')
    }

    const data = await response.json()
    return data.data // Medium wraps response in { data: {...} }
}

/**
 * Publish a post to Medium
 */
export async function publishToMedium(
    article: {
        title: string
        content: string // HTML
        tags: string[]
        canonicalUrl: string
    },
    accessToken: string,
    userId: string
): Promise<MediumPostResponse> {
    const payload: MediumPost = {
        title: article.title,
        contentFormat: 'html',
        content: article.content,
        tags: article.tags.slice(0, 5), // Medium allows max 5 tags
        canonicalUrl: article.canonicalUrl,
        publishStatus: 'public',
    }

    const response = await fetch(`${MEDIUM_API_URL}/users/${userId}/posts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.errors?.[0]?.message || `Medium API error: ${response.status}`)
    }

    const data = await response.json()
    return data.data
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeMediumCode(code: string) {
    const clientId = process.env.MEDIUM_CLIENT_ID
    const clientSecret = process.env.MEDIUM_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/syndication/medium/callback`

    if (!clientId || !clientSecret) {
        throw new Error('Missing Medium OAuth credentials')
    }

    const response = await fetch('https://api.medium.com/v1/tokens', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error_description || 'Failed to exchange Medium code')
    }

    const data = await response.json()
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : null,
    }
}

/**
 * Get Medium OAuth authorization URL
 */
export function getMediumAuthUrl(state: string) {
    const clientId = process.env.MEDIUM_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/syndication/medium/callback`

    if (!clientId) {
        throw new Error('Missing Medium client ID')
    }

    const params = new URLSearchParams({
        client_id: clientId,
        scope: 'basicProfile,publishPost',
        state,
        response_type: 'code',
        redirect_uri: redirectUri,
    })

    return `https://medium.com/m/oauth/authorize?${params.toString()}`
}
