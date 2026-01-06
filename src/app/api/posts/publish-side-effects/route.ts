import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKey } from '@/lib/ai-provider'
import { enforceUsageCaps } from '@/lib/usageCaps'
import { logProviderUsage } from '@/lib/usage'
import { embedTextWithOpenAI, pickTextForEmbedding, sha256, vectorLiteral } from '@/lib/embeddings'
import { sendNewPostNotifications } from '@/lib/email'
import { postToDevto, postToMedium } from '@/lib/syndication'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

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

type Body = {
  postId?: string
  notify?: boolean
  firstPublish?: boolean
  authorId?: string
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const authHeader = request.headers.get('authorization')
    const isCron =
      Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`

    const body = (await request.json().catch(() => null)) as Body | null
    const postId = body?.postId
    const notify = typeof body?.notify === 'boolean' ? body.notify : true
    const cronAuthorId = typeof body?.authorId === 'string' ? body.authorId : null
    const firstPublish = body?.firstPublish === true

    if (!session && !isCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const actorUserId = session?.user.id || cronAuthorId

    const tryStartRun = async (meta: Record<string, any>) => {
      if (runId) return
      try {
        const run = await startJobRun('posts.publish.side_effects', meta)
        runId = run.id
      } catch {
        // best-effort
      }
    }

    if (!postId) {
      if (actorUserId) {
        finalMeta = {
          user_id: actorUserId,
          auth_mode: session ? 'session' : 'cron',
          post_id: null,
          notify,
          first_publish: firstPublish,
        }
        await tryStartRun(finalMeta)
      }
      finalErrorMessage = 'postId is required'
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    if (!session && isCron && !cronAuthorId) {
      finalErrorMessage = 'authorId is required for cron'
      return NextResponse.json({ error: 'authorId is required for cron' }, { status: 400 })
    }

    const actorUserIdStrict = actorUserId!

    finalMeta = {
      user_id: actorUserIdStrict,
      auth_mode: session ? 'session' : 'cron',
      post_id: postId,
      notify,
      first_publish: firstPublish,
    }
    await tryStartRun(finalMeta)

    const db = session ? supabase : createAdminClient()
    if (!db) {
      finalErrorMessage = 'Server misconfigured.'
      return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
    }

    // Load post (ownership check)
    const { data: post, error: postError } = await db
      .from('posts')
      .select('*, author:profiles(username, display_name)')
      .eq('id', postId)
      .eq('author_id', actorUserIdStrict)
      .single()

    if (postError || !post) {
      finalErrorMessage = 'Post not found'
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Side-effects are only meaningful for first publish in the current product.
    // Keep this endpoint idempotent and cheap if called again.
    if (!firstPublish) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, skipped: true }
      return NextResponse.json({ ok: true, skipped: true })
    }

    const results: Record<string, any> = {}

    // 1) Embedding (best-effort)
    try {
      const openaiKey = await resolveProviderKey(actorUserIdStrict, 'openai')
      const admin = createAdminClient()

      if (openaiKey?.key && admin) {
        let canEmbed = true
        try {
          await enforceUsageCaps({ supabase: db as any, userId: actorUserIdStrict, provider: 'openai' })
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
                  userId: actorUserIdStrict,
                  provider: 'openai',
                  model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                  route: '/api/posts/publish-side-effects',
                  operation: 'embeddings',
                  usage: { prompt_tokens: u.prompt_tokens, total_tokens: u.total_tokens },
                  metadata: { post_id: postId },
                })
              },
            })

            await admin.from('post_embeddings').upsert(
              {
                post_id: postId,
                embedding: vectorLiteral(embedding),
                content_hash: sha256(text),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'post_id' },
            )

            results.embedding = { ok: true }
          }
        }
      }
    } catch {
      // ignore
    }

    // 2) Notifications (best-effort)
    if (notify) {
      try {
        let emailSubscribersQuery = db
          .from('email_subscribers')
          .select('email, unsubscribe_token')
          .eq('creator_id', actorUserId)
          .eq('status', 'active')
          .eq('email_new_posts', true)

        if (post.publication_id) {
          emailSubscribersQuery = emailSubscribersQuery.or(
            `publication_id.eq.${post.publication_id},publication_id.is.null`,
          )
        }

        const { data: emailSubscribers } = await emailSubscribersQuery

        if (emailSubscribers && emailSubscribers.length > 0) {
          const resendKey = await resolveProviderKey(actorUserIdStrict, 'resend')
          if (resendKey?.key) {
            const notificationResult = await sendNewPostNotifications(
              emailSubscribers.map((s) => ({
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
              { apiKey: resendKey.key },
            )
            results.notifications = notificationResult
          }
        }
      } catch {
        // ignore
      }
    }

    // 3) Auto-syndication (best-effort)
    try {
      const canonicalUrl = `${BASE_URL}/${post.author.username}/${post.slug}`
      const plain = stripHtml(post.content_html || post.content || '')
      const summary = post.excerpt || getSentences(plain, 2).join(' ')
      const sentenceList = getSentences(plain, 4)

      const mediumKey = await resolveProviderKey(actorUserIdStrict, 'medium')
      if (mediumKey?.key) {
        const { data: existing } = await db
          .from('post_syndications')
          .select('id, status')
          .eq('post_id', postId)
          .eq('provider', 'medium')
          .maybeSingle()

        if (!existing || existing.status !== 'sent') {
          await db.from('post_syndications').upsert(
            {
              post_id: postId,
              author_id: actorUserId,
              provider: 'medium',
              status: 'pending',
              request_payload: { title: post.title, canonical_url: canonicalUrl },
            },
            { onConflict: 'post_id,provider' },
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

          await db.from('post_syndications').upsert(
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
            { onConflict: 'post_id,provider' },
          )

          results.syndication = { ...(results.syndication || {}), medium: { ok: true, url: res.externalUrl } }
        }
      }

      const devtoKey = await resolveProviderKey(actorUserIdStrict, 'devto')
      if (devtoKey?.key) {
        const { data: existing } = await db
          .from('post_syndications')
          .select('id, status')
          .eq('post_id', postId)
          .eq('provider', 'devto')
          .maybeSingle()

        if (!existing || existing.status !== 'sent') {
          await db.from('post_syndications').upsert(
            {
              post_id: postId,
              author_id: actorUserId,
              provider: 'devto',
              status: 'pending',
              request_payload: { title: post.title, canonical_url: canonicalUrl },
            },
            { onConflict: 'post_id,provider' },
          )

          const devtoMarkdown = [
            `> Originally published at ${canonicalUrl}`,
            '',
            `# ${post.title}`,
            '',
            summary,
            '',
            '## Key takeaways',
            ...sentenceList.map((s) => `- ${s}`),
            '',
            '---',
            '',
            post.content_html ? stripHtml(post.content_html) : stripHtml(post.content || ''),
          ].join('\n')

          const res = await postToDevto({
            apiKey: devtoKey.key,
            title: post.title,
            bodyMarkdown: devtoMarkdown,
            canonicalUrl,
            published: true,
          })

          await db.from('post_syndications').upsert(
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
            { onConflict: 'post_id,provider' },
          )

          results.syndication = { ...(results.syndication || {}), devto: { ok: true, url: res.externalUrl } }
        }
      }
    } catch {
      // ignore
    }

    // 4) Distribution pack generation (best-effort)
    // Runs async to make "Publish" feel instant; pack can be opened later in the editor/dashboard.
    try {
      const cookie = request.headers.get('cookie') || ''
      const url = new URL('/api/posts/distribution-pack', request.url)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { cookie } : {}),
          ...(!cookie && process.env.CRON_SECRET
            ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
            : {}),
        },
        body: JSON.stringify({ postId, ...(!cookie ? { authorId: actorUserIdStrict } : {}) }),
      })
      if (res.ok) {
        results.pack = { ok: true }
      }
    } catch {
      // ignore
    }

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      embedding_ok: results.embedding?.ok === true,
      notifications_ok: results.notifications?.sent ? true : Boolean(results.notifications),
      syndication_ok: Boolean(results.syndication),
      pack_ok: results.pack?.ok === true,
    }

    return NextResponse.json({ ok: true, results })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Internal server error'
    return NextResponse.json({ error: finalErrorMessage }, { status: 500 })
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
