'use client'export const runtime = 'edge'


import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAgent, type AgentFormData } from '@/app/actions/agents'
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function NewAgentPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState<AgentFormData>({
        name: '',
        description: '',
        system_prompt: 'You are a forensic journalist who writes in a skeptical, investigative style. Keep sentences short. Focus on contradictions and power dynamics.',
        search_query: '',
        model_provider: 'openai',
        model_name: 'gpt-4o',
        is_active: true,
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const result = await createAgent(formData)
            if (result.success) {
                router.push('/dashboard/agents')
            } else {
                alert(`Error: ${result.error}`)
            }
        } catch (error: any) {
            alert(`Error: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="px-6 lg:px-8 py-8 max-w-3xl mx-auto">
            <Link
                href="/dashboard/agents"
                className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6"
            >
                <ArrowLeft size={16} />
                Back to Agents
            </Link>

            <div className="mb-8">
                <h1 className="font-display text-3xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-3">
                    <Sparkles size={32} className="text-[var(--accent)]" />
                    Create Agent
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Configure an AI agent to research and write blog posts
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Name */}
                <div>
                    <label className="block text-sm font-medium mb-2">Agent Name</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Canadian Politics Scout"
                        className="input"
                        required
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium mb-2">Description (optional)</label>
                    <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Brief description of what this agent does"
                        className="input"
                    />
                </div>

                {/* Search Query */}
                <div>
                    <label className="block text-sm font-medium mb-2">Search Query</label>
                    <input
                        type="text"
                        value={formData.search_query}
                        onChange={(e) => setFormData({ ...formData, search_query: e.target.value })}
                        placeholder="e.g., latest Canadian politics news"
                        className="input"
                        required
                    />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        What should the agent search for each time it runs?
                    </p>
                </div>

                {/* System Prompt */}
                <div>
                    <label className="block text-sm font-medium mb-2">Writing Style & Persona</label>
                    <textarea
                        value={formData.system_prompt}
                        onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                        placeholder="Describe the tone, style, and approach..."
                        className="input min-h-[120px]"
                        required
                    />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        Instructions for how the agent should write (tone, style, perspective)
                    </p>
                </div>

                {/* Model Selection */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">AI Provider</label>
                        <select
                            value={formData.model_provider}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    model_provider: e.target.value as 'openai' | 'anthropic',
                                    model_name: e.target.value === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-5',
                                })
                            }
                            className="input"
                        >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Model</label>
                        <select
                            value={formData.model_name}
                            onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                            className="input"
                        >
                            {formData.model_provider === 'openai' ? (
                                <>
                                    <option value="gpt-4o">GPT-4o</option>
                                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                    <option value="gpt-4">GPT-4</option>
                                </>
                            ) : (
                                <>
                                    <option value="claude-sonnet-4-5">Claude 4.5 Sonnet</option>
                                    <option value="claude-opus-4-5">Claude 4.5 Opus</option>
                                </>
                            )}
                        </select>
                    </div>
                </div>

                {/* Info Box */}
                <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-medium)]">
                    <p className="text-sm text-[var(--text-secondary)]">
                        💡 <strong>Reminder:</strong> Make sure you've added your{' '}
                        {formData.model_provider === 'openai' ? 'OpenAI' : 'Anthropic'} and Tavily API keys in{' '}
                        <Link href="/dashboard/settings" className="underline hover:text-[var(--text-primary)]">
                            Settings
                        </Link>
                        .
                    </p>
                </div>
                {/* Submit */}
                <div className="flex gap-3">
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Sparkles size={16} />
                                Create Agent
                            </>
                        )}
                    </button>
                    <Link href="/dashboard/agents" className="btn btn-secondary">
                        Cancel
                    </Link>
                </div>
            </form>
        </main>
    )
}
