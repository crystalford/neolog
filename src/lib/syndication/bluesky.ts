/**
 * Bluesky API Integration
 * 
 * Publishes posts to Bluesky using the AT Protocol
 * Docs: https://docs.bsky.app/docs/api/
 * 
 * Uses app passwords for authentication (simpler than OAuth)
 */

const BLUESKY_API_URL = 'https://bsky.social'

export interface BlueskySession {
    accessJwt: string
    refreshJwt: string
    handle: string
    did: string
}

export interface BlueskyPost {
    uri: string
    cid: string
    url: string
}

/**
 * Create a session with Bluesky
 */
export async function createBlueskySession(
    identifier: string, // username or email
    password: string // app password
): Promise<BlueskySession> {
    const response = await fetch(`${BLUESKY_API_URL}/xrpc/com.atproto.server.createSession`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            identifier,
            password,
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Failed to authenticate with Bluesky')
    }

    return await response.json()
}

/**
 * Create a post on Bluesky
 */
export async function createBlueskyPost(
    credentials: { identifier: string; password: string },
    post: {
        text: string
        url?: string
    }
): Promise<BlueskyPost> {
    // Create session
    const session = await createBlueskySession(credentials.identifier, credentials.password)

    // Build post text (max 300 chars)
    let postText = post.text
    if (postText.length > 300) {
        postText = postText.substring(0, 297) + '...'
    }

    // Add URL if provided
    if (post.url) {
        postText += `\n\n${post.url}`
    }

    // Detect facets (links, mentions, etc.)
    const facets = []
    if (post.url) {
        const urlStart = postText.lastIndexOf(post.url)
        facets.push({
            index: {
                byteStart: urlStart,
                byteEnd: urlStart + post.url.length,
            },
            features: [
                {
                    $type: 'app.bsky.richtext.facet#link',
                    uri: post.url,
                },
            ],
        })
    }

    // Create post
    const response = await fetch(`${BLUESKY_API_URL}/xrpc/com.atproto.repo.createRecord`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.accessJwt}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            repo: session.did,
            collection: 'app.bsky.feed.post',
            record: {
                $type: 'app.bsky.feed.post',
                text: postText,
                facets: facets.length > 0 ? facets : undefined,
                createdAt: new Date().toISOString(),
            },
        }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Failed to create Bluesky post')
    }

    const data = await response.json()

    // Build post URL
    const postUrl = `https://bsky.app/profile/${session.handle}/post/${data.uri.split('/').pop()}`

    return {
        uri: data.uri,
        cid: data.cid,
        url: postUrl,
    }
}

/**
 * Verify Bluesky credentials
 */
export async function verifyBlueskyCredentials(
    identifier: string,
    password: string
): Promise<{ handle: string; did: string }> {
    const session = await createBlueskySession(identifier, password)
    return {
        handle: session.handle,
        did: session.did,
    }
}
