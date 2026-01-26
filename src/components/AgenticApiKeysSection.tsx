'use client'

import { useState, useEffect } from 'react'
import { saveApiKey, deleteApiKey, getApiKeys, type ApiProvider } from '@/app/actions/apiKeys'
import { maskApiKey } from '@/lib/encryption'
import { Loader2, Key, Check, Trash2, Sparkles, ExternalLink } from 'lucide-react'

export function AgenticApiKeysSection() {
    const [providers, setProviders] = useState<{ provider: ApiProvider; hasKey: boolean }[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState<ApiProvider | null>(null)
    const [keys, setKeys] = useState<Record<ApiProvider, string>>({
        openai: '',
        anthropic: '',
        tavily: '',
        serpapi: '',
    })
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        loadKeys()
    }, [])

    const loadKeys = async () => {
        try {
            const data = await getApiKeys()
            const providerMap: Record<ApiProvider, boolean> = {
                openai: false,
                anthropic: false,
                tavily: false,
                serpapi: false,
            }

            data.forEach(item => {
                providerMap[item.provider] = item.hasKey
            })

            setProviders(
                Object.entries(providerMap).map(([provider, hasKey]) => ({
                    provider: provider as ApiProvider,
                    hasKey,
                }))
            )
        } catch (err) {
            console.error('Failed to load keys:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async (provider: ApiProvider) => {
        const key = keys[provider]
        if (!key || key.trim().length < 10) {
            setError('API key is too short or invalid')
            return
        }

        setSaving(provider)
        setError(null)
        setSuccess(null)

        try {
            const result = await saveApiKey(provider, key.trim())
            if (result.success) {
                setSuccess(`${getProviderLabel(provider)} key saved!`)
                setKeys(prev => ({ ...prev, [provider]: '' }))
                await loadKeys()
                setTimeout(() => setSuccess(null), 3000)
            } else {
                setError(result.error || 'Failed to save key')
            }
        } catch (err: any) {
            setError(err.message || 'Failed to save key')
        } finally {
            setSaving(null)
        }
    }

    const handleDelete = async (provider: ApiProvider) => {
        if (!confirm(`Delete your ${getProviderLabel(provider)} API key?`)) return

        setError(null)
        try {
            const result = await deleteApiKey(provider)
            if (result.success) {
                setSuccess(`${getProviderLabel(provider)} key deleted`)
                await loadKeys()
                setTimeout(() => setSuccess(null), 3000)
            } else {
                setError(result.error || 'Failed to delete key')
            }
        } catch (err: any) {
            setError(err.message || 'Failed to delete key')
        }
    }

    const getProviderLabel = (provider: ApiProvider): string => {
        const labels: Record<ApiProvider, string> = {
            openai: 'OpenAI',
            anthropic: 'Anthropic',
            tavily: 'Tavily',
            serpapi: 'SerpAPI',
        }
        return labels[provider]
    }

    const getProviderHelp = (provider: ApiProvider): { url: string; description: string } => {
        const help: Record<ApiProvider, { url: string; description: string }> = {
            openai: {
                url: 'https://platform.openai.com/api-keys',
                description: 'For GPT-4o and other OpenAI models. Used to generate article content.',
            },
            anthropic: {
                url: 'https://console.anthropic.com/settings/keys',
                description: 'For Claude 3.5 Sonnet and other Anthropic models. Alternative to OpenAI for content generation.',
            },
            tavily: {
                url: 'https://app.tavily.com/home',
                description: 'AI-native search API. Required for agents to research the web. Free tier: 1,000 searches/month.',
            },
            serpapi: {
                url: 'https://serpapi.com/manage-api-key',
                description: 'Alternative search API. Optional if using Tavily.',
            },
        }
        return help[provider]
    }

    const hasAnyKey = providers.some(p => p.hasKey)

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
        )
    }

    return (
        <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                    <Sparkles size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <h2 className="font-display text-lg">Agentic API Keys</h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                        Keys for AI agents to research and write blog posts
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 text-sm text-red-600 dark:text-red-400">
                    {error}
                </div>
            )}

            {success && (
                <div className="mb-4 p-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20 text-sm text-green-600 dark:text-green-400">
                    {success}
                </div>
            )}

            <div className="space-y-6">
                {providers.map(({ provider, hasKey }) => {
                    const help = getProviderHelp(provider)
                    return (
                        <div key={provider} className="border-b border-[var(--border-light)] last:border-0 pb-6 last:pb-0">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm font-medium">{getProviderLabel(provider)}</label>
                                        {hasKey && (
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                                                Connected
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                                        {help.description}
                                    </p>
                                    <a
                                        href={help.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline mt-1"
                                    >
                                        Get your API key
                                        <ExternalLink size={12} />
                                    </a>
                                </div>
                                {hasKey && (
                                    <button
                                        onClick={() => handleDelete(provider)}
                                        className="btn btn-ghost btn-sm btn-icon text-[var(--error)]"
                                        title="Delete key"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>

                            {!hasKey && (
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        value={keys[provider]}
                                        onChange={(e) => setKeys(prev => ({ ...prev, [provider]: e.target.value }))}
                                        placeholder={`Paste your ${getProviderLabel(provider)} API key`}
                                        className="input flex-1"
                                    />
                                    <button
                                        onClick={() => handleSave(provider)}
                                        disabled={saving === provider || !keys[provider]}
                                        className="btn btn-primary"
                                    >
                                        {saving === provider ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Check size={14} />
                                                Save
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {!hasAnyKey && (
                <div className="mt-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                        💡 <strong>Get started:</strong> Add at least your <strong>OpenAI</strong> (or Anthropic) and{' '}
                        <strong>Tavily</strong> keys to enable agentic newsroom features.
                    </p>
                </div>
            )}
        </section>
    )
}
