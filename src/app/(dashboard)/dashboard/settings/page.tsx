'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const C = {
  bg:           '#070706',
  bgSurface:    '#0e0d0b',
  bgRaised:     '#141210',
  border:       '#1e1b16',
  borderBright: '#2c2820',
  amber:        '#C8902A',
  amberDim:     '#7a5618',
  amberBright:  '#E8A840',
  amberGlow:    'rgba(200,144,42,0.09)',
  textPrimary:  '#EDE3CC',
  textSecond:   '#9A8E78',
  textDim:      '#5A5040',
  textDimmer:   '#2e2820',
  green:        '#4A8A60',
  red:          '#8A4040',
  redBright:    '#CC6666',
}

type SettingsTab = 'profile' | 'api' | 'storage' | 'danger'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder, hint, mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
  mono?: boolean
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', background: C.bgRaised, border: `1px solid ${C.border}`,
          color: C.textPrimary, fontSize: mono ? 11 : 12, padding: '9px 12px',
          outline: 'none', fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
          boxSizing: 'border-box',
        }}
      />
      {hint && (
        <div style={{ fontSize: 9, color: C.textDim, marginTop: 5, letterSpacing: 1 }}>{hint}</div>
      )}
    </div>
  )
}

function SaveBtn({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        background: saved ? `${C.green}22` : C.amber,
        border: `1px solid ${saved ? C.green : C.amber}`,
        color: saved ? C.green : C.bg,
        fontSize: 10, letterSpacing: 2, fontWeight: 700,
        padding: '8px 22px', cursor: 'pointer',
        fontFamily: "'JetBrains Mono', monospace",
        opacity: saving ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      {saving ? 'SAVING…' : saved ? 'SAVED ✓' : 'SAVE'}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{
        fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase',
        marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.border}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const supabase = createClient()
  const [form, setForm] = useState({
    display_name: '', bio: '', website_url: '', twitter_url: '', github_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setEmail(session.user.email ?? '')
      const { data } = await supabase
        .from('profiles')
        .select('display_name, bio, website_url, twitter_url, github_url')
        .eq('id', session.user.id)
        .single()
      if (data) setForm({
        display_name: data.display_name ?? '',
        bio: data.bio ?? '',
        website_url: data.website_url ?? '',
        twitter_url: data.twitter_url ?? '',
        github_url: data.github_url ?? '',
      })
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('profiles').upsert({ id: session.user.id, ...form })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <Section title="Account">
        <div style={{ marginBottom: 20 }}>
          <Label>EMAIL</Label>
          <div style={{ fontSize: 12, color: C.textSecond, padding: '9px 12px', background: C.bgRaised, border: `1px solid ${C.border}` }}>
            {email}
          </div>
          <div style={{ fontSize: 9, color: C.textDim, marginTop: 5, letterSpacing: 1 }}>
            Email is managed via authentication — contact support to change.
          </div>
        </div>
      </Section>

      <Section title="Identity">
        <Field label="Display Name" value={form.display_name} onChange={set('display_name')} placeholder="Your name" />
        <div style={{ marginBottom: 20 }}>
          <Label>BIO</Label>
          <textarea
            value={form.bio}
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="Short bio"
            rows={3}
            style={{
              width: '100%', background: C.bgRaised, border: `1px solid ${C.border}`,
              color: C.textPrimary, fontSize: 12, padding: '9px 12px',
              outline: 'none', resize: 'vertical', fontFamily: 'inherit',
              boxSizing: 'border-box', lineHeight: 1.6,
            }}
          />
        </div>
      </Section>

      <Section title="Links">
        <Field label="Website" value={form.website_url} onChange={set('website_url')} placeholder="https://yoursite.com" />
        <Field label="Twitter / X" value={form.twitter_url} onChange={set('twitter_url')} placeholder="https://twitter.com/handle" />
        <Field label="GitHub" value={form.github_url} onChange={set('github_url')} placeholder="https://github.com/handle" />
      </Section>

      <SaveBtn onClick={handleSave} saving={saving} saved={saved} />
    </div>
  )
}

// ─── API Tab ──────────────────────────────────────────────────────────────────

const API_PROVIDERS = [
  { id: 'openai',      label: 'OpenAI',      hint: 'Used for Whisper transcription and GPT-4o analysis', placeholder: 'sk-...' },
  { id: 'anthropic',   label: 'Anthropic',   hint: 'Used for Claude debrief, script generation, and post writing', placeholder: 'sk-ant-...' },
  { id: 'assemblyai',  label: 'AssemblyAI',  hint: 'Used for fast audio transcription (alternative to Whisper)', placeholder: 'aai_...' },
  { id: 'replicate',   label: 'Replicate',   hint: 'Used for audio extraction and video assembly via FFmpeg toolkit', placeholder: 'r8_...' },
  { id: 'elevenlabs',  label: 'ElevenLabs',  hint: 'Used for voice synthesis in produced videos', placeholder: 'Your ElevenLabs API key' },
]

function ApiTab() {
  const supabase = createClient()
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('integration_keys')
        .select('provider, key_value, is_active')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
      if (data) {
        const map: Record<string, string> = {}
        data.forEach((r: any) => { map[r.provider] = r.key_value ?? '' })
        setKeys(map)
        setDrafts(map)
      }
    }
    load()
  }, [])

  const handleSave = async (provider: string) => {
    setSaving(provider)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const value = drafts[provider] ?? ''

    // Deactivate existing
    await supabase
      .from('integration_keys')
      .update({ is_active: false })
      .eq('user_id', session.user.id)
      .eq('provider', provider)

    if (value.trim()) {
      await supabase.from('integration_keys').insert({
        user_id: session.user.id,
        provider,
        key_value: value.trim(),
        is_active: true,
      })
    }

    setKeys(k => ({ ...k, [provider]: value.trim() }))
    setSaving(null)
    setSaved(provider)
    setTimeout(() => setSaved(null), 2500)
  }

  return (
    <div>
      <div style={{ marginBottom: 24, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
        API keys are stored encrypted in your account. They are used only for your content processing pipeline
        and are never shared.
      </div>

      {API_PROVIDERS.map(({ id, label, hint, placeholder }) => (
        <Section key={id} title={label}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="password"
              value={drafts[id] ?? ''}
              onChange={e => setDrafts(d => ({ ...d, [id]: e.target.value }))}
              placeholder={placeholder}
              style={{
                width: '100%', background: C.bgRaised, border: `1px solid ${C.border}`,
                color: C.textPrimary, fontSize: 11, padding: '9px 12px',
                outline: 'none', fontFamily: "'JetBrains Mono', monospace",
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 5, letterSpacing: 1 }}>{hint}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SaveBtn
              onClick={() => handleSave(id)}
              saving={saving === id}
              saved={saved === id}
            />
            {keys[id] && (
              <div style={{ fontSize: 9, color: C.green, letterSpacing: 1 }}>KEY ACTIVE</div>
            )}
          </div>
        </Section>
      ))}
    </div>
  )
}

// ─── Storage Tab ──────────────────────────────────────────────────────────────

function StorageTab() {
  const supabase = createClient()
  const [config, setConfig] = useState({
    access_key_id: '',
    secret_access_key: '',
    bucket: '',
    region: 'auto',
    endpoint: '',
    public_base_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('storage_connections')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('provider', 'r2')
        .single()
      if (data) setConfig({
        access_key_id: data.access_key_id ?? '',
        secret_access_key: data.secret_access_key ?? '',
        bucket: data.bucket ?? '',
        region: data.region ?? 'auto',
        endpoint: data.endpoint ?? '',
        public_base_url: data.public_base_url ?? '',
      })
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('storage_connections').upsert({
      user_id: session.user.id,
      provider: 'r2',
      ...config,
    }, { onConflict: 'user_id,provider' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleExport = async () => {
    setExportLoading(true)
    try {
      const res = await fetch('/api/export/uploads')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `neolog-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
    }
    setExportLoading(false)
  }

  const set = (k: keyof typeof config) => (v: string) => setConfig(c => ({ ...c, [k]: v }))

  return (
    <div>
      <div style={{ marginBottom: 24, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
        Neolog uses Cloudflare R2 for video storage. These credentials are used for multipart upload
        and signed URL generation. Your videos are stored under your own R2 bucket.
      </div>

      <Section title="Cloudflare R2">
        <Field label="Access Key ID" value={config.access_key_id} onChange={set('access_key_id')} mono placeholder="R2 access key ID" />
        <Field label="Secret Access Key" value={config.secret_access_key} onChange={set('secret_access_key')} mono type="password" placeholder="R2 secret access key" />
        <Field label="Bucket Name" value={config.bucket} onChange={set('bucket')} mono placeholder="my-neolog-videos" />
        <Field label="Region" value={config.region} onChange={set('region')} mono placeholder="auto" hint="Use 'auto' for Cloudflare R2" />
        <Field
          label="Endpoint URL"
          value={config.endpoint}
          onChange={set('endpoint')}
          mono
          placeholder="https://<account-id>.r2.cloudflarestorage.com"
          hint="Found in your Cloudflare R2 dashboard"
        />
        <Field
          label="Public Base URL"
          value={config.public_base_url}
          onChange={set('public_base_url')}
          mono
          placeholder="https://pub-xxx.r2.dev or your custom domain"
          hint="Used to generate public video URLs for playback"
        />
      </Section>

      <div style={{ marginBottom: 36 }}>
        <SaveBtn onClick={handleSave} saving={saving} saved={saved} />
      </div>

      <Section title="Export">
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14, lineHeight: 1.7 }}>
          Export all your upload metadata, transcripts, and analysis as JSON.
          Video files remain in your R2 bucket.
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          style={{
            background: 'none', border: `1px solid ${C.borderBright}`,
            color: C.textSecond, fontSize: 10, letterSpacing: 2,
            padding: '8px 18px', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            opacity: exportLoading ? 0.5 : 1,
          }}
        >
          {exportLoading ? 'EXPORTING…' : 'EXPORT DATA'}
        </button>
      </Section>
    </div>
  )
}

// ─── Danger Tab ───────────────────────────────────────────────────────────────

function DangerTab() {
  const supabase = createClient()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [resetEntitiesConfirm, setResetEntitiesConfirm] = useState(false)
  const [resettingEntities, setResettingEntities] = useState(false)
  const [entityResetDone, setEntityResetDone] = useState(false)

  const handleResetEntities = async () => {
    setResettingEntities(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('entities').delete().eq('user_id', session.user.id)
    await supabase.from('entity_mentions').delete().eq('user_id', session.user.id)
    setResettingEntities(false)
    setEntityResetDone(true)
    setResetEntitiesConfirm(false)
  }

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE MY ACCOUNT') return
    setDeleting(true)
    try {
      await fetch('/api/account/delete', { method: 'DELETE' })
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (e) {
      setDeleting(false)
    }
  }

  return (
    <div>
      <Section title="Reset Entity Graph">
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14, lineHeight: 1.7 }}>
          Clear all accumulated entities and mentions. Your videos, transcripts, and analysis remain intact.
          Entities will be re-extracted on next analysis run.
        </div>
        {!resetEntitiesConfirm ? (
          <button
            onClick={() => setResetEntitiesConfirm(true)}
            style={{
              background: `${C.red}15`, border: `1px solid ${C.red}`,
              color: C.redBright, fontSize: 10, letterSpacing: 2,
              padding: '8px 18px', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            RESET ENTITY GRAPH
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleResetEntities}
              disabled={resettingEntities}
              style={{
                background: C.red, border: `1px solid ${C.red}`,
                color: '#fff', fontSize: 10, letterSpacing: 2,
                padding: '8px 18px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                opacity: resettingEntities ? 0.6 : 1,
              }}
            >
              {resettingEntities ? 'RESETTING…' : 'CONFIRM RESET'}
            </button>
            <button
              onClick={() => setResetEntitiesConfirm(false)}
              style={{
                background: 'none', border: `1px solid ${C.border}`,
                color: C.textDim, fontSize: 10, letterSpacing: 2,
                padding: '8px 18px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              CANCEL
            </button>
          </div>
        )}
        {entityResetDone && (
          <div style={{ fontSize: 10, color: C.green, marginTop: 10, letterSpacing: 1 }}>
            Entity graph cleared.
          </div>
        )}
      </Section>

      <Section title="Delete Account">
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14, lineHeight: 1.7 }}>
          Permanently delete your account and all associated data. This cannot be undone.
          Your video files in R2 will remain — delete them separately from your Cloudflare dashboard.
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>TYPE "DELETE MY ACCOUNT" TO CONFIRM</Label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="DELETE MY ACCOUNT"
            style={{
              width: 280, background: C.bgRaised, border: `1px solid ${C.red}44`,
              color: C.textPrimary, fontSize: 11, padding: '9px 12px',
              outline: 'none', fontFamily: "'JetBrains Mono', monospace",
              boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          onClick={handleDeleteAccount}
          disabled={confirmText !== 'DELETE MY ACCOUNT' || deleting}
          style={{
            background: confirmText === 'DELETE MY ACCOUNT' ? C.red : `${C.red}22`,
            border: `1px solid ${C.red}`,
            color: confirmText === 'DELETE MY ACCOUNT' ? '#fff' : C.textDim,
            fontSize: 10, letterSpacing: 2,
            padding: '8px 22px', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            opacity: deleting ? 0.6 : 1,
            transition: 'all 0.15s',
          }}
        >
          {deleting ? 'DELETING…' : 'DELETE ACCOUNT'}
        </button>
      </Section>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('profile')

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'profile',  label: 'PROFILE' },
    { id: 'api',      label: 'API' },
    { id: 'storage',  label: 'STORAGE' },
    { id: 'danger',   label: 'DANGER' },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '22px 40px 0',
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700,
          color: C.textPrimary, marginBottom: 18,
        }}>
          Settings
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none', border: 'none',
                borderBottom: tab === t.id ? `2px solid ${C.amber}` : '2px solid transparent',
                color: tab === t.id ? C.amberBright : C.textDim,
                fontSize: 10, letterSpacing: 2, padding: '0 16px 11px',
                transition: 'all 0.12s',
                cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', maxWidth: 600 }}>
        {tab === 'profile' && <ProfileTab />}
        {tab === 'api'     && <ApiTab />}
        {tab === 'storage' && <StorageTab />}
        {tab === 'danger'  && <DangerTab />}
      </div>
    </div>
  )
}
