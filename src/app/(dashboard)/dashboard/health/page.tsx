'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, parseISO } from 'date-fns'
import {
  Heart, Plus, Loader2, Dumbbell, Moon, Zap,
  Scale, ChevronDown, ChevronUp, Film, CheckCircle2
} from 'lucide-react'
import type { HealthLog } from '@/types/database'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kgToLbs(kg: number) { return Math.round(kg * 22.0462) / 10 }
function lbsToKg(lbs: number) { return Math.round(lbs / 2.20462 * 10) / 10 }
function cmToIn(cm: number) { return Math.round(cm / 2.54) }

function EnergyBar({ value }: { value: number | null }) {
  if (!value) return <span className="text-[var(--text-tertiary)]">—</span>
  const pct = (value / 10) * 100
  const color = value >= 7 ? 'bg-emerald-500' : value >= 4 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-[var(--text-secondary)]">{value}/10</span>
    </div>
  )
}

// ─── Quick Log Form ───────────────────────────────────────────────────────────

interface QuickLogFormProps {
  unitPref: 'imperial' | 'metric'
  onSaved: () => void
}

function QuickLogForm({ unitPref, onSaved }: QuickLogFormProps) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    weight: '',
    energy: '',
    sleep: '',
    mood: '',
    workout_done: false,
    workout_notes: '',
    notes: '',
  })
  const supabase = createClient()

  const handleSave = async () => {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    const weight_kg = form.weight
      ? (unitPref === 'imperial' ? lbsToKg(parseFloat(form.weight)) : parseFloat(form.weight))
      : null

    await supabase.from('health_logs').insert({
      user_id: session.user.id,
      logged_at: new Date().toISOString(),
      weight_kg: weight_kg,
      energy_level: form.energy ? parseInt(form.energy) : null,
      sleep_hours: form.sleep ? parseFloat(form.sleep) : null,
      mood: form.mood || null,
      workout_done: form.workout_done,
      workout_notes: form.workout_notes || null,
      notes: form.notes || null,
      source: 'manual',
    })

    setForm({ weight: '', energy: '', sleep: '', mood: '', workout_done: false, workout_notes: '', notes: '' })
    setSaving(false)
    onSaved()
  }

  const weightLabel = unitPref === 'imperial' ? 'lbs' : 'kg'
  const hasAnyData = form.weight || form.energy || form.sleep || form.mood || form.workout_done || form.notes

  return (
    <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-light)]">
      <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-4">
        Quick Log
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">

        {/* Weight */}
        <div>
          <label className="block text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">
            Weight ({weightLabel})
          </label>
          <input
            type="number"
            step={0.1}
            value={form.weight}
            onChange={e => setForm({ ...form, weight: e.target.value })}
            placeholder={unitPref === 'imperial' ? '175' : '79.5'}
            className="input w-full text-sm"
          />
        </div>

        {/* Energy */}
        <div>
          <label className="block text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">
            Energy (1–10)
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={form.energy}
            onChange={e => setForm({ ...form, energy: e.target.value })}
            placeholder="7"
            className="input w-full text-sm"
          />
        </div>

        {/* Sleep */}
        <div>
          <label className="block text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">
            Sleep (hrs)
          </label>
          <input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={form.sleep}
            onChange={e => setForm({ ...form, sleep: e.target.value })}
            placeholder="7.5"
            className="input w-full text-sm"
          />
        </div>

        {/* Mood */}
        <div>
          <label className="block text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">
            Mood
          </label>
          <input
            type="text"
            value={form.mood}
            onChange={e => setForm({ ...form, mood: e.target.value })}
            placeholder="focused, tired..."
            className="input w-full text-sm"
          />
        </div>
      </div>

      {/* Workout */}
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={() => setForm({ ...form, workout_done: !form.workout_done })}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            form.workout_done
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-[var(--bg-secondary)] border-[var(--border-light)] text-[var(--text-tertiary)]'
          }`}
        >
          <Dumbbell size={12} />
          Worked out
        </button>
        {form.workout_done && (
          <input
            type="text"
            value={form.workout_notes}
            onChange={e => setForm({ ...form, workout_notes: e.target.value })}
            placeholder="ran 5k, gym, yoga..."
            className="input flex-1 text-sm py-1.5"
          />
        )}
      </div>

      {/* Notes */}
      <textarea
        value={form.notes}
        onChange={e => setForm({ ...form, notes: e.target.value })}
        placeholder="Any health notes..."
        rows={2}
        className="input w-full text-sm resize-none mb-4"
      />

      <button
        onClick={handleSave}
        disabled={saving || !hasAnyData}
        className="btn btn-primary btn-sm flex items-center gap-2 disabled:opacity-40"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        Log Entry
      </button>
    </div>
  )
}

// ─── Log Entry Row ────────────────────────────────────────────────────────────

function HealthLogRow({ log, unitPref }: { log: HealthLog; unitPref: 'imperial' | 'metric' }) {
  const [expanded, setExpanded] = useState(false)
  const date = parseISO(log.logged_at)
  const weightDisplay = log.weight_kg
    ? (unitPref === 'imperial' ? `${kgToLbs(log.weight_kg)} lbs` : `${log.weight_kg} kg`)
    : null

  return (
    <div className="border-b border-[var(--border-light)] last:border-b-0">
      <div
        className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.015] transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Date */}
        <div className="w-20 flex-shrink-0">
          <p className="text-[11px] font-mono text-[var(--text-secondary)]">{format(date, 'MMM d')}</p>
          <p className="text-[9px] font-mono text-[var(--text-tertiary)] mt-0.5">{format(date, 'h:mm a')}</p>
        </div>

        {/* Metrics row */}
        <div className="flex-1 flex items-center gap-4 flex-wrap">
          {weightDisplay && (
            <div className="flex items-center gap-1.5">
              <Scale size={11} className="text-[var(--text-tertiary)]" />
              <span className="text-[12px] font-mono text-[var(--text-secondary)]">{weightDisplay}</span>
            </div>
          )}
          {log.energy_level && (
            <div className="flex items-center gap-1.5">
              <Zap size={11} className="text-amber-400" />
              <span className="text-[12px] font-mono text-[var(--text-secondary)]">{log.energy_level}/10</span>
            </div>
          )}
          {log.sleep_hours && (
            <div className="flex items-center gap-1.5">
              <Moon size={11} className="text-indigo-400" />
              <span className="text-[12px] font-mono text-[var(--text-secondary)]">{log.sleep_hours}h</span>
            </div>
          )}
          {log.workout_done && (
            <div className="flex items-center gap-1.5">
              <Dumbbell size={11} className="text-emerald-400" />
              <span className="text-[11px] text-emerald-400">Workout</span>
            </div>
          )}
          {log.mood && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15 font-mono">
              {log.mood}
            </span>
          )}
        </div>

        {/* Source badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {log.source === 'video_analysis' && (
            <span className="flex items-center gap-1 text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
              <Film size={9} /> Auto
            </span>
          )}
          {(log.notes || log.workout_notes) && (
            expanded ? <ChevronUp size={12} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={12} className="text-[var(--text-tertiary)]" />
          )}
        </div>
      </div>

      {expanded && (log.notes || log.workout_notes) && (
        <div className="px-4 pb-3 pl-24 text-[12px] text-[var(--text-secondary)] leading-relaxed">
          {log.workout_notes && <p className="mb-1"><span className="font-mono text-[var(--text-tertiary)] text-[10px]">WORKOUT</span> {log.workout_notes}</p>}
          {log.notes && <p>{log.notes}</p>}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HealthPage() {
  const [logs, setLogs] = useState<HealthLog[]>([])
  const [loading, setLoading] = useState(true)
  const [unitPref, setUnitPref] = useState<'imperial' | 'metric'>('imperial')
  const [profile, setProfile] = useState<any>(null)
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const [{ data: profileData }, { data: logsData }] = await Promise.all([
      supabase.from('profiles').select('unit_preference, height_cm, weight_kg, date_of_birth, biological_sex, display_name').eq('id', session.user.id).single(),
      supabase.from('health_logs').select('*').eq('user_id', session.user.id).order('logged_at', { ascending: false }).limit(90),
    ])

    if (profileData) {
      setProfile(profileData)
      setUnitPref(profileData.unit_preference || 'imperial')
    }
    setLogs((logsData || []) as HealthLog[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Stats ──
  const last30 = logs.filter(l => new Date(l.logged_at) >= subDays(new Date(), 30))
  const avgEnergy = last30.filter(l => l.energy_level).length > 0
    ? (last30.reduce((s, l) => s + (l.energy_level || 0), 0) / last30.filter(l => l.energy_level).length).toFixed(1)
    : null
  const avgSleep = last30.filter(l => l.sleep_hours).length > 0
    ? (last30.reduce((s, l) => s + (l.sleep_hours || 0), 0) / last30.filter(l => l.sleep_hours).length).toFixed(1)
    : null
  const workoutCount = last30.filter(l => l.workout_done).length
  const latestWeight = logs.find(l => l.weight_kg)

  const weightDisplay = (kg: number | null) => {
    if (!kg) return null
    return unitPref === 'imperial' ? `${kgToLbs(kg)} lbs` : `${kg} kg`
  }

  const heightDisplay = (cm: number | null) => {
    if (!cm) return null
    if (unitPref === 'imperial') {
      const totalIn = cmToIn(cm)
      return `${Math.floor(totalIn / 12)}′${totalIn % 12}″`
    }
    return `${cm} cm`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between border-b border-[var(--border-light)] pb-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">
            Personal Health
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Health</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Logged manually and auto-captured from your videos.
          </p>
        </div>

        {/* Profile quick stats */}
        {profile && (
          <div className="text-right space-y-0.5">
            {profile.height_cm && (
              <p className="text-[11px] font-mono text-[var(--text-tertiary)]">{heightDisplay(profile.height_cm)}</p>
            )}
            {latestWeight?.weight_kg && (
              <p className="text-[11px] font-mono text-[var(--text-tertiary)]">{weightDisplay(latestWeight.weight_kg)}</p>
            )}
            {profile.date_of_birth && (
              <p className="text-[11px] font-mono text-[var(--text-tertiary)]">
                {new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear()} yrs
              </p>
            )}
          </div>
        )}
      </div>

      {/* 30-day stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)] text-center">
          <Zap size={14} className="mx-auto mb-2 text-amber-400" />
          <p className="text-2xl font-bold">{avgEnergy ?? '—'}</p>
          <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mt-1">Avg Energy</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)] text-center">
          <Moon size={14} className="mx-auto mb-2 text-indigo-400" />
          <p className="text-2xl font-bold">{avgSleep ? `${avgSleep}h` : '—'}</p>
          <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mt-1">Avg Sleep</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)] text-center">
          <Dumbbell size={14} className="mx-auto mb-2 text-emerald-400" />
          <p className="text-2xl font-bold">{workoutCount}</p>
          <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mt-1">Workouts / 30d</p>
        </div>
      </div>

      {/* Quick log */}
      <QuickLogForm unitPref={unitPref} onSaved={loadData} />

      {/* Log history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">History</p>
          <p className="text-[10px] font-mono text-[var(--text-tertiary)]">{logs.length} entries</p>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[var(--border-light)] rounded-2xl">
            <Heart size={32} className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-20" />
            <p className="text-xs text-[var(--text-tertiary)]">No health logs yet. Add your first check-in above.</p>
            <p className="text-[10px] text-[var(--text-tertiary)] opacity-60 mt-1">
              Health data is also captured automatically from your video recordings.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-light)] overflow-hidden bg-[var(--bg-card)]">
            {logs.map(log => (
              <HealthLogRow key={log.id} log={log} unitPref={unitPref} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
