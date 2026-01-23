/**
 * Reddit API Integration
 * 
 * Publishes links to Reddit subreddits
 * Docs: https://www.reddit.com/dev/api/
 * 
 * Uses OAuth 2.0 for authentication
 */

const REDDIT_API_URL = 'https://oauth.reddit.com'
const REDDIT_AUTH_URL = 'https://www.reddit.com'

/**
 * Get Reddit OAuth authorization URL
 */
export function getRedditAuthUrl(state: string): string {
    const clientId = process.env.REDDIT_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/syndication/reddit/callback`

    if (!clientId) {
        throw new Error('Missing Reddit client ID')
    }

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        state,
        redirect_uri: redirectUri,
        duration: 'permanent', // Get refresh token
        scope: 'submit,read,mysubreddits',
    })

    return `${REDDIT_AUTH_URL}/api/v1/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeRedditCode(code: string): Promise<{
    accessToken: string
    refreshToken: string
    expiresIn: number
}> {
    const clientId = process.env.REDDIT_CLIENT_ID
    const clientSecret = process.env.REDDIT_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/syndication/reddit/callback`

    if (!clientId || !clientSecret) {
        throw new Error('Missing Reddit OAuth credentials')
    }

    const response = await fetch(`${REDDIT_AUTH_URL}/api/v1/access_token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error_description || 'Failed to exchange Reddit code')
    }

    const data = await response.json()

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
    }
}

/**
 * Get Reddit user info
 */
export async function getRedditUser(accessToken: string): Promise<{
    name: string
    id: string
}> {
    const response = await fetch(`${REDDIT_API_URL}/api/v1/me`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Neolog/1.0',
        },
    })

    if (!response.ok) {
        throw new Error('Failed to get Reddit user')
    }

    const data = await response.json()

    return {
        name: data.name,
        id: data.id,
    }
}

/**
 * Submit a link to a subreddit
 */
export async function submitRedditLink(
    accessToken: string,
    subreddit: string,
    title: string,
    url: string
): Promise<{ id: string; url: string }> {
    const response = await fetch(`${REDDIT_API_URL}/api/submit`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Neolog/1.0',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sr: subreddit,
            kind: 'link',
            title,
            url,
            resubmit: 'true',
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Failed to submit to Reddit')
    }

    const data = await response.json()

    if (data.json?.errors && data.json.errors.length > 0) {
        throw new Error(data.json.errors[0][1])
    }

    const postUrl = data.json?.data?.url || ''
    const postId = data.json?.data?.id || ''

    return {
        id: postId,
        url: postUrl,
    }
}

/**
 * Get user's subreddits
 */
export async function getUserSubreddits(accessToken: string): Promise<Array<{
    name: string
    displayName: string
    subscribers: number
}>> {
    const response = await fetch(`${REDDIT_API_URL}/subreddits/mine/subscriber?limit=100`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Neolog/1.0',
        },
    })

    if (!response.ok) {
        throw new Error('Failed to get subreddits')
    }

    const data = await response.json()

    return data.data.children.map((child: any) => ({
        name: child.data.display_name,
        displayName: child.data.display_name_prefixed,
        subscribers: child.data.subscribers,
    }))
}
