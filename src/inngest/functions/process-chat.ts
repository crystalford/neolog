import { inngest } from '../client'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { getActiveIntegrationKey } from '@/lib/integrations'

export const processChatSession = inngest.createFunction(
  { id: 'process-chat-session', name: 'Process Chat Session' },
  { event: 'chat/session.ended' },
  async ({ event, step }) => {
    const { user_id, messages, ended_at } = event.data
    const supabase = await createClient()

    // 1. Get OpenAI Key
    const openaiKey = await step.run('get-openai-key', async () => {
      return await getActiveIntegrationKey(user_id, 'openai')
    })

    if (!openaiKey) {
      throw new Error('No OpenAI API key found for user')
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    // 2. Perform 3rd Person Analysis
    const analysis = await step.run('analyze-session', async () => {
      const historyText = messages
        .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n')

      const systemPrompt = `You are the Neolog AI Biographer. 
Analyze the following chat session between the user and their assistant.

YOUR TASKS:
1. Write a 3rd-person narrative report of this session. Start with "In this session, [User]..."
2. Extract key Decisions, Ideas, and Projects mentioned.
3. Be insightful, analytical, and professional.

FORMAT YOUR RESPONSE AS JSON:
{
  "title": "Short descriptive title",
  "narrative": "3rd person analysis text...",
  "decisions": ["Decision 1", "Decision 2"],
  "ideas": ["Idea 1"],
  "projects": ["Project 1"],
  "summary": "Brief 1-sentence summary"
}`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Session History:\n\n${historyText}` }
        ],
        response_format: { type: 'json_object' }
      })

      return JSON.parse(response.choices[0].message.content || '{}')
    })

    // 3. Save to log_entries as a 'session'
    await step.run('save-log-entry', async () => {
      const { error } = await supabase.from('log_entries').insert({
        user_id,
        entry_type: 'session',
        title: analysis.title || 'Chat Session',
        body: analysis.narrative,
        logged_at: ended_at,
        meta: {
          analysis,
          messages_count: messages.length,
          source: 'chat'
        }
      })

      if (error) throw error
    })

    // 4. Future: Extract into Knowledge Graph (Entities)
    // For now,we have the analysis in the log entry.

    return { success: true, analysis }
  }
)
