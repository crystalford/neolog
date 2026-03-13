'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Trophy, Star, Zap, Activity, Brain, Target, Flame,
  Edit3, Save, X, Globe, Sparkles, Briefcase, Loader2,
  Plus, Search, Filter, ShieldCheck, Clock, ArrowUpRight,
  Wrench, Car, Laptop, Home, Smartphone, Boxes, TrendingUp,
  CheckCircle, ArrowRight, BookOpen, Download, Copy
} from 'lucide-react'

const BODY_MAP_COORDS: Record<string, { cx: string; cy: string; r: string }> = {
  ankle: { cx: '55', cy: '85', r: '4' },
  head: { cx: '50', cy: '15', r: '3' },
  sleep: { cx: '50', cy: '15', r: '3' },
  knee: { cx: '45', cy: '75', r: '3' },
  shoulder: { cx: '42', cy: '30', r: '3' },
  back: { cx: '50', cy: '45', r: '5' },
  wrist: { cx: '38', cy: '45', r: '2' },
}

const CATEGORY_ICONS: Record<string, any> = {
  vehicle: Car, hardware: Laptop, property: Home, gear: Smartphone, other: Boxes, instrument: Wrench,
}
const CATEGORY_COLORS: Record<string, string> = {
  vehicle: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  hardware: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  property: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  gear: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  other: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
}

type Tab = 'identity' | 'inventory' | 'portfolio'

