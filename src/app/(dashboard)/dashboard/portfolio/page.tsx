import { createClient } from '@/lib/supabase/server'
import { Briefcase, ChevronRight, Clock, Sparkles } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, bio, avatar_url')
    .eq('id', session.user.id)
    .single()

  // Pull projects from entities table
  const { data: projectEntities } = await supabase
    .from('entities')
    .select('id, name, summary, first_seen_at, last_seen_at, mention_count')
    .eq('user_id', session.user.id)
    .eq('type', 'project')
    .order('mention_count', { ascending: false })
    .limit(20)

  const name = profile?.display_name || profile?.username || 'You'

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:py-12">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            NARRATIVE ENGINE
          </p>
          <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Portfolio
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Auto-generated from your logs. Updated with each upload.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm flex items-center gap-2">
          <Sparkles size={14} />
          Regenerate
        </button>
      </div>

      {/* Bio section */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Your Bio</h2>
          <div className="flex gap-1">
            {['Short', 'Medium', 'Long'].map((v, i) => (
              <button key={v} className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                i === 1
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border-light)] text-[var(--text-tertiary)] hover:border-[var(--border-medium)]'
              }`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="relative p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-medium)] group">
          {profile?.bio ? (
            <p className="text-[var(--text-primary)] leading-relaxed">{profile.bio}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-[var(--text-tertiary)] italic text-sm">
                {name} is a builder working at the intersection of AI and media systems.
                Upload more videos to generate a detailed bio from your actual work.
              </p>
            </div>
          )}
          <button className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity btn btn-secondary btn-sm text-xs">
            Copy
          </button>
        </div>
      </section>

      {/* Projects */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-6 flex items-center gap-2">
           <Briefcase size={16} className="text-blue-400" /> Projects & Creations
        </h2>
        {!projectEntities || projectEntities.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--border-light)] rounded-2xl bg-[var(--bg-secondary)]/30 text-[var(--text-tertiary)]">
            <Briefcase size={32} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium mb-1">No artifacts detected in your graph</p>
            <p className="text-sm">Your creations and projects will appear here as you log them.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projectEntities.map((entity, i) => (
              <div key={entity.id} className="group p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-light)] hover:border-blue-400/30 hover:shadow-lg transition-all duration-300 relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full bg-blue-400 opacity-20 group-hover:opacity-100 transition-opacity`} />
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h3 className="font-bold text-[var(--text-primary)] group-hover:text-blue-400 transition-colors">{entity.name}</h3>
                    <div className="px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider bg-blue-400/10 text-blue-400 border border-blue-400/20">
                      Project
                    </div>
                  </div>
                  
                  {entity.summary && (
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2 mb-4">
                      {entity.summary}
                    </p>
                  )}

                  <div className="mt-auto pt-4 border-t border-[var(--border-light)] flex items-center justify-between">
                    <span className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1 font-mono">
                      <Clock size={11} /> {entity.mention_count} Mentions
                    </span>
                    <ChevronRight size={14} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Export */}
      <div className="mt-10 pt-6 border-t border-[var(--border-light)] flex items-center gap-3">
        <button className="btn btn-secondary btn-sm">Export as PDF</button>
        <button className="btn btn-secondary btn-sm">Copy bio link</button>
      </div>
    </div>
  )
}
