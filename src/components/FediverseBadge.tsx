'use client'

import { useState } from 'react'
import { Globe, Copy, Check, ExternalLink } from 'lucide-react'

type FediverseBadgeProps = {
  handle: string
  searchUrl: string
}

export function FediverseBadge({ handle, searchUrl }: FediverseBadgeProps) {
  const [copied, setCopied] = useState(false)

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(handle)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Best-effort: if clipboard fails, do nothing
    }
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
      <Globe size={14} />
      <span className="font-medium text-[var(--text-primary)]">Fediverse</span>
      <span className="text-[var(--text-tertiary)]">{handle}</span>
      <button
        type="button"
        onClick={copyHandle}
        className="ml-1 inline-flex items-center gap-1 rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        aria-label="Copy fediverse handle"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        aria-label="Open Mastodon search for this handle"
      >
        Follow
        <ExternalLink size={12} />
      </a>
    </div>
  )
}
