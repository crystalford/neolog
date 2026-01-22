/**
 * Hashnode API Integration
 * 
 * Publishes articles to Hashnode using their GraphQL API
 * Docs: https://apidocs.hashnode.com/
 */

const HASHNODE_API_URL = 'https://gql.hashnode.com'

export interface HashnodeArticle {
    title: string
    contentMarkdown: string
    tags: { name: string }[]
    publicationId: string
    canonicalUrl?: string
    coverImageOptions?: {
        coverImageURL: string
    }
}

export interface HashnodePostResponse {
    id: string
    url: string
    title: string
}

/**
 * Get Hashnode user info (to verify API key)
 */
export async function getHashnodeUser(apiKey: string) {
    const query = `
    query Me {
      me {
        id
        username
        name
        publications(first: 10) {
          edges {
            node {
              id
              title
            }
          }
        }
      }
    }
  `

    const response = await fetch(HASHNODE_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
    })

    if (!response.ok) {
        throw new Error('Invalid Hashnode API key')
    }

    const data = await response.json()

    if (data.errors) {
        throw new Error(data.errors[0]?.message || 'Invalid Hashnode API key')
    }

    return data.data.me
}

/**
 * Publish a post to Hashnode
 */
export async function publishToHashnode(
    article: {
        title: string
        content: string // markdown
        tags: string[]
        canonicalUrl: string
        coverImage?: string
    },
    apiKey: string,
    publicationId: string
): Promise<HashnodePostResponse> {
    const mutation = `
    mutation PublishPost($input: PublishPostInput!) {
      publishPost(input: $input) {
        post {
          id
          url
          title
        }
      }
    }
  `

    const variables = {
        input: {
            title: article.title,
            contentMarkdown: article.content,
            tags: article.tags.slice(0, 5).map(name => ({ name })),
            publicationId: publicationId,
            canonicalUrl: article.canonicalUrl,
            ...(article.coverImage && {
                coverImageOptions: {
                    coverImageURL: article.coverImage,
                },
            }),
        },
    }

    const response = await fetch(HASHNODE_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: mutation, variables }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.errors?.[0]?.message || `Hashnode API error: ${response.status}`)
    }

    const data = await response.json()

    if (data.errors) {
        throw new Error(data.errors[0]?.message || 'Failed to publish to Hashnode')
    }

    return data.data.publishPost.post
}
