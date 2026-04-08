'use client'

export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Trophy, Star, Zap, Activity, Shield, Users, 
  ChevronRight, Sparkles, Brain, Target, Flame,
  Edit3, Save, X, Globe, Link2, Github, Twitter, Linkedin
} from 'lucide-react'
import { format } from 'date-fns'

const BODY_MAP_COORDS: Record<string, { cx: string, cy: string, r: string }> = {
  'ankle': { cx: '55', cy: '85', r: '4' },
  'head': { cx: '50', cy: '15', r: '3' },
  'sleep': { cx: '50', cy: '15', r: '3' },
  'knee': { cx: '45', cy: '75', r: '3' },
  'shoulder': { cx: '42', cy: '30', r: '3' },
  'back': { cx: '50', cy: '45', r: '5' },
  'wrist': { cx: '38', cy: '45', r: '2' },
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<any>({
    display_name: '',
    bio: '',
    website_url: '',
    twitter_url: '',
    github_url: '',
    linkedin_url: '',
  })
  
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Load Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      
      if (profile) {
        setProfile(profile)
        setFormData({
          display_name: profile.display_name || '',
          bio: profile.bio || '',
          website_url: profile.website_url || '',
          twitter_url: profile.twitter_url || '',
          github_url: profile.github_url || '',
          linkedin_url: profile.linkedin_url || '',
        })
      }

      // Calculate Stats from Entities
      const { data: entities } = await supabase
        .from('entities')
        .select('*')
        .eq('user_id', session.user.id)
      
      if (entities) {
        const skills = entities.filter(e => e.type === 'skill')
        const projects = entities.filter(e => e.type === 'project')
        const goals = entities.filter(e => e.type === 'goal')
        const blockers = entities.filter(e => e.type === 'blocker' || e.type === 'habit')
        
        const totalMentions = entities.reduce((acc, curr) => acc + (curr.mention_count || 0), 0)
        const level = Math.floor(Math.sqrt(totalMentions / 10)) + 1
        const xp = totalMentions * 10 
        const nextLevelXp = Math.pow(level, 2) * 100

        setStats({
          level,
          xp,
          nextLevelXp,
          totalMentions,
          skillCount: skills.length,
          projectCount: projects.length,
          goalCount: goals.length,
          skills: skills.sort((a,b) => b.mention_count - a.mention_count).slice(0, 5),
          healthEntities: blockers,
          activeProjects: projects.sort((a,b) => b.mention_count - a.mention_count).slice(0, 3)
        })
      }

      setLoading(false)
    }
    loadData()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { error } = await supabase
      .from('profiles')
      .update(formData)
      .eq('id', session.user.id)

    if (!error) {
      setProfile({ ...profile, ...formData })
      setEditing(false)
    }
    setSaving(false)
  }

  if (loading) return <div className="p-8 animate-pulse font-mono text-xs uppercase tracking-widest text-[var(--accent)]">Syncing Character Data...</div>

  // Generate dynamic hotspots
  const hotspots = stats?.healthEntities?.map((e: any) => {
    const key = Object.keys(BODY_MAP_COORDS).find(k => e.name.toLowerCase().includes(k))
    return key ? { ...BODY_MAP_COORDS[key], id: e.id, name: e.name } : null
  }).filter(Boolean)

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-12 pb-32">
      
      {/* 1. Header & XP Bar (The Legacy RPG Layer) */}
      <div className="relative overflow-hidden rounded-3xl bg-[var(--bg-secondary)] border border-[var(--border-light)] p-8 shadow-xl">
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] rotate-12">
          <Trophy size={200} />
        </div>
        
        <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
          <div className="relative group">
            <div className="w-36 h-36 rounded-3xl overflow-hidden border-4 border-[var(--accent)] shadow-2xl transition-transform group-hover:scale-[1.02]">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center text-white text-5xl font-bold">
                  {profile?.username?.[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="absolute -bottom-3 -right-3 bg-[var(--accent)] text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg border-2 border-[var(--bg-secondary)]">
              LVL {stats?.level || 1}
            </div>
          </div>

          <div className="flex-1 space-y-4 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-6">
              <div>
                <h1 className="text-4xl font-bold tracking-tighter text-[var(--text-primary)] mb-1">
                  {profile?.display_name || profile?.username || 'Intelligence Pilot'}
                </h1>
                <p className="text-[var(--text-tertiary)] font-mono text-[9px] uppercase tracking-[0.3em] bg-[var(--accent-soft)] inline-block px-3 py-1 rounded-full border border-[var(--accent)]/20">
                   {profile?.username ? `@${profile.username}` : 'NEURAL PILOT'}
                </p>
              </div>
              <button 
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] hover:opacity-80 mb-2"
              >
                {editing ? <><X size={12} /> Cancel</> : <><Edit3 size={12} /> Edit Persona</>}
              </button>
            </div>

            {editing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 p-6 rounded-2xl border border-white/5 animate-in fade-in duration-300">
                 <div className="space-y-4">
                   <div className="space-y-1">
                     <label className="text-[10px] font-mono text-white/40 uppercase">Display Name</label>
                     <input 
                       value={formData.display_name} 
                       onChange={e => setFormData({...formData, display_name: e.target.value})}
                       className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] outline-none"
                     />
                   </div>
                   <div className="space-y-1">
                     <label className="text-[10px] font-mono text-white/40 uppercase">Global Bio</label>
                     <textarea 
                       value={formData.bio} 
                       onChange={e => setFormData({...formData, bio: e.target.value})}
                       className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] outline-none min-h-[80px]"
                     />
                   </div>
                 </div>
                 <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-left">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-white/40 uppercase">Website</label>
                        <input value={formData.website_url} onChange={e => setFormData({...formData, website_url: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-white/40 uppercase">Twitter</label>
                        <input value={formData.twitter_url} onChange={e => setFormData({...formData, twitter_url: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs" />
                      </div>
                    </div>
                    <button 
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full btn btn-primary py-3 flex items-center justify-center gap-2"
                    >
                      {saving ? <Sparkles className="animate-spin" size={16} /> : <><Save size={16} /> Save Changes</>}
                    </button>
                 </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-[var(--text-tertiary)] mb-1">
                  <span>Progress to Level { (stats?.level || 1) + 1 }</span>
                  <span>{Math.round((stats?.xp / stats?.nextLevelXp) * 100) || 0}%</span>
                </div>
                <div className="h-3 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border-light)] p-[1px]">
                  <div 
                    className="h-full bg-gradient-to-r from-[var(--accent)] to-purple-500 rounded-full transition-all duration-1000"
                    style={{ width: `${(stats?.xp / stats?.nextLevelXp) * 100}%` }}
                  />
                </div>
                {profile?.bio && <p className="text-sm text-[var(--text-secondary)] italic mt-4 max-w-xl">"{profile.bio}"</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--bg-tertiary)]/50 backdrop-blur-sm p-4 rounded-2xl border border-[var(--border-light)] text-center">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.totalMentions || 0}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Total Actions</p>
            </div>
            <div className="bg-[var(--bg-tertiary)]/50 backdrop-blur-sm p-4 rounded-2xl border border-[var(--border-light)] text-center">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.skillCount || 0}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Skills Mastered</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* 2. Neural Manifest - Hyper Realistic AI Model */}
        <div className="lg:col-span-12">
           <div className="relative group overflow-hidden rounded-[3rem] bg-black border border-white/5 p-12">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--accent)_0%,_transparent_70%)] group-hover:opacity-30 transition-opacity duration-1000" />
              
              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                <div className="space-y-8 order-2 md:order-1">
                   <div className="space-y-2">
                     <h2 className="text-4xl font-bold tracking-tighter text-white uppercase italic">Neural Manifest</h2>
                     <p className="text-sm text-white/40 font-mono tracking-widest uppercase">The Sovereign AI Twin</p>
                   </div>
                   
                   <div className="space-y-6">
                      <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-3 backdrop-blur-xl">
                         <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-white/60">
                           <span>COGNITIVE STABILITY</span>
                           <span className="text-[var(--accent)] font-bold">94%</span>
                         </div>
                         <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--accent)]" style={{ width: '94%' }} />
                         </div>
                      </div>
                      <p className="text-sm leading-relaxed text-white/60">
                        The manifest is an evolving digital synthesis of your multi-modal signal intake. 
                        As you upload headshots and audio, the LORA model refines its hyperparameters to mirror your exact cognitive profile.
                      </p>
                      <ul className="grid grid-cols-1 gap-3 font-mono text-[9px] uppercase tracking-widest text-[var(--accent)]">
                         <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[var(--accent)] rounded-full animate-pulse" /> [READY] High-Fidelity Visual Weights</li>
                         <li className="flex items-center gap-2"><div className="w-1 h-1 bg-[var(--accent)] rounded-full" /> [PENDING] Voice Manifold Extraction</li>
                         <li className="flex items-center gap-2 text-white/20"><div className="w-1 h-1 bg-white/10 rounded-full" /> [LOCKED] Real-time Reflexive Reaction</li>
                      </ul>
                   </div>
                </div>

                <div className="relative order-1 md:order-2 flex justify-center">
                   <div className="relative w-80 h-80 md:w-[450px] md:h-[450px]">
                      {/* Hyper realistic avatar Placeholder */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent)]/20 to-transparent rounded-[4rem] blur-3xl opacity-50" />
                      <div className="relative w-full h-full rounded-[4rem] border border-white/10 overflow-hidden shadow-[0_0_100px_rgba(124,106,245,0.2)]">
                         <img 
                           src="/neural_manifest_hyper_realistic_avatar_1773404786973.png" 
                           alt="Neural Manifest Hyper-Realistic Model"
                           className="w-full h-full object-cover grayscale brightness-125"
                           onError={(e) => {
                             // Fallback if image not found in public dir yet
                             e.currentTarget.src = "/api/placeholder/450/450"
                           }}
                         />
                         <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                         
                         {/* Scanning Line */}
                         <div className="absolute top-0 left-0 w-full h-0.5 bg-[var(--accent)] shadow-[0_0_15px_var(--accent)] opacity-50 animate-[scan_6s_linear_infinite]" />
                      </div>
                      
                      {/* Biometric Badges */}
                      <div className="absolute top-10 -right-4 p-3 bg-black/80 border border-[var(--accent)]/40 rounded-xl backdrop-blur-xl animate-bounce-slow">
                         <div className="text-[8px] font-mono text-[var(--accent)] uppercase mb-1">Pulse Sync</div>
                         <div className="text-xs font-bold text-white">ACTIVE</div>
                      </div>
                   </div>
                </div>
              </div>
           </div>
        </div>

        {/* 3. Skills & Attributes */}
        <div className="lg:col-span-8 flex flex-col gap-8">
           <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-light)] p-8">
            <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-8 flex items-center gap-2">
              <Brain size={16} className="text-blue-400" /> Cognitive Attributes & Skills
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {stats?.skills?.map((skill: any) => (
                <div key={skill.id} className="space-y-3 group p-6 rounded-3xl bg-[var(--bg-tertiary)]/20 hover:bg-[var(--bg-tertiary)]/50 transition-all border border-transparent hover:border-[var(--border-light)]">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[var(--text-primary)]">{skill.name}</span>
                    <span className="text-[9px] font-mono text-[var(--accent)] px-3 py-1 bg-[var(--accent-soft)] rounded-full border border-[var(--accent)]/10 font-black">RANK {Math.floor(skill.mention_count / 5) + 1}</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden p-[1px]">
                    <div 
                      className="h-full bg-blue-400/80 rounded-full transition-all duration-1000 group-hover:bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.3)]"
                      style={{ width: `${Math.min(skill.mention_count * 2, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] font-mono text-[var(--text-tertiary)] opacity-60">
                     <span>SIGNAL SYNC</span>
                     <span>{skill.mention_count} MENTIONS</span>
                  </div>
                </div>
              ))}
              {(!stats?.skills || stats.skills.length === 0) && (
                <div className="col-span-2 py-12 text-center border-2 border-dashed border-[var(--border-light)] rounded-3xl opacity-40">
                  <p className="text-xs font-mono uppercase tracking-widest italic">
                    Log multi-modal signals to stabilize your attributes.
                  </p>
                </div>
              )}
            </div>
           </div>

           {/* Health Bio-Map */}
           <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-light)] p-8">
             <div className="flex items-center justify-between mb-8">
               <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] flex items-center gap-2">
                 <Activity size={16} className="text-rose-400" /> Bio-Metric Map
               </h3>
               <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/5 border border-emerald-500/20 rounded-full">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[8px] font-mono text-emerald-500 uppercase font-black">SYSTEM STABLE</span>
               </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
               <div className="relative aspect-square max-w-[280px] mx-auto filter group">
                 <svg viewBox="0 0 100 100" className="w-full h-full text-[var(--text-tertiary)] fill-current opacity-40">
                    <path d="M50,10c3,0,5,2,5,5s-2,5-5,5s-5-2-5-5S47,10,50,10z M45,22h10c4,0,7,3,7,7v15h-4v25h-5v20h-6v-20h-5v-25h-4V29C38,25,41,22,45,22z" />
                    {hotspots?.map((h: any) => (
                      <circle key={h.id} cx={h.cx} cy={h.cy} r={h.r} className="fill-rose-500 animate-pulse shadow-lg" />
                    ))}
                 </svg>
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_var(--bg-card)_70%)] pointer-events-none" />
               </div>
               <div className="space-y-6">
                 <p className="text-[10px] uppercase font-mono text-[var(--text-tertiary)] tracking-widest leading-relaxed">
                   Neural extraction from recent transmissions has flagged the following biometric markers:
                 </p>
                 <div className="space-y-3">
                   {stats?.healthEntities?.length > 0 ? stats.healthEntities.map((h: any) => (
                     <div key={h.id} className="flex items-center gap-4 p-4 rounded-2xl bg-black/20 border border-white/5 group hover:border-rose-500/30 transition-all">
                        <div className={`w-3 h-3 rounded-full ${h.type === 'blocker' ? 'bg-rose-500' : 'bg-blue-500'} shadow-[0_0_10px_currentColor]`} />
                        <div>
                          <p className="text-xs font-bold text-[var(--text-primary)] uppercase">{h.name}</p>
                          <p className="text-[8px] font-mono text-[var(--text-tertiary)]">STRESS FACTOR: HIGH</p>
                        </div>
                        <span className="ml-auto text-[8px] font-mono text-[var(--text-tertiary)] bg-white/5 px-2 py-1 rounded">DEBILITATING</span>
                     </div>
                   )) : (
                     <div className="p-8 border-2 border-dashed border-emerald-500/10 rounded-2xl text-center">
                       <p className="text-[10px] text-emerald-500/60 uppercase font-mono italic">No critical anomalies detected in the current manifold.</p>
                     </div>
                   )}
                 </div>
               </div>
             </div>
           </div>
        </div>

        {/* 4. Active Missions & Success Metrics */}
        <div className="lg:col-span-4 space-y-8">
           <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-light)] p-8">
            <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-8 flex items-center gap-2">
              <Target size={16} className="text-amber-400" /> Active Directives
            </h3>
            <div className="space-y-6">
              {stats?.activeProjects?.map((p: any) => (
                <div key={p.id} className="p-6 rounded-3xl bg-amber-400/5 border border-amber-400/10 hover:bg-amber-400/10 transition-all group">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-amber-400/20 flex items-center justify-center text-amber-500">
                       <Flame size={16} />
                    </div>
                    <span className="text-xs font-black text-amber-500 uppercase tracking-tighter">{p.name}</span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)] transition-all duration-1000" 
                      style={{ width: `${(p.mention_count % 10) * 10}%` }} 
                    />
                  </div>
                  <div className="flex justify-between mt-3 text-[9px] font-mono text-amber-500/60">
                     <span>LEVEL {Math.floor(p.mention_count / 10) + 1}</span>
                     <span>MOMENTUM { (p.mention_count % 10) * 10 }%</span>
                  </div>
                </div>
              ))}
              {(!stats?.activeProjects || stats.activeProjects.length === 0) && (
                <div className="py-12 border-2 border-dashed border-white/5 rounded-3xl text-center opacity-40">
                  <p className="text-[9px] font-mono uppercase italic tracking-widest text-[var(--text-tertiary)] px-4">Directives will manifest as your intelligence graph matures.</p>
                </div>
              )}
            </div>
           </div>

           {/* Achievements / Ribbons */}
           <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-light)] p-8">
            <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-8 flex items-center gap-2">
              <Sparkles size={16} className="text-purple-400" /> Recent Stabilizations
            </h3>
            <div className="space-y-4">
               {stats?.skillCount > 0 ? (
                 <div className="flex items-center gap-4 p-5 rounded-3xl bg-purple-400/5 border border-purple-400/10 hover:border-purple-400/30 transition-all">
                    <div className="w-10 h-10 rounded-2xl bg-purple-400/20 flex items-center justify-center text-purple-400 shadow-[0_0_20px_rgba(167,139,250,0.1)]">
                       <Star size={20} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-purple-400 uppercase tracking-tighter">{stats.skillCount} Nodes Active</p>
                      <p className="text-[8px] font-mono text-white/30 uppercase">Graph Stability: High</p>
                    </div>
                 </div>
               ) : (
                <div className="text-center py-10 grayscale opacity-20">
                  <Trophy size={48} className="mx-auto text-[var(--text-tertiary)] mb-4" />
                  <p className="text-[9px] font-mono uppercase tracking-[0.3em] font-black">No Active Ribbons</p>
                </div>
               )}
            </div>
           </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes scan {
          from { transform: translateY(-100%); }
          to { transform: translateY(450px); }
        }
        .animate-scan {
          animation: scan 6s linear infinite;
        }
        .animate-bounce-slow {
          animation: bounce 3s ease-in-out infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  )
}
