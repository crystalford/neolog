'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KeyRound } from 'lucide-react'

const aiProviders = [
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic (Claude)' },
    { id: 'perplexity', label: 'Perplexity' },
    { id: 'grok', label: 'Grok (Speed)' },
    { id: 'x', label: 'X (Twitter) API' },
    { id: 'groq', label: 'Groq (Speed)' },
    { id: 'replicate', label: 'Replicate (Flux)' },
    { id: 'elevenlabs', label: 'ElevenLabs (Voice)' },
]

export function AICaptureSettings() {
    const [integrationKeys, setIntegrationKeys] = useState<{
        id: string
        provider: string
        label: string | null
        is_active: boolean
    }[]>([])
    const [integrationDrafts, setIntegrationDrafts] = useState<Record<string, string>>({})
    const [integrationLabels, setIntegrationLabels] = useState<Record<string, string>>({})
    const [integrationSaving, setIntegrationSaving] = useState<string | null>(null)

    const supabase = createClient()

    useEffect(() => {
        loadIntegrations()
    }, [])

    const loadIntegrations = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data } = await supabase
            .from('integration_keys')
            .select('id, provider, label, is_active')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })

        if (data) {
            setIntegrationKeys(data)
        }
    }

    const getProviderKeys = (providerId: string) => {
        return integrationKeys.filter((k) => k.provider === providerId)
    }

    const isConnected = (providerId: string) => {
        return integrationKeys.some((k) => k.provider === providerId && k.is_active)
    }

    const getIntegrationHint = (providerId: string, value: string) => {
        if (!value) return null
        if (providerId === 'openai' && !value.startsWith('sk-')) {
            return { tone: 'error' as const, text: 'OpenAI keys start with sk-' }
        }
        if (providerId === 'anthropic' && !value.startsWith('sk-ant-')) {
            return { tone: 'error' as const, text: 'Anthropic keys start with sk-ant-' }
        }
        if (providerId === 'perplexity' && !value.startsWith('pplx-')) {
            return { tone: 'error' as const, text: 'Perplexity keys start with pplx-' }
        }
        return null
    }

    const saveIntegration = async (providerId: string) => {
        const value = integrationDrafts[providerId]
        if (!value) return

        setIntegrationSaving(providerId)

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const label = integrationLabels[providerId] || null

        const { error } = await supabase.from('integration_keys').insert({
            user_id: session.user.id,
            provider: providerId,
            api_key: value,
            label,
            is_active: true,
        })

        if (!error) {
            setIntegrationDrafts((prev) => ({ ...prev, [providerId]: '' }))
            setIntegrationLabels((prev) => ({ ...prev, [providerId]: '' }))
            await loadIntegrations()
        }

        setIntegrationSaving(null)
    }

    const setActiveIntegration = async (keyId: string) => {
        const key = integrationKeys.find((k) => k.id === keyId)
        if (!key) return

        // Deactivate all keys for this provider
        await supabase
            .from('integration_keys')
            .update({ is_active: false })
            .eq('provider', key.provider)

        // Activate this key
        await supabase
            .from('integration_keys')
            .update({ is_active: true })
            .eq('id', keyId)

        await loadIntegrations()
    }

    const deleteIntegration = async (keyId: string) => {
        await supabase.from('integration_keys').delete().eq('id', keyId)
        await loadIntegrations()
    }

    return (
        <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                    <KeyRound size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-lg">AI Capture (BYOK)</h2>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
                Add your own keys to unlock AI summaries, expansions, and research tools.
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mb-6">
                Active keys are used first. Pro users can fall back to managed keys when no active key is set.
            </p>

            <div className="space-y-4">
                {aiProviders.map((provider) => {
                    const providerKeys = getProviderKeys(provider.id)
                    const draftValue = integrationDrafts[provider.id] || ''
                    const hint = getIntegrationHint(provider.id, draftValue)
                    return (
                        <div key={provider.id} className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-sm font-medium text-[var(--text-primary)]">
                                        {provider.label}
                                    </p>
                                    <p className="text-xs text-[var(--text-tertiary)]">
                                        {isConnected(provider.id) ? 'Active' : 'Not connected'}
                                    </p>
                                </div>
                                {isConnected(provider.id) && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.2em] bg-[var(--accent-soft)] text-[var(--accent)]">
                                        Active
                                    </span>
                                )}
                            </div>

                            {providerKeys.length > 0 ? (
                                <div className="space-y-2 mb-4">
                                    {providerKeys.map((key, index) => (
                                        <div key={key.id} className="flex items-center justify-between text-xs">
                                            <div>
                                                <p className="text-[var(--text-primary)] font-medium">
                                                    {key.label || `Key ${providerKeys.length - index}`}
                                                </p>
                                                <p className="text-[var(--text-tertiary)]">
                                                    {key.is_active ? 'Active' : 'Inactive'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!key.is_active && (
                                                    <button
                                                        onClick={() => setActiveIntegration(key.id)}
                                                        className="btn btn-secondary btn-sm"
                                                    >
                                                        Set active
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => deleteIntegration(key.id)}
                                                    className="btn btn-secondary btn-sm text-[var(--error)]"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-[var(--text-tertiary)] mb-4">
                                    No keys saved yet.
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    type="text"
                                    value={integrationLabels[provider.id] || ''}
                                    onChange={(event) =>
                                        setIntegrationLabels((prev) => ({
                                            ...prev,
                                            [provider.id]: event.target.value,
                                        }))
                                    }
                                    placeholder="Label (optional)"
                                    className="input flex-1 min-w-[160px]"
                                />
                                <input
                                    type="password"
                                    value={draftValue}
                                    onChange={(event) =>
                                        setIntegrationDrafts((prev) => ({
                                            ...prev,
                                            [provider.id]: event.target.value,
                                        }))
                                    }
                                    placeholder={isConnected(provider.id) ? '************' : 'Paste API key'}
                                    className="input flex-1 min-w-[200px]"
                                />
                                <button
                                    onClick={() => saveIntegration(provider.id)}
                                    disabled={integrationSaving === provider.id}
                                    className="btn btn-secondary btn-sm"
                                >
                                    {integrationSaving === provider.id ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                            {hint && (
                                <p className={`text-xs mt-2 ${hint.tone === 'error' ? 'text-[var(--error)]' : 'text-[var(--warning)]'}`}>
                                    {hint.text}
                                </p>
                            )}
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
