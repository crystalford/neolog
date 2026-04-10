import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { postToX } from '@/lib/integrations'

export const runtime = 'edge'

/**
 * POST /api/social-queue/post
 * Triggers an actual post to X.com for an approved queue item.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { postId } = body

    if (!postId) {
      return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
    }

    // 1. Fetch the post from the queue
    const { data: post, error: fetchError } = await supabase
      .from('social_queue')
      .select('*')
      .eq('id', postId)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError || !post) {
      return NextResponse.json({ error: 'Post not found in queue' }, { status: 404 })
    }

    // 2. Prevent double posting
    if (post.status === 'posted') {
      return NextResponse.json({ error: 'Post already distributed' }, { status: 400 })
    }

    // 3. Dispatch to X Protocol
    console.log(`[X_PROTOCOL] DISPATCHING_ARTIFACT: ${postId}`)
    const result = await postToX(post.content)

    // 4. Update status in database
    const { error: updateError } = await supabase
      .from('social_queue')
      .update({ 
        status: 'posted',
        updated_at: new Date().toISOString(),
        platform_post_id: result?.data?.id || 'simulated'
      })
      .eq('id', postId)

    if (updateError) {
      console.error('DATABASE_UPDATE_ERROR_POST_POST:', updateError)
    }

    return NextResponse.json({ 
      success: true, 
      platform_id: result?.data?.id,
      message: 'Artifact distributed successfully via X Protocol' 
    })

  } catch (err: any) {
    console.error('X_PROTOCOL_DISPATCH_FAILURE:', err)
    return NextResponse.json({ 
      error: 'Dispatch failed', 
      details: err.message,
      diagnostic: 'Ensure X_BEARER_TOKEN is configured in Cloudflare Dashboard'
    }, { status: 500 })
  }
}