export default function CharacterPage() {
  const [activeTab, setActiveTab] = useState<Tab>('identity')
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [assets, setAssets] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [generatingBio, setGeneratingBio] = useState(false)
  const [generatingProject, setGeneratingProject] = useState<string | null>(null)
  const [activeProject, setActiveProject] = useState<string | null>(null)
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
        { data: assetsData },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('entities').select('*').eq('user_id', session.user.id),
        supabase.from('assets').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
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

      if (entitiesData) {
        const skills = entitiesData.filter((e: any) => e.type === 'skill')
        const prjs = entitiesData.filter((e: any) => e.type === 'project')
        const blockers = entitiesData.filter((e: any) => e.type === 'blocker' || e.type === 'habit')
        const totalMentions = entitiesData.reduce((acc: number, curr: any) => acc + (curr.mention_count || 0), 0)
        const level = Math.floor(Math.sqrt(totalMentions / 10)) + 1
        const xp = totalMentions * 10
        const nextLevelXp = Math.pow(level, 2) * 100
        setStats({
          level, xp, nextLevelXp, totalMentions,
          skillCount: skills.length,
          projectCount: prjs.length,
          skills: skills.sort((a: any, b: any) => b.mention_count - a.mention_count).slice(0, 5),
          healthEntities: blockers,
          activeProjects: prjs.sort((a: any, b: any) => b.mention_count - a.mention_count).slice(0, 3),
        })
        setProjects(prjs.sort((a: any, b: any) => b.mention_count - a.mention_count).slice(0, 20))
      }

      if (assetsData) setAssets(assetsData)
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

  const handleGenerateBio = async () => {
    setGeneratingBio(true)
    try {
      const res = await fetch('/api/portfolio/generate', { method: 'POST' })
      if (res.ok) { const data = await res.json(); setProfile((p: any) => ({ ...p, bio: data.bio })) }
    } finally { setGeneratingBio(false) }
  }

  const handleGenerateCaseStudy = async (projectId: string) => {
    setGeneratingProject(projectId)
    try {
      const res = await fetch(`/api/portfolio/project/${projectId}/generate`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, metadata: { ...p.metadata, case_study: data.caseStudy }, summary: data.caseStudy.summary } : p))
      }
    } finally { setGeneratingProject(null) }
  }

  if (loading) return <div className="p-8 text-[var(--text-tertiary)] font-mono text-xs uppercase tracking-widest animate-pulse">Loading character data...</div>

  const hotspots = stats?.healthEntities?.map((e: any) => {
    const key = Object.keys(BODY_MAP_COORDS).find(k => e.name.toLowerCase().includes(k))
    return key ? { ...BODY_MAP_COORDS[key], id: e.id, name: e.name } : null
  }).filter(Boolean)

  const filteredAssets = assets.filter(a =>
    (a.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.category || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const tabs: { id: Tab; label: string }[] = [
    { id: 'identity', label: 'Identity' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'portfolio', label: 'Portfolio' },
  ]

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8 pb-32">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--accent)] mb-1">Character Profile</p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            {profile?.display_name || profile?.username || 'Intelligence Pilot'}
          </h1>
          <p className="text-xs text-[var(--text-tertiary)] font-mono mt-1">@{profile?.username} · Level {stats?.level || 1}</p>
        </div>
        <div className="flex items-center gap-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                activeTab === t.id
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── IDENTITY TAB ── */}
      {activeTab === 'identity' && (
        <div className="space-y-8">
          {/* Avatar + XP */}
          <div className="relative overflow-hidden rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] p-8">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="relative">
                <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-[var(--accent)]">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center text-white text-4xl font-bold">
                      {profile?.username?.[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-2 -right-2 bg-[var(--accent)] text-white px-3 py-0.5 rounded-full text-xs font-bold">
                  LVL {stats?.level || 1}
                </div>
              </div>

              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-bold">{profile?.display_name || profile?.username}</h2>
                  <button onClick={() => setEditing(!editing)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] hover:opacity-80">
                    {editing ? <><X size={11} /> Cancel</> : <><Edit3 size={11} /> Edit</>}
                  </button>
                </div>

                {editing ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 p-5 rounded-xl border border-white/5">
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-mono text-white/40 uppercase">Display Name</label>
                        <input value={formData.display_name} onChange={e => setFormData({ ...formData, display_name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-white/40 uppercase">Bio</label>
                        <textarea value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none min-h-[70px]" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      {['website_url', 'twitter_url', 'github_url', 'linkedin_url'].map(field => (
                        <div key={field}>
                          <label className="text-[10px] font-mono text-white/40 uppercase">{field.replace('_url', '')}</label>
                          <input value={formData[field]} onChange={e => setFormData({ ...formData, [field]: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs mt-1" />
                        </div>
                      ))}
                      <button onClick={handleSave} disabled={saving} className="w-full btn btn-primary py-2 flex items-center justify-center gap-2 text-sm">
                        {saving ? <Sparkles className="animate-spin" size={14} /> : <><Save size={14} /> Save</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {profile?.bio && <p className="text-sm text-[var(--text-secondary)] italic max-w-xl">"{profile.bio}"</p>}
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-[var(--text-tertiary)] mb-1">
                        <span>XP to Level {(stats?.level || 1) + 1}</span>
                        <span>{Math.round(((stats?.xp || 0) / (stats?.nextLevelXp || 100)) * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[var(--accent)] to-purple-500 rounded-full transition-all duration-1000" style={{ width: `${((stats?.xp || 0) / (stats?.nextLevelXp || 100)) * 100}%` }} />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                {[
                  { val: stats?.totalMentions || 0, label: 'Signals' },
                  { val: stats?.skillCount || 0, label: 'Skills' },
                  { val: stats?.projectCount || 0, label: 'Projects' },
                  { val: stats?.level || 1, label: 'Level' },
                ].map(s => (
                  <div key={s.label} className="bg-[var(--bg-tertiary)]/50 p-3 rounded-xl border border-[var(--border-light)]">
                    <p className="text-xl font-bold">{s.val}</p>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Skills + Bio-map */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] p-6">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-5 flex items-center gap-2"><Brain size={13} className="text-blue-400" /> Skills</h3>
              <div className="space-y-4">
                {stats?.skills?.map((skill: any) => (
                  <div key={skill.id} className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">{skill.name}</span>
                      <span className="text-[9px] font-mono text-[var(--accent)]">RANK {Math.floor(skill.mention_count / 5) + 1}</span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400/70 rounded-full" style={{ width: `${Math.min(skill.mention_count * 2, 100)}%` }} />
                    </div>
                  </div>
                ))}
                {(!stats?.skills?.length) && <p className="text-xs text-[var(--text-tertiary)] italic">Skills accumulate as you upload sessions.</p>}
              </div>
            </div>

            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] p-6">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-5 flex items-center gap-2"><Activity size={13} className="text-rose-400" /> Bio-metric Map</h3>
              <div className="flex gap-6 items-center">
                <div className="relative w-32 h-32 flex-shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full text-[var(--text-tertiary)] fill-current opacity-30">
                    <path d="M50,10c3,0,5,2,5,5s-2,5-5,5s-5-2-5-5S47,10,50,10z M45,22h10c4,0,7,3,7,7v15h-4v25h-5v20h-6v-20h-5v-25h-4V29C38,25,41,22,45,22z" />
                    {hotspots?.map((h: any) => (
                      <circle key={h.id} cx={h.cx} cy={h.cy} r={h.r} className="fill-rose-500 animate-pulse" />
                    ))}
                  </svg>
                </div>
                <div className="flex-1 space-y-2">
                  {stats?.healthEntities?.length > 0 ? stats.healthEntities.slice(0, 4).map((h: any) => (
                    <div key={h.id} className="flex items-center gap-2 text-xs">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${h.type === 'blocker' ? 'bg-rose-500' : 'bg-blue-400'}`} />
                      <span className="text-[var(--text-secondary)]">{h.name}</span>
                    </div>
                  )) : <p className="text-xs text-[var(--text-tertiary)] italic">No blockers detected.</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Active Projects */}
          {stats?.activeProjects?.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] p-6">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-5 flex items-center gap-2"><Target size={13} className="text-amber-400" /> Active Directives</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.activeProjects.map((p: any) => (
                  <div key={p.id} className="p-4 rounded-xl bg-amber-400/5 border border-amber-400/10">
                    <div className="flex items-center gap-2 mb-3">
                      <Flame size={14} className="text-amber-500" />
                      <span className="text-xs font-bold text-amber-500 uppercase truncate">{p.name}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400" style={{ width: `${(p.mention_count % 10) * 10}%` }} />
                    </div>
                    <p className="text-[9px] font-mono text-amber-500/60 mt-1.5">{p.mention_count} signals</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INVENTORY TAB ── */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Inventory Loadout</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Physical and digital assets — linked to your entity graph.</p>
            </div>
            <button className="btn btn-primary btn-sm flex items-center gap-2"><Plus size={14} /> Add Asset</button>
          </div>

          <div className="flex gap-3 bg-[var(--bg-secondary)] border border-[var(--border-light)] p-2 rounded-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
              <input
                type="text"
                placeholder="Search assets..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none focus:ring-0 pl-9 pr-4 py-2 text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-tertiary)]/50 outline-none"
              />
            </div>
          </div>

          {filteredAssets.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredAssets.map(asset => {
                const cat = asset.category || 'other'
                const Icon = CATEGORY_ICONS[cat] || Boxes
                const colorClass = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
                return (
                  <div key={asset.id} className="group flex flex-col bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl overflow-hidden hover:border-[var(--accent)] transition-all">
                    <div className="aspect-video relative bg-[var(--bg-tertiary)]/30 overflow-hidden">
                      {asset.image_url ? (
                        <img src={asset.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-40">
                          <Icon size={36} className={colorClass.split(' ')[0]} />
                        </div>
                      )}
                      <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-lg border text-[9px] font-mono font-bold uppercase backdrop-blur-md ${colorClass}`}>{cat}</div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-1">{asset.name}</h3>
                      <p className="text-xs text-[var(--text-tertiary)] line-clamp-2 mt-1 flex-1">{asset.description || 'No description.'}</p>
                      <div className="mt-3 pt-3 border-t border-[var(--border-light)] flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[var(--text-tertiary)] flex items-center gap-1"><Clock size={10} /> {new Date(asset.updated_at).toLocaleDateString()}</span>
                        {!asset.is_public && <ShieldCheck size={12} className="text-rose-400" />}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-[var(--border-light)] rounded-2xl">
              <Boxes size={36} className="text-[var(--text-tertiary)] opacity-20 mb-4" />
              <h3 className="text-sm font-medium text-[var(--text-secondary)]">Inventory empty</h3>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">Add assets to track your gear, vehicles, equipment.</p>
              <button className="btn btn-primary btn-sm mt-5">Initialize Loadout</button>
            </div>
          )}
        </div>
      )}

      {/* ── PORTFOLIO TAB ── */}
      {activeTab === 'portfolio' && (
        <div className="space-y-10">
          <div className="flex items-end justify-between border-b border-[var(--border-light)] pb-6">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">Auto-synthesized from intelligence logs</p>
              <h2 className="text-2xl font-bold">Portfolio</h2>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm flex items-center gap-2"><Download size={13} /> Export</button>
              <button className="btn btn-primary btn-sm flex items-center gap-2"><Globe size={13} /> Public Log</button>
            </div>
          </div>

          {/* Living Bio */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] flex items-center gap-2"><BookOpen size={13} className="text-[var(--accent)]" /> Living Bio</h3>
              <button onClick={handleGenerateBio} disabled={generatingBio} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] hover:opacity-80 disabled:opacity-50">
                {generatingBio ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {generatingBio ? 'Synthesizing...' : 'Regenerate'}
              </button>
            </div>
            <div className="relative p-7 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <div className="absolute -top-2.5 -left-2.5 w-5 h-5 border-t-2 border-l-2 border-[var(--accent)] opacity-40" />
              <div className="absolute -bottom-2.5 -right-2.5 w-5 h-5 border-b-2 border-r-2 border-[var(--accent)] opacity-40" />
              {profile?.bio ? (
                <p className="text-base text-[var(--text-primary)] leading-relaxed">{profile.bio}</p>
              ) : (
                <div className="flex flex-col items-center py-8 opacity-50">
                  <Sparkles size={24} className="mb-3 text-[var(--accent)]" />
                  <p className="text-sm italic text-[var(--text-tertiary)]">No bio yet. Click Regenerate to synthesize one from your history.</p>
                </div>
              )}
              <p className="mt-5 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">Informed by {projects.length} project nodes</p>
            </div>
          </section>

          {/* Project Case Studies */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] flex items-center gap-2"><Briefcase size={13} className="text-blue-400" /> Evidence Library</h3>
            {projects.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-[var(--border-light)] rounded-xl">
                <Briefcase size={32} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm text-[var(--text-secondary)]">No projects yet</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Projects appear as you mention them in uploads.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {projects.map(project => {
                  const caseStudy = project.metadata?.case_study
                  const isGenerating = generatingProject === project.id
                  return (
                    <div key={project.id} className={`group flex flex-col p-5 rounded-xl border transition-all ${caseStudy ? 'bg-[var(--bg-card)] border-blue-400/20 hover:border-blue-400/40' : 'bg-black/20 border-white/5 hover:border-white/20'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${caseStudy ? 'bg-blue-400/10 text-blue-400' : 'bg-white/5 text-[var(--text-tertiary)]'}`}>
                          <Briefcase size={16} strokeWidth={1.5} />
                        </div>
                        <button onClick={() => handleGenerateCaseStudy(project.id)} disabled={isGenerating} className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50" title="Generate Case Study">
                          {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        </button>
                      </div>
                      <h4 className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-blue-400 transition-colors mb-2">{project.name}</h4>
                      <p className="text-xs text-[var(--text-tertiary)] line-clamp-3 flex-1">
                        {caseStudy?.summary || project.summary || 'No summary yet.'}
                      </p>
                      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[var(--text-tertiary)] flex items-center gap-1"><TrendingUp size={10} className="text-blue-400" /> {project.mention_count} signals</span>
                        {caseStudy && (
                          <button onClick={() => setActiveProject(project.id)} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 flex items-center gap-1">
                            Read <ArrowRight size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Case Study Modal */}
      {activeProject && projects.find(p => p.id === activeProject)?.metadata?.case_study && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setActiveProject(null)} />
          <div className="relative w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-medium)] rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-8 space-y-6 max-h-[80vh] overflow-y-auto">
              {(() => {
                const p = projects.find(proj => proj.id === activeProject)!
                const cs = p.metadata.case_study
                return (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-blue-400 text-[10px] font-bold uppercase tracking-widest"><Briefcase size={14} /> Case Study</div>
                      <h2 className="text-2xl font-bold">{p.name}</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div><p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">The Challenge</p><p className="text-sm text-[var(--text-secondary)] leading-relaxed">{cs.challenge}</p></div>
                      <div><p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">The Approach</p><p className="text-sm text-[var(--text-secondary)] leading-relaxed">{cs.approach}</p></div>
                    </div>
                    <div className="p-5 rounded-xl bg-emerald-400/5 border border-emerald-400/20">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Results</p>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{cs.results}</p>
                    </div>
                    <button onClick={() => setActiveProject(null)} className="w-full py-3 text-[10px] font-bold uppercase tracking-widest border border-white/5 hover:bg-white/5 rounded-xl transition-all">Close</button>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
