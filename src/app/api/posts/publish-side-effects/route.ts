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
import { createNote, createNoteForActor } from '@/lib/activitypub'
import { sendSignedActivity, sendSignedActivityForPublication } from '@/lib/activitypub-outbound'

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
      .select('*, author:profiles(username, display_name), publication:publications(slug)')
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
      const publicationSlug = post.publication?.slug || post.author.username
      const canonicalUrl = `${BASE_URL}/${publicationSlug}/${post.slug}`
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

    // 5) ActivityPub fan-out (best-effort)
    try {
      const admin = createAdminClient()
      if (admin) {
        const { data: followers } = await admin
          .from('activitypub_followers')
          .select('inbox_url, shared_inbox')
          .eq('user_id', actorUserIdStrict)
          .eq('status', 'accepted')

        const inboxes = Array.from(
          new Set(
            (followers || [])
              .map((f) => f.shared_inbox || f.inbox_url)
              .filter(Boolean)
          )
        ) as string[]

        if (inboxes.length > 0) {
          const note = createNote(
            {
              id: post.id,
              title: post.title,
              slug: post.slug,
              content: post.content,
              content_html: post.content_html,
              published_at: post.published_at || new Date().toISOString(),
              author_username: post.author.username,
            },
            BASE_URL
          )

          const activity = {
            '@context': 'https://www.w3.org/ns/activitystreams',
            id: `${note.id}#create`,
            type: 'Create',
            actor: `${BASE_URL}/${post.author.username}`,
            published: note.published,
            to: note.to,
            cc: note.cc,
            object: note,
          }

          const now = new Date()
          const retryScheduleMinutes = [5, 15, 60, 240]

          const resultsList = await Promise.all(
            inboxes.map(async (inboxUrl) => {
              const { error: insertError } = await admin
                .from('activitypub_deliveries')
                .upsert(
                  {
                    user_id: actorUserIdStrict,
                    activity_id: activity.id,
                    activity_type: activity.type,
                    inbox_url: inboxUrl,
                    payload: activity,
                    status: 'pending',
                    attempt_count: 0,
                    last_attempt_at: null,
                    next_attempt_at: null,
                    last_error: null,
                    response_status: null,
                    updated_at: now.toISOString(),
                  },
                  { onConflict: 'activity_id,inbox_url' }
                )

              if (insertError) {
                return { ok: false, status: 0, error: insertError.message }
              }

              const delivery = await sendSignedActivity(
                actorUserIdStrict,
                post.author.username,
                inboxUrl,
                activity
              )

              const attemptCount = 1
              const nextRetryAt = delivery.ok
                ? null
                : new Date(now.getTime() + retryScheduleMinutes[0] * 60 * 1000).toISOString()

              await admin
                .from('activitypub_deliveries')
                .update({
                  status: delivery.ok ? 'sent' : 'failed',
                  attempt_count: attemptCount,
                  last_attempt_at: now.toISOString(),
                  next_attempt_at: nextRetryAt,
                  last_error: delivery.error,
                  response_status: delivery.status || null,
                  updated_at: new Date().toISOString(),
                })
                .eq('activity_id', activity.id)
                .eq('inbox_url', inboxUrl)

              return delivery
            })
          )

          results.federation = {
            attempted: inboxes.length,
            delivered: resultsList.filter((result) => result.ok).length,
          }
        }

        if (post.publication_id) {
          const { data: publication } = await admin
            .from('publications')
            .select('id, slug, is_active')
            .eq('id', post.publication_id)
            .maybeSingle()

          if (publication?.is_active) {
            const { data: publicationFollowers } = await admin
              .from('activitypub_publication_followers')
              .select('inbox_url, shared_inbox')
              .eq('publication_id', publication.id)
              .eq('status', 'accepted')

            const pubInboxes = Array.from(
              new Set(
                (publicationFollowers || [])
                  .map((f) => f.shared_inbox || f.inbox_url)
                  .filter(Boolean)
              )
            ) as string[]

            if (pubInboxes.length > 0) {
              const actorUrl = `${BASE_URL}/api/activitypub/publications/${publication.slug}`
              const note = createNoteForActor(
                {
                  id: post.id,
                  title: post.title,
                  slug: post.slug,
                  content: post.content,
                  content_html: post.content_html,
                  published_at: post.published_at || new Date().toISOString(),
                  author_username: publication.slug,
                },
                BASE_URL,
                actorUrl
              )

              const activity = {
                '@context': 'https://www.w3.org/ns/activitystreams',
                id: `${note.id}#create`,
                type: 'Create',
                actor: actorUrl,
                published: note.published,
                to: note.to,
                cc: note.cc,
                object: note,
              }

              const now = new Date()
              const retryScheduleMinutes = [5, 15, 60, 240]

              const resultsList = await Promise.all(
                pubInboxes.map(async (inboxUrl) => {
                  const { error: insertError } = await admin
                    .from('activitypub_publication_deliveries')
                    .upsert(
                      {
                        publication_id: publication.id,
                        activity_id: activity.id,
                        activity_type: activity.type,
                        inbox_url: inboxUrl,
                        payload: activity,
                        status: 'pending',
                        attempt_count: 0,
                        last_attempt_at: null,
                        next_attempt_at: null,
                        last_error: null,
                        response_status: null,
                        updated_at: now.toISOString(),
                      },
                      { onConflict: 'activity_id,inbox_url' }
                    )

                  if (insertError) {
                    return { ok: false, status: 0, error: insertError.message }
                  }

                  const delivery = await sendSignedActivityForPublication(
                    publication.id,
                    publication.slug,
                    inboxUrl,
                    activity
                  )

                  const attemptCount = 1
                  const nextRetryAt = delivery.ok
                    ? null
                    : new Date(now.getTime() + retryScheduleMinutes[0] * 60 * 1000).toISOString()

                  await admin
                    .from('activitypub_publication_deliveries')
                    .update({
                      status: delivery.ok ? 'sent' : 'failed',
                      attempt_count: attemptCount,
                      last_attempt_at: now.toISOString(),
                      next_attempt_at: nextRetryAt,
                      last_error: delivery.error,
                      response_status: delivery.status || null,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('activity_id', activity.id)
                    .eq('inbox_url', inboxUrl)

                  return delivery
                })
              )

              results.publication_federation = {
                attempted: pubInboxes.length,
                delivered: resultsList.filter((result) => result.ok).length,
              }
            }
          }
        }
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
