'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { History, ChevronRight, RotateCcw, Eye, User } from 'lucide-react'
import type { PostVersionWithAuthor } from '@/types/database'

interface VersionHistoryProps {
  postId: string
  onRestore?: (version: PostVersionWithAuthor) => void
  onPreview?: (version: PostVersionWithAuthor) => void
}

export function VersionHistory({ postId, onRestore, onPreview }: VersionHistoryProps) {
  const [versions, setVersions] = useState<PostVersionWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadVersions()
  }, [postId])

  const loadVersions = async () => {
    const { data, error } = await supabase
      .from('post_versions')
      .select(`
        *,
        changed_by_profile:profiles!post_versions_changed_by_fkey(*)
      `)
      .eq('post_id', postId)
      .order('version_number', { ascending: false })

    if (!error && data) {
      setVersions(data)
    }
    setLoading(false)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000)
      if (hours < 1) {
        const mins = Math.floor(diff / 60000)
        return mins < 1 ? 'Just now' : `${mins}m ago`
      }
      return `${hours}h ago`
    }
    
    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000)
      return `${days}d ago`
    }
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  if (loading) {
    return null
  }

  if (versions.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center">
            <History size={16} className="text-[var(--text-secondary)]" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">Version History</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {versions.length} {versions.length === 1 ? 'version' : 'versions'}
            </p>
          </div>
        </div>
        <ChevronRight 
          size={18} 
          className={`text-[var(--text-tertiary)] transition-transform ${expanded ? 'rotate-90' : ''}`} 
        />
      </button>

      {/* Version list */}
      {expanded && (
        <div className="border-t border-[var(--border-light)]">
          <div className="max-h-80 overflow-y-auto">
            {versions.map((version, index) => (
              <div 
                key={version.id}
                className={`p-4 flex items-start gap-4 ${
                  index !== versions.length - 1 ? 'border-b border-[var(--border-light)]' : ''
                }`}
              >
                {/* Version indicator */}
                <div className="relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                    index === 0 
                      ? 'bg-[var(--accent)] text-white' 
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  }`}>
                    v{version.version_number}
                  </div>
                  {index !== versions.length - 1 && (
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 w-px h-full bg-[var(--border-light)]" />
                  )}
                </div>

                {/* Version info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">
                      {version.change_summary || `Version ${version.version_number}`}
                    </span>
                    {index === 0 && (
                      <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[var(--accent-soft)] text-[var(--accent)] rounded">
                        Current
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                    <span>{formatDate(version.created_at)}</span>
                    {version.changed_by_profile && (
                      <>
                        <span>-</span>
                        <span className="flex items-center gap-1">
                          <User size={10} />
                          {version.changed_by_profile.display_name || version.changed_by_profile.username}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {index !== 0 && (onPreview || onRestore) && (
                  <div className="flex items-center gap-1">
                    {onPreview && (
                      <button
                        onClick={() => onPreview(version)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                        title="Preview this version"
                      >
                        <Eye size={14} className="text-[var(--text-tertiary)]" />
                      </button>
                    )}
                    {onRestore && (
                      <button
                        onClick={() => onRestore(version)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                        title="Restore this version"
                      >
                        <RotateCcw size={14} className="text-[var(--text-tertiary)]" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

