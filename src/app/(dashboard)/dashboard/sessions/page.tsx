'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Layers, Plus, Loader2, CheckCircle2, AlertCircle,
  Clock, ChevronRight, Video, Sparkles,
} from 'lucide-react'
import type { ClipSession } from '@/types/database'

type SessionListItem = Pick<ClipSession,
  'id' | 'title' | 'status' | 'clip_count' | 'total_duration_seconds' | 'processed_at' | 'created_at'
>

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/clip-sessions')
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    const res = await fetch('/api/clip-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    if (res.ok) {
      const data = await res.json()
      window.location.href = `/dashboard/sessions/${data.session.id}`
    }
    setCreating(false)
  }

  const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
    collecting:  { label: 'Collecting clips',  icon: Clock,        color: 'text-[var(--text-tertiary)]' },
    processing:  { label: 'Synthesizing...',   icon: Loader2,      color: 'text-blue-400' },
    synthesized: { label: 'Ready',             icon: CheckCircle2, color: 'text-green-400' },
    error:       { label: 'Error',             icon: AlertCircle,  color: 'text-red-400' },
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null
    const m = Math.round(seconds / 60)
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
  }

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-[var(--text-primary)] mb-2">
            Sessions
          </h2>
          <p className="text-[var(--text-secondary)]">
            Group clips into sessions. The AI analyzes across all clips to find narratives and generate finished edits.
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="btn btn-primary btn-sm flex items-center gap-2 flex-shrink-0"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          New Session
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <Layers size={40} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">No sessions yet</p>
          <p className="text-sm mt-1 mb-6">Create a session to group clips for AI synthesis</p>
          <button onClick={handleCreate} className="btn btn-primary btn-sm">
            Create First Session
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const st = statusConfig[session.status] || statusConfig.collecting
            const StatusIcon = st.icon
            const isAnimating = session.status === 'processing'

            return (
              <Link
                key={session.id}
                href={`/dashboard/sessions/${session.id}`}
                className="flex items-center gap-4 px-5 py-4 border border-[var(--border-medium)] rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <Layers size={20} className="text-[var(--text-tertiary)] flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {session.title || `Session — ${new Date(session.created_at).toLocaleDateString()}`}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1">
                      <Video size={11} />
                      {session.clip_count} clip{session.clip_count !== 1 ? 's' : ''}
                    </span>
                    {session.total_duration_seconds && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {formatDuration(session.total_duration_seconds)}
                      </span>
                    )}
                    {session.status === 'synthesized' && (
                      <span className="text-xs text-[var(--accent)] flex items-center gap-1">
                        <Sparkles size={11} />
                        Edit plans ready
                      </span>
                    )}
                  </div>
                </div>

                <div className={`flex items-center gap-1.5 flex-shrink-0 ${st.color}`}>
                  <StatusIcon size={14} className={isAnimating ? 'animate-spin' : ''} />
                  <span className="text-xs font-medium">{st.label}</span>
                </div>

                <ChevronRight size={16} className="text-[var(--text-tertiary)] flex-shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
