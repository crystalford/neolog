'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveIntegrationKey } from '@/lib/integrations'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export interface ChatMessage {
    role: 'user' | 'assistant' | 'tool'
    content: string
    tool_call_id?: string
    name?: string
}

export interface ChatResponse {
    success: boolean
    message?: string
    error?: string
}

const TOOLS = [
    {
        name: 'create_log_entry',
        description: 'Create a new entry in the users daily log / timeline.',
        input_schema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'The title of the log entry' },
                body: { type: 'string', description: 'The detailed content of the log entry' },
                entry_type: { 
                    type: 'string', 
                    enum: ['work', 'food', 'health', 'finance', 'asset_update', 'social', 'learn', 'build', 'session', 'capture'],
                    description: 'The category of the event'
                },
                logged_at: { type: 'string', description: 'The ISO timestamp of when the event happened (optional)' },
                is_public: { type: 'boolean', description: 'Whether the entry should be visible on the public log' }
            },
            required: ['title', 'entry_type']
        }
    }
]

/**
 * Chat with the "Manager Agent" (Neolog System)
 * Uses the user's BYOK keys to power the dashboard chat
 */
export async function chatWithManager(history: ChatMessage[]): Promise<ChatResponse> {
    const keys: Record<string, string> = { openai: '', anthropic: '' }
    try {
        const supabase = await createClient()

        // 1. Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, error: 'Not authenticated' }
        }

        // 2. Get user's agents (to give context about available tools)
        const { data: agents } = await supabase
            .from('agents')
            .select('name, description, model_provider')
            .eq('user_id', user.id)

        const agentList = agents?.map(a => `- ${a.name}: ${a.description} (${a.model_provider})`).join('\n') || 'No custom agents configured.'

        // 3. Get API keys from modern integration system
        const [openaiKey, anthropicKey] = await Promise.all([
            getActiveIntegrationKey(user.id, 'openai'),
            getActiveIntegrationKey(user.id, 'anthropic')
        ])

        keys.openai = openaiKey || ''
        keys.anthropic = anthropicKey || ''

        if (!keys.openai && !keys.anthropic) {
            return { success: false, error: 'NO_API_KEYS' }
        }

        // 4. Construct System Prompt
        const systemPrompt = `You are Neolog, an intelligent editorial assistant and content strategist.

CONTEXT:
 The user is a writer/publisher using the Neolog platform.
 You are their "Manager Agent" - helping them brainstorm, organize, and plan content.
 
AVAILABLE TOOLS (Worker Agents):
 The user has these specialized agents configured:
 ${agentList}
 
YOUR GOAL:
 - Help the user clarify their ideas.
 - Suggest which Agent might be best for a specific task.
 - Draft outlines or summaries if asked.
 - Be concise, helpful, and focused on high-quality publishing.
 
FORMAT:
 - Use Markdown for formatting.
 - Keep responses conversational but professional.`

        // 5. Call LLM (Prefer OpenAI, fallback to Anthropic)
        let aiResponseContent = ''

        if (keys.openai) {
            const openai = new OpenAI({ apiKey: keys.openai })
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...history.map(m => ({ role: m.role as any, content: m.content }))
                ],
                tools: TOOLS.map(t => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.input_schema
                    }
                })),
                tool_choice: 'auto'
            })

            const responseMessage = completion.choices[0].message
            aiResponseContent = responseMessage.content || ''

            if (responseMessage.tool_calls) {
                for (const toolCall of responseMessage.tool_calls) {
                    const tc = toolCall as any
                    if (tc.function?.name === 'create_log_entry') {
                        const args = JSON.parse(tc.function.arguments)
                        const { error: insertError } = await supabase.from('log_entries').insert({
                            user_id: user.id,
                            ...args,
                            logged_at: args.logged_at || new Date().toISOString()
                        })
                        if (insertError) {
                            aiResponseContent += `\n\n(Error creating log entry: ${insertError.message})`
                        } else {
                            aiResponseContent += `\n\n✅ I've published that to your Daily Log.`
                        }
                    }
                }
            }
        } else if (keys.anthropic) {
            const anthropic = new Anthropic({ apiKey: keys.anthropic })
            const message = await anthropic.messages.create({
                model: 'claude-sonnet-4-5',
                max_tokens: 4096,
                system: systemPrompt,
                messages: history.map(h => ({ role: h.role as any, content: h.content })),
                tools: TOOLS as any
            })

            const textContent = message.content.find(c => c.type === 'text')
            if (textContent && textContent.type === 'text') {
                aiResponseContent = textContent.text
            }

            const toolCalls = message.content.filter(c => c.type === 'tool_use') as any[]
            if (toolCalls.length > 0) {
                for (const toolCall of toolCalls) {
                    if (toolCall.name === 'create_log_entry') {
                        const { error: insertError } = await supabase.from('log_entries').insert({
                            user_id: user.id,
                            ...toolCall.input,
                            logged_at: toolCall.input.logged_at || new Date().toISOString()
                        })
                        if (insertError) {
                            aiResponseContent += `\n\n(Error creating log entry: ${insertError.message})`
                        } else {
                            aiResponseContent = (aiResponseContent ? aiResponseContent + '\n\n' : '') + `✅ I've published that to your Daily Log.`
                        }
                    }
                }
            }
        } else {
            return { success: false, error: 'MISSING_PROVIDER_KEY' }
        }

        return { success: true, message: aiResponseContent }

    } catch (error: any) {
        console.error('Chat error:', error)
        return { success: false, error: error.message || 'Failed to generate response' }
    }
}
