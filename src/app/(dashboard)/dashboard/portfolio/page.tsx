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
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">Portfolio</h1>
          <p className="text-[var(--text-secondary)] mt-1">Auto-generated from your logs. Updated with each upload.</p>
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
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Projects</h2>
        {!projectEntities || projectEntities.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--border-light)] rounded-xl text-[var(--text-tertiary)]">
            <Briefcase size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">No projects detected yet</p>
            <p className="text-sm">Projects are extracted automatically from your video logs.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projectEntities.map((entity) => (
              <div key={entity.id} className="group p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[var(--text-primary)]">{entity.name}</h3>
                      <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1">
                        <Clock size={11} />
                        {entity.mention_count} mentions
                      </span>
                    </div>
                    {entity.summary && (
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{entity.summary}</p>
                    )}
                    {entity.first_seen_at && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-2">
                        First mentioned: {new Date(entity.first_seen_at).toLocaleDateString()}
                        {entity.last_seen_at && ` · Last: ${new Date(entity.last_seen_at).toLocaleDateString()}`}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-[var(--text-tertiary)] flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
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
