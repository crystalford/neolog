'use client'

import { useState, useEffect } from 'react'
import { Share2, Check } from 'lucide-react'

interface SyndicationConnection {
    platform: string
    platform_username: string
    is_active: boolean
}

interface SyndicationOptionsProps {
    selectedPlatforms: string[]
    onToggle: (platform: string) => void
}

export function SyndicationOptions({ selectedPlatforms, onToggle }: SyndicationOptionsProps) {
    const [connections, setConnections] = useState<SyndicationConnection[]>([])
    const [loading, setLoading] = useState(true)

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

    const platforms = [
        { id: 'devto', name: 'Dev.to', color: 'from-black to-gray-800' },
        { id: 'medium', name: 'Medium', color: 'from-gray-800 to-gray-900', disabled: true },
        { id: 'hashnode', name: 'Hashnode', color: 'from-blue-600 to-blue-700', disabled: true },
        { id: 'linkedin', name: 'LinkedIn', color: 'from-blue-700 to-blue-800', disabled: true },
    ]

    const isConnected = (platform: string) =>
        connections.some(c => c.platform === platform && c.is_active)

    if (loading) {
        return null
    }

    const connectedPlatforms = platforms.filter(p => isConnected(p.id) && !p.disabled)

    if (connectedPlatforms.length === 0) {
        return null
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Share2 size={16} className="text-[var(--text-tertiary)]" />
                <h4 className="text-sm font-medium text-[var(--text-secondary)]">
                    Cross-post to
                </h4>
            </div>

            <div className="space-y-2">
                {connectedPlatforms.map((platform) => {
                    const isSelected = selectedPlatforms.includes(platform.id)

                    return (
                        <label
                            key={platform.id}
                            className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => onToggle(platform.id)}
                                className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-0"
                            />
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center text-white font-bold text-xs`}>
                                {platform.name[0]}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium">{platform.name}</p>
                                <p className="text-xs text-[var(--text-tertiary)]">
                                    @{connections.find(c => c.platform === platform.id)?.platform_username}
                                </p>
                            </div>
                            {isSelected && (
                                <Check size={16} className="text-[var(--accent)]" />
                            )}
                        </label>
                    )
                })}
            </div>

            <p className="text-xs text-[var(--text-tertiary)]">
                Posts will include a canonical URL pointing back to your Neolog post
            </p>
        </div>
    )
}
