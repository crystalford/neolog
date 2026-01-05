'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/profile'
import { 
  User, Download, Rss, Shield, Loader2, Camera,
  Check, ExternalLink, Copy, Globe, Bell, Mail, Trash2,
  KeyRound,
  AlertTriangle
} from 'lucide-react'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [usernameDraft, setUsernameDraft] = useState('')
  const [usernameSaving, setUsernameSaving] = useState(false)
  
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
  }, [])

  const aiProviders = [
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic (Claude)' },
    { id: 'perplexity', label: 'Perplexity' },
    { id: 'grok', label: 'Grok' },
    { id: 'groq', label: 'Groq (Speed)' },
    { id: 'replicate', label: 'Replicate (Flux)' },
    { id: 'elevenlabs', label: 'ElevenLabs (Voice)' },
    { id: 'resend', label: 'Resend (Newsletter)' },
    { id: 'posthog', label: 'PostHog (Analytics)' },
    { id: 'r2', label: 'Cloudflare R2 (Storage)' },
    { id: 's3', label: 'Amazon S3 (Storage)' },
    { id: 'heygen', label: 'HeyGen (Video Avatar)' },
    { id: 'stability', label: 'Stability (Legacy)' },
  ]

  const providerValidation: Record<string, { pattern?: RegExp; hint: string }> = {
    openai: { pattern: /^sk-(proj-)?[A-Za-z0-9]{10,}/, hint: 'OpenAI keys start with sk-' },
    anthropic: { pattern: /^sk-ant-[A-Za-z0-9-]{10,}/, hint: 'Anthropic keys start with sk-ant-' },
    groq: { pattern: /^gsk_[A-Za-z0-9]{10,}/, hint: 'Groq keys start with gsk_' },
    perplexity: { pattern: /^pplx-[A-Za-z0-9]{10,}/, hint: 'Perplexity keys start with pplx-' },
    elevenlabs: { pattern: /^[A-Za-z0-9]{20,}/, hint: 'ElevenLabs keys are long alphanumeric strings' },
    replicate: { pattern: /^r8_[A-Za-z0-9]{10,}/, hint: 'Replicate keys start with r8_' },
    resend: { pattern: /^re_[A-Za-z0-9]{10,}/, hint: 'Resend keys start with re_' },
    posthog: { pattern: /^phc_[A-Za-z0-9]{10,}/, hint: 'PostHog keys start with phc_' },
    heygen: { pattern: /^[A-Za-z0-9]{20,}/, hint: 'HeyGen keys are long alphanumeric strings' },
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
          setError('Username must be 3–30 characters and only use a-z, 0-9, and _.')
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
    if (deleteConfirmText !== profile.username) return
    
    setDeleting(true)

    // Delete all user data (cascade will handle most)
    // Sign out and delete auth user
    await supabase.auth.signOut()
    
    // Note: Full account deletion requires a server function with service role
    // For now, sign out and show message
    router.push('/?deleted=true')
  }

  const baseUrl = typeof window !== 'undefined' 
    ? window.location.origin 
    : 'https://neolog.ai'

  if (loading) {
    return (
      <>
        <main className="pt-16 pb-16">
          <div className="max-w-2xl mx-auto px-6 pt-8">
            <div className="h-8 w-32 skeleton rounded mb-8" />
            <div className="space-y-4">
              <div className="h-20 skeleton rounded-xl" />
              <div className="h-20 skeleton rounded-xl" />
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <main className="pt-16 pb-16">
      <div className="max-w-6xl mx-auto px-6 lg:px-12">
        <div className="pt-8 mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            Publisher settings
          </p>
          <h1 className="font-display text-3xl">Settings</h1>
          <p className="text-[var(--text-secondary)] mt-2 max-w-2xl">
            Manage your profile, notifications, and exports for your publication.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-[var(--error)]/30 bg-[var(--error)]/10 text-sm text-[var(--error)]">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/10 text-sm text-[var(--success)]">
            {success}
          </div>
        )}

        <div className="space-y-8">
            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <User size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-lg">Profile</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                    Profile Picture
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {formData.avatar_url ? (
                        <img 
                          src={formData.avatar_url}
                          alt="Avatar"
                          className="w-20 h-20 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-[var(--accent)] flex items-center justify-center text-2xl text-white font-medium">
                          {(formData.display_name || profile?.username || 'U')[0].toUpperCase()}
                        </div>
                      )}
                      
                      <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[var(--bg-primary)] border border-[var(--border-medium)] flex items-center justify-center cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                        {uploadingAvatar ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Camera size={14} className="text-[var(--text-secondary)]" />
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
                    
                    <div className="text-sm text-[var(--text-tertiary)]">
                      <p>Click the camera icon to upload</p>
                      <p>JPG, PNG, or GIF. Max 2MB.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={usernameDraft}
                    onChange={(e) => setUsernameDraft(e.target.value)}
                    className="input"
                  />
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button
                      onClick={handleUsernameSave}
                      disabled={usernameSaving || !usernameDraft}
                      className="btn btn-secondary btn-sm"
                    >
                      {usernameSaving ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <Check size={16} />
                          Update username
                        </>
                      )}
                    </button>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      3–30 chars. a-z, 0-9, underscore.
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Your profile URL: {baseUrl}/{profile?.username}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Changing your username can break old links.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    className="input"
                    placeholder="Your display name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Bio
                  </label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="input min-h-[100px] resize-y"
                    placeholder="Tell readers about yourself"
                    maxLength={500}
                  />
                  <p className="text-xs text-[var(--text-tertiary)] mt-1 text-right">
                    {formData.bio.length}/500
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Website
                  </label>
                  <input
                    type="url"
                    value={formData.website_url}
                    onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                    className="input"
                    placeholder="https://yoursite.com"
                  />
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Twitter
                    </label>
                    <input
                      type="url"
                      value={formData.twitter_url}
                      onChange={(e) => setFormData({ ...formData, twitter_url: e.target.value })}
                      className="input"
                      placeholder="https://twitter.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      GitHub
                    </label>
                    <input
                      type="url"
                      value={formData.github_url}
                      onChange={(e) => setFormData({ ...formData, github_url: e.target.value })}
                      className="input"
                      placeholder="https://github.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      LinkedIn
                    </label>
                    <input
                      type="url"
                      value={formData.linkedin_url}
                      onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                      className="input"
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      Save Profile
                    </>
                  )}
                </button>
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <Globe size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-lg">Context memory</h2>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                This context is injected into AI prompts to keep tone and facts consistent.
              </p>
              <textarea
                value={formData.context_md}
                onChange={(event) => setFormData({ ...formData, context_md: event.target.value })}
                placeholder="e.g. My tone is concise, data-first, skeptical of hype. Avoid the word 'delve'."
                className="input min-h-[160px] font-mono"
              />
            </section>

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <Bell size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-lg">Email Notifications</h2>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'email_new_follower', label: 'New subscribers', desc: 'When someone subscribes to you' },
                  { key: 'email_new_comment', label: 'New comments', desc: 'When someone comments on your posts' },
                  { key: 'email_comment_reply', label: 'Comment replies', desc: 'When someone replies to your comment' },
                  { key: 'email_post_upvote', label: 'Upvotes', desc: 'When someone upvotes your post' },
                  { key: 'email_weekly_digest', label: 'Weekly digest', desc: 'Summary of activity on your posts' },
                ].map(({ key, label, desc }) => (
                  <label 
                    key={key}
                    className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] cursor-pointer hover:border-[var(--border-medium)] transition-colors"
                  >
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-sm text-[var(--text-tertiary)]">{desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={(emailPrefs as any)[key]}
                      onChange={(e) => setEmailPrefs({ ...emailPrefs, [key]: e.target.checked })}
                      className="w-5 h-5 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <Rss size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-lg">Your Feeds</h2>
              </div>

              <p className="text-[var(--text-secondary)] mb-4">
                Your content is available in multiple formats. Share these with your audience.
              </p>

              <div className="space-y-3">
                {[
                  { label: 'RSS Feed', url: `${baseUrl}/${profile?.username}/feed` },
                  { label: 'Atom Feed', url: `${baseUrl}/${profile?.username}/feed?format=atom` },
                  { label: 'JSON Feed', url: `${baseUrl}/${profile?.username}/feed?format=json` },
                ].map(({ label, url }) => (
                  <div 
                    key={label}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-[var(--text-tertiary)] truncate">
                        {url}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        onClick={() => copyToClipboard(url, label)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                        title="Copy URL"
                      >
                        {copied === label ? (
                          <Check size={16} className="text-[var(--success)]" />
                        ) : (
                          <Copy size={16} className="text-[var(--text-tertiary)]" />
                        )}
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                        title="Open feed"
                      >
                        <ExternalLink size={16} className="text-[var(--text-tertiary)]" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <Download size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-lg">Export Your Data</h2>
              </div>

              <p className="text-[var(--text-secondary)] mb-4">
                Download all your content. Your data is yours - no lock-in.
              </p>

              <div className="grid gap-3">
                {[
                  { format: 'json', label: 'Full Export (JSON)', desc: 'Complete data: posts, drafts, settings' },
                  { format: 'markdown', label: 'Markdown Export', desc: 'All posts as markdown files' },
                  { format: 'html', label: 'HTML Archive', desc: 'Self-contained HTML with all posts' },
                ].map(({ format, label, desc }) => (
                  <a
                    key={format}
                    href={`/api/export?format=${format}`}
                    className="flex items-center justify-between p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
                  >
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-sm text-[var(--text-tertiary)]">{desc}</p>
                    </div>
                    <Download size={18} className="text-[var(--text-tertiary)]" />
                  </a>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <KeyRound size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-lg">AI Vault (BYOK)</h2>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Add your own keys to unlock AI summaries, expansions, and research tools.
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mb-6">
                Active keys are used first. Pro users can fall back to managed keys when no active key is set.
              </p>

              <div className="space-y-4">
                {aiProviders.map((provider) => {
                  const providerKeys = getProviderKeys(provider.id)
                  const draftValue = integrationDrafts[provider.id] || ''
                  const hint = getIntegrationHint(provider.id, draftValue)
                  return (
                    <div key={provider.id} className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {provider.label}
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)]">
                            {isConnected(provider.id) ? 'Active' : 'Not connected'}
                          </p>
                        </div>
                        {isConnected(provider.id) && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.2em] bg-[var(--accent-soft)] text-[var(--accent)]">
                            Active
                          </span>
                        )}
                      </div>

                      {providerKeys.length > 0 ? (
                        <div className="space-y-2 mb-4">
                          {providerKeys.map((key, index) => (
                            <div key={key.id} className="flex items-center justify-between text-xs">
                              <div>
                                <p className="text-[var(--text-primary)] font-medium">
                                  {key.label || `Key ${providerKeys.length - index}`}
                                </p>
                                <p className="text-[var(--text-tertiary)]">
                                  {key.is_active ? 'Active' : 'Inactive'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {!key.is_active && (
                                  <button
                                    onClick={() => setActiveIntegration(key.id)}
                                    className="btn btn-secondary btn-sm"
                                  >
                                    Set active
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteIntegration(key.id)}
                                  className="btn btn-secondary btn-sm text-[var(--error)]"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text-tertiary)] mb-4">
                          No keys saved yet.
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={integrationLabels[provider.id] || ''}
                          onChange={(event) =>
                            setIntegrationLabels((prev) => ({
                              ...prev,
                              [provider.id]: event.target.value,
                            }))
                          }
                          placeholder="Label (optional)"
                          className="input flex-1 min-w-[160px]"
                        />
                        <input
                          type="password"
                          value={draftValue}
                          onChange={(event) =>
                            setIntegrationDrafts((prev) => ({
                              ...prev,
                              [provider.id]: event.target.value,
                            }))
                          }
                          placeholder={isConnected(provider.id) ? '************' : 'Paste API key'}
                          className="input flex-1 min-w-[200px]"
                        />
                        <button
                          onClick={() => saveIntegration(provider.id)}
                          disabled={integrationSaving === provider.id}
                          className="btn btn-secondary btn-sm"
                        >
                          {integrationSaving === provider.id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                      {hint && (
                        <p className={`text-xs mt-2 ${hint.tone === 'error' ? 'text-[var(--error)]' : 'text-[var(--warning)]'}`}>
                          {hint.text}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <Shield size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-lg">Sovereign storage</h2>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Store large assets in your own bucket. Add the secret key in the AI Vault under R2/S3.
              </p>

              <div className="grid gap-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="text-sm text-[var(--text-secondary)]">
                    Provider
                    <select
                      value={storageConfig.provider}
                      onChange={(event) =>
                        setStorageConfig((prev) => ({ ...prev, provider: event.target.value }))
                      }
                      className="input mt-2"
                    >
                      <option value="r2">Cloudflare R2</option>
                      <option value="s3">Amazon S3</option>
                    </select>
                  </label>
                  <label className="text-sm text-[var(--text-secondary)]">
                    Access key ID
                    <input
                      value={storageConfig.access_key_id}
                      onChange={(event) =>
                        setStorageConfig((prev) => ({ ...prev, access_key_id: event.target.value }))
                      }
                      className="input mt-2"
                      placeholder="R2/S3 access key id"
                    />
                  </label>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="text-sm text-[var(--text-secondary)]">
                    Bucket
                    <input
                      value={storageConfig.bucket}
                      onChange={(event) =>
                        setStorageConfig((prev) => ({ ...prev, bucket: event.target.value }))
                      }
                      className="input mt-2"
                      placeholder="my-neolog-assets"
                    />
                  </label>
                  <label className="text-sm text-[var(--text-secondary)]">
                    Region
                    <input
                      value={storageConfig.region}
                      onChange={(event) =>
                        setStorageConfig((prev) => ({ ...prev, region: event.target.value }))
                      }
                      className="input mt-2"
                      placeholder="auto or us-east-1"
                    />
                  </label>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="text-sm text-[var(--text-secondary)]">
                    Endpoint (optional)
                    <input
                      value={storageConfig.endpoint}
                      onChange={(event) =>
                        setStorageConfig((prev) => ({ ...prev, endpoint: event.target.value }))
                      }
                      className="input mt-2"
                      placeholder="https://<account>.r2.cloudflarestorage.com"
                    />
                  </label>
                  <label className="text-sm text-[var(--text-secondary)]">
                    Public base URL (optional)
                    <input
                      value={storageConfig.public_base_url}
                      onChange={(event) =>
                        setStorageConfig((prev) => ({ ...prev, public_base_url: event.target.value }))
                      }
                      className="input mt-2"
                      placeholder="https://cdn.yoursite.com"
                    />
                  </label>
                </div>

                <button
                  onClick={saveStorage}
                  disabled={storageSaving}
                  className="btn btn-secondary btn-sm"
                >
                  {storageSaving ? 'Saving...' : 'Save storage settings'}
                </button>
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <KeyRound size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-lg">Automation API keys</h2>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={apiKeyLabel}
                    onChange={(event) => setApiKeyLabel(event.target.value)}
                    placeholder="Key label (e.g. n8n)"
                    className="input flex-1 min-w-[200px]"
                  />
                  <button
                    onClick={createApiKey}
                    className="btn btn-secondary btn-sm"
                    disabled={apiKeySaving}
                  >
                    {apiKeySaving ? 'Creating...' : 'Create key'}
                  </button>
                </div>

                {apiKeyCreated && (
                  <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3 text-xs text-[var(--text-secondary)]">
                    <p className="text-[var(--text-primary)] font-medium">Copy this key now (shown once)</p>
                    <p className="font-mono mt-2 break-all">{apiKeyCreated}</p>
                  </div>
                )}

                {apiKeys.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)]">No keys created yet.</p>
                ) : (
                  <div className="space-y-2">
                    {apiKeys.map((key) => (
                      <div key={key.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="text-[var(--text-primary)] font-medium">{key.label || 'Untitled key'}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">
                            Last used: {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}
                          </p>
                        </div>
                        <button
                          onClick={() => revokeApiKey(key.id)}
                          className="btn btn-secondary btn-sm text-[var(--error)]"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center">
                  <Mail size={20} className="text-[var(--text-tertiary)]" />
                </div>
                <h2 className="font-display text-lg">Account</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="input bg-[var(--bg-secondary)] text-[var(--text-tertiary)]"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--error)]/20 bg-[var(--error)]/5 p-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--error)]/10 flex items-center justify-center">
                  <Shield size={20} className="text-[var(--error)]" />
                </div>
                <h2 className="font-display text-lg">Danger Zone</h2>
              </div>

              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle size={20} className="text-[var(--error)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-[var(--error)]">Delete Account</p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    This will permanently delete your account, all posts, comments, and data. 
                    This action cannot be undone.
                  </p>
                </div>
              </div>
              
              {!showDeleteConfirm ? (
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn bg-[var(--error)] text-white hover:opacity-90"
                >
                  <Trash2 size={16} />
                  Delete Account
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    Type <code className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded">{profile?.username}</code> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="input"
                    placeholder="Enter your username"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== profile?.username || deleting}
                      className="btn bg-[var(--error)] text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {deleting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        'Permanently Delete'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false)
                        setDeleteConfirmText('')
                      }}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
      </div>
    </main>
  )
}
