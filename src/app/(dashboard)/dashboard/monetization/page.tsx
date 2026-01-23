'use client'

import { DollarSign } from 'lucide-react'

export default function MonetizationPage() {
    return (
        <main className="min-h-screen bg-[var(--bg-primary)] p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                            <DollarSign size={24} className="text-[var(--accent)]" />
                        </div>
                        <div>
                            <h1 className="font-display text-3xl font-bold">Monetization</h1>
                            <p className="text-[var(--text-secondary)]">
                                Manage premium content and subscriptions
                            </p>
                        </div>
                    </div>
                </div>

                {/* Premium Content Settings */}
                <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6 shadow-sm mb-6">
                    <h2 className="font-display text-xl font-semibold mb-4">Premium Content</h2>
                    <p className="text-[var(--text-secondary)] mb-6">
                        Mark posts as premium to restrict access to paid subscribers only.
                    </p>
                    <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                        <p className="text-sm text-blue-900">
                            <strong>How it works:</strong> When writing a post, toggle "Premium Only" in the post settings.
                            Only subscribers will be able to read the full content.
                        </p>
                    </div>
                </section>

                {/* Subscription Tiers (Future) */}
                <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6 shadow-sm">
                    <h2 className="font-display text-xl font-semibold mb-4">Subscription Tiers</h2>
                    <p className="text-[var(--text-secondary)] mb-6">
                        Create different subscription levels with varying benefits.
                    </p>
                    <div className="p-8 text-center border-2 border-dashed border-[var(--border-light)] rounded-xl">
                        <DollarSign size={32} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
                        <p className="text-[var(--text-secondary)] mb-4">
                            Subscription tiers coming soon
                        </p>
                        <p className="text-sm text-[var(--text-tertiary)]">
                            Set up multiple pricing tiers, offer exclusive benefits, and grow your revenue.
                        </p>
                    </div>
                </section>
            </div>
        </main>
    )
}
