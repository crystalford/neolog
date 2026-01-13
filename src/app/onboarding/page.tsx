'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/profile'
import { 
  ArrowRight, Loader2, Camera, Check, Sparkles, 
  PenLine, Users, Rss
} from 'lucide-react'

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  
  // Form data
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [interests, setInterests] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    setUser(session.user)

    const profileData = await ensureProfile(supabase, session.user)

    if (profileData) {
      setProfile(profileData)
      
      // If onboarding already completed, go to dashboard
      if (profileData.onboarded_at) {
        router.push('/dashboard')
        return
      }
      
      // Pre-fill existing data
      setDisplayName(profileData.display_name || '')
      setUsername(profileData.username || '')
      setBio(profileData.bio || '')
      setAvatarUrl(profileData.avatar_url || '')
    }

    setLoading(false)
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

  const validateUsernameLocal = (value: string) => {
    const normalized = normalizeUsername(value)
    if (!normalized || normalized.length < 3) {
      return { ok: false as const, normalized, message: 'Username must be at least 3 characters.' }
    }
    if (RESERVED_USERNAMES.has(normalized)) {
      return { ok: false as const, normalized, message: 'That username is reserved.' }
    }
    return { ok: true as const, normalized, message: null }
  }

  const checkUsernameAvailability = async (value: string) => {
    const { ok, normalized, message } = validateUsernameLocal(value)
    if (normalized !== value) {
      setUsername(normalized)
    }

    if (!ok) {
      setUsernameStatus('invalid')
      setUsernameMessage(message)
      return false
    }

    // If unchanged, treat as available.
    if (profile?.username && normalized === profile.username) {
      setUsernameStatus('available')
      setUsernameMessage(null)
      return true
    }

    setUsernameStatus('checking')
    setUsernameMessage(null)

    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', normalized)
      .limit(1)

    if (error) {
      setUsernameStatus('idle')
      setUsernameMessage('Could not check username availability.')
      return false
    }

    const taken = Array.isArray(data) && data.length > 0
    if (taken) {
      setUsernameStatus('taken')
      setUsernameMessage('That username is already taken.')
      return false
    }

    setUsernameStatus('available')
    setUsernameMessage(null)
    return true
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Image size must be less than 5MB')
      return
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setSaveError('Please upload an image file')
      return
    }

    setUploadingAvatar(true)
    setSaveError(null)

    try {
      const currentProfile = profile || (user ? await ensureProfile(supabase, user) : null)
      if (!currentProfile) {
        setSaveError('Unable to load your profile. Please try again.')
        setUploadingAvatar(false)
        return
      }

      if (!profile) {
        setProfile(currentProfile)
      }

      const fileExt = file.name.split('.').pop()
      const fileName = `${currentProfile.id}/avatar.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        setSaveError(`Failed to upload image: ${uploadError.message}`)
        setUploadingAvatar(false)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      setAvatarUrl(publicUrl)
    } catch (err) {
      console.error('Avatar upload error:', err)
      setSaveError('An unexpected error occurred while uploading. Please try again.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleNext = async () => {
    if (step === 1) {
      // Validate step 1
      if (!displayName.trim()) return
      const ok = await checkUsernameAvailability(username)
      if (!ok) return
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    } else if (step === 3) {
      // Save and finish
    setSaving(true)
    setSaveError(null)

    const currentProfile = profile || (user ? await ensureProfile(supabase, user) : null)
    if (!currentProfile) {
      setSaveError('Unable to load your profile. Please try again.')
      setSaving(false)
      return
    }
    if (!profile) {
      setProfile(currentProfile)
    }
      
      const { error } = await supabase
        .from('profiles')
        .update({
          username: normalizeUsername(username),
          display_name: displayName,
          bio: bio || null,
          avatar_url: avatarUrl || null,
          onboarded_at: new Date().toISOString(),
        })
        .eq('id', currentProfile.id)

      if (error) {
        if ((error as any).code === '23505') {
          setSaveError('That username is already taken.')
        } else if ((error as any).message?.includes('username_format') || (error as any).message?.includes('username_length')) {
          setSaveError('Username must be 3-30 characters and only use a-z, 0-9, and _.')
        } else {
        setSaveError('Unable to finish setup. Please try again.')
        }
        setSaving(false)
        return
      }

      router.push('/dashboard')
    }
  }

  const topicOptions = [
    'Technology', 'AI & Machine Learning', 'Writing', 'Business',
    'Startups', 'Science', 'Health', 'Finance', 'Crypto',
    'Design', 'Politics', 'Culture', 'Philosophy', 'Productivity',
    'Marketing', 'Personal Development', 'Climate', 'Education'
  ]

  const toggleInterest = (topic: string) => {
    setInterests(prev => 
      prev.includes(topic) 
        ? prev.filter(t => t !== topic)
        : [...prev, topic]
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-[var(--bg-secondary)]">
        <div 
          className="h-full bg-[var(--accent)] transition-all duration-500"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      <div className="max-w-xl mx-auto px-6 py-16">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-12">
          <div className="w-10 h-10 bg-[var(--accent)] rounded-lg flex items-center justify-center font-mono text-lg font-bold text-white">
            N
          </div>
          <span className="font-display text-2xl">neolog</span>
        </div>

        {/* Step 1: Basic info */}
        {step === 1 && (
          <div className="animate-fade-up">
            <div className="text-center mb-8">
              <h1 className="font-display text-3xl mb-2">Welcome to Neolog!</h1>
              <p className="text-[var(--text-secondary)]">
                Let's set up your profile so readers can find you
              </p>
            </div>

            <div className="space-y-6">
              {/* Avatar */}
              <div className="flex flex-col items-center">
                <div className="relative mb-3">
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-24 h-24 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-[var(--accent)] flex items-center justify-center text-3xl text-white font-medium">
                      {displayName ? displayName[0].toUpperCase() : user?.email?.[0].toUpperCase()}
                    </div>
                  )}
                  
                  <label className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-[var(--bg-primary)] border-2 border-[var(--border-medium)] flex items-center justify-center cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                    {uploadingAvatar ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Camera size={18} className="text-[var(--text-secondary)]" />
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
                <p className="text-sm text-[var(--text-tertiary)]">Add a profile photo</p>
              </div>

              {/* Display name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  What should we call you?
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="input text-lg py-3"
                  autoFocus
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Choose your username
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-tertiary)]">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      setUsernameStatus('idle')
                      setUsernameMessage(null)
                    }}
                    onBlur={() => {
                      void checkUsernameAvailability(username)
                    }}
                    placeholder="your_handle"
                    className="input text-lg py-3 flex-1"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
                {(profile?.username?.startsWith('user_') || username.startsWith('user_')) && (
                  <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                    We created a temporary username for you - pick the one you want now.
                  </p>
                )}
                <div className="mt-2 text-sm">
                  {usernameStatus === 'checking' ? (
                    <span className="text-[var(--text-tertiary)]">Checking availability...</span>
                  ) : usernameMessage ? (
                    <span className="text-red-500">{usernameMessage}</span>
                  ) : usernameStatus === 'available' ? (
                    <span className="text-[var(--text-secondary)]">Looks good.</span>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">3-30 chars, a-z, 0-9, underscore.</span>
                  )}
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Tell readers about yourself
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Writer, thinker, builder..."
                  className="input min-h-[100px] resize-none"
                  maxLength={160}
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-1 text-right">
                  {bio.length}/160
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Interests */}
        {step === 2 && (
          <div className="animate-fade-up">
            <div className="text-center mb-8">
              <h1 className="font-display text-3xl mb-2">What do you write about?</h1>
              <p className="text-[var(--text-secondary)]">
                Select topics to help readers discover your work
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {topicOptions.map(topic => (
                <button
                  key={topic}
                  onClick={() => toggleInterest(topic)}
                  className={`px-4 py-2 rounded-full text-sm transition-all ${
                    interests.includes(topic)
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)]'
                  }`}
                >
                  {interests.includes(topic) && <Check size={14} className="inline mr-1" />}
                  {topic}
                </button>
              ))}
            </div>

            <p className="text-sm text-[var(--text-tertiary)] text-center">
              You can always change these later
            </p>
          </div>
        )}

        {/* Step 3: Ready */}
        {step === 3 && (
          <div className="animate-fade-up text-center">
            <div className="w-20 h-20 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mx-auto mb-6">
              <Sparkles size={32} className="text-[var(--accent)]" />
            </div>
            
            <h1 className="font-display text-3xl mb-2">You're all set!</h1>
            <p className="text-[var(--text-secondary)] mb-8">
              Here's what you can do on Neolog
            </p>

            <div className="grid gap-4 text-left mb-8">
              <div className="flex items-start gap-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                  <PenLine size={20} className="text-[var(--accent)]" />
                </div>
                <div>
                  <p className="font-medium">Write and publish</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Rich editor with formatting, images, and code blocks
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                  <Users size={20} className="text-[var(--accent)]" />
                </div>
                <div>
                  <p className="font-medium">Build your audience</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Subscribers, email notifications, and engagement
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                  <Rss size={20} className="text-[var(--accent)]" />
                </div>
                <div>
                  <p className="font-medium">Own your content</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    RSS feeds, full export, no lock-in ever
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={handleNext}
            disabled={step === 1 && (!displayName.trim() || usernameStatus === 'checking' || !username.trim())}
            className="btn btn-primary btn-lg"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Setting up...
              </>
            ) : step === 3 ? (
              <>
                Go to Dashboard
                <ArrowRight size={18} />
              </>
            ) : (
              <>
                Continue
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
        {saveError && (
          <p className="mt-4 text-center text-sm text-red-500">{saveError}</p>
        )}
      </div>
    </div>
  )
}
