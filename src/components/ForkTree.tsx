'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GitFork, ChevronRight, User, ExternalLink } from 'lucide-react'
import type { ForkTreeNode } from '@/types/database'

interface ForkTreeProps {
  postId: string
  rootPostId: string | null
  currentPostId: string
}

export function ForkTree({ postId, rootPostId, currentPostId }: ForkTreeProps) {
  const [tree, setTree] = useState<ForkTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadForkTree()
  }, [postId, rootPostId])

  const loadForkTree = async () => {
    // Get the tree starting from the root
    const startId = rootPostId || postId
    
    const { data, error } = await supabase
      .rpc('get_fork_tree', { post_uuid: startId })

    if (!error && data) {
      setTree(data)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--text-tertiary)] border-t-transparent animate-spin" />
          Loading fork tree...
        </div>
      </div>
    )
  }

  if (tree.length <= 1) {
    return null // No forks to show
  }

  // Organize tree by depth
  const treeByDepth: { [depth: number]: ForkTreeNode[] } = {}
  tree.forEach(node => {
    if (!treeByDepth[node.fork_depth]) {
      treeByDepth[node.fork_depth] = []
    }
    treeByDepth[node.fork_depth].push(node)
  })

  const maxDepth = Math.max(...Object.keys(treeByDepth).map(Number))

  return (
    <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
            <GitFork size={16} className="text-[var(--accent)]" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">Fork Tree</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {tree.length} {tree.length === 1 ? 'version' : 'versions'} across {maxDepth + 1} {maxDepth === 0 ? 'generation' : 'generations'}
            </p>
          </div>
        </div>
        <ChevronRight 
          size={18} 
          className={`text-[var(--text-tertiary)] transition-transform ${expanded ? 'rotate-90' : ''}`} 
        />
      </button>

      {/* Tree visualization */}
      {expanded && (
        <div className="p-4 pt-0 border-t border-[var(--border-light)]">
          <div className="space-y-3 mt-4">
            {Object.entries(treeByDepth).map(([depth, nodes]) => (
              <div key={depth} className="relative">
                {/* Depth label */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    {depth === '0' ? 'Original' : `Generation ${depth}`}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border-light)]" />
                </div>

                {/* Nodes at this depth */}
                <div className="space-y-2 pl-4">
                  {nodes.map((node) => {
                    const publicationSlug = (node as any).publication_slug || node.author_username
                    return (
                    <Link
                      key={node.id}
                      href={`/${publicationSlug}/${node.id}`}
                      className={`block p-3 rounded-lg border transition-all ${
                        node.id === currentPostId
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                          : 'bg-[var(--bg-primary)] border-[var(--border-light)] hover:border-[var(--border-medium)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`font-medium text-sm truncate ${
                            node.id === currentPostId ? 'text-[var(--accent)]' : ''
                          }`}>
                            {node.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-tertiary)]">
                            <User size={10} />
                            <span>{node.author_display_name || node.author_username}</span>
                            {node.fork_count > 0 && (
                              <>
                                <span>-</span>
                                <span className="flex items-center gap-1">
                                  <GitFork size={10} />
                                  {node.fork_count}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {node.id !== currentPostId && (
                          <ExternalLink size={14} className="text-[var(--text-tertiary)] flex-shrink-0" />
                        )}
                      </div>
                    </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

