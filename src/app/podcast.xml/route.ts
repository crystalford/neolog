/**
 * GET /podcast.xml
 *
 * Public RSS 2.0 + iTunes-namespace podcast feed. No auth — anyone with
 * the URL can subscribe in Apple Podcasts, Overcast, Pocket Casts,
 * Spotify, etc. Includes only vlogs flagged is_podcast=1.
 *
 * The audio enclosure points at /podcast/audio/{vlog_id}.mp3, which
 * 302-redirects to a freshly presigned R2 URL each time the podcast
 * client fetches it.
 *
 * Single-operator app: we pick the lone row from `operator` (or the
 * first by created_at if more than one ever exists). No /podcast/[op]
 * routing needed.
 *
 * Cloudflare Access policy must exclude /podcast.xml and /podcast/*
 * from the auth gate (same pattern as /p/*).
 */

export const runtime = 'edge'

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database }

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&apos;')

const cdata = (s: string): string => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`

const rfc822 = (iso: string | null): string => {
  if (!iso) return new Date().toUTCString()
  const d = new Date(iso)
  if (isNaN(d.getTime())) return new Date().toUTCString()
  return d.toUTCString()
}

const fmtDuration = (sec: number | null): string => {
  if (!sec || sec <= 0) return '00:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const db = getDb(env)

  const origin = new URL(req.url).origin

  const operator = await findOne<{
    id: string
    display_name: string | null
    handle: string | null
    bio: string | null
    email: string
  }>(
    db,
    `SELECT id, display_name, handle, bio, email
       FROM operator
      ORDER BY created_at ASC
      LIMIT 1`,
  )
  if (!operator) {
    return new Response('<error>no operator</error>', {
      status: 404, headers: { 'Content-Type': 'application/xml' },
    })
  }

  const items = await findMany<{
    id: string
    title: string | null
    original_filename: string | null
    recorded_at: string | null
    duration_seconds: number | null
    transcript_text: string | null
    summary: string | null
    file_size_bytes: number | null
    anchor_take: string | null
    anchor_topic: string | null
  }>(
    db,
    `SELECT v.id, v.title, v.original_filename, v.recorded_at, v.duration_seconds,
            v.transcript_text, v.summary, v.file_size_bytes,
            t.take  AS anchor_take,
            t.topic AS anchor_topic
       FROM vlogs v
       LEFT JOIN threads t
              ON t.id = (
                SELECT id FROM threads
                 WHERE vlog_id = v.id AND deleted_at IS NULL
                 ORDER BY COALESCE(strength, 0) DESC, created_at ASC
                 LIMIT 1
              )
      WHERE v.operator_id = ?
        AND v.is_podcast = 1
        AND v.deleted_at IS NULL
      ORDER BY COALESCE(v.recorded_at, v.created_at) DESC
      LIMIT 500`,
    operator.id,
  )

  const channelTitle = operator.display_name || operator.handle || 'Neolog'
  const channelLink = origin
  const channelDescription = operator.bio || 'Voice recordings from the field.'
  const channelEmail = operator.email
  const channelAuthor = channelTitle
  const feedUrl = `${origin}/podcast.xml`
  const coverUrl = `${origin}/icon-512.png`

  const itemXml = items.map(v => {
    const title = (v.title?.trim()) || (v.anchor_take?.trim()) || (v.anchor_topic?.trim()) || (v.original_filename || 'Untitled')
    const desc = (v.summary?.trim()) || (v.transcript_text?.trim()) || ''
    const audioUrl = `${origin}/podcast/audio/${v.id}.mp3`
    const length = v.file_size_bytes ?? 0
    const pub = rfc822(v.recorded_at)
    const dur = fmtDuration(v.duration_seconds)
    return `    <item>
      <title>${escape(title)}</title>
      <description>${cdata(desc)}</description>
      <link>${escape(`${origin}/p/${v.id}`)}</link>
      <guid isPermaLink="false">${escape(v.id)}</guid>
      <pubDate>${pub}</pubDate>
      <enclosure url="${escape(audioUrl)}" length="${length}" type="audio/mpeg"/>
      <itunes:author>${escape(channelAuthor)}</itunes:author>
      <itunes:duration>${dur}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <itunes:summary>${cdata(desc.slice(0, 4000))}</itunes:summary>
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escape(channelTitle)}</title>
    <link>${escape(channelLink)}</link>
    <description>${cdata(channelDescription)}</description>
    <language>en-us</language>
    <atom:link href="${escape(feedUrl)}" rel="self" type="application/rss+xml"/>
    <itunes:author>${escape(channelAuthor)}</itunes:author>
    <itunes:summary>${cdata(channelDescription)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${escape(channelAuthor)}</itunes:name>
      <itunes:email>${escape(channelEmail)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${escape(coverUrl)}"/>
    <itunes:category text="Society &amp; Culture"/>
    <itunes:explicit>false</itunes:explicit>
${itemXml}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
