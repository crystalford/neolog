import { createClient } from '@/lib/supabase/server'
import { sendNewPostNotifications } from '@/lib/email'
import { resolveProviderKey } from '@/lib/ai-provider'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedTextWithOpenAI, pickTextForEmbedding, sha256, vectorLiteral } from '@/lib/embeddings'
import { logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'
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

      // Best-effort: create/refresh pgvector embedding for semantic search.
      // Never block publishing on embedding failures.
      try {
        const openaiKey = await resolveProviderKey(session.user.id, 'openai')
        const admin = createAdminClient()

        if (openaiKey?.key && admin) {
          let canEmbed = true
          try {
            await enforceUsageCaps({ supabase, userId: session.user.id, provider: 'openai' })
          } catch {
            canEmbed = false
          }

          if (canEmbed) {
            const text = pickTextForEmbedding({
              title: post.title,
              excerpt: post.excerpt,
              content: post.content,
              content_html: post.content_html,
            })

            if (text) {
              const embedding = await embedTextWithOpenAI({
                apiKey: openaiKey.key,
                text,
                onUsage: (u) => {
                  void logProviderUsage({
                    userId: session.user.id,
                    provider: 'openai',
                    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                    route: '/api/posts/publish',
                    operation: 'embeddings',
                    usage: { prompt_tokens: u.prompt_tokens, total_tokens: u.total_tokens },
                    metadata: { post_id: postId },
                  })
                },
              })
              await admin
                .from('post_embeddings')
                .upsert(
                  {
                    post_id: postId,
                    embedding: vectorLiteral(embedding),
                    content_hash: sha256(text),
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'post_id' },
                )
            }
          }
        }
      } catch (e: any) {
        // ignore
      }
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
