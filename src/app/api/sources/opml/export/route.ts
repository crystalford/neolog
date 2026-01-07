import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function escapeXml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(_request: NextRequest) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: sources, error } = await supabase
    .from('feed_sources')
    .select('name, url, is_active, source_type')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to export OPML.' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const outlines = (sources || [])
    .filter((s: any) => String(s.source_type || '') === 'rss')
    .map((s: any) => {
      const title = s.name ? String(s.name) : String(s.url)
      const xmlUrl = String(s.url)
      return `    <outline type="rss" text="${escapeXml(title)}" title="${escapeXml(title)}" xmlUrl="${escapeXml(xmlUrl)}"/>`
    })
    .join('\n')

  const opml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Neolog Sources</title>\n    <dateCreated>${escapeXml(now)}</dateCreated>\n  </head>\n  <body>\n${outlines || '    <!-- no sources -->'}\n  </body>\n</opml>\n`

  return new NextResponse(opml, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="neolog-sources.opml"',
    },
  })
}
