'use client'export const runtime = 'edge'


import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { FolderOpen, Clock, Hash, ArrowRight, BookOpen, Code2, Palette, Briefcase, User, HelpCircle } from 'lucide-react'

const PROJECT_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  tech:      { label: 'Tech',      icon: Code2,     color: 'text-blue-400' },
  book:      { label: 'Book',      icon: BookOpen,  color: 'text-amber-400' },
  creative:  { label: 'Creative',  icon: Palette,   color: 'text-purple-400' },
  business:  { label: 'Business',  icon: Briefcase, color: 'text-emerald-400' },
  personal:  { label: 'Personal',  icon: User,      color: 'text-pink-400' },
  other:     { label: 'Other',     icon: HelpCircle,color: 'text-[var(--text-tertiary)]' },
}

type Project = {
  id: string
  name: string
  slug: string
  status: string | null
  mention_count: number
  first_mentioned_at: string | null
  last_mentioned_at: string | null
  metadata: { status?: string; project_type?: string } | null
  // joined from project_documents
  project_documents?: Array<{ project_type: string; last_synthesized_at: string | null }>
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('entities')
        .select('id, name, slug, status, mention_count, first_mentioned_at, last_mentioned_at, metadata, project_documents(project_type, last_synthesized_at)')
        .eq('user_id', session.user.id)
        .eq('type', 'project')
        .order('mention_count', { ascending: false })

      setProjects((data as Project[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  const getProjectType = (p: Project): string =>
    p.project_documents?.[0]?.project_type || p.metadata?.project_type || 'other'

  const getLastDate = (p: Project) => {
    if (!p.last_mentioned_at) return '—'
    return new Date(p.last_mentioned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const hasSynthesis = (p: Project) => !!p.project_documents?.[0]?.last_synthesized_at

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] opacity-50 mb-2">Intelligence</p>
        <h1 className="text-2xl font-medium text-[var(--text-primary)] tracking-tight">Projects</h1>
        {!loading && (
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''} tracked across all recordings
          </p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 skeleton rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && projects.length === 0 && (
        <div className="py-24 text-center border border-dashed border-[var(--border-light)] rounded-xl">
          <FolderOpen size={24} className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-20" />
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] opacity-40">No projects yet</p>
          <p className="text-xs text-[var(--text-tertiary)] opacity-30 mt-2">Upload and process videos to start tracking your projects</p>
        </div>
      )}

      {/* Project grid */}
      {!loading && projects.length > 0 && (
        <div className="space-y-2">
          {projects.map(p => {
            const type = getProjectType(p)
            const typeMeta = PROJECT_TYPE_META[type] || PROJECT_TYPE_META.other
            const TypeIcon = typeMeta.icon
            const synthesized = hasSynthesis(p)

            return (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.slug}`}
                className="group flex items-center gap-4 p-5 border border-[var(--border-light)] rounded-xl bg-[var(--bg-card)] hover:border-[var(--border-medium)] hover:bg-[var(--bg-secondary)] transition-all"
              >
                {/* Type icon */}
                <div className={`flex-shrink-0 ${typeMeta.color} opacity-60 group-hover:opacity-100 transition-opacity`}>
                  <TypeIcon size={18} />
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[15px] font-medium text-[var(--text-primary)] truncate">{p.name}</span>
                    {p.status && p.status !== 'mentioned' && (
                      <span className="text-[8px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] opacity-40 flex-shrink-0">{p.status}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--text-tertiary)] opacity-40">
                    <span className="flex items-center gap-1"><Hash size={9} />{p.mention_count}</span>
                    <span className="flex items-center gap-1"><Clock size={9} />{getLastDate(p)}</span>
                    <span className={`${typeMeta.color} opacity-60`}>{typeMeta.label}</span>
                    {synthesized && <span className="text-emerald-500 opacity-60">● doc</span>}
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight size={14} className="flex-shrink-0 text-[var(--text-tertiary)] opacity-20 group-hover:opacity-60 transition-opacity" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
