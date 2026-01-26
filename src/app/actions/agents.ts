'use server'

import { createClient } from '@/lib/supabase/server'

export interface AgentFormData {
    name: string
    description?: string
    system_prompt: string
    search_query: string
    model_provider: 'openai' | 'anthropic'
    model_name: string
    publication_id?: string | null
    is_active?: boolean
}

/**
 * Create a new agent
 */
export async function createAgent(data: AgentFormData): Promise<{ success: boolean; agentId?: string; error?: string }> {
    const supabase = await createClient()

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, error: 'Not authenticated' }
        }

        const { data: agent, error } = await supabase
            .from('agents')
            .insert({
                user_id: user.id,
                ...data,
            })
            .select()
            .single()

        if (error) {
            console.error('Create agent error:', error)
            return { success: false, error: error.message }
        }

        return { success: true, agentId: agent.id }
    } catch (error: any) {
        console.error('Create agent error:', error)
        return { success: false, error: error.message }
    }
}

/**
 * Update an existing agent
 */
export async function updateAgent(agentId: string, data: Partial<AgentFormData>): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, error: 'Not authenticated' }
        }

        const { error } = await supabase
            .from('agents')
            .update(data)
            .eq('id', agentId)
            .eq('user_id', user.id)

        if (error) {
            return { success: false, error: error.message }
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Delete an agent
 */
export async function deleteAgent(agentId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, error: 'Not authenticated' }
        }

        const { error } = await supabase
            .from('agents')
            .delete()
            .eq('id', agentId)
            .eq('user_id', user.id)

        if (error) {
            return { success: false, error: error.message }
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Get all agents for the current user
 */
export async function getAgents() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
        .from('agents')
        .select('*, publication:publications(name, slug)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    return data || []
}

/**
 * Get a single agent
 */
export async function getAgent(agentId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
        .from('agents')
        .select('*, publication:publications(name, slug)')
        .eq('id', agentId)
        .eq('user_id', user.id)
        .single()

    return data
}

/**
 * Get recent runs for an agent
 */
export async function getAgentRuns(agentId: string, limit = 10) {
    const supabase = await createClient()

    const { data } = await supabase
        .from('agent_runs')
        .select('*, post:posts(title, slug)')
        .eq('agent_id', agentId)
        .order('started_at', { ascending: false })
        .limit(limit)

    return data || []
}
