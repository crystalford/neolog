'use client'

import { useState, useEffect } from 'react'
import { Key, Copy, Trash2, Plus, Loader2, Eye, EyeOff } from 'lucide-react'

interface ApiKey {
    id: string
    name: string
    key_prefix: string
    created_at: string
    last_used_at: string | null
    is_active: boolean
}

export function ApiKeyManager() {
    const [keys, setKeys] = useState<ApiKey[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [newKeyName, setNewKeyName] = useState('')
    const [showNewKey, setShowNewKey] = useState(false)
    const [newKey, setNewKey] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadKeys()
    }, [])

    const loadKeys = async () => {
        try {
            const response = await fetch('/api/v1/keys')
            if (response.ok) {
                const data = await response.json()
                setKeys(data.keys || [])
            }
        } catch (err) {
            console.error('Failed to load API keys:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateKey = async () => {
        if (!newKeyName.trim()) {
            setError('Please enter a name for the API key')
            return
        }

        setCreating(true)
        setError(null)

        try {
            const response = await fetch('/api/v1/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || 'Failed to create API key')
                return
            }

            setNewKey(data.key)
            setShowNewKey(true)
            setNewKeyName('')
            await loadKeys()
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setCreating(false)
        }
    }

    const handleRevokeKey = async (keyId: string) => {
        if (!confirm('Revoke this API key? This cannot be undone.')) return

        try {
            const response = await fetch('/api/v1/keys', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyId }),
            })

            if (response.ok) {
                await loadKeys()
            }
        } catch (err) {
            setError('Failed to revoke API key')
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                    <Key size={24} className="text-[var(--accent)]" />
                </div>
                <div className="flex-1">
                    <h3 className="font-display text-xl mb-1">API Keys</h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Use API keys to publish content to Neolog from external platforms like your application.
                    </p>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* New Key Display */}
            {showNewKey && newKey && (
                <div className="p-5 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent)]/5">
                    <div className="flex items-start justify-between mb-3">
                        <div>
                            <h4 className="font-semibold text-[var(--accent)] mb-1">API Key Created!</h4>
                            <p className="text-sm text-[var(--text-secondary)]">
                                Save this key securely. You won't be able to see it again.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowNewKey(false)}
                            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                        >
                            ×
                        </button>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-light)] font-mono text-sm">
                        <code className="flex-1 overflow-x-auto">{newKey}</code>
                        <button
                            onClick={() => copyToClipboard(newKey)}
                            className="p-2 hover:bg-[var(--bg-secondary)] rounded transition-colors"
                            title="Copy to clipboard"
                        >
                            <Copy size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Create New Key */}
            <div className="p-5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]">
                <h4 className="font-semibold mb-3">Create New API Key</h4>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g., Production Integration"
                        className="flex-1 px-4 py-2 rounded-lg border border-[var(--border-light)] bg-white outline-none focus:border-[var(--accent)] transition-colors"
                    />
                    <button
                        onClick={handleCreateKey}
                        disabled={creating}
                        className="btn btn-primary"
                    >
                        {creating ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Plus size={16} />
                                Create Key
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Existing Keys */}
            {loading ? (
                <div className="flex items-center justify-center p-8">
                    <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
                </div>
            ) : keys.length === 0 ? (
                <div className="text-center p-8 text-[var(--text-tertiary)]">
                    <Key size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No API keys yet. Create one to get started.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {keys.map((key) => (
                        <div
                            key={key.id}
                            className="p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-colors"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <h4 className="font-semibold mb-1">{key.name}</h4>
                                    <p className="text-sm text-[var(--text-secondary)] font-mono mb-2">
                                        {key.key_prefix}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                                        <span>Created {formatDate(key.created_at)}</span>
                                        {key.last_used_at && (
                                            <span>Last used {formatDate(key.last_used_at)}</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRevokeKey(key.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Revoke key"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Documentation Link */}
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-900">
                    <strong>Need help?</strong> Check out the{' '}
                    <a href="/docs/api" className="text-blue-600 hover:underline">
                        API documentation
                    </a>{' '}
                    to learn how to use your API keys.
                </p>
            </div>
        </div>
    )
}
