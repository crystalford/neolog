import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// This endpoint should be called by a cron job (e.g., Vercel Cron, Supabase Edge Functions)
// Add to vercel.json: { "crons": [{ "path": "/api/cron/publish-scheduled", "schedule": "*/5 * * * *" }] }

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      )
    }

    if (!appUrl) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_APP_URL configuration' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Get all scheduled posts that should be published
    const { data: scheduledPosts, error: fetchError } = await supabase
      .from('posts')
      .select('id, author_id, title')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())

    if (fetchError) throw fetchError

    if (!scheduledPosts || scheduledPosts.length === 0) {
      return NextResponse.json({ published: 0 })
    }

    // Publish each post through the normal publish pipeline.
    // This ensures versioning, embeddings, and syndication run.
    for (const post of scheduledPosts) {
      await fetch(`${appUrl}/api/posts/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ postId: post.id, notify: true, authorId: post.author_id }),
      })
    }

    return NextResponse.json({ 
      published: scheduledPosts.length,
      posts: scheduledPosts.map(p => ({ id: p.id, title: p.title })),
    })
  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json({ error: 'Failed to publish scheduled posts' }, { status: 500 })
  }
}
