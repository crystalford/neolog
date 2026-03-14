'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Brain, Edit3, Save, X, Sparkles, Clock,
} from 'lucide-react'

export default function CharacterPage() {
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
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
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('entities').select('*').eq('user_id', session.user.id),
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
        const topics = entitiesData.filter((e: any) => !['project', 'goal'].includes(e.type))
        const prjs = entitiesData.filter((e: any) => e.type === 'project')
        const totalMentions = entitiesData.reduce((acc: number, curr: any) => acc + (curr.mention_count || 0), 0)
        setStats({
          totalMentions,
          topicCount: topics.length,
          projectCount: prjs.length,
          topics: topics.sort((a: any, b: any) => b.mention_count - a.mention_count),
        })
      }

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

  if (loading) return (
    <div className="p-8 text-[var(--text-tertiary)] font-mono text-xs uppercase tracking-widest animate-pulse">
      Loading...
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8 pb-32">

      {/* Header */}
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--accent)] mb-1">Profile</p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          {profile?.display_name || profile?.username || 'Anonymous'}
        </h1>
        <p className="text-xs text-[var(--text-tertiary)] font-mono mt-1">@{profile?.username}</p>
      </div>

      {/* Avatar + Identity */}
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
          </div>

          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold">{profile?.display_name || profile?.username}</h2>
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] hover:opacity-80"
              >
                {editing ? <><X size={11} /> Cancel</> : <><Edit3 size={11} /> Edit</>}
              </button>
            </div>

            {editing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 p-5 rounded-xl border border-white/5">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-mono text-white/40 uppercase">Display Name</label>
                    <input
                      value={formData.display_name}
                      onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-white/40 uppercase">Bio</label>
                    <textarea
                      value={formData.bio}
                      onChange={e => setFormData({ ...formData, bio: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mt-1 focus:border-[var(--accent)] outline-none min-h-[70px]"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  {['website_url', 'twitter_url', 'github_url', 'linkedin_url'].map(field => (
                    <div key={field}>
                      <label className="text-[10px] font-mono text-white/40 uppercase">{field.replace('_url', '')}</label>
                      <input
                        value={formData[field]}
                        onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs mt-1 focus:border-[var(--accent)] outline-none"
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
              profile?.bio && <p className="text-sm text-[var(--text-secondary)] italic max-w-xl">"{profile.bio}"</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { val: stats?.totalMentions || 0, label: 'Mentions' },
              { val: stats?.topicCount || 0, label: 'Topics' },
              { val: stats?.projectCount || 0, label: 'Projects' },
            ].map(s => (
              <div key={s.label} className="bg-[var(--bg-tertiary)]/50 p-3 rounded-xl border border-[var(--border-light)]">
                <p className="text-xl font-bold">{s.val}</p>
                <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] p-6">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-5 flex items-center gap-2">
            <Brain size={13} className="text-blue-400" /> Topics &amp; Interests
          </h3>
          {stats?.topics?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {stats.topics.slice(0, 20).map((topic: any) => (
                <div key={topic.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
                  <span className="text-xs font-medium">{topic.name}</span>
                  <span className="text-[9px] text-[var(--text-tertiary)]">{topic.mention_count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)] italic">
              Topics accumulate as you record and upload sessions.
            </p>
          )}
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] p-6">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-5 flex items-center gap-2">
            <Clock size={13} className="text-purple-400" /> Activity
          </h3>
          {stats?.totalMentions > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Total mentions across all uploads</span>
                <span className="font-bold text-[var(--text-primary)]">{stats.totalMentions}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Unique topics tracked</span>
                <span className="font-bold text-[var(--text-primary)]">{stats.topicCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Projects mentioned</span>
                <span className="font-bold text-[var(--text-primary)]">{stats.projectCount}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)] italic">
              No activity recorded yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
