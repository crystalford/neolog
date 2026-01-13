import { createClient } from '@supabase/supabase-js'
import { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Static pages
  const staticPages = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 1 },
    { url: `${BASE_URL}/explore`, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 0.9 },
    { url: `${BASE_URL}/tags`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.8 },
    { url: `${BASE_URL}/curators`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.7 },
  ]

  if (!supabaseUrl || !serviceRoleKey) {
    return staticPages
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: publications } = await supabase
    .from('publications')
    .select('id, slug, owner_id, created_at, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5000)

  const publicationPages = (publications || []).map((publication: any) => ({
    url: `${BASE_URL}/${publication.slug}`,
    lastModified: publication.created_at ? new Date(publication.created_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  const publicationSlugByOwner = new Map<string, string>()
  ;(publications || []).forEach((publication: any) => {
    if (!publicationSlugByOwner.has(publication.owner_id)) {
      publicationSlugByOwner.set(publication.owner_id, publication.slug)
    }
  })

  // Get all published posts
  const { data: posts } = await supabase
    .from('posts')
    .select('slug, updated_at, publication:publications(slug)')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(5000)

  const postPages = (posts || [])
    .filter((post: any) => post?.publication?.slug)
    .map((post: any) => ({
      url: `${BASE_URL}/${post.publication.slug}/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))

  // Get all tags
  const { data: tags } = await supabase
    .from('tags')
    .select('slug')
    .gt('post_count', 0)

  const tagPages = (tags || []).map((tag: any) => ({
    url: `${BASE_URL}/tag/${tag.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.5,
  }))

  // Get all stacks (series)
  const { data: stacks } = await supabase
    .from('series')
    .select('slug, created_at, author_id')
    .limit(5000)

  const stackPages = (stacks || [])
    .filter((stack: any) => stack?.slug && publicationSlugByOwner.has(stack.author_id))
    .map((stack: any) => ({
      url: `${BASE_URL}/${publicationSlugByOwner.get(stack.author_id)}/stack/${stack.slug}`,
      lastModified: stack.created_at ? new Date(stack.created_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }))

  return [...staticPages, ...publicationPages, ...postPages, ...tagPages, ...stackPages]
}
