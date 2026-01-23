'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Book, Code2, ArrowLeft, Terminal, Shield, FileImage, Layout } from 'lucide-react'

export default function DocsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    const navItems = [
        { href: '/docs/api', label: 'API Reference', icon: Code2 },
        // Future: { href: '/docs/webhooks', label: 'Webhooks', icon: Webhook },
    ]

    const endpoints = [
        { href: '/docs/api#authentication', label: 'Authentication' },
        { href: '/docs/api#get-posts', label: 'List Posts' },
        { href: '/docs/api#create-post', label: 'Create Post' },
        { href: '/docs/api#upload-image', label: 'Upload Image' },
    ]

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-[var(--border-light)] bg-[var(--bg-secondary)] flex flex-col fixed top-0 bottom-0 left-0 z-50 overflow-y-auto">
                <div className="p-6 border-b border-[var(--border-light)]">
                    <Link href="/dashboard" className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-4 text-sm font-medium">
                        <ArrowLeft size={16} />
                        Back to Dashboard
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold">
                            N
                        </div>
                        <span className="font-display text-lg font-bold">Neolog API</span>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-6">
                    <div>
                        <p className="px-2 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                            Getting Started
                        </p>
                        <div className="space-y-1">
                            {navItems.map((item) => {
                                const isActive = pathname === item.href
                                const Icon = item.icon
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
                                                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm font-medium'
                                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]'
                                            }`}
                                    >
                                        <Icon size={16} />
                                        {item.label}
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                        <p className="px-2 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                            Endpoints
                        </p>
                        <div className="space-y-1">
                            {endpoints.map((item) => (
                                <a
                                    key={item.href}
                                    href={item.href}
                                    className="block px-3 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] transition-colors"
                                >
                                    {item.label}
                                </a>
                            ))}
                        </div>
                    </div>
                </nav>

                <div className="p-4 border-t border-[var(--border-light)]">
                    <p className="text-xs text-[var(--text-tertiary)] text-center">
                        Neolog Publishing API v1.0
                    </p>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 min-w-0">
                <div className="max-w-4xl mx-auto px-8 py-12">
                    {children}
                </div>
            </main>
        </div>
    )
}
