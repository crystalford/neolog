import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getActiveIntegrationKeyWithClient } from '@/lib/integrations'

export const processChatSession = inngest.createFunction(
  { id: 'process-chat-session', name: 'Process Chat Session' },
  { event: 'chat/session.ended' },
  async ({ event, step }) => {
    const { user_id, messages, ended_at } = event.data
    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    // 1. Get API keys (prefer Anthropic, fallback to OpenAI)
    const keys = await step.run('get-api-keys', async () => {
      const [anthropicKey, openaiKey] = await Promise.all([
        getActiveIntegrationKeyWithClient(admin, user_id, 'anthropic'),
        getActiveIntegrationKeyWithClient(admin, user_id, 'openai'),
      ])
      return { anthropicKey, openaiKey }
    })

    if (!keys.anthropicKey && !keys.openaiKey) {
      throw new Error('No API key found for user — add an Anthropic or OpenAI key in Settings')
    }

    const systemPrompt = `You are the Neolog Intelligence Layer — an AI that analyzes conversations and extracts structured knowledge.

Analyze the following chat session and return a JSON object.

YOUR TASKS:
1. Write a 3rd-person narrative report. Start with "In this session, [User]..."
2. Extract key Decisions, Ideas, and Projects as string arrays.
3. Extract Entities: recurring concepts discussed (projects, ideas, people, goals, topics).

RESPONSE FORMAT (JSON only):
{
  "title": "Short descriptive title",
  "narrative": "3rd person analysis...",
  "decisions": ["Decision 1"],
  "ideas": ["Idea 1"],
  "projects": ["Project 1"],
  "summary": "One sentence summary",
  "entities": [
    { "name": "Entity Name", "type": "project", "context": "What was said about this entity." }
  ]
}
ALLOWED ENTITY TYPES: project, idea, person, goal, question, habit, topic, commitment, skill, blocker`

    // 2. Perform analysis (Claude preferred, GPT-4o fallback)
    const analysis = await step.run('analyze-session', async () => {
      const historyText = messages
        .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n')

      if (keys.anthropicKey) {
        const anthropic = new Anthropic({ apiKey: keys.anthropicKey })
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          messages: [
            { role: 'user', content: `${systemPrompt}\n\nSession History:\n\n${historyText}\n\nRespond with JSON only.` }
          ]
        })
        const text = response.content.find(c => c.type === 'text')?.text || '{}'
        const match = text.match(/\{[\s\S]*\}/)
        return JSON.parse(match ? match[0] : '{}')
      } else {
        const openai = new OpenAI({ apiKey: keys.openaiKey! })
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Session History:\n\n${historyText}` }
          ],
          response_format: { type: 'json_object' }
        })
        return JSON.parse(response.choices[0].message.content || '{}')
      }
    })

    // 3. Save to log_entries as a 'session'
    const logEntry = await step.run('save-log-entry', async () => {
      const { data, error } = await admin.from('log_entries').insert({
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
        const { data: existing } = await admin
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
          const { error: mentionError } = await admin.from('entity_mentions').insert({
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
