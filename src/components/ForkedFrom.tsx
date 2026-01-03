import Link from 'next/link'
import { GitFork } from 'lucide-react'
import type { Profile } from '@/types/database'

interface ForkedFromProps {
  originalPost: {
    id: string
    title: string
    slug: string
    author: Profile
  }
}

export function ForkedFrom({ originalPost }: ForkedFromProps) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
      <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
        <GitFork size={18} className="text-[var(--accent)]" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-[var(--text-secondary)]">
          Forked from
        </p>
        <Link 
          href={`/${originalPost.author.username}/${originalPost.slug}`}
          className="text-[var(--text-primary)] font-medium hover:text-[var(--accent)] transition-colors truncate block"
        >
          {originalPost.title}
        </Link>
        <p className="text-xs text-[var(--text-tertiary)]">
          by{' '}
          <Link 
            href={`/${originalPost.author.username}`}
            className="hover:text-[var(--accent)] transition-colors"
          >
            {originalPost.author.display_name || originalPost.author.username}
          </Link>
        </p>
      </div>
    </div>
  )
}
