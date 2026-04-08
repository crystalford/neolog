'use client'

export const runtime = 'edge'


import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAgents, deleteAgent } from '@/app/actions/agents'
import { dispatchAgent } from '@/app/actions/dispatchAgent'
import { Plus, Loader2, Trash2, Settings as SettingsIcon, Calendar, Zap, Bot } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Agent {
    id: string
    name: string
    description: string | null
    system_prompt: string
    search_query: string
    model_provider: string
    model_name: string
    is_active: boolean
    last_run_at: string | null
    created_at: string
    publication: { name: string; slug: string } | null
}

export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([])
    const [loading, setLoading] = useState(true)
    const [dispatching, setDispatching] = useState<string | null>(null)
    const router = useRouter()

    useEffect(() => {
        loadAgents()
    }, [])

    const loadAgents = async () => {
        const data = await getAgents()
        setAgents(data as Agent[])
        setLoading(false)
    }

    const handleDispatch = async (agentId: string) => {
        setDispatching(agentId)
        try {
            const result = await dispatchAgent(agentId)
            if (result.success) {
                alert(`✅ Agent dispatched! Draft created. View it in your Posts.`)
                loadAgents() // Refresh to update last_run_at
                if (result.postId) {
                    router.push(`/write?edit=${result.postId}`)
                }
            } else {
                alert(`❌ Error: ${result.error}`)
            }
        } catch (error: any) {
            alert(`❌ Error: ${error.message}`)
        } finally {
            setDispatching(null)
        }
    }

    const handleDelete = async (agentId: string, agentName: string) => {
        if (!confirm(`Delete agent "${agentName}"?`)) return

        const result = await deleteAgent(agentId)
        if (result.success) {
            loadAgents()
        } else {
            alert(`Error: ${result.error}`)
        }
    }

    if (loading) {
        return (
            <main className="px-6 lg:px-8 py-8 max-w-7xl mx-auto">
                <div className="flex justify-center py-16">
                    <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
                </div>
            </main>
        )
    }

    return (
        <main className="px-6 lg:px-8 py-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                            Agents
                        </h1>
                        <p className="text-sm text-[var(--text-secondary)] mt-2">
                            AI agents that research and write blog posts for you
                        </p>
                    </div>
                    <Link href="/dashboard/agents/new" className="btn btn-primary">
                        <Plus size={16} />
                        Create Agent
                    </Link>
                </div>

                {/* Info Card */}
                {agents.length === 0 && (
                    <div className="p-6 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-medium)] mb-6">
                        <h3 className="font-semibold text-[var(--text-primary)] mb-2">
                            🤖 Welcome to Agents
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-3">
                            Create AI agents that automatically research topics and write draft blog posts.
                            You review and publish them with full editorial control.
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                            💡 <strong>Tip:</strong> Make sure to add your API keys in{' '}
                            <Link href="/dashboard/settings" className="underline hover:text-[var(--text-secondary)]">Settings</Link> first.
                        </p>
                    </div>
                )}
            </div>

            {/* Agents Grid */}
            {agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 px-6">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-medium)] flex items-center justify-center mb-6">
                        <Bot size={32} className="text-[var(--text-tertiary)]" />
                    </div>
                    <h3 className="font-display text-2xl font-semibold text-[var(--text-primary)] mb-3">
                        No agents yet
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-md text-center">
                        Create your first AI agent to automatically research topics and generate draft blog posts.
                    </p>
                    <Link href="/dashboard/agents/new" className="btn btn-primary">
                        <Plus size={18} />
                        Create Your First Agent
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.map((agent) => (
                        <div
                            key={agent.id}
                            className="p-6 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] transition-all"
                        >
                            <div className="mb-4">
                                <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-2">
                                    {agent.name}
                                </h3>
                                {agent.description && (
                                    <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">
                                        {agent.description}
                                    </p>
                                )}
                                <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                                    <span className="px-2 py-1 rounded bg-[var(--bg-tertiary)]">
                                        {agent.model_provider === 'openai' ? 'OpenAI' : 'Anthropic'}
                                    </span>
                                    <span className="px-2 py-1 rounded bg-[var(--bg-tertiary)]">
                                        {agent.model_name}
                                    </span>
                                </div>
                            </div>

                            {agent.last_run_at && (
                                <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] mb-4">
                                    <Calendar size={14} />
                                    Last run {new Date(agent.last_run_at).toLocaleDateString()}
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDispatch(agent.id)}
                                    disabled={dispatching === agent.id}
                                    className="flex-1 btn btn-primary btn-sm"
                                >
                                    {dispatching === agent.id ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Researching...
                                        </>
                                    ) : (
                                        <>
                                            <Zap size={14} />
                                            Dispatch
                                        </>
                                    )}
                                </button>
                                <Link
                                    href={`/dashboard/agents/${agent.id}`}
                                    className="btn btn-secondary btn-sm btn-icon"
                                    title="Edit agent"
                                >
                                    <SettingsIcon size={14} />
                                </Link>
                                <button
                                    onClick={() => handleDelete(agent.id, agent.name)}
                                    className="btn btn-ghost btn-sm btn-icon text-[var(--error)] hover:text-[var(--error)]"
                                    title="Delete agent"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </main>
    )
}
