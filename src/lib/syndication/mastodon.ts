/**
 * Mastodon API Integration (BYOK - Bring Your Own Key)
 * 
 * Users provide their instance URL and access token
 * Docs: https://docs.joinmastodon.org/api/
 * 
 * Each Mastodon instance has its own API
 */

/**
 * Create a status (post) on Mastodon
 */
export async function createMastodonStatus(
    instance: string, // e.g., "mastodon.social"
    accessToken: string,
    text: string
): Promise<{ id: string; url: string }> {
    const apiUrl = `https://${instance}/api/v1/statuses`

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            status: text.substring(0, 500), // Mastodon default limit
            visibility: 'public',
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to create Mastodon status')
    }

    const data = await response.json()

    return {
        id: data.id,
        url: data.url,
    }
}

/**
 * Verify Mastodon credentials
 */
export async function verifyMastodonCredentials(
    instance: string,
    accessToken: string
): Promise<{ username: string; id: string }> {
    const apiUrl = `https://${instance}/api/v1/accounts/verify_credentials`

    const response = await fetch(apiUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    })

    if (!response.ok) {
        throw new Error('Invalid Mastodon credentials')
    }

    const data = await response.json()

    return {
        username: data.username,
        id: data.id,
    }
}

/**
 * Get Mastodon app credentials (for OAuth flow)
 * This creates an app on the user's instance
 */
export async function registerMastodonApp(
    instance: string,
    appName: string = 'Neolog'
): Promise<{
    clientId: string
    clientSecret: string
}> {
    const apiUrl = `https://${instance}/api/v1/apps`
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/syndication/mastodon/callback`

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_name: appName,
            redirect_uris: redirectUri,
            scopes: 'read write',
            website: process.env.NEXT_PUBLIC_SITE_URL,
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to register Mastodon app')
    }

    const data = await response.json()

    return {
        clientId: data.client_id,
        clientSecret: data.client_secret,
    }
}
