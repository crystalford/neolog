import { createClient } from '@/lib/supabase/server'
import { sendNewPostNotifications } from '@/lib/email'
import { resolveProviderKey } from '@/lib/ai-provider'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedTextWithOpenAI, pickTextForEmbedding, sha256, vectorLiteral } from '@/lib/embeddings'
import { logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'
import { postToDevto, postToMedium } from '@/lib/syndication'
import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

function stripHtml(input: string): string {
  return String(input || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSentences(text: string, max = 3): string[] {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean)
  return sentences.slice(0, max)
}

// Publish a post and notify subscribers
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Normal mode: session-auth
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const authHeader = request.headers.get('authorization')
    const isCron = Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`

    const body = (await request.json().catch(() => null)) as
      | {
          postId?: string
          notify?: boolean
          authorId?: string
          fast?: boolean
        }
      | null

    const postId = body?.postId
    const notify = typeof body?.notify === 'boolean' ? body.notify : true
    const cronAuthorId = typeof body?.authorId === 'string' ? body.authorId : null
    const fast = body?.fast === true

    if (!session && !isCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    if (!session && isCron && !cronAuthorId) {
      return NextResponse.json({ error: 'authorId is required for cron publish' }, { status: 400 })
    }

    const actorUserId = session?.user.id || cronAuthorId!
    const db = session ? supabase : createAdminClient()
    if (!db) {
      return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
    }

    // Get the post
    const { data: post, error: postError } = await db
      .from('posts')
      .select('*, author:profiles(username, display_name)')
      .eq('id', postId)
      .eq('author_id', actorUserId)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const alreadyPublished = post.status === 'published'
    const firstPublish = !alreadyPublished

    // Fast mode: if already published, do nothing and return quickly.
    if (fast && alreadyPublished) {
      return NextResponse.json({
        success: true,
        fast: true,
        firstPublish: false,
        post: {
          id: postId,
          slug: post.slug,
          published_at: post.published_at || new Date().toISOString(),
        },
      })
    }

    if (!alreadyPublished) {
      const { error: publishError } = await db
        .from('posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .eq('id', postId)

      if (publishError) {
        return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })
      }

      const { data: latestVersion } = await db
        .from('post_versions')
        .select('version_number')
        .eq('post_id', postId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersionNumber = (latestVersion?.version_number || 0) + 1

      await db
        .from('post_versions')
        .upsert({
          post_id: postId,
          version_number: nextVersionNumber,
          title: post.title,
          content: post.content,
          content_html: post.content_html,
          change_summary: 'Published',
          changed_by: actorUserId,
        }, { onConflict: 'post_id,version_number' })

      // Fast mode: return right after the publish transition.
      // Run heavy side-effects via /api/posts/publish-side-effects.
      if (fast) {
        return NextResponse.json({
          success: true,
          fast: true,
          firstPublish: true,
          post: {
            id: postId,
            slug: post.slug,
            published_at: new Date().toISOString(),
          },
        })
      }

      // Best-effort: create/refresh pgvector embedding for semantic search.
      // Never block publishing on embedding failures.
      try {
        const openaiKey = await resolveProviderKey(actorUserId, 'openai')
        const admin = createAdminClient()

        if (openaiKey?.key && admin) {
          let canEmbed = true
          try {
            await enforceUsageCaps({ supabase: db as any, userId: actorUserId, provider: 'openai' })
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
                    userId: actorUserId,
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
      const { data: userSubscribers } = await db
        .from('subscriptions')
        .select('subscriber:profiles(id)')
        .eq('creator_id', actorUserId)
        .eq('email_new_posts', true)

      const { data: emailSubscribers } = await db
        .from('email_subscribers')
        .select('email, unsubscribe_token')
        .eq('creator_id', actorUserId)
        .eq('status', 'active')
        .eq('email_new_posts', true)

      // For now, we only send to email subscribers
      // User subscribers would need their email from auth.users (requires service role)
      if (emailSubscribers && emailSubscribers.length > 0) {
        const resendKey = await resolveProviderKey(actorUserId, 'resend')
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

    // Best-effort: auto-post syndication (platform APIs).
    // Only runs on first publish; never blocks publishing.
    let syndicationResult: Record<string, any> = {}
    if (!alreadyPublished) {
      try {
        const canonicalUrl = `${BASE_URL}/${post.author.username}/${post.slug}`
        const plain = stripHtml(post.content_html || post.content || '')
        const summary = post.excerpt || getSentences(plain, 2).join(' ')
        const sentenceList = getSentences(plain, 4)

        const mediumKey = await resolveProviderKey(actorUserId, 'medium')
        if (mediumKey?.key) {
          const { data: existing } = await db
            .from('post_syndications')
            .select('id, status')
            .eq('post_id', postId)
            .eq('provider', 'medium')
            .maybeSingle()

          if (!existing || existing.status !== 'sent') {
            await db
              .from('post_syndications')
              .upsert(
                {
                  post_id: postId,
                  author_id: actorUserId,
                  provider: 'medium',
                  status: 'pending',
                  request_payload: {
                    title: post.title,
                    canonical_url: canonicalUrl,
                  },
                },
                { onConflict: 'post_id,provider' }
              )

            const mediumHtml = [
              `<p><em>Originally published at <a href="${canonicalUrl}">${canonicalUrl}</a></em></p>`,
              post.content_html || post.content || '',
            ].join('\n')

            const res = await postToMedium({
              token: mediumKey.key,
              title: post.title,
              html: mediumHtml,
              canonicalUrl,
              publishStatus: 'public',
            })

            await db
              .from('post_syndications')
              .upsert(
                {
                  post_id: postId,
                  author_id: actorUserId,
                  provider: 'medium',
                  status: 'sent',
                  external_id: res.externalId,
                  external_url: res.externalUrl,
                  response_payload: res.raw,
                  error_message: null,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'post_id,provider' }
              )

            syndicationResult.medium = { ok: true, url: res.externalUrl }
          }
        }

        const devtoKey = await resolveProviderKey(actorUserId, 'devto')
        if (devtoKey?.key) {
          const { data: existing } = await db
            .from('post_syndications')
            .select('id, status')
            .eq('post_id', postId)
            .eq('provider', 'devto')
            .maybeSingle()

          if (!existing || existing.status !== 'sent') {
            await db
              .from('post_syndications')
              .upsert(
                {
                  post_id: postId,
                  author_id: actorUserId,
                  provider: 'devto',
                  status: 'pending',
                  request_payload: {
                    title: post.title,
                    canonical_url: canonicalUrl,
                  },
                },
                { onConflict: 'post_id,provider' }
              )

            const devtoMarkdown = [
              `> Originally published at ${canonicalUrl}`,
              '',
              `# ${post.title}`,
              '',
              summary,
              '',
              '## Key takeaways',
              sentenceList.map((s) => `- ${s}`).join('\n'),
              '',
              `Read more: ${canonicalUrl}`,
            ].join('\n')

            const res = await postToDevto({
              apiKey: devtoKey.key,
              title: post.title,
              bodyMarkdown: devtoMarkdown,
              canonicalUrl,
              published: true,
            })

            await db
              .from('post_syndications')
              .upsert(
                {
                  post_id: postId,
                  author_id: actorUserId,
                  provider: 'devto',
                  status: 'sent',
                  external_id: res.externalId,
                  external_url: res.externalUrl,
                  response_payload: res.raw,
                  error_message: null,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'post_id,provider' }
              )

            syndicationResult.devto = { ok: true, url: res.externalUrl }
          }
        }
      } catch (e: any) {
        syndicationResult.error = e?.message || 'Syndication failed.'
      }
    }

    return NextResponse.json({
      success: true,
      firstPublish,
      post: {
        id: postId,
        slug: post.slug,
        published_at: new Date().toISOString(),
      },
      notifications: notificationResult,
      syndication: syndicationResult,
    })

  } catch (error) {
    console.error('Publish error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
