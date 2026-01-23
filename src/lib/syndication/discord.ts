/**
 * Discord Webhook Integration
 * 
 * Posts to Discord channels via webhooks
 * Docs: https://discord.com/developers/docs/resources/webhook
 * 
 * Uses webhook URLs (BYOK - user provides webhook)
 */

/**
 * Post to Discord via webhook
 */
export async function postToDiscord(
    webhookUrl: string,
    post: {
        title: string
        excerpt?: string
        url: string
        coverImage?: string
    }
): Promise<{ id: string; url: string }> {
    // Build Discord embed
    const embed: any = {
        title: post.title,
        description: post.excerpt || '',
        url: post.url,
        color: 5814783, // Neolog brand color
        timestamp: new Date().toISOString(),
    }

    if (post.coverImage) {
        embed.image = { url: post.coverImage }
    }

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            embeds: [embed],
        }),
    })

    if (!response.ok) {
        const error = await response.text().catch(() => '')
        throw new Error(error || 'Failed to post to Discord')
    }

    // Discord webhooks don't return message ID in response
    // Extract from webhook URL for tracking
    const webhookId = webhookUrl.split('/').slice(-2, -1)[0]

    return {
        id: webhookId,
        url: webhookUrl, // Can't get actual message URL without bot
    }
}

/**
 * Verify Discord webhook
 */
export async function verifyDiscordWebhook(webhookUrl: string): Promise<{
    name: string
    channelId: string
}> {
    const response = await fetch(webhookUrl)

    if (!response.ok) {
        throw new Error('Invalid Discord webhook URL')
    }

    const data = await response.json()

    return {
        name: data.name,
        channelId: data.channel_id,
    }
}
