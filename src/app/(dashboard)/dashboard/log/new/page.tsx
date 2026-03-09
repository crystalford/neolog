'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, X, Plus, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

const ENTRY_TYPES = [
  { value: 'work',         label: '🧠 Work', description: 'Sessions, projects, deep work' },
  { value: 'build',        label: '⚡ Build', description: 'Shipped features, commits, launches' },
  { value: 'food',         label: '🍽️ Food', description: 'Meals, restaurants, recipes' },
  { value: 'health',       label: '💪 Health', description: 'Exercise, appointments, wellness' },
  { value: 'finance',      label: '💰 Finance', description: 'Purchases, income, expenses' },
  { value: 'asset_update', label: '🔧 Asset', description: 'Maintenance, upgrades, repairs' },
  { value: 'social',       label: '👥 Social', description: 'Meetings, events, people' },
  { value: 'learn',        label: '📚 Learn', description: 'Reading, courses, insights' },
  { value: 'capture',      label: '📝 Note', description: 'Quick thoughts, captures' },
]

const KNOWN_TOOLS = [
  'Claude', 'Claude Sonnet', 'GPT-4o', 'Antigravity', 'Cursor',
  'Gemini', 'Copilot', 'Figma', 'Notion', 'Xcode',
]

export default function NewLogEntryPage() {
  const router = useRouter()
  const supabase = createClient()

  const [entryType, setEntryType] = useState('work')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [loggedAt, setLoggedAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [softwareTags, setSoftwareTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [costDir, setCostDir] = useState<'+' | '-'>('-')
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addTag = (tag: string) => {
    const t = tag.trim()
    if (t && !softwareTags.includes(t)) setSoftwareTags((prev) => [...prev, t])
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    setSoftwareTags((prev) => prev.filter((t) => t !== tag))
  }

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true); setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const costDelta = costAmount
      ? parseFloat(costDir + costAmount.replace(/[^0-9.]/g, ''))
      : null

    const { error: insertError } = await supabase.from('log_entries').insert({
      user_id: session.user.id,
      entry_type: entryType,
      title: title.trim(),
      body: body.trim() || null,
      thumbnail_url: thumbnailUrl.trim() || null,
      logged_at: new Date(loggedAt).toISOString(),
      software_tags: softwareTags,
      cost_delta: costDelta,
      is_public: isPublic,
    })

    setSaving(false)
    if (insertError) { setError(insertError.message); return }
    router.push('/dashboard/timeline')
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 md:py-12" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Back */}
      <Link
        href="/dashboard/timeline"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] mb-6 transition-colors"
        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}
      >
        <ChevronLeft size={13} /> BACK TO LOG
      </Link>

      {/* Header */}
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
        INGEST
      </p>
      <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '2rem' }}>
        New Log Entry
      </h1>

      <div className="space-y-6">
        {/* Entry type */}
        <section>
          <label className="block text-xs font-mono tracking-widest uppercase text-[var(--text-tertiary)] mb-3">
            Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ENTRY_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setEntryType(t.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: `1px solid ${entryType === t.value ? 'var(--accent)' : 'var(--border-light)'}`,
                  background: entryType === t.value ? 'rgba(124,106,245,0.08)' : 'transparent',
                  color: entryType === t.value ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-[10px] opacity-60 mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Title */}
        <section>
          <label className="block text-xs font-mono tracking-widest uppercase text-[var(--text-tertiary)] mb-2">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="2014 Camry LE — stabilizer link + tie rods"
            className="w-full rounded-lg border border-[var(--border-medium)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
            style={{ fontFamily: 'var(--font-mono)' }}
            autoFocus
          />
        </section>

        {/* Body */}
        <section>
          <label className="block text-xs font-mono tracking-widest uppercase text-[var(--text-tertiary)] mb-2">
            Notes <span className="opacity-40">(optional)</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Additional context..."
            rows={3}
            className="w-full rounded-lg border border-[var(--border-medium)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
          />
        </section>

        {/* Thumbnail */}
        <section>
          <label className="block text-xs font-mono tracking-widest uppercase text-[var(--text-tertiary)] mb-2">
            Image / Thumbnail URL <span className="opacity-40">(optional)</span>
          </label>
          <input
            type="text"
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="w-full rounded-lg border border-[var(--border-medium)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </section>

        {/* Date & time */}
        <section>
          <label className="block text-xs font-mono tracking-widest uppercase text-[var(--text-tertiary)] mb-2">
            When did this happen?
          </label>
          <input
            type="datetime-local"
            value={loggedAt}
            onChange={(e) => setLoggedAt(e.target.value)}
            className="rounded-lg border border-[var(--border-medium)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
            style={{ fontFamily: 'var(--font-mono)', colorScheme: 'dark' }}
          />
        </section>

        {/* Cost */}
        <section>
          <label className="block text-xs font-mono tracking-widest uppercase text-[var(--text-tertiary)] mb-2">
            Cost / Value <span className="opacity-40">(optional)</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCostDir(costDir === '-' ? '+' : '-')}
              className="w-9 h-9 rounded-lg border border-[var(--border-medium)] flex items-center justify-center text-sm font-bold transition-colors"
              style={{
                background: costDir === '-' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                color: costDir === '-' ? '#F87171' : '#4ADE80',
                border: costDir === '-' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(34,197,94,0.3)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {costDir}
            </button>
            <input
              type="number"
              placeholder="0.00"
              value={costAmount}
              onChange={(e) => setCostAmount(e.target.value)}
              min="0"
              step="0.01"
              className="w-32 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-secondary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] transition-colors"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="text-xs text-[var(--text-tertiary)] font-mono">USD</span>
          </div>
        </section>

        {/* Software tags */}
        <section>
          <label className="block text-xs font-mono tracking-widest uppercase text-[var(--text-tertiary)] mb-2">
            Tools / Software <span className="opacity-40">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {softwareTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20 font-mono"
              >
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:opacity-70">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
              }}
              placeholder="Type a tool and press Enter..."
              list="tool-suggestions"
              className="flex-1 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-secondary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] transition-colors"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <datalist id="tool-suggestions">
              {KNOWN_TOOLS.map((t) => <option key={t} value={t} />)}
            </datalist>
            <button
              onClick={() => addTag(tagInput)}
              className="px-3 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--accent)] transition-colors"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {KNOWN_TOOLS.filter((t) => !softwareTags.includes(t)).slice(0, 6).map((t) => (
              <button
                key={t}
                onClick={() => addTag(t)}
                className="px-2 py-0.5 rounded border border-[var(--border-light)] text-[10px] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors font-mono"
              >
                + {t}
              </button>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Public entry
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Visible on your public log at /{'{username}'}/log
              </p>
            </div>
          </label>
        </section>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? 'Adding...' : 'Add to Log'}
          </button>
          <Link href="/dashboard/timeline" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}
