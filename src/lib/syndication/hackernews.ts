/**
 * Hacker News API Integration
 * 
 * Submits links to Hacker News
 * Docs: https://github.com/HackerNews/API
 * 
 * Uses Firebase API (BYOK - user provides credentials)
 */

/**
 * Submit a link to Hacker News
 */
export async function submitToHackerNews(
    credentials: {
        username: string
        password: string
    },
    post: {
        title: string
        url: string
    }
): Promise<{ id: string; url: string }> {
    // Hacker News uses a form-based submission
    // We'll use their API endpoint
    const loginResponse = await fetch('https://news.ycombinator.com/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            acct: credentials.username,
            pw: credentials.password,
            goto: 'news',
        }),
    })

    if (!loginResponse.ok) {
        throw new Error('Failed to login to Hacker News')
    }

    // Extract cookie
    const cookies = loginResponse.headers.get('set-cookie')
    if (!cookies) {
        throw new Error('Failed to get Hacker News session')
    }

    // Submit story
    const submitResponse = await fetch('https://news.ycombinator.com/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookies,
        },
        body: new URLSearchParams({
            title: post.title,
            url: post.url,
        }),
    })

    if (!submitResponse.ok) {
        throw new Error('Failed to submit to Hacker News')
    }

    // HN doesn't return the submission ID directly
    // We'd need to parse the response or use their API
    // For now, return a placeholder
    const submissionUrl = 'https://news.ycombinator.com/newest'

    return {
        id: 'submitted',
        url: submissionUrl,
    }
}

/**
 * Verify Hacker News credentials
 */
export async function verifyHackerNewsCredentials(
    username: string,
    password: string
): Promise<{ username: string }> {
    const response = await fetch('https://news.ycombinator.com/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            acct: username,
            pw: password,
            goto: 'news',
        }),
    })

    if (!response.ok || response.url.includes('login')) {
        throw new Error('Invalid Hacker News credentials')
    }

    return { username }
}
