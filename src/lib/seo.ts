import { Metadata } from 'next'

interface SEOProps {
  title: string
  description?: string
  image?: string
  url?: string
  type?: 'website' | 'article'
  author?: string
  publishedTime?: string
  modifiedTime?: string
  tags?: string[]
  noindex?: boolean
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

export function generateSEO({
  title,
  description = 'A publishing platform built for ideas that spread',
  image,
  url,
  type = 'website',
  author,
  publishedTime,
  modifiedTime,
  tags,
  noindex = false,
}: SEOProps): Metadata {
  const fullTitle = title.includes('Neolog') ? title : `${title} - Neolog`
  const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL
  const imageUrl = image || `${BASE_URL}/og-default.png`

  return {
    title: fullTitle,
    description,
    authors: author ? [{ name: author }] : undefined,
    keywords: tags,
    robots: noindex ? 'noindex, nofollow' : 'index, follow',
    alternates: {
      canonical: fullUrl,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: fullUrl,
      siteName: 'Neolog',
      type,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      ...(type === 'article' && {
        article: {
          publishedTime,
          modifiedTime,
          authors: author ? [author] : undefined,
          tags,
        },
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [imageUrl],
      creator: author ? `@${author}` : undefined,
    },
  }
}

// Generate JSON-LD structured data
export function generateArticleSchema({
  title,
  description,
  image,
  url,
  author,
  authorUrl,
  publishedTime,
  modifiedTime,
}: {
  title: string
  description?: string
  image?: string
  url: string
  author: string
  authorUrl: string
  publishedTime?: string
  modifiedTime?: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image: image || `${BASE_URL}/og-default.png`,
    url: `${BASE_URL}${url}`,
    datePublished: publishedTime,
    dateModified: modifiedTime || publishedTime,
    author: {
      '@type': 'Person',
      name: author,
      url: `${BASE_URL}${authorUrl}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Neolog',
      url: BASE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/logo.png`,
      },
    },
  }
}

export function generateProfileSchema({
  name,
  username,
  bio,
  image,
}: {
  name: string
  username: string
  bio?: string
  image?: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    url: `${BASE_URL}/${username}`,
    description: bio,
    image,
    sameAs: [`${BASE_URL}/${username}`],
  }
}


