type MediumMeResponse = {
  data?: {
    id?: string
  }
}

type MediumCreatePostResponse = {
  data?: {
    id?: string
    url?: string
  }
}

type DevtoCreateArticleResponse = {
  id?: number
  url?: string
}

export async function postToMedium(args: {
  token: string
  title: string
  html: string
  canonicalUrl: string
  publishStatus?: 'public' | 'draft' | 'unlisted'
}): Promise<{ externalId: string | null; externalUrl: string | null; raw: any }> {
  const publishStatus = args.publishStatus || 'public'

  const meResp = await fetch('https://api.medium.com/v1/me', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${args.token}`,
    },
  })

  if (!meResp.ok) {
    throw new Error('Medium auth failed.')
  }

  const meJson = (await meResp.json().catch(() => ({}))) as MediumMeResponse
  const userId = meJson?.data?.id
  if (!userId) {
    throw new Error('Medium user not found.')
  }

  const createResp = await fetch(`https://api.medium.com/v1/users/${encodeURIComponent(userId)}/posts`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify({
      title: args.title,
      contentFormat: 'html',
      content: args.html,
      canonicalUrl: args.canonicalUrl,
      publishStatus,
    }),
  })

  const createJson = (await createResp.json().catch(() => ({}))) as MediumCreatePostResponse

  if (!createResp.ok) {
    throw new Error('Medium post failed.')
  }

  return {
    externalId: createJson?.data?.id || null,
    externalUrl: createJson?.data?.url || null,
    raw: createJson,
  }
}

export async function postToDevto(args: {
  apiKey: string
  title: string
  bodyMarkdown: string
  canonicalUrl: string
  published?: boolean
}): Promise<{ externalId: string | null; externalUrl: string | null; raw: any }> {
  const published = args.published !== false

  const resp = await fetch('https://dev.to/api/articles', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.forem.api-v1+json',
      'Content-Type': 'application/json',
      'api-key': args.apiKey,
    },
    body: JSON.stringify({
      article: {
        title: args.title,
        body_markdown: args.bodyMarkdown,
        canonical_url: args.canonicalUrl,
        published,
      },
    }),
  })

  const json = (await resp.json().catch(() => ({}))) as DevtoCreateArticleResponse

  if (!resp.ok) {
    throw new Error('Dev.to post failed.')
  }

  return {
    externalId: typeof json?.id === 'number' ? String(json.id) : null,
    externalUrl: typeof json?.url === 'string' ? json.url : null,
    raw: json,
  }
}
