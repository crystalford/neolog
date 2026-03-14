import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { runAnalysis, upsertEntities, extractTags, generatePostSuggestions } from '@/lib/video-analysis'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'

/**
 * Bulk retroactive re-analysis of all processed uploads for a user.
 *
 * Triggered by: POST /api/video-upload/reanalyze-all  (sends neolog/reanalyze-all event)
 *
 * Fans out one step per upload to stay within rate limits and avoid
 * timeouts. Each step is retried independently on failure.
 *
 * Safe to re-run: entity upserts are idempotent (slug-based deduplication).
 * New entity types will be created; existing ones will have mention_count
 * incremented by 1 (we accept this minor over-count as a trade-off).
 */
export const reanalyzeAllUploads = inngest.createFunction(
  {
    id: 'reanalyze-all-uploads',
    name: 'Reanalyze All Uploads',
    concurrency: { limit: 1, key: 'event.data.user_id' }, // one job per user at a time
    retries: 2,
  },
  { event: 'neolog/reanalyze-all' },
  async ({ event, step }) => {
    const { user_id } = event.data as { user_id: string }
    const admin = createAdminClient()

    // Fetch all uploads with transcripts for this user
    const uploads = await step.run('fetch-uploads', async () => {
      const { data } = await admin
        .from('video_uploads')
        .select('id, transcript, recorded_at, file_name')
        .eq('user_id', user_id)
        .eq('status', 'processed')
        .not('transcript', 'is', null)
        .order('recorded_at', { ascending: false })
      return data || []
    })

    if (uploads.length === 0) {
      return { processed: 0, message: 'No processed uploads with transcripts found' }
    }

    // Resolve AI keys once (they don't change per-upload)
    const keys = await step.run('resolve-keys', async () => {
      const { data: profile } = await admin
        .from('profiles')
        .select('display_name, username')
        .eq('id', user_id)
        .single()

      const { data: integrations } = await admin
        .from('integrations')
        .select('provider, api_key, is_active')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .in('provider', ['anthropic', 'openai'])

      const anthropicKey = integrations?.find(i => i.provider === 'anthropic')?.api_key
        || process.env.ANTHROPIC_API_KEY
        || null
      const openaiKey = integrations?.find(i => i.provider === 'openai')?.api_key
        || process.env.OPENAI_API_KEY
        || null

      return {
        anthropicKey,
        openaiKey,
        userName: profile?.display_name || profile?.username || 'the user',
      }
    })

    if (!keys.anthropicKey && !keys.openaiKey) {
      return { error: 'No AI API keys available for this user' }
    }

    let processed = 0
    let failed = 0

    // Process each upload in sequence (not parallel) to respect rate limits
    for (const upload of uploads) {
      try {
        await step.run(`reanalyze-${upload.id}`, async () => {
          const result = await runAnalysis(
            upload.transcript,
            keys.openaiKey,
            keys.anthropicKey,
            keys.userName,
          )

          const tags = extractTags(result.analysis)
          const posts = generatePostSuggestions(result.analysis, upload.recorded_at)

          await admin
            .from('video_uploads')
            .update({
              analysis: result.analysis,
              analysis_model: result.modelUsed,
              tags,
              generated_posts: posts,
              updated_at: new Date().toISOString(),
            })
            .eq('id', upload.id)

          await upsertEntities(admin, user_id, { videoUploadId: upload.id }, result.analysis)

          return { id: upload.id, model: result.modelUsed }
        })
        processed++
      } catch (err) {
        console.error(`Reanalyze failed for upload ${upload.id}:`, err)
        failed++
      }
    }

    return {
      processed,
      failed,
      total: uploads.length,
      message: `Reanalyzed ${processed}/${uploads.length} uploads${failed > 0 ? ` (${failed} failed)` : ''}`,
    }
  },
)
