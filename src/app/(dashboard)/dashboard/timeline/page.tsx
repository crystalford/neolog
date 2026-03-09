import { createClient } from '@/lib/supabase/server'
import { CalendarDays, Clock, Layers } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function TimelinePage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: uploads } = await supabase
    .from('video_uploads')
    .select('id, original_filename, status, created_at, transcript, analysis')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Group uploads by date
  const grouped: Record<string, typeof uploads> = {}
  for (const upload of uploads ?? []) {
    const dateKey = new Date(upload.created_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })
    if (!grouped[dateKey]) grouped[dateKey] = []
    grouped[dateKey]!.push(upload)
  }

  const entryCount = (upload: any): number => {
    try {
      const analysis = typeof upload.analysis === 'string' ? JSON.parse(upload.analysis) : upload.analysis
      if (!analysis) return 0
      const keys = ['ideas', 'projects', 'questions', 'commitments', 'decisions', 'people', 'action_items']
      return keys.reduce((acc: number, k: string) => acc + (Array.isArray(analysis[k]) ? analysis[k].length : 0), 0)
    } catch { return 0 }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:py-12">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">Timeline</h1>
        <p className="text-[var(--text-secondary)] mt-1">A chronological log of every session and what was extracted.</p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-20 text-[var(--text-tertiary)]">
          <CalendarDays size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-2">No sessions yet</p>
          <p className="text-sm">Upload a video or audio file to start building your timeline.</p>
          <Link href="/dashboard/uploads" className="mt-6 btn btn-primary btn-sm inline-flex">
            Go to Uploads
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(grouped).map(([date, entries]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                <h2 className="text-sm font-semibold text-[var(--text-secondary)]">{date}</h2>
                <div className="flex-1 h-px bg-[var(--border-light)]" />
              </div>
              <div className="space-y-3 pl-5">
                {entries?.map((upload) => {
                  const count = entryCount(upload)
                  const time = new Date(upload.created_at).toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit'
                  })
                  return (
                    <Link
                      key={upload.id}
                      href={`/dashboard/uploads/${upload.id}`}
                      className="block p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                            {upload.original_filename}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--text-tertiary)]">
                            <span className="flex items-center gap-1"><Clock size={11} />{time}</span>
                            {count > 0 && (
                              <span className="flex items-center gap-1"><Layers size={11} />{count} entities</span>
                            )}
                          </div>
                        </div>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
                          upload.status === 'completed'
                            ? 'bg-[var(--success)]/10 text-[var(--success)]'
                            : upload.status === 'error'
                            ? 'bg-[var(--error)]/10 text-[var(--error)]'
                            : 'bg-[var(--accent)]/10 text-[var(--accent)]'
                        }`}>
                          {upload.status}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
