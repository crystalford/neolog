import { NextRequest, NextResponse } from 'next/server'

const stripTags = (html: string) =>
  html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const getMeta = (html: string, attr: string, value: string) => {
  const regex = new RegExp(
    `<meta[^>]+${attr}=["']${value}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    'i'
  )
  const match = html.match(regex)
  return match?.[1] || ''
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    const targetUrl = String(url).trim()
    const isReddit = /reddit\.com|redd\.it/i.test(targetUrl)
    const isX = /(^|\.)twitter\.com|(^|\.)x\.com/i.test(targetUrl)

    if (isReddit) {
      const response = await fetch(targetUrl, { redirect: 'follow' })
      const finalUrl = response.url || targetUrl
      const jsonUrl = finalUrl.endsWith('.json')
        ? finalUrl
        : `${finalUrl.replace(/\/$/, '')}.json`
      const redditResponse = await fetch(jsonUrl, {
        headers: { 'User-Agent': 'neolog-pulse/1.0' },
      })
      const data = await redditResponse.json()
      const post = data?.[0]?.data?.children?.[0]?.data
      if (!post) {
        return NextResponse.json({ error: 'Unable to parse Reddit post.' }, { status: 400 })
      }
      return NextResponse.json({
        card: {
          source: 'reddit',
          label: 'Hype',
          sentiment: 'positive',
          author: post.author ? `u/${post.author}` : '',
          body: post.selftext || post.title || '',
          url: `https://www.reddit.com${post.permalink || ''}`,
          avatar_url: post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : '',
          timestamp: post.created_utc
            ? new Date(post.created_utc * 1000).toLocaleString()
            : '',
        },
      })
    }

    if (isX) {
      const oembedUrl = `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(targetUrl)}`
      const response = await fetch(oembedUrl)
      if (!response.ok) {
        return NextResponse.json({ error: 'Unable to fetch X oEmbed.' }, { status: 400 })
      }
      const data = await response.json()
      const body = data.html ? stripTags(data.html) : ''
      return NextResponse.json({
        card: {
          source: 'x',
          label: 'Neutral',
          sentiment: 'neutral',
          author: data.author_name || '',
          body,
          url: targetUrl,
        },
      })
    }

    const htmlResponse = await fetch(targetUrl)
    const html = await htmlResponse.text()
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    const title = titleMatch ? stripTags(titleMatch[1]) : ''
    const description =
      getMeta(html, 'name', 'description') ||
      getMeta(html, 'property', 'og:description') ||
      ''

    return NextResponse.json({
      card: {
        source: 'link',
        label: 'Neutral',
        sentiment: 'neutral',
        author: '',
        body: description || title,
        url: targetUrl,
      },
    })
  } catch (error) {
    console.error('Pulse resolve error:', error)
    return NextResponse.json({ error: 'Failed to resolve URL.' }, { status: 500 })
  }
}
