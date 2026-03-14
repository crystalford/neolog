'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Brain, Edit3, Save, X, Sparkles, Clock, Target, Users,
  Lightbulb, Zap, BookOpen, TrendingUp, Hash, Link2,
} from 'lucide-react'

// ─── Entity layer config ──────────────────────────────────────────────────────

const ENTITY_LAYERS = [
  {
    key: 'project',
    label: 'Projects',
    sublabel: 'Work layer — what you\'re building',
    icon: TrendingUp,
    color: 'text-blue-400',
    bg: 'bg-blue-500/8',
    border: 'border-blue-500/20',
    chipBg: 'bg-blue-500/10',
    chipBorder: 'border-blue-500/20',
    chipText: 'text-blue-300',
  },
  {
    key: 'person',
    label: 'People',
    sublabel: 'Relationships — who you\'re working with',
    icon: Users,
    color: 'text-green-400',
    bg: 'bg-green-500/8',
    border: 'border-green-500/20',
    chipBg: 'bg-green-500/10',
    chipBorder: 'border-green-500/20',
    chipText: 'text-green-300',
  },
  {
    key: 'goal',
    label: 'Goals',
    sublabel: 'Intentions — what you\'re working toward',
    icon: Target,
    color: 'text-orange-400',
    bg: 'bg-orange-500/8',
    border: 'border-orange-500/20',
    chipBg: 'bg-orange-500/10',
    chipBorder: 'border-orange-500/20',
    chipText: 'text-orange-300',
  },
  {
    key: 'idea',
    label: 'Ideas',
    sublabel: 'Intelligence layer — concepts that keep surfacing',
    icon: Lightbulb,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/8',
    border: 'border-yellow-500/20',
    chipBg: 'bg-yellow-500/10',
    chipBorder: 'border-yellow-500/20',
    chipText: 'text-yellow-300',
  },
  {
    key: 'skill',
    label: 'Skills',
    sublabel: 'Capabilities — what you\'re developing and demonstrating',
    icon: Zap,
    color: 'text-purple-400',
    bg: 'bg-purple-500/8',
    border: 'border-purple-500/20',
    chipBg: 'bg-purple-500/10',
    chipBorder: 'border-purple-500/20',
    chipText: 'text-purple-300',
  },
  {
    key: 'question',
    label: 'Open Questions',
    sublabel: 'Intelligence layer — what you haven\'t solved yet',
    icon: Brain,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/8',
    border: 'border-cyan-500/20',
    chipBg: 'bg-cyan-500/10',
    chipBorder: 'border-cyan-500/20',
    chipText: 'text-cyan-300',
  },
  {
    key: 'habit',
    label: 'Habits & Patterns',
    sublabel: 'Life layer — recurring behaviors and routines',
    icon: Clock,
    color: 'text-rose-400',
    bg: 'bg-rose-500/8',
    border: 'border-rose-500/20',
    chipBg: 'bg-rose-500/10',
    chipBorder: 'border-rose-500/20',
    chipText: 'text-rose-300',
  },
  {
    key: 'theme',
    label: 'Recurring Themes',
    sublabel: 'Identity layer — topics that define your thinking',
    icon: Hash,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/8',
    border: 'border-indigo-500/20',
    chipBg: 'bg-indigo-500/10',
    chipBorder: 'border-indigo-500/20',
    chipText: 'text-indigo-300',
  },
] as const

// ─── Entity section ───────────────────────────────────────────────────────────

