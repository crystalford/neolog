/**
 * X Protocol Integration
 * Handles authenticated social distribution for the Intelligence Terminal.
 * Optimized for Edge Runtime (Cloudflare Pages).
 */

export interface XCredentials {
  consumerKey: string
  consumerSecret: string
  accessToken: string
  accessSecret: string
}

/**
 * Get X credentials from environment variables.
 * In Cloudflare Pages, these must be defined in the Dashboard.
 */
export const getXCredentials = (): XCredentials | null => {
  const consumerKey = process.env.X_CONSUMER_KEY
  const consumerSecret = process.env.X_CONSUMER_SECRET
  const accessToken = process.env.X_ACCESS_TOKEN
  const accessSecret = process.env.X_ACCESS_SECRET

  if (!consumerKey || !consumerSecret || !accessToken || !accessSecret) {
    console.warn('X_CREDENTIALS_MISSING: Ensure X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, and X_ACCESS_SECRET are set.')
    return null
  }

  return { consumerKey, consumerSecret, accessToken, accessSecret }
}

/**
 * Post a status update directly to X using OAuth 1.0a (Raw fetch implementation for Edge)
 * Note: For simplicity and Edge compatibility, we use a standard fetch pattern.
 * If OAuth 1.0a signing is too complex for raw fetch, a lean library like 'oauth-1.0a' is recommended.
 */
export const postToX = async (content: string) => {
  const credentials = getXCredentials()
  if (!credentials) throw new Error('MISSING_X_CREDENTIALS')

  console.log('INITIATING_X_POST_PROTOCOL:', content.slice(0, 30) + '...')
  
  // Implementation Note: Real OAuth 1.0a signing requires crypto (HmacSHA1).
  // In the Edge Runtime, we use the Web Crypto API.
  
  // FOR NOW: We'll return a simulated success if credentials exist but signing is pending implementation,
  // or we can use a basic Bearer token if using X API v2 and OAuth 2.0 User Context.
  
  // If we have an OAUTH2 Bearer token (User Context), it's much simpler for Edge:
  const bearerToken = process.env.X_BEARER_TOKEN
  if (bearerToken) {
    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: content }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`X_API_ERROR: ${JSON.stringify(error)}`)
    }

    return await response.json()
  }

  throw new Error('X_AUTH_PROTOCOL_NOT_CONFIGURED: Set X_BEARER_TOKEN for OAuth 2.0')
}

/**
 * Legacy decryption utility (Stubbed for Edge compliance)
 */
export const decryptIntegrationKey = (encryptedKey: string, iv: string) => {
  return null
}
