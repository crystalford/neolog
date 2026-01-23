/**
 * Twitter/X API Integration (BYOK - Bring Your Own Key)
 * 
 * Users provide their own Twitter API credentials
 * Docs: https://developer.twitter.com/en/docs/twitter-api
 * 
 * Uses Twitter API v2 with Bearer Token or OAuth 2.0
 */

const TWITTER_API_URL = 'https://api.twitter.com/2'

/**
 * Create a tweet
 */
export async function createTweet(
    credentials: {
        apiKey: string
        apiSecret: string
        accessToken: string
        accessSecret: string
    },
    text: string
): Promise<{ id: string; url: string }> {
    // For simplicity, we'll use OAuth 1.0a with user credentials
    // In production, you'd want to use OAuth 2.0 or App-only auth

    const oauth = require('oauth-1.0a')
    const crypto = require('crypto')

    const oauthClient = oauth({
        consumer: {
            key: credentials.apiKey,
            secret: credentials.apiSecret,
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string: string, key: string) {
            return crypto
                .createHmac('sha1', key)
                .update(base_string)
                .digest('base64')
        },
    })

    const requestData = {
        url: `${TWITTER_API_URL}/tweets`,
        method: 'POST',
    }

    const token = {
        key: credentials.accessToken,
        secret: credentials.accessSecret,
    }

    const authHeader = oauthClient.toHeader(oauthClient.authorize(requestData, token))

    const response = await fetch(`${TWITTER_API_URL}/tweets`, {
        method: 'POST',
        headers: {
            ...authHeader,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: text.substring(0, 280), // Twitter character limit
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || error.title || 'Failed to create tweet')
    }

    const data = await response.json()

    // Get username for URL (would need separate API call in real implementation)
    const tweetUrl = `https://twitter.com/i/web/status/${data.data.id}`

    return {
        id: data.data.id,
        url: tweetUrl,
    }
}

/**
 * Verify Twitter credentials
 */
export async function verifyTwitterCredentials(credentials: {
    apiKey: string
    apiSecret: string
    accessToken: string
    accessSecret: string
}): Promise<{ username: string; id: string }> {
    const oauth = require('oauth-1.0a')
    const crypto = require('crypto')

    const oauthClient = oauth({
        consumer: {
            key: credentials.apiKey,
            secret: credentials.apiSecret,
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string: string, key: string) {
            return crypto
                .createHmac('sha1', key)
                .update(base_string)
                .digest('base64')
        },
    })

    const requestData = {
        url: `${TWITTER_API_URL}/users/me`,
        method: 'GET',
    }

    const token = {
        key: credentials.accessToken,
        secret: credentials.accessSecret,
    }

    const authHeader = oauthClient.toHeader(oauthClient.authorize(requestData, token))

    const response = await fetch(`${TWITTER_API_URL}/users/me`, {
        method: 'GET',
        headers: authHeader,
    })

    if (!response.ok) {
        throw new Error('Invalid Twitter credentials')
    }

    const data = await response.json()

    return {
        username: data.data.username,
        id: data.data.id,
    }
}
