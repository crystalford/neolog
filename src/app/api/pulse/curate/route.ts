import { NextRequest, NextResponse } from 'next/server'
import { MAX_PULSE_CARDS } from '@/lib/pulse'

export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json()

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 })
    }

    const cards: any[] = []

    const redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=top&t=week&limit=4`
    const redditResponse = await fetch(redditUrl, {
      headers: { 'User-Agent': 'neolog-pulse/1.0' },
    })
    if (redditResponse.ok) {
      const redditData = await redditResponse.json()
      const redditPosts = redditData?.data?.children || []
      redditPosts.slice(0, 3).forEach((item: any) => {
        const post = item.data
        if (!post?.title) return
        cards.push({
          source: 'reddit',
          label: 'Hype',
          sentiment: 'positive',
          author: post.author ? `u/${post.author}` : '',
          body: post.title,
          url: `https://www.reddit.com${post.permalink || ''}`,
        })
      })
    }

    const hnUrl = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&hitsPerPage=3`
    const hnResponse = await fetch(hnUrl)
    if (hnResponse.ok) {
      const hnData = await hnResponse.json()
      const hits = hnData?.hits || []
      hits.slice(0, 3).forEach((hit: any) => {
        if (!hit?.title) return
        cards.push({
          source: 'link',
          label: 'Neutral',
          sentiment: 'neutral',
          author: hit.author || '',
          body: hit.title,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        })
      })
    }

    return NextResponse.json({
      cards: cards.slice(0, MAX_PULSE_CARDS),
    })
  } catch (error) {
    console.error('Pulse curate error:', error)
    return NextResponse.json({ error: 'Failed to curate sources.' }, { status: 500 })
  }
}
