'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  Layers, Plus, MoreHorizontal, Edit2, Trash2, 
  Loader2, CheckCircle, Circle 
} from 'lucide-react'

type Series = {
  id: string
  title: string
  slug: string
  description: string | null
  cover_image_url: string | null
  is_complete: boolean
  post_count: number
  created_at: string
}

export default function SeriesPage() {
  const [loading, setLoading] = useState(true)
  const [series, setSeries] = useState<Series[]>([])
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadSeries()
  }, [])

  const loadSeries = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login?redirect=/series')
      return
    }

    const { data } = await supabase
      .from('series')
      .select('*')
      .eq('author_id', session.user.id)
      .order('created_at', { ascending: false })

    if (data) {
      setSeries(data)
    }

    setLoading(false)
  }

  const deleteSeries = async (seriesId: string) => {
    if (!confirm('Delete this series? Posts will be kept but removed from the series.')) return

    // Remove posts from series first
    await supabase
      .from('posts')
      .update({ series_id: null, series_order: null })
      .eq('series_id', seriesId)

    await supabase.from('series').delete().eq('id', seriesId)
    setSeries(series.filter(s => s.id !== seriesId))
    setActiveMenu(null)
  }

  const toggleComplete = async (seriesId: string, currentStatus: boolean) => {
    await supabase
      .from('series')
      .update({ is_complete: !currentStatus })
      .eq('id', seriesId)

    setSeries(series.map(s => 
      s.id === seriesId ? { ...s, is_complete: !currentStatus } : s
    ))
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <Layers size={24} className="text-[var(--accent)]" />
              </div>
              <div>
                <h1 className="font-display text-3xl">Series</h1>
                <p className="text-[var(--text-secondary)]">
                  Group related posts together
                </p>
              </div>
            </div>
            
            <Link href="/series/new" className="btn btn-primary">
              <Plus size={16} />
              New Series
            </Link>
          </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : series.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <Layers size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h2 className="font-display text-xl mb-2">No series yet</h2>
          <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            Create a series to group related posts with sequential navigation
          </p>
          <Link href="/series/new" className="btn btn-primary">
            <Plus size={16} />
            Create Your First Series
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {series.map(s => (
            <div
              key={s.id}
              className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
            >
                  <div className="flex items-start justify-between">
                    <Link href={`/series/${s.id}`} className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-lg hover:text-[var(--accent)] transition-colors">
                          {s.title}
                        </h3>
                        {s.is_complete ? (
                          <span className="flex items-center gap-1 text-xs text-[var(--success)]">
                            <CheckCircle size={12} />
                            Complete
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                            <Circle size={12} />
                            In progress
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p className="text-sm text-[var(--text-secondary)] mb-2 line-clamp-2">
                          {s.description}
                        </p>
                      )}
                      <p className="text-sm text-[var(--text-tertiary)]">
                        {s.post_count} part{s.post_count !== 1 ? 's' : ''}
                      </p>
                    </Link>

                    <div className="relative ml-4">
                      <button
                        onClick={() => setActiveMenu(activeMenu === s.id ? null : s.id)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)]"
                      >
                        <MoreHorizontal size={16} className="text-[var(--text-tertiary)]" />
                      </button>

                      {activeMenu === s.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                          <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-lg shadow-lg z-20 py-1">
                            <button
                              onClick={() => toggleComplete(s.id, s.is_complete)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)]"
                            >
                              {s.is_complete ? <Circle size={14} /> : <CheckCircle size={14} />}
                              Mark as {s.is_complete ? 'in progress' : 'complete'}
                            </button>
                            <Link
                              href={`/series/${s.id}`}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)]"
                            >
                              <Edit2 size={14} />
                              Edit
                            </Link>
                            <button
                              onClick={() => deleteSeries(s.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--error)] hover:bg-[var(--bg-secondary)]"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}


