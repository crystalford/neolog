'use client'

import Link from 'next/link'
import { Eye, Rss, Radio, Inbox, BarChart3 } from 'lucide-react'

export default function MonitorsPage() {
  return (
    <div className="p-6 lg:p-12">
      <div className="max-w-4xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-display text-[var(--text-primary)]">Monitors</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              A single place to watch your feeds, syndication, inbox, and performance signals.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/sources"
            className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <Rss size={16} />
              <span className="font-medium">Sources</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Manage RSS sources and automation settings.
            </p>
          </Link>

          <Link
            href="/inbox"
            className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <Inbox size={16} />
              <span className="font-medium">Inbox</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Review incoming items and convert them to drafts.
            </p>
          </Link>

          <Link
            href="/syndication"
            className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <Radio size={16} />
              <span className="font-medium">Syndication</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Track external distributions and status.
            </p>
          </Link>

          <Link
            href="/analytics"
            className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <BarChart3 size={16} />
              <span className="font-medium">Analytics</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              View performance and engagement trends.
            </p>
          </Link>
        </div>

        <div className="mt-6 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <Eye size={16} />
            <span className="font-medium">Coming next</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Unified monitor cards, alert thresholds, and per-publication rollups (v3.1 alignment).
          </p>
        </div>
      </div>
    </div>
  )
}
