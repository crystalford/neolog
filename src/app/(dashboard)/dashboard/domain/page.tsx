'use client'export const runtime = 'edge'


import { PublicationDomainSection } from '@/components/PublicationDomainSection'
import { Globe } from 'lucide-react'

export default function CustomDomainPage() {
    return (
        <main className="min-h-screen bg-[var(--bg-primary)] p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                            <Globe size={24} className="text-[var(--accent)]" />
                        </div>
                        <div>
                            <h1 className="font-display text-3xl font-bold">Custom Domain</h1>
                            <p className="text-[var(--text-secondary)]">
                                Use your own domain for your publication
                            </p>
                        </div>
                    </div>
                </div>

                {/* Custom Domain Settings */}
                <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6 shadow-sm">
                    <PublicationDomainSection />
                </section>
            </div>
        </main>
    )
}
