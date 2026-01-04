import { createClient } from '@/lib/supabase/server'
import { sendNewPostNotifications } from '@/lib/email'
import { resolveProviderKey } from '@/lib/ai-provider'
import { NextRequest, NextResponse } from 'next/server'

// Publish a post and notify subscribers
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Get current user
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { postId, notify = true } = await request.json()

    if (!postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    // Get the post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('*, author:profiles(username, display_name)')
      .eq('id', postId)
      .eq('author_id', session.user.id)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const alreadyPublished = post.status === 'published'

    if (!alreadyPublished) {
      const { error: publishError } = await supabase
        .from('posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .eq('id', postId)

      if (publishError) {
        return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })
      }

      const { data: latestVersion } = await supabase
        .from('post_versions')
        .select('version_number')
        .eq('post_id', postId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersionNumber = (latestVersion?.version_number || 0) + 1

      await supabase
        .from('post_versions')
        .upsert({
          post_id: postId,
          version_number: nextVersionNumber,
          title: post.title,
          content: post.content,
          content_html: post.content_html,
          change_summary: 'Published',
          changed_by: session.user.id,
        }, { onConflict: 'post_id,version_number' })
    }

    // Send notifications if requested
    let notificationResult = { sent: 0, failed: 0 }
    
    if (notify) {
      // Get all subscribers who want new post emails
      const { data: userSubscribers } = await supabase
        .from('subscriptions')
        .select('subscriber:profiles(id)')
        .eq('creator_id', session.user.id)
        .eq('email_new_posts', true)

      const { data: emailSubscribers } = await supabase
        .from('email_subscribers')
        .select('email, unsubscribe_token')
        .eq('creator_id', session.user.id)
        .eq('status', 'active')
        .eq('email_new_posts', true)

      // For now, we only send to email subscribers
      // User subscribers would need their email from auth.users (requires service role)
      if (emailSubscribers && emailSubscribers.length > 0) {
        const resendKey = await resolveProviderKey(session.user.id, 'resend')
        if (resendKey) {
          notificationResult = await sendNewPostNotifications(
            emailSubscribers.map(s => ({
              email: s.email,
              unsubscribeToken: s.unsubscribe_token,
            })),
            {
              creatorName: post.author.display_name || post.author.username,
              creatorUsername: post.author.username,
              postTitle: post.title,
              postSlug: post.slug,
              postExcerpt: post.excerpt,
            },
            { apiKey: resendKey.key }
          )
        }
      }
    }

    return NextResponse.json({
      success: true,
      post: {
        id: postId,
        slug: post.slug,
        published_at: new Date().toISOString(),
      },
      notifications: notificationResult,
    })

  } catch (error) {
    console.error('Publish error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
