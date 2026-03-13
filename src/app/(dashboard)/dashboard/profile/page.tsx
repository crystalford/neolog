'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Trophy, Star, Zap, Activity, Shield, Users, 
  ChevronRight, Sparkles, Brain, Target, Flame
} from 'lucide-react'
import { format } from 'date-fns'

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
      
      setProfile(profile)

      // Calculate Stats from Entities
      const { data: entities } = await supabase
        .from('entities')
        .select('*')
        .eq('user_id', session.user.id)
      
      if (entities) {
        const skills = entities.filter(e => e.type === 'skill')
        const projects = entities.filter(e => e.type === 'project')
        const goals = entities.filter(e => e.type === 'goal')
        
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
          healthEntities: entities.filter(e => e.type === 'habit' || e.type === 'blocker')
        })
      }

      setLoading(false)
    }
    loadData()
  }, [])

  if (loading) return <div className="p-8 animate-pulse">Loading Character Sheet...</div>

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-8">
      {/* Header / XP Bar */}
      <div className="relative overflow-hidden rounded-3xl bg-[var(--bg-secondary)] border border-[var(--border-light)] p-8 shadow-xl">
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] rotate-12">
          <Trophy size={200} />
        </div>
        
        <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
          <div className="relative">
            <div className="w-32 h-32 rounded-3xl overflow-hidden border-4 border-[var(--accent)] shadow-2xl">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center text-white text-4xl font-bold">
                  {profile?.username?.[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="absolute -bottom-3 -right-3 bg-[var(--accent)] text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg border-2 border-[var(--bg-secondary)]">
              LVL {stats?.level || 1}
            </div>
          </div>

          <div className="flex-1 space-y-4 text-center md:text-left">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-1">
                {profile?.display_name || profile?.username}
              </h1>
              <p className="text-[var(--text-tertiary)] font-mono text-xs uppercase tracking-widest bg-[var(--accent-soft)] inline-block px-2 py-1 rounded">
                Neolog Intelligence Pilot
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-[var(--text-tertiary)] mb-1">
                <span>XP: {stats?.xp} / {stats?.nextLevelXp}</span>
                <span>{Math.round((stats?.xp / stats?.nextLevelXp) * 100)}%</span>
              </div>
              <div className="h-3 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border-light)]">
                <div 
                  className="h-full bg-gradient-to-r from-[var(--accent)] to-purple-500 transition-all duration-1000"
                  style={{ width: `${(stats?.xp / stats?.nextLevelXp) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--bg-tertiary)]/50 backdrop-blur-sm p-4 rounded-2xl border border-[var(--border-light)] text-center">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.totalMentions}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Total Actions</p>
            </div>
            <div className="bg-[var(--bg-tertiary)]/50 backdrop-blur-sm p-4 rounded-2xl border border-[var(--border-light)] text-center">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.skillCount}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Skills Mastered</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Skills & Bio-Map */}
        <div className="lg:col-span-2 space-y-8">
          {/* Skills / Attributes */}
          <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border-light)] p-8">
            <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-6 flex items-center gap-2">
              <Brain size={16} className="text-blue-400" /> Attributes & Skills
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {stats?.skills?.map((skill: any) => (
                <div key={skill.id} className="space-y-2 group p-4 rounded-2xl hover:bg-[var(--bg-tertiary)]/50 transition-colors border border-transparent hover:border-[var(--border-light)]">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{skill.name}</span>
                    <span className="text-[10px] font-mono text-[var(--accent)] px-2 py-0.5 bg-[var(--accent-soft)] rounded-full">rank {Math.floor(skill.mention_count / 5) + 1}</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-400 transform origin-left transition-transform duration-1000"
                      style={{ transform: `scaleX(${Math.min(skill.mention_count / 50, 1)})` }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Recently mentioned in active sessions</p>
                </div>
              ))}
              {(!stats?.skills || stats.skills.length === 0) && (
                <p className="text-xs text-[var(--text-tertiary)] italic col-span-2 py-4">
                  Keep logging sessions to reveal and level up your skills.
                </p>
              )}
            </div>
          </div>

          {/* Bio-Map / Health State */}
          <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border-light)] p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] flex items-center gap-2">
                <Activity size={16} className="text-rose-400" /> Health Bio-Map
              </h3>
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono bg-green-400/10 text-green-400 px-3 py-1 rounded-full border border-green-400/20">
                Stable
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="relative aspect-square max-w-[240px] mx-auto opacity-80 group">
                {/* SVG Humanoid Placeholder */}
                <svg viewBox="0 0 100 100" className="w-full h-full text-[var(--text-tertiary)] fill-current">
                   <path d="M50,10c3,0,5,2,5,5s-2,5-5,5s-5-2-5-5S47,10,50,10z M45,22h10c4,0,7,3,7,7v15h-4v25h-5v20h-6v-20h-5v-25h-4V29C38,25,41,22,45,22z" />
                   {/* "Hotspots" based on blockers */}
                   {stats?.healthEntities?.some((e: any) => e.name.toLowerCase().includes('ankle')) && (
                     <circle cx="55" cy="85" r="4" className="fill-rose-500 animate-pulse" />
                   )}
                   {stats?.healthEntities?.some((e: any) => e.name.toLowerCase().includes('head') || e.name.toLowerCase().includes('sleep')) && (
                     <circle cx="50" cy="15" r="3" className="fill-rose-500 animate-pulse" />
                   )}
                </svg>
              </div>
              <div className="space-y-4">
                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                  Active health indicators monitored through log analysis. Identified markers:
                </p>
                <div className="space-y-2">
                  {stats?.healthEntities?.length > 0 ? stats.healthEntities.map((h: any) => (
                    <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-tertiary)]/30 border border-[var(--border-light)]">
                       <span className={`w-2 h-2 rounded-full ${h.type === 'blocker' ? 'bg-rose-400' : 'bg-blue-400'}`} />
                       <span className="text-xs font-medium text-[var(--text-secondary)]">{h.name}</span>
                       <span className="ml-auto text-[9px] font-mono text-[var(--text-tertiary)]">{h.status || 'Active'}</span>
                    </div>
                  )) : (
                    <p className="text-[10px] text-green-400">No active physiological markers detected.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Quests & Achievements */}
        <div className="space-y-8">
          <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border-light)] p-8">
            <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-6 flex items-center gap-2">
              <Target size={16} className="text-amber-400" /> Active Quests
            </h3>
            <div className="space-y-4">
              {stats?.projectCount > 0 ? (
                <div className="p-4 rounded-2xl bg-amber-400/5 border border-amber-400/10 group cursor-pointer hover:bg-amber-400/10 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <Flame size={14} className="text-amber-500" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">Project Momentum</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] mb-3">Maintain mention frequency across {stats.projectCount} active projects.</p>
                  <div className="h-1 w-full bg-[var(--border-light)] rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 w-2/3" />
                  </div>
                </div>
              ) : null}
              <div className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] opacity-60">
                 <p className="text-[10px] text-[var(--text-tertiary)] text-center italic">More quests unlock as your intelligence graph grows.</p>
              </div>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border-light)] p-8">
            <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-6 flex items-center gap-2">
              <Sparkles size={16} className="text-purple-400" /> Recent Gains
            </h3>
            <div className="space-y-4">
              <div className="text-center py-6">
                <Trophy size={32} className="mx-auto text-[var(--text-tertiary)] opacity-20 mb-2" />
                <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest">No recent achievements</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
