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
2. Extract key Decisions, Ideas, and Projects mentioned as simple string arrays.
3. EXTRACT ENTITIES: Identify the core, recurring concepts discussed (projects, ideas, people, goals, topics).
4. Be insightful, analytical, and professional.

FORMAT YOUR RESPONSE AS JSON:
{
  "title": "Short descriptive title",
  "narrative": "3rd person analysis text...",
  "decisions": ["Decision 1", "Decision 2"],
  "ideas": ["Idea 1"],
  "projects": ["Project 1"],
  "summary": "Brief 1-sentence summary",
  "entities": [
    { "name": "Entity Name", "type": "project", "context": "What was specifically said or decided about this entity in the session." }
  ]
}
ALLOWED ENTITY TYPES: 'project', 'idea', 'person', 'goal', 'question', 'habit', 'topic', 'commitment', 'skill', 'blocker'`

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
    const logEntry = await step.run('save-log-entry', async () => {
      const { data, error } = await supabase.from('log_entries').insert({
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
      }).select().single()

      if (error) throw error
      return data
    })

    // 4. Extract into Knowledge Graph (Entities)
    await step.run('extract-entities', async () => {
      const entities = analysis.entities || []
      
      for (const e of entities) {
        // Basic slugification
        const slug = e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        if (!slug) continue
        
        const type = e.type || 'topic'
        let entityId = null

        // 1. Check if entity already exists
        const { data: existing } = await supabase
          .from('entities')
          .select('id, mention_count')
          .eq('user_id', user_id)
          .eq('type', type)
          .eq('slug', slug)
          .single()

        if (existing) {
          entityId = existing.id
          // Update mention count
          await supabase
            .from('entities')
            .update({ 
              mention_count: existing.mention_count + 1,
              last_mentioned_at: new Date().toISOString()
            })
            .eq('id', entityId)
        } else {
          // Create new entity
          const { data: newEntity, error: insertError } = await supabase
            .from('entities')
            .insert({
              user_id,
              type,
              name: e.name,
              slug,
              summary: e.context
            })
            .select()
            .single()

          if (insertError) {
             console.error(`[AI Biographer] Failed to insert entity ${e.name}:`, insertError)
             continue
          }
          entityId = newEntity?.id
        }

        // 2. Create the Entity Mention (Polymorphic linked to log_entry)
        if (entityId) {
          const { error: mentionError } = await supabase.from('entity_mentions').insert({
            entity_id: entityId,
            log_entry_id: logEntry.id,
            source_type: 'chat',
            context: e.context,
            sentiment: 'neutral'
          })
          
          if (mentionError) {
            console.error(`[AI Biographer] Failed to link mention for ${e.name}:`, mentionError)
          }
        }
      }
    })

    return { success: true, analysis }
  }
)
