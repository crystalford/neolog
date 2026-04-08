'use client'export const runtime = 'edge'


import { ApiKeyManager } from '@/components/ApiKeyManager'
import { AICaptureSettings } from '@/components/AICaptureSettings'
import { Code2 } from 'lucide-react'

export default function ApiPage() {
    return (
        <main className="min-h-screen bg-[var(--bg-primary)] p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                            <Code2 size={24} className="text-[var(--accent)]" />
                        </div>
                        <div>
                            <h1 className="font-display text-3xl font-bold">API & Integrations</h1>
                            <p className="text-[var(--text-secondary)]">
                                Connect external platforms and manage API access
                            </p>
                        </div>
                    </div>
                </div>

                {/* Publishing API Keys */}
                <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6 shadow-sm mb-6">
                    <ApiKeyManager />
                </section>

                {/* AI Capture (BYOK) */}
                <div className="mb-6">
                    <AICaptureSettings />
                </div>

                {/* Documentation Link */}
                <section className="rounded-2xl bg-blue-50 border border-blue-200 p-6">
                    <h3 className="font-semibold text-blue-900 mb-2">API Documentation</h3>
                    <p className="text-sm text-blue-800 mb-4">
                        Learn how to use the Neolog Publishing API to publish content from external platforms like your application.
                    </p>
                    <a
                        href="/docs/api"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                        View API Docs
                    </a>
                </section>
            </div>
        </main>
    )
}
