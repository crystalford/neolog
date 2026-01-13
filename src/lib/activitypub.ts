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
  orderedItems?: Array<APNote | APCreateActivity> // If small enough to inline
}

export interface APOrderedCollectionPage {
  '@context': string | string[]
  type: 'OrderedCollectionPage'
  id: string
  partOf: string // Parent collection URL
  totalItems: number
  orderedItems: Array<APNote | APCreateActivity>
  next?: string // URL to next page
  prev?: string // URL to previous page
}

export interface APCreateActivity {
  '@context': string | string[]
  type: 'Create'
  id: string
  actor: string
  published: string
  to: string[]
  cc: string[]
  object: APNote
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
  public_key_pem?: string
}, baseUrl: string): APActor {
  const actorUrl = `${baseUrl}/${profile.username}`
  const inboxUrl = `${baseUrl}/api/activitypub/${profile.username}/inbox`
  const outboxUrl = `${baseUrl}/api/activitypub/${profile.username}/outbox`
  const publicKeyPem = profile.public_key_pem || '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'

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
    inbox: inboxUrl,
    outbox: outboxUrl,
    publicKey: {
      id: `${actorUrl}#main-key`,
      owner: actorUrl,
      publicKeyPem,
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

export function createPublicationActor(
  publication: {
    slug: string
    name: string
    description?: string | null
    logo_url?: string | null
    website_url?: string | null
    twitter_url?: string | null
    github_url?: string | null
    public_key_pem?: string
  },
  baseUrl: string
): APActor {
  const actorUrl = `${baseUrl}/api/activitypub/publications/${publication.slug}`
  const inboxUrl = `${baseUrl}/api/activitypub/publications/${publication.slug}/inbox`
  const outboxUrl = `${baseUrl}/api/activitypub/publications/${publication.slug}/outbox`
  const publicKeyPem = publication.public_key_pem || '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'

  const extractHandle = (value: string | null | undefined, prefix: string) => {
    if (!value) return null
    return value.replace(new RegExp(`^https?:\\/\\/(www\\.)?${prefix}\\/`, 'i'), '')
  }

  const twitterHandle = extractHandle(publication.twitter_url, 'twitter.com')
  const githubHandle = extractHandle(publication.github_url, 'github.com')

  return {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
    ],
    type: 'Organization',
    id: actorUrl,
    name: publication.name,
    preferredUsername: publication.slug,
    summary: publication.description || '',
    url: `${baseUrl}/${publication.slug}`,
    icon: publication.logo_url
      ? {
          type: 'Image',
          mediaType: 'image/jpeg',
          url: publication.logo_url,
        }
      : undefined,
    inbox: inboxUrl,
    outbox: outboxUrl,
    followers: `${actorUrl}/followers`,
    following: `${actorUrl}/following`,
    publicKey: {
      id: `${actorUrl}#main-key`,
      owner: actorUrl,
      publicKeyPem,
    },
    attachment: [
      publication.website_url && {
        type: 'PropertyValue' as const,
        name: 'Website',
        value: `<a href="${publication.website_url}" rel="noopener noreferrer">${publication.website_url}</a>`,
      },
      twitterHandle && {
        type: 'PropertyValue' as const,
        name: 'Twitter',
        value: `<a href="https://twitter.com/${twitterHandle}" rel="noopener noreferrer">@${twitterHandle}</a>`,
      },
      githubHandle && {
        type: 'PropertyValue' as const,
        name: 'GitHub',
        value: `<a href="https://github.com/${githubHandle}" rel="noopener noreferrer">@${githubHandle}</a>`,
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
    content_html?: string
    published_at: string
    author_username: string
  },
  baseUrl: string
): APNote {
  const actorUrl = `${baseUrl}/${post.author_username}`
  const postUrl = `${baseUrl}/${post.author_username}/${post.slug}`
  const noteId = `${postUrl}#note`

  // Use content_html if available, otherwise wrap content in basic HTML
  const htmlContent = post.content_html || `<p>${escapeHtml(post.content || '')}</p>`

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

export function createNoteForActor(
  post: {
    id: string
    title: string
    slug: string
    content?: string
    content_html?: string
    published_at: string
    author_username: string
  },
  baseUrl: string,
  actorUrl: string
): APNote {
  const postUrl = `${baseUrl}/${post.author_username}/${post.slug}`
  const noteId = `${postUrl}#note`

  const htmlContent = post.content_html || `<p>${escapeHtml(post.content || '')}</p>`
  const hashtagMatches = (post.content || '').match(/#\w+/g) || []
  const tags = hashtagMatches.map(tag => ({
    type: 'Hashtag' as const,
    name: tag,
    href: `${baseUrl}/tag/${tag.slice(1)}`,
  }))

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'Article',
    id: noteId,
    attributedTo: actorUrl,
    content: `<h1>${escapeHtml(post.title)}</h1>\n${htmlContent}`,
    summary: post.title,
    published: post.published_at,
    url: postUrl,
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    cc: [`${actorUrl}/followers`],
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
    content_html?: string
    published_at: string
    author_username: string
  }>,
  baseUrl: string,
  page?: number,
  pageSize: number = 20
): APOrderedCollection | APOrderedCollectionPage {
  const outboxUrl = `${baseUrl}/api/activitypub/${username}/outbox`

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

export function createOutboxCollectionForActor(
  actorUrl: string,
  posts: Array<{
    id: string
    title: string
    slug: string
    content?: string
    content_html?: string
    published_at: string
    author_username: string
  }>,
  baseUrl: string,
  outboxUrl: string,
  page?: number,
  pageSize: number = 20
): APOrderedCollection | APOrderedCollectionPage {
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

  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const pagePosts = posts.slice(startIndex, endIndex)

  const notes = pagePosts.map(post => createNoteForActor(post, baseUrl, actorUrl))

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

export function createWebFingerResourceForActor(
  subject: string,
  actorUrl: string,
  profileUrl: string
): WebFingerResource {
  return {
    subject,
    aliases: [actorUrl, profileUrl],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: actorUrl,
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: profileUrl,
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
