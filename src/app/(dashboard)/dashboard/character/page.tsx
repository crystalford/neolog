'use client'

export const runtime = 'edge'


import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Brain, Edit3, Save, X, Sparkles, Clock, Target, Users,
  Lightbulb, Zap, BookOpen, TrendingUp, Hash, Link2, Mic,
  Cpu, ImageIcon, CheckCircle, AlertCircle, Shield, ArrowRight
} from 'lucide-react'
import Link from 'next/link'

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface CorpusStats {
  voice: number
  face: number
  voiceMinutes: number
  qualifiedFaces: number
}

interface RecentSignal {
  id: string
  type: string
  fidelity_score: number
  fidelity_rank: string
  created_at: string
  meta: any
  source_upload_id: string
}

interface ManifestModel {
  signal_type: string
  is_training_ready: boolean
  quality_score: number
  metadata: any
  created_at: string
}

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

// ─── Constants ───────────────────────────────────────────────────────────────

const VOICE_THRESHOLD_MINUTES = 180
const FACE_THRESHOLD = 25

// ─── Sub-Components ──────────────────────────────────────────────────────────

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
      </div>
    </div>
  )
}

function VoiceProfileSection({ voiceProfile }: { voiceProfile: any }) {
  if (!voiceProfile) {
    return (
      <div className="rounded-xl border border-[var(--border-light)] border-dashed bg-[var(--bg-secondary)]/30 p-8 text-center">
        <Mic size={24} className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-30" />
        <p className="text-sm text-[var(--text-tertiary)]">Voice profile building...</p>
        <p className="text-xs text-[var(--text-tertiary)] opacity-60 mt-1 max-w-xs mx-auto">
          The system is learning how you talk from your uploads.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-5 space-y-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Mic size={13} className="text-[var(--accent)]" />
        <h3 className="text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--text-primary)]">
          Voice DNA
        </h3>
      </div>
      {voiceProfile.voice_summary && (
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic border-l-2 border-[var(--accent)]/30 pl-3">
          "{voiceProfile.voice_summary}"
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {voiceProfile.signature_phrases?.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-2">Signature</p>
            <div className="flex flex-wrap gap-1.5">
              {voiceProfile.signature_phrases.map((phrase: string, i: number) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15 font-medium">
                  {phrase}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function IdentityPage() {
  const [profile, setProfile] = useState<any>(null)
  const [entities, setEntities] = useState<any[]>([])
  const [uploadCount, setUploadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Corpus State (from Manifest)
  const [corpus, setCorpus] = useState<CorpusStats>({ voice: 0, face: 0, voiceMinutes: 0, qualifiedFaces: 0 })
  const [recentSignals, setRecentSignals] = useState<RecentSignal[]>([])
  const [models, setModels] = useState<ManifestModel[]>([])
  const [faceThumbnails, setFaceThumbnails] = useState<string[]>([])
  
  const [formData, setFormData] = useState<any>({
    display_name: '', bio: '', website_url: '', twitter_url: '', github_url: '',
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
        { data: corpusData },
        { data: signalsData },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('entities').select('*').eq('user_id', session.user.id).order('mention_count', { ascending: false }),
        supabase.from('video_uploads').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
        supabase.from('neural_corpus').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('neural_signals').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
      ])

      if (profileData) {
        setProfile(profileData)
        setFormData({
          display_name: profileData.display_name || '',
          bio: profileData.bio || '',
          website_url: profileData.website_url || '',
          twitter_url: profileData.twitter_url || '',
          github_url: profileData.github_url || '',
        })
      }

      if (corpusData) {
        const voiceEntries = corpusData.filter((c: any) => c.type === 'voice')
        const faceEntries = corpusData.filter((c: any) => c.type === 'face')
        const voiceMinutes = voiceEntries.reduce((acc: number, v: any) => acc + (v.meta?.duration_seconds || 300) / 60, 0)
        const qualifiedFaces = faceEntries.filter((f: any) => (f.fidelity_score ?? 0.7) >= 0.6).length
        
        setCorpus({
          voice: voiceEntries.length,
          face: faceEntries.length,
          voiceMinutes: Math.round(voiceMinutes),
          qualifiedFaces,
        })
        setFaceThumbnails(faceEntries.sort((a: any, b: any) => (b.fidelity_score || 0) - (a.fidelity_score || 0)).slice(0, 6).map((f: any) => f.storage_path))
        setRecentSignals(corpusData.slice(0, 8) as RecentSignal[])
      }

      setModels(signalsData || [])
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

  const byType = (type: string) => entities.filter((e: any) => e.type === type)
  const totalMentions = entities.reduce((acc: number, e: any) => acc + (e.mention_count || 0), 0)

  if (loading) return <div className="p-8 text-[var(--text-tertiary)] font-mono text-xs uppercase tracking-widest animate-pulse">Synchronizing Identity...</div>

  const voicePct = Math.min(100, Math.round((corpus.voiceMinutes / VOICE_THRESHOLD_MINUTES) * 100))
  const facePct = Math.min(100, Math.round((corpus.qualifiedFaces / FACE_THRESHOLD) * 100))
  const voiceModel = models.find(m => m.signal_type === 'voice')
  const imageModel = models.find(m => m.signal_type === 'image')

  return (
    <div className="max-w-7xl mx-auto px-8 py-12 pb-64 space-y-16">
      
      {/* ── Section 1: Core Identity ── */}
      <div className="flex flex-col lg:flex-row gap-10">
        <div className="flex-1 space-y-8">
           <div className="flex items-start gap-8 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-[2.5rem] p-8 shadow-sm">
             <div className="w-32 h-32 rounded-3xl overflow-hidden border-4 border-[var(--accent)]/20 shadow-2xl shrink-0">
               {profile?.avatar_url ? (
                 <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center text-white text-4xl font-black">
                   {(profile?.username || '?')[0].toUpperCase()}
                 </div>
               )}
             </div>

             <div className="flex-1 min-w-0">
               <div className="flex items-center gap-4 mb-2">
                 <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">
                   {profile?.display_name || profile?.username || 'Anonymous'}
                 </h1>
                 <button onClick={() => setEditing(!editing)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[var(--accent)] transition-all">
                   {editing ? <X size={16} /> : <Edit3 size={16} />}
                 </button>
               </div>
               <p className="text-xs text-[var(--text-tertiary)] font-mono uppercase tracking-widest mb-6">@{profile?.username}</p>
               
               {editing ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                    <input value={formData.display_name} onChange={e => setFormData({...formData, display_name: e.target.value})} placeholder="Display Name" className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-[var(--accent)]" />
                    <textarea value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} placeholder="Bio" className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-[var(--accent)] min-h-[80px]" />
                    <button onClick={handleSave} disabled={saving} className="btn btn-primary py-3 rounded-xl font-bold uppercase tracking-widest text-[10px]">{saving ? 'Saving...' : 'Save Profile'}</button>
                 </div>
               ) : (
                 <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-xl italic whitespace-pre-wrap">{profile?.bio || "No bio established yet."}</p>
               )}
             </div>
           </div>

           <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Sessions', val: uploadCount, icon: Clock },
                { label: 'Entities', val: entities.length, icon: Brain },
                { label: 'Mentions', val: totalMentions, icon: Zap },
              ].map(s => (
                <div key={s.label} className="bg-[var(--bg-secondary)]/50 p-6 rounded-3xl border border-[var(--border-light)] flex flex-col items-center text-center gap-2">
                   <s.icon size={16} className="text-[var(--accent)] opacity-40" />
                   <p className="text-2xl font-black text-[var(--text-primary)] tracking-tighter">{s.val}</p>
                   <p className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-[0.2em]">{s.label}</p>
                </div>
              ))}
           </div>
        </div>

        <div className="w-full lg:w-96 shrink-0">
           <VoiceProfileSection voiceProfile={profile?.voice_profile} />
        </div>
      </div>

      {/* ── Section 2: Neural Manifest (The Corpus) ── */}
      <div className="space-y-10">
        <div className="flex items-center gap-4">
           <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500"><Cpu size={18} /></div>
           <div>
             <h2 className="text-xl font-bold tracking-tight">Biometric Corpus</h2>
             <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-widest font-mono">Archive health & Training readiness</p>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Voice Health */}
           <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-[2rem] p-8 space-y-6 shadow-sm">
              <div className="flex justify-between items-start">
                 <div className="flex items-center gap-3">
                    <Mic size={20} className="text-emerald-400" />
                    <div>
                      <h3 className="font-bold underline decoration-emerald-400/30">Voice Archive</h3>
                      <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono">{corpus.voiceMinutes} / {VOICE_THRESHOLD_MINUTES} min</p>
                    </div>
                 </div>
                 {voicePct === 100 && <div className="px-3 py-1 bg-emerald-400/10 text-emerald-400 text-[9px] font-mono uppercase tracking-widest rounded-full border border-emerald-400/20">Ready</div>}
              </div>
              <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden shadow-inner">
                 <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(52,211,153,0.3)]" style={{ width: `${voicePct}%` }} />
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic opacity-70">
                {voiceModel?.is_training_ready ? "✓ Your ElevenLabs Professional Voice Clone is trained and active." : `Accumulating clean audio samples. ${VOICE_THRESHOLD_MINUTES - corpus.voiceMinutes} minutes remain until training trigger.`}
              </p>
           </div>

           {/* Visual Health */}
           <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-[2rem] p-8 space-y-6 shadow-sm">
              <div className="flex justify-between items-start">
                 <div className="flex items-center gap-3">
                    <ImageIcon size={20} className="text-indigo-400" />
                    <div>
                      <h3 className="font-bold underline decoration-indigo-400/30">Visual Corpus</h3>
                      <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono">{corpus.qualifiedFaces} / {FACE_THRESHOLD} frames</p>
                    </div>
                 </div>
                 {facePct === 100 && <div className="px-3 py-1 bg-indigo-400/10 text-indigo-400 text-[9px] font-mono uppercase tracking-widest rounded-full border border-indigo-400/20">Ready</div>}
              </div>
              <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden shadow-inner">
                 <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(129,140,248,0.3)]" style={{ width: `${facePct}%` }} />
              </div>
              <div className="flex gap-2">
                 {faceThumbnails.map((path, i) => (
                    <div key={i} className="w-10 h-10 rounded-lg overflow-hidden border border-white/5 bg-black/20">
                       <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${path}`} className="w-full h-full object-cover" onError={e => e.currentTarget.style.display='none'} />
                    </div>
                 ))}
                 {corpus.qualifiedFaces === 0 && <div className="text-[10px] text-[var(--text-tertiary)] italic">Awaiting high-fidelity frames...</div>}
              </div>
           </div>
        </div>

        <div className="bg-black/20 rounded-3xl border border-white/5 p-8">
           <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] mb-6">Recent Biometric Signals</h3>
           <div className="overflow-x-auto">
             <table className="w-full text-left">
                <thead className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">
                   <tr>
                      <th className="pb-4">Type</th>
                      <th className="pb-4">Fidelity</th>
                      <th className="pb-4">Rank</th>
                      <th className="pb-4">Captured</th>
                   </tr>
                </thead>
                <tbody className="text-xs">
                   {recentSignals.map(sig => (
                      <tr key={sig.id} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                         <td className="py-3 flex items-center gap-2">
                           {sig.type === 'voice' ? <Mic size={12} className="text-emerald-400" /> : <ImageIcon size={12} className="text-indigo-400" />}
                           <span className="font-mono opacity-60 uppercase">{sig.type}</span>
                         </td>
                         <td className="py-3">
                           <div className="w-24 h-1 rounded-full bg-white/5 overflow-hidden">
                              <div className="h-full bg-[var(--accent)]" style={{ width: `${(sig.fidelity_score || 0.7) * 100}%` }} />
                           </div>
                         </td>
                         <td className="py-3 font-mono font-black">{sig.fidelity_rank || 'B'}</td>
                         <td className="py-3 text-[var(--text-tertiary)] font-mono">{new Date(sig.created_at).toLocaleDateString()}</td>
                      </tr>
                   ))}
                </tbody>
             </table>
           </div>
        </div>
      </div>

      {/* ── Section 3: Intelligence Map (Entities) ── */}
      <div className="space-y-10">
        <div className="flex items-center gap-4">
           <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500"><Brain size={18} /></div>
           <div>
             <h2 className="text-xl font-bold tracking-tight">Memory Architecture</h2>
             <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-widest font-mono">Synthesized entity network</p>
           </div>
        </div>

        {entities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ENTITY_LAYERS.map(layer => {
              const layerEntities = byType(layer.key as string)
              if (layerEntities.length === 0) return null
              return <EntitySection key={layer.key} layer={layer} entities={layerEntities} />
            })}
          </div>
        ) : (
          <div className="py-20 text-center bg-[var(--bg-secondary)]/30 border border-dashed border-[var(--border-light)] rounded-[3rem] opacity-30">
             <Brain size={48} className="mx-auto mb-4" />
             <p className="text-sm">Neural map initializing...</p>
          </div>
        )}
      </div>

    </div>
  )
}
