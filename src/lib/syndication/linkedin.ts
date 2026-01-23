/**
 * LinkedIn API Integration
 * 
 * Publishes articles to LinkedIn using their REST API
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/posts-api
 * 
 * Requires OAuth 2.0 authentication
 */

const LINKEDIN_API_URL = 'https://api.linkedin.com/v2'

export interface LinkedInPost {
    author: string // urn:li:person:{personId}
    lifecycleState: 'PUBLISHED' | 'DRAFT'
    specificContent: {
        'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
                text: string
            }
            shareMediaCategory: 'ARTICLE' | 'NONE'
            media?: Array<{
                status: 'READY'
                description: {
                    text: string
                }
                originalUrl: string
                title: {
                    text: string
                }
            }>
        }
    }
    visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' | 'CONNECTIONS'
    }
}

/**
 * Get LinkedIn user profile (to verify token and get person ID)
 */
export async function getLinkedInUser(accessToken: string) {
    const response = await fetch(`${LINKEDIN_API_URL}/me`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error('Invalid LinkedIn access token')
    }

    return await response.json()
}

/**
 * Publish a post to LinkedIn
 */
export async function publishToLinkedIn(
    article: {
        title: string
        excerpt: string
        url: string
        coverImage?: string
    },
    accessToken: string,
    personId: string
): Promise<{ id: string; url: string }> {
    const author = `urn:li:person:${personId}`

    // LinkedIn post with article link
    const payload: LinkedInPost = {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                    text: article.excerpt || article.title,
                },
                shareMediaCategory: 'ARTICLE',
                media: [
                    {
                        status: 'READY',
                        description: {
                            text: article.excerpt || '',
                        },
                        originalUrl: article.url,
                        title: {
                            text: article.title,
                        },
                    },
                ],
            },
        },
        visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
    }

    const response = await fetch(`${LINKEDIN_API_URL}/ugcPosts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || `LinkedIn API error: ${response.status}`)
    }

    const data = await response.json()

    // LinkedIn returns the post ID in the response
    const postId = data.id
    const postUrl = `https://www.linkedin.com/feed/update/${postId}`

    return {
        id: postId,
        url: postUrl,
    }
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeLinkedInCode(code: string) {
    const clientId = process.env.LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/syndication/linkedin/callback`

    if (!clientId || !clientSecret) {
        throw new Error('Missing LinkedIn OAuth credentials')
    }

    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error_description || 'Failed to exchange LinkedIn code')
    }

    const data = await response.json()

    return {
        accessToken: data.access_token,
        expiresIn: data.expires_in, // seconds
    }
}

/**
 * Get LinkedIn OAuth authorization URL
 */
export function getLinkedInAuthUrl(state: string) {
    const clientId = process.env.LINKEDIN_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/syndication/linkedin/callback`

    if (!clientId) {
        throw new Error('Missing LinkedIn client ID')
    }

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        scope: 'r_liteprofile w_member_social', // Read profile, write posts
    })

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
}
