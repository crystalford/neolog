'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/profile'
import {
  User, Download, Rss, Shield, Loader2, Camera,
  Check, ExternalLink, Copy, Globe, Bell, Mail, Trash2,
  KeyRound,
  AlertTriangle, Settings as SettingsIcon, Link2, ShieldAlert
} from 'lucide-react'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [usernameDraft, setUsernameDraft] = useState('')
  const [usernameSaving, setUsernameSaving] = useState(false)

  const [usageCaps, setUsageCaps] = useState<{
    openai: { day: string; month: string }
    anthropic: { day: string; month: string }
    groq: { day: string; month: string }
  }>({
    openai: { day: '', month: '' },
    anthropic: { day: '', month: '' },
    groq: { day: '', month: '' },
  })
  const [usageCapsSaving, setUsageCapsSaving] = useState(false)

  const [formData, setFormData] = useState({
    display_name: '',
    bio: '',
    website_url: '',
    avatar_url: '',
    twitter_url: '',
    github_url: '',
    linkedin_url: '',
    context_md: '',
  })

  const [emailPrefs, setEmailPrefs] = useState({
    email_new_follower: true,
    email_new_comment: true,
    email_comment_reply: true,
    email_post_upvote: false,
    email_weekly_digest: false,
  })

  const [copied, setCopied] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [integrationKeys, setIntegrationKeys] = useState<{
    id: string
    provider: string
    label: string | null
    is_active: boolean
    created_at?: string | null
  }[]>([])
  const [integrationDrafts, setIntegrationDrafts] = useState<Record<string, string>>({})
  const [integrationLabels, setIntegrationLabels] = useState<Record<string, string>>({})
  const [integrationSaving, setIntegrationSaving] = useState<string | null>(null)
  const [apiKeys, setApiKeys] = useState<{ id: string; label: string | null; last_used_at: string | null }[]>([])
  const [apiKeyLabel, setApiKeyLabel] = useState('')
  const [apiKeyCreated, setApiKeyCreated] = useState<string | null>(null)
  const [apiKeySaving, setApiKeySaving] = useState(false)
  const [storageConfig, setStorageConfig] = useState({
    provider: 'r2',
    access_key_id: '',
    bucket: '',
    region: '',
    endpoint: '',
    public_base_url: '',
  })
  const [storageSaving, setStorageSaving] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
    loadIntegrations()
    loadApiKeys()
    loadStorage()
    loadUsageCaps()
  }, [])

  const aiProviders = [
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic (Claude)' },
    { id: 'groq', label: 'Groq (Speed)' },
    { id: 'replicate', label: 'Replicate (Flux)' },
    { id: 'elevenlabs', label: 'ElevenLabs (Voice)' },
  ]

  const providerValidation: Record<string, { pattern?: RegExp; hint: string }> = {
    openai: { pattern: /^sk-(proj-)?[A-Za-z0-9]{10,}/, hint: 'OpenAI keys start with sk-' },
    anthropic: { pattern: /^sk-ant-[A-Za-z0-9-]{10,}/, hint: 'Anthropic keys start with sk-ant-' },
    groq: { pattern: /^gsk_[A-Za-z0-9]{10,}/, hint: 'Groq keys start with gsk_' },
    elevenlabs: { pattern: /^[A-Za-z0-9]{20,}/, hint: 'ElevenLabs keys are long alphanumeric strings' },
    replicate: { pattern: /^r8_[A-Za-z0-9]{10,}/, hint: 'Replicate keys start with r8_' },
  }

  const getIntegrationHint = (provider: string, value: string) => {
    if (!value) return null
    if (value.length < 12) {
      return { tone: 'error', text: 'Key is too short.' }
    }
    const validation = providerValidation[provider]
    if (validation?.pattern && !validation.pattern.test(value)) {
      return { tone: 'warning', text: validation.hint }
    }
    return null
  }

  const loadUsageCaps = async () => {
    try {
      const response = await fetch('/api/usage/limits')
      if (!response.ok) return
      const data = await response.json()
      const next = {
        openai: { day: '', month: '' },
        anthropic: { day: '', month: '' },
        groq: { day: '', month: '' },
      }

      for (const row of (data?.limits || []) as Array<any>) {
        const provider = row?.provider
        const period = row?.period
        const tokenLimit = row?.token_limit

        if ((provider === 'openai' || provider === 'anthropic' || provider === 'groq') && (period === 'day' || period === 'month')) {
          ; (next as any)[provider][period] = tokenLimit == null ? '' : String(tokenLimit)
        }
      }

      setUsageCaps(next)
    } catch {
      // ignore
    }
  }

  const saveUsageCaps = async () => {
    setUsageCapsSaving(true)
    setError(null)
    setSuccess(null)

    const parseLimit = (value: string) => {
      const trimmed = (value || '').trim()
      if (!trimmed) return null
      const n = Number(trimmed)
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
        throw new Error('Token caps must be a positive whole number (or blank for unlimited).')
      }
      return n
    }

    try {
      const limits = [
        { provider: 'openai', period: 'day', token_limit: parseLimit(usageCaps.openai.day) },
        { provider: 'openai', period: 'month', token_limit: parseLimit(usageCaps.openai.month) },
        { provider: 'anthropic', period: 'day', token_limit: parseLimit(usageCaps.anthropic.day) },
        { provider: 'anthropic', period: 'month', token_limit: parseLimit(usageCaps.anthropic.month) },
        { provider: 'groq', period: 'day', token_limit: parseLimit(usageCaps.groq.day) },
        { provider: 'groq', period: 'month', token_limit: parseLimit(usageCaps.groq.month) },
      ]

      const response = await fetch('/api/usage/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limits }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save usage caps.')
      }

      setSuccess('Usage caps saved.')
      await loadUsageCaps()
    } catch (err: any) {
      setError(err?.message || 'Failed to save usage caps.')
    } finally {
      setUsageCapsSaving(false)
    }
  }

  const loadIntegrations = async () => {
    try {
      const response = await fetch('/api/integrations/list')
      if (!response.ok) return
      const data = await response.json()
      setIntegrationKeys(data.keys || [])
    } catch (err) {
      console.error('Integration load error:', err)
    }
  }

  const loadApiKeys = async () => {
    try {
      const response = await fetch('/api/keys/list')
      if (!response.ok) return
      const data = await response.json()
      setApiKeys(data.keys || [])
    } catch (err) {
      console.error('API key load error:', err)
    }
  }

  const loadStorage = async () => {
    try {
      const response = await fetch('/api/storage/get')
      if (!response.ok) return
      const data = await response.json()
      if (data.connection) {
        setStorageConfig({
          provider: data.connection.provider || 'r2',
          access_key_id: data.connection.access_key_id || '',
          bucket: data.connection.bucket || '',
          region: data.connection.region || '',
          endpoint: data.connection.endpoint || '',
          public_base_url: data.connection.public_base_url || '',
        })
      }
    } catch (err) {
      console.error('Storage load error:', err)
    }
  }

  const createApiKey = async () => {
    setApiKeySaving(true)
    setError(null)
    setSuccess(null)
    setApiKeyCreated(null)
    try {
      const response = await fetch('/api/keys/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: apiKeyLabel.trim() || null }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create key.')
      }
      setApiKeyCreated(data.key)
      setApiKeyLabel('')
      await loadApiKeys()
    } catch (err: any) {
      setError(err.message || 'Failed to create key.')
    } finally {
      setApiKeySaving(false)
    }
  }

  const revokeApiKey = async (id: string) => {
    setError(null)
    const response = await fetch('/api/keys/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) {
      const data = await response.json()
      setError(data.error || 'Failed to revoke key.')
      return
    }
    setApiKeys((prev) => prev.filter((item) => item.id !== id))
  }

  const saveIntegration = async (provider: string) => {
    const apiKey = integrationDrafts[provider]?.trim()
    if (!apiKey) {
      setError('Enter an API key before saving.')
      return
    }
    const hint = getIntegrationHint(provider, apiKey)
    if (hint?.tone === 'error') {
      setError(hint.text)
      return
    }
    setIntegrationSaving(provider)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/integrations/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
          label: integrationLabels[provider]?.trim() || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save integration.')
      }
      setSuccess('Integration saved.')
      setIntegrationDrafts((prev) => ({ ...prev, [provider]: '' }))
      setIntegrationLabels((prev) => ({ ...prev, [provider]: '' }))
      await loadIntegrations()
    } catch (err: any) {
      setError(err.message || 'Failed to save integration.')
    } finally {
      setIntegrationSaving(null)
    }
  }

  const isConnected = (provider: string) =>
    integrationKeys.some((key) => key.provider === provider && key.is_active)

  const getProviderKeys = (provider: string) =>
    integrationKeys.filter((key) => key.provider === provider)

  const setActiveIntegration = async (id: string) => {
    setError(null)
    const response = await fetch('/api/integrations/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) {
      const data = await response.json()
      setError(data.error || 'Failed to update integration.')
      return
    }
    await loadIntegrations()
  }

  const deleteIntegration = async (id: string) => {
    setError(null)
    const response = await fetch('/api/integrations/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) {
      const data = await response.json()
      setError(data.error || 'Failed to delete integration.')
      return
    }
    await loadIntegrations()
  }

  const saveStorage = async () => {
    setStorageSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/storage/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storageConfig),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save storage config.')
      }
      setSuccess('Storage settings saved.')
      await loadStorage()
    } catch (err: any) {
      setError(err.message || 'Failed to save storage config.')
    } finally {
      setStorageSaving(false)
    }
  }

  const loadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      setUser(session.user)

      const data = await ensureProfile(supabase, session.user)

      if (data) {
        setProfile(data)
        setUsernameDraft(data.username || '')
        setFormData({
          display_name: data.display_name || '',
          bio: data.bio || '',
          website_url: data.website_url || '',
          avatar_url: data.avatar_url || '',
          twitter_url: data.twitter_url || '',
          github_url: data.github_url || '',
          linkedin_url: data.linkedin_url || '',
          context_md: data.context_md || '',
        })
        setError(null)
      } else {
        setError('Unable to load your profile. Please try refreshing the page or contact support.')
      }
    } catch (err) {
      console.error('Profile load error:', err)
      setError('An error occurred while loading your profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: formData.display_name || null,
          bio: formData.bio || null,
          website_url: formData.website_url || null,
          avatar_url: formData.avatar_url || null,
          twitter_url: formData.twitter_url || null,
          github_url: formData.github_url || null,
          linkedin_url: formData.linkedin_url || null,
          context_md: formData.context_md || null,
        })
        .eq('id', profile.id)

      if (error) {
        setError('Failed to save profile. Please try again.')
        console.error('Save error:', error)
      } else {
        setProfile({ ...profile, ...formData })
        setSuccess('Profile saved successfully!')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB')
      return
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }

    setUploadingAvatar(true)
    setError(null)
    setSuccess(null)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${profile.id}/avatar.${fileExt}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        setError(`Failed to upload image: ${uploadError.message}. Make sure the storage bucket exists.`)
        setUploadingAvatar(false)
        return
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id)

      if (updateError) {
        console.error('Update error:', updateError)
        setError('Failed to update profile with new avatar')
      } else {
        setFormData({ ...formData, avatar_url: publicUrl })
        setProfile({ ...profile, avatar_url: publicUrl })
        setSuccess('Profile picture updated successfully!')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      console.error('Avatar upload error:', err)
      setError('An unexpected error occurred while uploading. Please try again.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const RESERVED_USERNAMES = new Set([
    'api',
    '_next',
    'dashboard',
    'auth',
    'explore',
    'visuals',
    'privacy',
    'tos',
    'search',
    'tags',
    'tag',
    'unsubscribe',
    'admin',
    'earnings',
    'curators',
    'onboarding',
    'login',
    'signup',
    'forgot-password',
    'reset-password',
    'preview',
    'readme',
    'roadmap',
    'architecture',
  ])

  const normalizeUsername = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30)

  const handleUsernameSave = async () => {
    if (!profile) return

    setError(null)
    setSuccess(null)
    setUsernameSaving(true)

    try {
      const normalized = normalizeUsername(usernameDraft)
      if (normalized !== usernameDraft) {
        setUsernameDraft(normalized)
      }

      if (!normalized || normalized.length < 3) {
        setError('Username must be at least 3 characters.')
        return
      }

      if (RESERVED_USERNAMES.has(normalized)) {
        setError('That username is reserved.')
        return
      }

      if (normalized === profile.username) {
        setError('That is already your username.')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ username: normalized })
        .eq('id', profile.id)
        .select('username')
        .single()

      if (error) {
        if ((error as any).code === '23505') {
          setError('That username is already taken.')
          return
        }
        if ((error as any).message?.includes('username_format') || (error as any).message?.includes('username_length')) {
          setError('Username must be 3"30 characters and only use a-z, 0-9, and _.')
          return
        }
        console.error('Username update error:', error)
        setError('Failed to update username. Please try again.')
        return
      }

      setProfile((prev: any) => ({ ...prev, username: data.username }))
      setSuccess('Username updated.')
      setTimeout(() => setSuccess(null), 3000)
      router.refresh()
    } finally {
      setUsernameSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!profile) return
    if (deleteConfirmText !== profile.username) return

    setDeleting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/account/delete', { method: 'POST' })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account.')
      }

      await supabase.auth.signOut()
      router.push('/?deleted=true')
    } catch (err: any) {
      setError(err.message || 'Failed to delete account.')
    } finally {
      setDeleting(false)
    }
  }

  const handleReset = async () => {
    if (!profile) return
    if (resetConfirmText !== 'RESET') return

    setResetting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/reset', { method: 'POST' })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Failed to wipe memory.')
      }

      setSuccess('All intelligence data has been wiped. Your system is fresh.')
      setShowResetConfirm(false)
      setResetConfirmText('')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to wipe memory.')
    } finally {
      setResetting(false)
    }
  }

  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://neolog.ai'

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-10 max-w-2xl mx-auto">
        <div className="h-8 w-32 skeleton rounded mb-8" />
        <div className="space-y-4">
          <div className="h-20 skeleton rounded-xl" />
          <div className="h-20 skeleton rounded-xl" />
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 md:py-12" style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-primary)' }}>
      <div className="mb-12">
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-tertiary)', marginBottom: '0.75rem', fontWeight: 600 }}>
          CONTROL ROOM
        </p>
        <h1 style={{ fontSize: '32px', fontWeight: 300, letterSpacing: '-0.04em', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
          Settings
        </h1>
        <p className="text-sm text-[var(--text-secondary)] max-w-xl leading-relaxed">
          Configure your intelligence layer, manage your global persona, and control your sovereign data.
        </p>
      </div>

      {error && (
        <div className="mb-8 p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-500 flex items-center gap-3">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-8 p-4 rounded-xl border border-[var(--success)]/20 bg-[var(--success)]/5 text-sm text-[var(--success)] flex items-center gap-3">
          <Check size={18} />
          {success}
        </div>
      )}

      <div className="space-y-12">
        {/* 1. Assistant Persona & Memory */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <Globe size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Assistant Persona & Memory</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Prime your intelligence layer with your style and preferences.</p>
            </div>
          </div>
          
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--accent)] to-violet-500 rounded-2xl blur opacity-[0.03] group-focus-within:opacity-10 transition duration-500"></div>
            <textarea
              value={formData.context_md}
              onChange={(event) => setFormData({ ...formData, context_md: event.target.value })}
              placeholder="e.g. My tone is concise, data-first, skeptical of hype. I am a software engineer focused on agentic coding."
              className="input min-h-[180px] font-mono leading-relaxed transition-all resize-y"
            />
          </div>
        </section>


        {/* 2. Integrations (BYOK) */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <Link2 size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Intelligence Integrations (BYOK)</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Plug in your own model keys for maximum control and lower costs.</p>
            </div>
          </div>

          <div className="grid gap-4">
            {aiProviders.map((provider) => {
              const keys = getProviderKeys(provider.id)
              const draft = integrationDrafts[provider.id] || ''
              const label = integrationLabels[provider.id] || ''
              const hint = getIntegrationHint(provider.id, draft)

              return (
                <div key={provider.id} className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] transition-all hover:border-[var(--border-medium)]" style={{ background: 'rgba(13,13,22,0.2)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{provider.label}</span>
                      {isConnected(provider.id) && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider">
                          <div className="w-1 h-1 rounded-full bg-emerald-500" />
                          Active
                        </div>
                      )}
                    </div>
                  </div>

                  {keys.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {keys.map((k) => (
                        <div key={k.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-primary)]/50 border border-[var(--border-light)] text-[10px] font-mono">
                          <div className="flex items-center gap-3">
                            <span className="text-[var(--text-secondary)] opacity-60">••••{k.label ? ` [${k.label}]` : ''}</span>
                            {!k.is_active && (
                              <button
                                onClick={() => setActiveIntegration(k.id)}
                                className="text-[var(--accent)] hover:opacity-80 font-bold uppercase tracking-widest"
                              >
                                Activate
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => deleteIntegration(k.id)}
                            className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors uppercase font-bold tracking-widest"
                          >
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isConnected(provider.id) && (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={draft}
                          onChange={(e) => setIntegrationDrafts({ ...integrationDrafts, [provider.id]: e.target.value })}
                          placeholder={`Enter ${provider.label} API Key...`}
                          className="input flex-1"
                        />
                        <button
                          onClick={() => saveIntegration(provider.id)}
                          disabled={integrationSaving === provider.id || !draft}
                          className="px-6 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold uppercase tracking-widest hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(124,106,245,0.4)] transition-all"
                        >
                          {integrationSaving === provider.id ? <Loader2 className="animate-spin" size={16} /> : 'Connect'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => setIntegrationLabels({ ...integrationLabels, [provider.id]: e.target.value })}
                        placeholder="Key label (e.g. Personal)"
                        className="input mt-2 py-1.5 text-[10px] opacity-70 focus:opacity-100"
                      />
                      {hint && (
                        <p className={`text-[10px] ${hint.tone === 'error' ? 'text-red-500' : 'text-amber-500'} font-mono uppercase tracking-tight`}>
                          [{hint.tone}] {hint.text}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* 3. Sovereign Storage */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <ShieldAlert size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Sovereign Storage (R2/S3)</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Your files, your bucket. Total data sovereignty.</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] space-y-6" style={{ background: 'rgba(13,13,22,0.2)' }}>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Provider</label>
                <select
                  value={storageConfig.provider}
                  onChange={(e) => setStorageConfig({ ...storageConfig, provider: e.target.value })}
                  className="input appearance-none"
                >
                  <option value="r2">Cloudflare R2</option>
                  <option value="s3">AWS S3</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Bucket Name</label>
                <input
                  type="text"
                  value={storageConfig.bucket}
                  onChange={(e) => setStorageConfig({ ...storageConfig, bucket: e.target.value })}
                  className="input"
                  placeholder="my-neolog-assets"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Access Key ID</label>
              <input
                type="text"
                value={storageConfig.access_key_id}
                onChange={(e) => setStorageConfig({ ...storageConfig, access_key_id: e.target.value })}
                className="input font-mono"
                placeholder="xxxxxx"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Region</label>
                <input
                  type="text"
                  value={storageConfig.region}
                  onChange={(e) => setStorageConfig({ ...storageConfig, region: e.target.value })}
                  className="input"
                  placeholder="auto"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Endpoint (Required for R2)</label>
                <input
                  type="text"
                  value={storageConfig.endpoint}
                  onChange={(e) => setStorageConfig({ ...storageConfig, endpoint: e.target.value })}
                  className="input"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Public Base URL (CDN)</label>
              <input
                type="text"
                value={storageConfig.public_base_url}
                onChange={(e) => setStorageConfig({ ...storageConfig, public_base_url: e.target.value })}
                className="input"
                placeholder="https://..."
              />
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={saveStorage}
                disabled={storageSaving}
                className="px-6 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold uppercase tracking-widest hover:bg-[var(--accent-hover)] disabled:opacity-50 shadow-[0_0_20px_-5px_rgba(124,106,245,0.4)] transition-all"
              >
                {storageSaving ? <Loader2 size={16} className="animate-spin" /> : 'Save Storage Configuration'}
              </button>
            </div>
          </div>
        </section>

        {/* 4. Automation API Keys */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <SettingsIcon size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Automation API Keys</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Securely bridge Neolog with external platforms like n8n or Zapier.</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] space-y-6" style={{ background: 'rgba(13,13,22,0.2)' }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={apiKeyLabel}
                onChange={(e) => setApiKeyLabel(e.target.value)}
                placeholder="Key Description (e.g. n8n workflow)"
                className="input flex-1"
              />
              <button
                onClick={createApiKey}
                disabled={apiKeySaving || !apiKeyLabel.trim()}
                className="px-6 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold uppercase tracking-widest hover:bg-[var(--accent-hover)] disabled:opacity-40 shadow-[0_0_20px_-5px_rgba(124,106,245,0.4)] transition-all"
              >
                {apiKeySaving ? <Loader2 size={16} className="animate-spin" /> : 'Generate'}
              </button>
            </div>

            {apiKeyCreated && (
              <div className="p-5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-200/90 text-xs font-mono leading-relaxed">
                <p className="font-bold uppercase tracking-widest mb-3 text-amber-500 flex items-center gap-2">
                  <Shield size={14} /> Secret Key Generated
                </p>
                <p className="mb-4 text-[var(--text-tertiary)]">Copy this key now. It will not be visible again once you leave this page.</p>
                <div className="relative group">
                  <code className="block p-4 bg-black/40 rounded-xl border border-white/5 break-all select-all pr-12">
                    {apiKeyCreated}
                  </code>
                  <button 
                    onClick={() => copyToClipboard(apiKeyCreated, 'api_key')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <Copy size={16} className="text-[var(--text-tertiary)]" />
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {apiKeys.length === 0 && !apiKeyCreated && (
                <div className="text-center py-6 border border-dashed border-[var(--border-light)] rounded-xl">
                  <p className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest">No Active Automation Keys</p>
                </div>
              )}
              {apiKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-primary)]/30 border border-[var(--border-light)]/40 hover:border-[var(--border-light)] transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold">{k.label || 'Unnamed Integration'}</span>
                    <span className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-60">
                      ID: {k.id.slice(0, 8)}... • Activity: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
                    </span>
                  </div>
                  <button
                    onClick={() => revokeApiKey(k.id)}
                    className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-[var(--text-tertiary)] transition-colors"
                    title="Revoke Access"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. AI Usage Caps */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <Shield size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Intelligence Budgeting (Usage Caps)</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Set hard limits on token usage to prevent billing surprises.</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] space-y-6" style={{ background: 'rgba(13,13,22,0.2)' }}>
            <div className="grid gap-6">
              {([
                { id: 'openai', label: 'OpenAI (GPT-4o/o1)' },
                { id: 'anthropic', label: 'Anthropic (Claude 3.5/3.7)' },
                { id: 'groq', label: 'Groq (Llama 3/Mistral)' },
              ] as const).map((provider) => (
                <div key={provider.id} className="p-5 rounded-xl bg-[var(--bg-primary)]/20 border border-[var(--border-light)]/40 space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{provider.label}</span>
                    <div className="h-px flex-1 mx-4 bg-[var(--border-light)]/30" />
                  </div>
                  
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Daily Limit (Tokens)</label>
                      <input
                        type="number"
                        value={(usageCaps as any)[provider.id].day}
                        onChange={(event) =>
                          setUsageCaps((prev) => ({
                            ...prev,
                            [provider.id]: {
                              ...(prev as any)[provider.id],
                              day: event.target.value,
                            },
                          }))
                        }
                        placeholder="Unlimited"
                        className="input"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Monthly Limit (Tokens)</label>
                      <input
                        type="number"
                        value={(usageCaps as any)[provider.id].month}
                        onChange={(event) =>
                          setUsageCaps((prev) => ({
                            ...prev,
                            [provider.id]: {
                              ...(prev as any)[provider.id],
                              month: event.target.value,
                            },
                          }))
                        }
                        placeholder="Unlimited"
                        className="input"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={saveUsageCaps}
                disabled={usageCapsSaving}
                className="px-6 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold uppercase tracking-widest hover:bg-[var(--accent-hover)] disabled:opacity-50 shadow-[0_0_20px_-5px_rgba(124,106,245,0.4)] transition-all"
              >
                {usageCapsSaving ? <Loader2 size={16} className="animate-spin" /> : 'Lock Budget Limits'}
              </button>
            </div>
          </div>
        </section>
        {/* 6. Profile */}
        <section>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <User size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Public Profile</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Manage how you appear to other neologgers and assistants.</p>
            </div>
          </div>

          <div className="p-8 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] space-y-10" style={{ background: 'rgba(13,13,22,0.2)' }}>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-4 block">Identity</label>
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-tr from-[var(--accent)] to-violet-500 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                  {formData.avatar_url ? (
                    <img
                      src={formData.avatar_url}
                      alt="Avatar"
                      className="relative w-24 h-24 rounded-full object-cover border-2 border-[var(--bg-primary)] shadow-2xl"
                    />
                  ) : (
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-[var(--accent)] to-violet-600 flex items-center justify-center text-3xl text-white font-light tracking-tighter border-2 border-[var(--bg-primary)] shadow-2xl">
                      {(formData.display_name || profile?.username || 'U')[0].toUpperCase()}
                    </div>
                  )}

                  <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all shadow-lg">
                    {uploadingAvatar ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Camera size={14} />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      disabled={uploadingAvatar}
                    />
                  </label>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-semibold tracking-tight">{profile?.username || 'User'}</p>
                  <p className="text-xs text-[var(--text-tertiary)] max-w-xs leading-relaxed">Recommended: 400x400px. JPG or PNG. Max 2MB.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-8">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Username</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      className="input flex-1 font-mono"
                    />
                    <button
                      onClick={handleUsernameSave}
                      disabled={usernameSaving || !usernameDraft}
                      className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-all shadow-[0_0_15px_-5px_rgba(124,106,245,0.4)]"
                    >
                      {usernameSaving ? <Loader2 size={12} className="animate-spin" /> : 'Update'}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Display Name</label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    className="input"
                    placeholder="Your display name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Bio</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="input min-h-[100px] transition-all resize-none"
                  placeholder="Tell the world about your perspective..."
                  maxLength={500}
                />
                <p className="text-[10px] text-right font-mono text-[var(--text-tertiary)] opacity-60">
                  {formData.bio.length}/500
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Website</label>
                  <input
                    type="url"
                    value={formData.website_url}
                    onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                    className="input"
                    placeholder="https://yourpage.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Twitter/X (URL)</label>
                  <input
                    type="url"
                    value={formData.twitter_url}
                    onChange={(e) => setFormData({ ...formData, twitter_url: e.target.value })}
                    className="input"
                    placeholder="https://x.com/username"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-8 py-2.5 rounded-xl bg-[var(--accent)] text-white text-xs font-bold uppercase tracking-[0.1em] hover:bg-[var(--accent-hover)] disabled:opacity-50 shadow-[0_0_20px_-5px_rgba(124,106,245,0.4)] transition-all"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Profile Changes'}
              </button>
            </div>
          </div>
        </section>

        {/* 7. Notifications */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <Bell size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Intelligence Briefs (Notifications)</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Control how and when you are alerted of system activity.</p>
            </div>
          </div>

          <div className="grid gap-3">
            {[
              { key: 'email_new_follower', label: 'New Subscribers', desc: 'Alert when a new user follows your log.' },
              { key: 'email_new_comment', label: 'Interaction Updates', desc: 'Alert when someone comments on your sessions.' },
              { key: 'email_comment_reply', label: 'Reply Notifications', desc: 'Alert when someone responds to your thread.' },
            ].map(({ key, label, desc }) => (
              <label
                key={key}
                className="group flex items-center justify-between p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] cursor-pointer hover:border-[var(--accent)]/30 transition-all"
                style={{ background: 'rgba(13,13,22,0.2)' }}
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{label}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{desc}</p>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={(emailPrefs as any)[key]}
                    onChange={(e) => setEmailPrefs({ ...emailPrefs, [key]: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-[var(--bg-primary)] rounded-full border border-[var(--border-light)] peer-checked:bg-[var(--accent)] peer-checked:border-[var(--accent)] transition-all duration-300"></div>
                  <div className="absolute left-1 top-1 w-3 h-3 bg-[var(--text-tertiary)] rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-all duration-300"></div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* 8. Feeds */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <Rss size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Protocol Feeds</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Syndicate your log via standard protocols for maximum distribution.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: 'RSS Protcol', url: `${baseUrl}/${profile?.username}/feed`, icon: <Globe size={18} /> },
              { label: 'JSON protocol', url: `${baseUrl}/${profile?.username}/feed?format=json`, icon: <Link2 size={18} /> },
            ].map(({ label, url, icon }) => (
              <div
                key={label}
                className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] space-y-4 hover:border-[var(--border-medium)] transition-all"
                style={{ background: 'rgba(13,13,22,0.1)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[var(--accent)]">
                    {icon}
                    <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(url, label)}
                    className="p-2 rounded-lg bg-[var(--bg-primary)]/50 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {copied === label ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
                <div className="px-3 py-2 rounded-lg bg-black/20 border border-white/5 font-mono text-[10px] text-[var(--text-tertiary)] truncate">
                  {url}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 9. Export */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <Download size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Data Portability (Export)</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Export your entire neolog archive in open formats.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { format: 'json', label: 'Archive (JSON)', desc: 'Complete system snapshot.' },
              { format: 'markdown', label: 'Journal (MD)', desc: 'All logs as markdown files.' },
            ].map(({ format, label, desc }) => (
              <a
                key={format}
                href={`/api/export?format=${format}`}
                className="group flex items-center justify-between p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-all"
                style={{ background: 'rgba(13,13,22,0.1)' }}
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none group-hover:text-[var(--accent)] transition-colors">{label}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-tight font-mono">{desc}</p>
                </div>
                <Download size={16} className="text-[var(--text-tertiary)] opacity-40 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </section>

        {/* 10. Account */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <KeyRound size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Security & Auth</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Manage your core authentication and session security.</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)]" style={{ background: 'rgba(13,13,22,0.2)' }}>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Primary Email</label>
              <div className="relative">
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="input cursor-not-allowed opacity-60 font-mono"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40"></div>
                  <span className="text-[9px] uppercase font-bold tracking-widest text-emerald-500/80">Verified</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 11. Danger Zone */}
        <section className="pt-8">
          <div className="p-8 rounded-3xl border border-red-500/20 bg-red-500/5 space-y-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity pointer-events-none">
              <Trash2 size={120} />
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shadow-sm border border-red-500/20">
                <Trash2 size={20} strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-lg font-medium tracking-tight text-red-500">Danger Zone</h2>
                <p className="text-xs text-red-500/60 mt-0.5 font-medium">Irreversible actions regarding your identity and data.</p>
              </div>
            </div>

            {/* Memory Wipe */}
            {!showResetConfirm ? (
              <div className="flex items-center justify-between gap-6 p-6 rounded-2xl bg-black/20 border border-white/5 mt-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Nuclear Reset (Wipe Memory)</h3>
                  <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-sm">
                    This will wipe all log entries, entities, and video uploads. Your profile and settings will remain.
                  </p>
                </div>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="px-6 py-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[10px] font-bold uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all shadow-xl shadow-amber-500/5 active:scale-95 whitespace-nowrap"
                >
                  Initiate Reset
                </button>
              </div>
            ) : (
              <div className="space-y-4 p-6 rounded-2xl bg-black/40 border border-amber-500/20 animate-in fade-in slide-in-from-bottom-2 mt-4">
                <p className="text-xs font-medium text-amber-500/80 uppercase tracking-widest flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} /> Critical Confirmation Required
                </p>
                <p className="text-sm">
                  Please type <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded border border-white/5">RESET</span> to confirm total memory wipe.
                </p>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  className="input border-amber-500/30 focus:border-amber-500 text-amber-500 font-mono"
                  placeholder="Type RESET"
                  autoFocus
                />
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleReset}
                    disabled={resetConfirmText !== 'RESET' || resetting}
                    className="flex-1 px-6 py-3 rounded-xl bg-amber-500 text-white text-xs font-bold uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-amber-500/20 active:scale-95"
                  >
                    {resetting ? 'Wiping Intelligence...' : 'Confirm System Reset'}
                  </button>
                  <button
                    onClick={() => {
                      setShowResetConfirm(false)
                      setResetConfirmText('')
                    }}
                    className="px-6 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-xs font-bold uppercase tracking-widest hover:bg-[var(--bg-tertiary)] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Delete Account */}
          </div>
        </section>
      </div>
    </main>
  )
}

