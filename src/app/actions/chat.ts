'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveIntegrationKey } from '@/lib/integrations'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

export interface ChatResponse {
    success: boolean
    message?: string
    error?: string
}

/**
 * Chat with the "Manager Agent" (Neolog System)
 * Uses the user's BYOK keys to power the dashboard chat
 */
export async function chatWithManager(history: ChatMessage[]): Promise<ChatResponse> {
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

        const keys: Record<string, string> = {
            openai: openaiKey || '',
            anthropic: anthropicKey || ''
        }

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
                    ...history
                ],
            })
            aiResponseContent = completion.choices[0].message.content || ''
        } else if (keys.anthropic) {
            const anthropic = new Anthropic({ apiKey: keys.anthropic })
            const message = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20240620',
                max_tokens: 4096,
                system: systemPrompt,
                messages: history.map(h => ({ role: h.role, content: h.content })),
            })

            const textContent = message.content.find(c => c.type === 'text')
            if (textContent && textContent.type === 'text') {
                aiResponseContent = textContent.text
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