function EntitySection({ layer, entities }: { layer: typeof ENTITY_LAYERS[number]; entities: any[] }) {
  const Icon = layer.icon
  if (entities.length === 0) return null

  return (
    <div className={`rounded-xl border ${layer.border} ${layer.bg} p-5`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={13} className={layer.color} />
        <h3 className="text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--text-primary)]">
          {layer.label}
        </h3>
        <span className="ml-auto text-[10px] font-mono text-[var(--text-tertiary)]">
          {entities.length}
        </span>
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)] mb-4">{layer.sublabel}</p>
      <div className="flex flex-wrap gap-2">
        {entities.slice(0, 16).map((entity: any) => (
          <div
            key={entity.id}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${layer.chipBg} border ${layer.chipBorder} ${layer.chipText}`}
            title={entity.description || entity.context_notes || entity.name}
          >
            <span>{entity.name}</span>
            {entity.mention_count > 1 && (
              <span className="opacity-50 text-[9px]">×{entity.mention_count}</span>
            )}
          </div>
        ))}
        {entities.length > 16 && (
          <span className="inline-flex items-center px-2.5 py-1 text-[10px] text-[var(--text-tertiary)]">
            +{entities.length - 16} more
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CharacterPage() {
  const [profile, setProfile] = useState<any>(null)
  const [entities, setEntities] = useState<any[]>([])
  const [uploadCount, setUploadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<any>({
    display_name: '', bio: '', website_url: '', twitter_url: '', github_url: '', linkedin_url: '',
  })

  const supabase = createClient()

  useEffect(() => {
    async function loadAll() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [
        { data: profileData },
        { data: entitiesData },
        { count },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('entities').select('*').eq('user_id', session.user.id).order('mention_count', { ascending: false }),
        supabase.from('video_uploads').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
      ])

      if (profileData) {
        setProfile(profileData)
        setFormData({
          display_name: profileData.display_name || '',
          bio: profileData.bio || '',
          website_url: profileData.website_url || '',
          twitter_url: profileData.twitter_url || '',
          github_url: profileData.github_url || '',
          linkedin_url: profileData.linkedin_url || '',
        })
      }

      setEntities(entitiesData || [])
      setUploadCount(count || 0)
      setLoading(false)
    }
    loadAll()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('profiles').update(formData).eq('id', session.user.id)
    if (!error) { setProfile({ ...profile, ...formData }); setEditing(false) }
    setSaving(false)
  }

  // Group entities by type
  const byType = (type: string) => entities.filter((e: any) => e.type === type)

  // Fallback: entities that don't match any specific type go into 'other'
  const knownTypes = ENTITY_LAYERS.map(l => l.key as string)
  const otherEntities = entities.filter((e: any) => !knownTypes.includes(e.type))

  const totalMentions = entities.reduce((acc: number, e: any) => acc + (e.mention_count || 0), 0)

  if (loading) return (
    <div className="p-8 text-[var(--text-tertiary)] font-mono text-xs uppercase tracking-widest animate-pulse">
      Loading...
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 pb-32 space-y-8">

      {/* ── Identity header ── */}
      <div className="flex items-start gap-6 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl p-6">

        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-[var(--accent)]/40">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
                {(profile?.username || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Identity text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {profile?.display_name || profile?.username || 'Anonymous'}
            </h1>
            <button
              onClick={() => setEditing(!editing)}
              className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] hover:opacity-70 transition-opacity"
            >
              {editing ? <><X size={10} /> Cancel</> : <><Edit3 size={10} /> Edit</>}
            </button>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] font-mono mb-3">@{profile?.username}</p>

          {editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">Display Name</label>
                  <input
                    value={formData.display_name}
                    onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">Bio</label>
                  <textarea
                    value={formData.bio}
                    onChange={e => setFormData({ ...formData, bio: e.target.value })}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none min-h-[70px] resize-none"
                  />
                </div>
              </div>
              <div className="space-y-2.5">
                {['website_url', 'twitter_url', 'github_url', 'linkedin_url'].map(field => (
                  <div key={field}>
                    <label className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">{field.replace('_url', '')}</label>
                    <input
                      value={formData[field]}
                      onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-xs mt-1 focus:border-[var(--accent)] outline-none"
                    />
                  </div>
                ))}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full btn btn-primary py-2 flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? <Sparkles className="animate-spin" size={14} /> : <><Save size={14} /> Save</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {profile?.bio && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-xl">
                  {profile.bio}
                </p>
              )}
              {/* Links */}
              {(profile?.website_url || profile?.twitter_url || profile?.github_url || profile?.linkedin_url) && (
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {[
                    { key: 'website_url', label: 'Website' },
                    { key: 'twitter_url', label: 'Twitter' },
                    { key: 'github_url', label: 'GitHub' },
                    { key: 'linkedin_url', label: 'LinkedIn' },
                  ].filter(l => profile?.[l.key]).map(l => (
                    <a
                      key={l.key}
                      href={profile[l.key]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] font-mono text-[var(--accent)] hover:underline"
                    >
                      <Link2 size={9} />
                      {l.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex-shrink-0 grid grid-cols-3 gap-2 text-center">
          {[
            { val: uploadCount, label: 'Sessions' },
            { val: entities.length, label: 'Entities' },
            { val: totalMentions, label: 'Mentions' },
          ].map(s => (
            <div key={s.label} className="bg-[var(--bg-tertiary)]/50 px-3 py-2.5 rounded-xl border border-[var(--border-light)]">
              <p className="text-lg font-bold text-[var(--text-primary)]">{s.val}</p>
              <p className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Intelligence map ── */}
      {entities.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Brain size={14} className="text-[var(--accent)]" />
            <h2 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
              Intelligence Map
            </h2>
            <span className="text-[10px] text-[var(--text-tertiary)] opacity-50 ml-1">
              — accumulated across {uploadCount} session{uploadCount !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ENTITY_LAYERS.map(layer => {
              const layerEntities = byType(layer.key as string)
              if (layerEntities.length === 0) return null
              return (
                <EntitySection key={layer.key} layer={layer} entities={layerEntities} />
              )
            })}

            {/* Catch-all for entity types not in the defined layers */}
            {otherEntities.length > 0 && (
              <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/30 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen size={13} className="text-[var(--text-tertiary)]" />
                  <h3 className="text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--text-primary)]">
                    Other
                  </h3>
                  <span className="ml-auto text-[10px] font-mono text-[var(--text-tertiary)]">
                    {otherEntities.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  {otherEntities.slice(0, 16).map((e: any) => (
                    <div
                      key={e.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)]"
                    >
                      <span>{e.name}</span>
                      {e.mention_count > 1 && (
                        <span className="opacity-40 text-[9px]">×{e.mention_count}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border-light)] border-dashed bg-[var(--bg-secondary)]/30 p-10 text-center">
          <Brain size={32} className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-30" />
          <p className="text-sm text-[var(--text-tertiary)]">
            Your intelligence map will build here as you upload and process sessions.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] opacity-60 mt-1">
            Projects, people, goals, ideas, and patterns — all extracted automatically.
          </p>
        </div>
      )}

    </div>
  )
}
