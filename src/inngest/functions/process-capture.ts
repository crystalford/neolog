import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveIntegrationKeyWithClient } from '@/lib/integrations'
import { runAnalysis, upsertEntities } from '@/lib/video-analysis'

export const processCapture = inngest.createFunction(
  {
    id: 'process-capture',
    name: 'Process Text Capture',
    onFailure: async ({ event, error }) => {
      // Best-effort: log the failure but don't block the capture from being saved
      console.error('[PROC-CAPTURE] Failed to process capture:', error.message)
    },
  },
  { event: 'capture/text.created' },
  async ({ event, step }) => {
    const { user_id, log_entry_id, content } = event.data
    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    // 1. Get API keys
    const keys = await step.run('get-api-keys', async () => {
      const [anthropicKey, openaiKey] = await Promise.all([
        getActiveIntegrationKeyWithClient(admin, user_id, 'anthropic'),
        getActiveIntegrationKeyWithClient(admin, user_id, 'openai'),
      ])
      return { anthropicKey, openaiKey }
    })

    if (!keys.anthropicKey && !keys.openaiKey) {
      // No key available — skip silently. Capture is still saved, just not analyzed.
      console.warn(`[PROC-CAPTURE] No API key for user ${user_id} — skipping entity extraction`)
      return { skipped: true, reason: 'no_api_key' }
    }

    // 2. Run analysis on the captured text
    const analysisResult = await step.run('analyze-capture', async () => {
      const { analysis, modelUsed } = await runAnalysis(
        content,
        keys.openaiKey,
        keys.anthropicKey,
      )
      return { analysis, modelUsed }
    })

    // 3. Update the log_entry body with the analysis summary
    await step.run('update-log-entry', async () => {
      await admin
        .from('log_entries')
        .update({
          body: analysisResult.analysis.summary || null,
          meta: {
            analysis: analysisResult.analysis,
            model_used: analysisResult.modelUsed,
          },
        })
        .eq('id', log_entry_id)
    })

    // 4. Upsert entities into the knowledge graph
    await step.run('upsert-entities', async () => {
      await upsertEntities(
        admin,
        user_id,
        { logEntryId: log_entry_id },
        analysisResult.analysis,
      )
    })

    return { success: true, log_entry_id, model: analysisResult.modelUsed }
  },
)
