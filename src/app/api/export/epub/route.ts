export const runtime = 'edge'
/**
 * ePub Export API
 *
 * GET /api/export/epub?username=yourname
 *
 * Exports a user's entire publication as an ePub 3.0 book.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEpub, EpubPost, EpubAuthor, EpubMetadata } from '@/lib/epub'

// Type for post with series relationship
type PostWithSeries = {
  id: string
  title: string
  slug: string
  content: string | null
  html_content: string | null
  published_at: string
  reading_time_minutes: number | null
  series: {
    title: string
    slug: string
  } | null
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const username = searchParams.get('username')
  const seriesSlug = searchParams.get('series') // Optional: export specific series only

  if (!username) {
    return NextResponse.json({ error: 'Username required' }, { status: 400 })
  }

  const supabase = createClient()

  // Get publication
  const { data: publication, error: publicationError } = await supabase
    .from('publications')
    .select('id, name, slug, description, logo_url, owner_id, is_active')
    .eq('slug', username)
    .maybeSingle()

  if (publicationError || !publication || !publication.is_active) {
    return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
  }

  // Build query for posts
  let query = supabase
    .from('posts')
    .select(`
      id,
      title,
      slug,
      content,
      html_content,
      published_at,
      reading_time_minutes,
      series:series(title, slug)
    `)
    .eq('publication_id', publication.id)
    .eq('status', 'published')
    .order('published_at', { ascending: true })

  // Filter by series if provided
  if (seriesSlug) {
    const { data: series } = await supabase
      .from('series')
      .select('id')
      .eq('slug', seriesSlug)
      .eq('author_id', publication.owner_id)
      .single()

    if (!series) {
      return NextResponse.json({ error: 'Series not found' }, { status: 404 })
    }

    query = query.eq('series_id', series.id)
  }

  const { data: posts, error: postsError } = await query

  if (postsError) {
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ error: 'No published posts found' }, { status: 404 })
  }

  // Cast to proper type
  const typedPosts = posts as unknown as PostWithSeries[]

  // Prepare metadata
  const author: EpubAuthor = {
    display_name: publication.name,
    username: publication.slug,
    bio: publication.description || undefined,
    website: undefined,
    avatar_url: publication.logo_url || undefined,
  }

  const bookTitle = seriesSlug
    ? `${typedPosts[0]?.series?.title || 'Series'} by ${author.display_name}`
    : `The Complete Works of ${author.display_name}`

  const metadata: EpubMetadata = {
    title: bookTitle,
    author,
    language: 'en',
    publisher: 'Neolog',
    description: publication.description || `A collection of posts by ${author.display_name}`,
    identifier: `neolog-${username}-${Date.now()}`,
    pubDate: new Date().toISOString().split('T')[0],
  }

  // Format posts for ePub
  const epubPosts: EpubPost[] = typedPosts.map(post => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    content: post.content || '',
    html_content: post.html_content || undefined,
    published_at: post.published_at,
    reading_time_minutes: post.reading_time_minutes || undefined,
    series: post.series || null,
  }))

  try {
    // Generate ePub
    const epubBlob = await generateEpub(epubPosts, metadata, {
      includeImages: true,
      groupBySeries: !seriesSlug, // Only group if exporting all posts
      includeTOC: true,
    })

    // Convert blob to buffer
    const arrayBuffer = await epubBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Sanitize filename
    const sanitizedUsername = username.replace(/[^a-z0-9-]/gi, '-')
    const sanitizedTitle = (seriesSlug || 'complete-works').replace(/[^a-z0-9-]/gi, '-')
    const filename = `${sanitizedUsername}-${sanitizedTitle}.epub`

    // Return ePub file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('ePub generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate ePub', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
