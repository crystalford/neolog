'use client'

import { useState } from 'react'
import { Sparkles, Eye, CheckCircle } from 'lucide-react'

interface Draft {
    id: string
    title: string
    preview: string
    source: 'chat' | 'agent'
}

export function PublishPanel() {
    // TODO: Load actual drafts from database
    const [drafts] = useState<Draft[]>([])

    return (
        <div className="flex flex-col h-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border-light)]">
                <div className="flex items-center gap-3">
                    <Sparkles size={20} className="text-[var(--accent)]" />
                    <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                        Ready to Publish
                    </h2>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    AI-generated drafts waiting for review
                </p>
            </div>

            {/* Drafts */}
            <div className="flex-1 overflow-y-auto p-4">
                {drafts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <Sparkles size={48} className="text-[var(--text-tertiary)] mb-4" />
                        <h3 className="font-semibold text-[var(--text-secondary)] mb-2">
                            No drafts ready
                        </h3>
                        <p className="text-sm text-[var(--text-tertiary)] max-w-sm">
                            Chat with AI or dispatch an agent to create content automatically
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {drafts.map((draft) => (
                            <div
                                key={draft.id}
                                className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                            >
                                <div className="flex items-start gap-2 mb-3">
                                    <Sparkles size={16} className="text-[var(--accent)] mt-1" />
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-[var(--text-primary)] mb-1">
                                            {draft.title}
                                        </h3>
                                        <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                                            {draft.preview}
                                        </p>
                                        <p className="text-xs text-[var(--text-tertiary)] mt-2">
                                            From {draft.source === 'chat' ? 'conversation' : 'agent research'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button className="flex-1 btn btn-secondary btn-sm">
                                        <Eye size={14} />
                                        Review
                                    </button>
                                    <button className="flex-1 btn btn-primary btn-sm">
                                        <CheckCircle size={14} />
                                        Publish
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
