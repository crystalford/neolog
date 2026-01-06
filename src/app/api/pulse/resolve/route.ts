import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

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
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const { url } = await request.json()

    const targetUrl = String(url || '').trim()
    const isReddit = /reddit\.com|redd\.it/i.test(targetUrl)
    const isX = /(^|\.)twitter\.com|(^|\.)x\.com/i.test(targetUrl)

    finalMeta = {
      url_len: targetUrl.length,
      is_reddit: isReddit,
      is_x: isX,
    }
    try {
      const run = await startJobRun('pulse.resolve', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!url) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

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
        finalStatus = 'success'
        finalMeta = { ...finalMeta, result: 'unable_to_parse_reddit' }
        return NextResponse.json({ error: 'Unable to parse Reddit post.' }, { status: 400 })
      }

      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'success', provider: 'reddit' }
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
        finalStatus = 'success'
        finalMeta = { ...finalMeta, result: 'unable_to_fetch_oembed', provider: 'x' }
        return NextResponse.json({ error: 'Unable to fetch X oEmbed.' }, { status: 400 })
      }
      const data = await response.json()
      const body = data.html ? stripTags(data.html) : ''

      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'success', provider: 'x', body_len: body.length }
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

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', provider: 'link', body_len: (description || title).length }

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
    finalErrorMessage = (error as any)?.message || 'Failed to resolve URL.'
    return NextResponse.json({ error: 'Failed to resolve URL.' }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}
