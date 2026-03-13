import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import { runAnalysis, extractTags, upsertEntities } from '@/lib/video-analysis'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'

export const processText = inngest.createFunction(
  { id: 'process-text' },
  { event: 'ingest/process-text' },
  async ({ event, step }) => {
    const { logEntryId, content, userId } = event.data
    const admin = createAdminClient()

    if (!admin) {
      console.error('Failed to create admin client')
      return { status: 'error', error: 'admin_client_failed' }
    }

    // 1. Fetch AI keys and user context
    const context = await step.run('fetch-keys', async () => {
      const openaiKeyRes = await resolveProviderKeyWithClient(admin, userId, 'openai')
      const anthropicKeyRes = await resolveProviderKeyWithClient(admin, userId, 'anthropic')

      const { data: profile } = await admin
        .from('profiles')
        .select('display_name, username')
        .eq('id', userId)
        .single()

      const userName = profile?.display_name || profile?.username || 'the user'

      return {
        userName,
        openaiKey: openaiKeyRes?.key || null,
        anthropicKey: anthropicKeyRes?.key || null,
      }
    })

    // 2. Run AI Analysis
    const analysisResult = await step.run('analyze-text', async () => {
      if (!context.openaiKey && !context.anthropicKey) {
        throw new Error('No AI API key found for text analysis')
      }

      const result = await runAnalysis(
        content,
        context.openaiKey as string | null,
        context.anthropicKey as string | null,
        context.userName
      )

      return result
    })

    // 3. Update Log Entry with analysis
    await step.run('update-log-entry', async () => {
      const analysis = analysisResult.analysis
      const tags = extractTags(analysis)

      // Construct rich body if needed, or just keep original content
      // For text dumps, we'll prefix with metadata if it's significant
      let richBody = content
      if (analysis.mood || analysis.energy_level) {
        richBody = `Mood: ${analysis.mood || 'N/A'} | Energy: ${analysis.energy_level || 'N/A'}\n\n` + richBody
      }

      await admin.from('log_entries').update({
        title: analysis.summary ? (analysis.summary.length > 80 ? analysis.summary.substring(0, 77) + '...' : analysis.summary) : 'Processed Text Signal',
        body: richBody,
        meta: {
          model: analysisResult.modelUsed,
          categories: tags,
          mood: analysis.mood,
          energy: analysis.energy_level,
          reflections: analysis.reflections,
          questions: analysis.questions,
          summary: analysis.summary
        }
      }).eq('id', logEntryId)
    })

    // 4. Upsert Entities
    await step.run('upsert-entities', async () => {
      await upsertEntities(admin, userId, { logEntryId }, analysisResult.analysis)
    })

    return { status: 'success', logEntryId }
  }
)
