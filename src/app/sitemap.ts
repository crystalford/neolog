import { createClient } from '@supabase/supabase-js'
import { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Static pages
  const staticPages = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 1 },
    { url: `${BASE_URL}/explore`, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 0.9 },
    { url: `${BASE_URL}/tags`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.8 },
    { url: `${BASE_URL}/curators`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.7 },
  ]

  // Get all published posts
  const { data: posts } = await supabase
    .from('posts')
    .select('slug, updated_at, author:profiles(username)')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(5000)

  const postPages = (posts || []).map((post: any) => ({
    url: `${BASE_URL}/${post.author.username}/${post.slug}`,
    lastModified: new Date(post.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  // Get all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('username, updated_at')
    .limit(5000)

  const profilePages = (profiles || []).map((profile: any) => ({
    url: `${BASE_URL}/${profile.username}`,
    lastModified: profile.updated_at ? new Date(profile.updated_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
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

  return [...staticPages, ...postPages, ...profilePages, ...tagPages]
}
