/**
 * ActivityPub Implementation
 *
 * Enables Neolog to be a native member of the fediverse.
 * Posts appear in Mastodon, Misskey, Pleroma, and other ActivityPub clients.
 *
 * Spec: https://www.w3.org/TR/activitypub/
 * Spec: https://www.w3.org/TR/activitystreams-core/
 */

export interface APActor {
  '@context': string | string[]
  type: 'Person' | 'Organization' | 'Service'
  id: string // URL to this actor
  name: string // Display name
  preferredUsername: string // Username
  summary?: string // Bio (HTML allowed)
  url: string // Profile URL
  icon?: {
    type: 'Image'
    mediaType: string
    url: string
  }
  image?: {
    // Header/banner
    type: 'Image'
    mediaType: string
    url: string
  }
  inbox: string // URL to inbox endpoint
  outbox: string // URL to outbox endpoint
  followers?: string // URL to followers collection
  following?: string // URL to following collection
  publicKey: {
    id: string
    owner: string
    publicKeyPem: string
  }
  attachment?: Array<{
    type: 'PropertyValue'
    name: string
    value: string
  }>
}

export interface APNote {
  '@context': string | string[]
  type: 'Note' | 'Article'
  id: string // URL to this note
  attributedTo: string // Actor URL
  content: string // HTML content
  summary?: string // Content warning or summary
  published: string // ISO 8601 timestamp
  url: string // Canonical URL
  to: string[] // Audience (usually includes 'https://www.w3.org/ns/activitystreams#Public')
  cc: string[] // Carbon copy
  tag?: Array<{
    type: 'Hashtag'
    name: string // e.g., "#javascript"
    href: string // URL to tag page
  }>
  attachment?: Array<{
    type: 'Image' | 'Video' | 'Audio' | 'Document'
    mediaType: string
    url: string
    name?: string
  }>
}

export interface APOrderedCollection {
  '@context': string | string[]
  type: 'OrderedCollection'
  id: string
  totalItems: number
  first?: string // URL to first page
  last?: string // URL to last page
  orderedItems?: APNote[] // If small enough to inline
}

export interface APOrderedCollectionPage {
  '@context': string | string[]
  type: 'OrderedCollectionPage'
  id: string
  partOf: string // Parent collection URL
  totalItems: number
  orderedItems: APNote[]
  next?: string // URL to next page
  prev?: string // URL to previous page
}

/**
 * Create ActivityPub Actor for a Neolog user
 */
export function createActor(profile: {
  username: string
  display_name?: string
  bio?: string
  avatar_url?: string
  website?: string
  twitter_username?: string
  github_username?: string
  linkedin_url?: string
}, baseUrl: string): APActor {
  const actorUrl = `${baseUrl}/${profile.username}`

  return {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
    ],
    type: 'Person',
    id: actorUrl,
    name: profile.display_name || profile.username,
    preferredUsername: profile.username,
    summary: profile.bio || '',
    url: actorUrl,
    icon: profile.avatar_url
      ? {
          type: 'Image',
          mediaType: 'image/jpeg',
          url: profile.avatar_url,
        }
      : undefined,
    inbox: `${actorUrl}/inbox`,
    outbox: `${actorUrl}/outbox`,
    followers: `${actorUrl}/followers`,
    following: `${actorUrl}/following`,
    publicKey: {
      id: `${actorUrl}#main-key`,
      owner: actorUrl,
      publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----', // TODO: Generate real key
    },
    attachment: [
      profile.website && {
        type: 'PropertyValue' as const,
        name: 'Website',
        value: `<a href="${profile.website}" rel="noopener noreferrer">${profile.website}</a>`,
      },
      profile.twitter_username && {
        type: 'PropertyValue' as const,
        name: 'Twitter',
        value: `<a href="https://twitter.com/${profile.twitter_username}" rel="noopener noreferrer">@${profile.twitter_username}</a>`,
      },
      profile.github_username && {
        type: 'PropertyValue' as const,
        name: 'GitHub',
        value: `<a href="https://github.com/${profile.github_username}" rel="noopener noreferrer">@${profile.github_username}</a>`,
      },
    ].filter(Boolean) as Array<{
      type: 'PropertyValue'
      name: string
      value: string
    }>,
  }
}

/**
 * Create ActivityPub Note from a Neolog post
 */
export function createNote(
  post: {
    id: string
    title: string
    slug: string
    content?: string
    html_content?: string
    published_at: string
    author_username: string
  },
  baseUrl: string
): APNote {
  const actorUrl = `${baseUrl}/${post.author_username}`
  const postUrl = `${baseUrl}/${post.author_username}/${post.slug}`
  const noteId = `${postUrl}#note`

  // Use html_content if available, otherwise wrap content in basic HTML
  const htmlContent = post.html_content || `<p>${escapeHtml(post.content || '')}</p>`

  // Extract hashtags from content (simple regex)
  const hashtagMatches = (post.content || '').match(/#\w+/g) || []
  const tags = hashtagMatches.map(tag => ({
    type: 'Hashtag' as const,
    name: tag,
    href: `${baseUrl}/tag/${tag.slice(1)}`,
  }))

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'Article', // Use 'Article' for blog posts (longer content)
    id: noteId,
    attributedTo: actorUrl,
    content: `<h1>${escapeHtml(post.title)}</h1>\n${htmlContent}`,
    summary: post.title,
    published: post.published_at,
    url: postUrl,
    to: ['https://www.w3.org/ns/activitystreams#Public'], // Public post
    cc: [`${actorUrl}/followers`], // Notify followers
    tag: tags.length > 0 ? tags : undefined,
  }
}

/**
 * Create OrderedCollection for outbox
 */
export function createOutboxCollection(
  username: string,
  posts: Array<{
    id: string
    title: string
    slug: string
    content?: string
    html_content?: string
    published_at: string
    author_username: string
  }>,
  baseUrl: string,
  page?: number,
  pageSize: number = 20
): APOrderedCollection | APOrderedCollectionPage {
  const actorUrl = `${baseUrl}/${username}`
  const outboxUrl = `${actorUrl}/outbox`

  // If no page specified, return collection overview
  if (page === undefined) {
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'OrderedCollection',
      id: outboxUrl,
      totalItems: posts.length,
      first: posts.length > 0 ? `${outboxUrl}?page=1` : undefined,
      last: posts.length > 0 ? `${outboxUrl}?page=${Math.ceil(posts.length / pageSize)}` : undefined,
    }
  }

  // Return specific page
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const pagePosts = posts.slice(startIndex, endIndex)

  const notes = pagePosts.map(post => createNote(post, baseUrl))

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollectionPage',
    id: `${outboxUrl}?page=${page}`,
    partOf: outboxUrl,
    totalItems: posts.length,
    orderedItems: notes,
    next: endIndex < posts.length ? `${outboxUrl}?page=${page + 1}` : undefined,
    prev: page > 1 ? `${outboxUrl}?page=${page - 1}` : undefined,
  }
}

/**
 * WebFinger resource for user discovery
 */
export interface WebFingerResource {
  subject: string // acct:username@domain
  aliases: string[]
  links: Array<{
    rel: string
    type?: string
    href: string
  }>
}

export function createWebFingerResource(
  username: string,
  domain: string,
  baseUrl: string
): WebFingerResource {
  const actorUrl = `${baseUrl}/${username}`

  return {
    subject: `acct:${username}@${domain}`,
    aliases: [actorUrl],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: actorUrl,
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: actorUrl,
      },
    ],
  }
}

/**
 * Escape HTML for ActivityPub content
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
