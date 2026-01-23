'use client'

import { useState, useEffect } from 'react'
import { Share2, Check, X, Loader2, ExternalLink } from 'lucide-react'

interface SyndicationConnection {
    platform: string
    platform_username: string
    is_active: boolean
}

export function SyndicationSettings() {
    const [connections, setConnections] = useState<SyndicationConnection[]>([])
    const [loading, setLoading] = useState(true)
    const [devtoApiKey, setDevtoApiKey] = useState('')
    const [hashnodeApiKey, setHashnodeApiKey] = useState('')
    const [hashnodePublicationId, setHashnodePublicationId] = useState('')
    const [blueskyIdentifier, setBlueskyIdentifier] = useState('')
    const [blueskyPassword, setBlueskyPassword] = useState('')
    const [connecting, setConnecting] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        loadConnections()
    }, [])

    const loadConnections = async () => {
        try {
            const response = await fetch('/api/syndication/connections')
            if (response.ok) {
                const data = await response.json()
                setConnections(data.connections || [])
            }
        } catch (err) {
            console.error('Failed to load connections:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleConnectDevTo = async () => {
        if (!devtoApiKey.trim()) {
            setError('Please enter your Dev.to API key')
            return
        }

        setConnecting('devto')
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch('/api/syndication/devto/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: devtoApiKey }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || 'Failed to connect')
                return
            }

            setSuccess(`Connected to Dev.to as @${data.username}`)
            setDevtoApiKey('')
            await loadConnections()
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setConnecting(null)
        }
    }

    const handleConnectHashnode = async () => {
        if (!hashnodeApiKey.trim()) {
            setError('Please enter your Hashnode API key')
            return
        }
        if (!hashnodePublicationId.trim()) {
            setError('Please enter your Hashnode publication ID')
            return
        }

        setConnecting('hashnode')
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch('/api/syndication/hashnode/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: hashnodeApiKey,
                    publicationId: hashnodePublicationId
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || 'Failed to connect')
                return
            }

            setSuccess(`Connected to Hashnode as @${data.username}`)
            setHashnodeApiKey('')
            setHashnodePublicationId('')
            await loadConnections()
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setConnecting(null)
        }
    }

    const handleConnectBluesky = async () => {
        if (!blueskyIdentifier.trim() || !blueskyPassword.trim()) {
            setError('Please enter both username and app password')
            return
        }

        setConnecting('bluesky')
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch('/api/syndication/bluesky/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier: blueskyIdentifier,
                    password: blueskyPassword,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || 'Failed to connect')
                return
            }

            setSuccess(`Connected to Bluesky as @${data.username}`)
            setBlueskyIdentifier('')
            setBlueskyPassword('')
            await loadConnections()
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setConnecting(null)
        }
    }

    const handleDisconnect = async (platform: string) => {
        if (!confirm(`Disconnect from ${platform}?`)) return

        try {
            const response = await fetch('/api/syndication/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            })

            if (response.ok) {
                setSuccess(`Disconnected from ${platform}`)
                await loadConnections()
            }
        } catch (err) {
            setError('Failed to disconnect')
        }
    }

    const isConnected = (platform: string) =>
        connections.some(c => c.platform === platform && c.is_active)

    const getConnection = (platform: string) =>
        connections.find(c => c.platform === platform && c.is_active)

    const platforms = [
        {
            id: 'devto',
            name: 'Dev.to',
            description: 'Reach 1M+ developers',
            color: 'from-black to-gray-800',
            docsUrl: 'https://dev.to/settings/extensions',
            disabled: false,
        },
        {
            id: 'hashnode',
            name: 'Hashnode',
            description: 'Reach 500K+ developers',
            color: 'from-blue-600 to-blue-700',
            docsUrl: 'https://hashnode.com/settings/developer',
            disabled: false,
        },
        {
            id: 'linkedin',
            name: 'LinkedIn',
            description: 'Reach 900M+ professionals',
            color: 'from-blue-700 to-blue-800',
            requiresOAuth: true,
            disabled: false,
        },
        {
            id: 'bluesky',
            name: 'Bluesky',
            description: 'Reach 5M+ users on AT Protocol',
            color: 'from-blue-400 to-blue-600',
            requiresCredentials: true,
            disabled: false,
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                    <Share2 size={24} className="text-[var(--accent)]" />
                </div>
                <div className="flex-1">
                    <h3 className="font-display text-xl mb-1">Cross-Platform Publishing</h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Write once in Neolog, publish everywhere. Connect your accounts to auto-publish to multiple platforms.
                    </p>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {success && (
                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-sm text-green-700">{success}</p>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center p-8">
                    <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
                </div>
            ) : (
                <div className="space-y-4">
                    {platforms.map((platform) => {
                        const connected = isConnected(platform.id)
                        const connection = getConnection(platform.id)

                        return (
                            <div
                                key={platform.id}
                                className="p-5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center text-white font-bold text-sm`}>
                                            {platform.name[0]}
                                        </div>
                                        <div>
                                            <h4 className="font-semibold">{platform.name}</h4>
                                            <p className="text-sm text-[var(--text-tertiary)]">{platform.description}</p>
                                        </div>
                                    </div>
                                    {connected && (
                                        <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium flex items-center gap-1">
                                            <Check size={12} />
                                            Connected
                                        </span>
                                    )}
                                </div>

                                {connected ? (
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm text-[var(--text-secondary)]">
                                            Connected as <span className="font-mono">@{connection?.platform_username}</span>
                                        </p>
                                        <button
                                            onClick={() => handleDisconnect(platform.id)}
                                            className="text-sm text-red-600 hover:underline"
                                        >
                                            Disconnect
                                        </button>
                                    </div>
                                ) : platform.disabled ? (
                                    <p className="text-sm text-[var(--text-tertiary)] italic">Coming soon</p>
                                ) : platform.id === 'devto' ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                                Dev.to API Key
                                            </label>
                                            <input
                                                type="password"
                                                value={devtoApiKey}
                                                onChange={(e) => setDevtoApiKey(e.target.value)}
                                                placeholder="Enter your Dev.to API key"
                                                className="w-full px-4 py-2 rounded-lg border border-[var(--border-light)] bg-white outline-none focus:border-[var(--accent)] transition-colors"
                                            />
                                            <a
                                                href={platform.docsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-[var(--accent)] hover:underline mt-1 inline-flex items-center gap-1"
                                            >
                                                Get your API key <ExternalLink size={12} />
                                            </a>
                                        </div>
                                        <button
                                            onClick={handleConnectDevTo}
                                            disabled={connecting === 'devto'}
                                            className="btn btn-primary btn-sm"
                                        >
                                            {connecting === 'devto' ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    Connecting...
                                                </>
                                            ) : (
                                                'Connect Dev.to'
                                            )}
                                        </button>
                                    </div>
                                ) : platform.id === 'hashnode' ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                                Hashnode API Key
                                            </label>
                                            <input
                                                type="password"
                                                value={hashnodeApiKey}
                                                onChange={(e) => setHashnodeApiKey(e.target.value)}
                                                placeholder="Enter your Hashnode API key"
                                                className="w-full px-4 py-2 rounded-lg border border-[var(--border-light)] bg-white outline-none focus:border-[var(--accent)] transition-colors mb-2"
                                            />
                                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                                Publication ID
                                            </label>
                                            <input
                                                type="text"
                                                value={hashnodePublicationId}
                                                onChange={(e) => setHashnodePublicationId(e.target.value)}
                                                placeholder="Enter your publication ID"
                                                className="w-full px-4 py-2 rounded-lg border border-[var(--border-light)] bg-white outline-none focus:border-[var(--accent)] transition-colors"
                                            />
                                            <a
                                                href={platform.docsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-[var(--accent)] hover:underline mt-1 inline-flex items-center gap-1"
                                            >
                                                Get your API key & Publication ID <ExternalLink size={12} />
                                            </a>
                                        </div>
                                        <button
                                            onClick={handleConnectHashnode}
                                            disabled={connecting === 'hashnode'}
                                            className="btn btn-primary btn-sm"
                                        >
                                            {connecting === 'hashnode' ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    Connecting...
                                                </>
                                            ) : (
                                                'Connect Hashnode'
                                            )}
                                        </button>
                                    </div>
                                ) : platform.id === 'linkedin' && platform.requiresOAuth ? (
                                    <div>
                                        <a
                                            href="/api/syndication/linkedin/connect"
                                            className="btn btn-primary btn-sm inline-flex items-center gap-2"
                                        >
                                            Connect with LinkedIn
                                        </a>
                                        <p className="text-xs text-[var(--text-tertiary)] mt-2">
                                            You'll be redirected to LinkedIn to authorize Neolog
                                        </p>
                                    </div>
                                ) : platform.id === 'bluesky' && platform.requiresCredentials ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                                Username or Email
                                            </label>
                                            <input
                                                type="text"
                                                value={blueskyIdentifier}
                                                onChange={(e) => setBlueskyIdentifier(e.target.value)}
                                                placeholder="username.bsky.social"
                                                className="w-full px-4 py-2 rounded-lg border border-[var(--border-light)] bg-white outline-none focus:border-[var(--accent)] transition-colors mb-2"
                                            />
                                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                                App Password
                                            </label>
                                            <input
                                                type="password"
                                                value={blueskyPassword}
                                                onChange={(e) => setBlueskyPassword(e.target.value)}
                                                placeholder="Enter your app password"
                                                className="w-full px-4 py-2 rounded-lg border border-[var(--border-light)] bg-white outline-none focus:border-[var(--accent)] transition-colors"
                                            />
                                            <a
                                                href="https://bsky.app/settings/app-passwords"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-[var(--accent)] hover:underline mt-2 inline-flex items-center gap-1"
                                            >
                                                Create app password
                                                <ExternalLink size={12} />
                                            </a>
                                        </div>
                                        <button
                                            onClick={handleConnectBluesky}
                                            disabled={connecting === 'bluesky'}
                                            className="btn btn-primary btn-sm"
                                        >
                                            {connecting === 'bluesky' ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    Connecting...
                                                </>
                                            ) : (
                                                'Connect Bluesky'
                                            )}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
