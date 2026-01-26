'use server'

import { createClient } from '@/lib/supabase/server'
import { searchWithTavily, formatSearchResults } from '@/lib/tavily'
import { decryptApiKey } from '@/lib/encryption'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

interface DispatchAgentResult {
    success: boolean
    runId?: string
    postId?: string
    error?: string
}

/**
 * Dispatch an AI agent to research and write a blog post
 * This is the main orchestration function
 */
export async function dispatchAgent(agentId: string): Promise<DispatchAgentResult> {
    const supabase = await createClient()

    try {
        // 1. Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, error: 'Not authenticated' }
        }

        // 2. Get agent configuration
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('*')
            .eq('id', agentId)
            .eq('user_id', user.id)
            .single()

        if (agentError || !agent) {
            return { success: false, error: 'Agent not found' }
        }

        // 3. Get user's API keys
        const { data: apiKeys, error: keysError } = await supabase
            .from('user_api_keys')
            .select('*')
            .eq('user_id', user.id)

        if (keysError || !apiKeys || apiKeys.length === 0) {
            return { success: false, error: 'No API keys found. Please add your keys in settings.' }
        }

        // Map keys by provider
        const keys: Record<string, string> = {}
        for (const key of apiKeys) {
            keys[key.provider] = decryptApiKey(key.encrypted_key)
        }

        // Validate required keys
        if (!keys.tavily) {
            return { success: false, error: 'Tavily API key required for research' }
        }
        if (agent.model_provider === 'openai' && !keys.openai) {
            return { success: false, error: 'OpenAI API key required' }
        }
        if (agent.model_provider === 'anthropic' && !keys.anthropic) {
            return { success: false, error: 'Anthropic API key required' }
        }

        // 4. Create agent run record
        const { data: run, error: runError } = await supabase
            .from('agent_runs')
            .insert({
                agent_id: agentId,
                status: 'running',
                started_at: new Date().toISOString(),
            })
            .select()
            .single()

        if (runError || !run) {
            return { success: false, error: 'Failed to create run record' }
        }

        try {
            // 5. RESEARCH PHASE: Search the web with Tavily
            const searchResults = await searchWithTavily(
                agent.search_query,
                keys.tavily,
                {
                    search_depth: 'advanced',
                    max_results: 5,
                }
            )

            const researchContext = formatSearchResults(searchResults.results)

            // 6. WRITING PHASE: Generate content with LLM
            let articleContent: string
            let tokensUsed = 0

            if (agent.model_provider === 'openai') {
                const openai = new OpenAI({ apiKey: keys.openai })

                const completion = await openai.chat.completions.create({
                    model: agent.model_name,
                    messages: [
                        {
                            role: 'system',
                            content: `You are a blog author with this persona: ${agent.system_prompt}

Write a blog post in Markdown format based STRICTLY on the context provided below.

Format your response as a JSON object with this structure:
{
  "title": "The article title",
  "content": "The full article body in Markdown"
}`,
                        },
                        {
                            role: 'user',
                            content: `RESEARCH CONTEXT:\n${researchContext}\n\nTASK: Write a complete blog post based on this research.`,
                        },
                    ],
                    response_format: { type: 'json_object' },
                })

                const response = JSON.parse(completion.choices[0].message.content || '{}')
                articleContent = `# ${response.title}\n\n${response.content}`
                tokensUsed = completion.usage?.total_tokens || 0

            } else {
                // Anthropic
                const anthropic = new Anthropic({ apiKey: keys.anthropic })

                const message = await anthropic.messages.create({
                    model: agent.model_name,
                    max_tokens: 4096,
                    system: `You are a blog author with this persona: ${agent.system_prompt}

Write a blog post in Markdown format based STRICTLY on the context provided below.

Format your response as a JSON object with this structure:
{
  "title": "The article title",
  "content": "The full article body in Markdown"
}`,
                    messages: [{
                        role: 'user',
                        content: `RESEARCH CONTEXT:\n${researchContext}\n\nTASK: Write a complete blog post based on this research.`,
                    }],
                })

                const textContent = message.content.find(c => c.type === 'text')
                if (textContent && textContent.type === 'text') {
                    const response = JSON.parse(textContent.text)
                    articleContent = `# ${response.title}\n\n${response.content}`
                    tokensUsed = message.usage.input_tokens + message.usage.output_tokens
                } else {
                    throw new Error('No text response from Anthropic')
                }
            }

            // 7. Save as draft post
            const { data: post, error: postError } = await supabase
                .from('posts')
                .insert({
                    title: articleContent.split('\n')[0].replace(/^#\s+/, ''),
                    content: articleContent,
                    status: 'draft',
                    author_id: user.id,
                    publication_id: agent.publication_id,
                })
                .select()
                .single()

            if (postError || !post) {
                throw new Error('Failed to create post')
            }

            // 8. Update run as completed
            await supabase
                .from('agent_runs')
                .update({
                    status: 'completed',
                    post_id: post.id,
                    search_results_count: searchResults.results.length,
                    tokens_used: tokensUsed,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', run.id)

            return {
                success: true,
                runId: run.id,
                postId: post.id,
            }

        } catch (executionError: any) {
            // Update run as failed
            await supabase
                .from('agent_runs')
                .update({
                    status: 'failed',
                    error_message: executionError.message,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', run.id)

            throw executionError
        }

    } catch (error: any) {
        console.error('Agent dispatch error:', error)
        return {
            success: false,
            error: error.message || 'Unknown error occurred',
        }
    }
}
