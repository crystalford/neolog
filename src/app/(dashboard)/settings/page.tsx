'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/profile'
import { 
  User, Download, Rss, Shield, Loader2, Camera,
  Check, ExternalLink, Copy, Globe, Bell, Mail, Trash2,
  AlertTriangle
} from 'lucide-react'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  
  const [formData, setFormData] = useState({
    display_name: '',
    bio: '',
    website_url: '',
    avatar_url: '',
    twitter_url: '',
    github_url: '',
    linkedin_url: '',
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
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
  }, [])

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
        setFormData({
          display_name: data.display_name || '',
          bio: data.bio || '',
          website_url: data.website_url || '',
          avatar_url: data.avatar_url || '',
          twitter_url: data.twitter_url || '',
          github_url: data.github_url || '',
          linkedin_url: data.linkedin_url || '',
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

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8">
          <div className="space-y-8">
            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <User size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-xl">Profile</h2>
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
                    value={profile?.username || ''}
                    disabled
                    className="input bg-[var(--bg-secondary)] text-[var(--text-tertiary)] cursor-not-allowed"
                  />
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Your profile URL: {baseUrl}/{profile?.username}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Username cannot be changed after account creation
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

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <Bell size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-xl">Email Notifications</h2>
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

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <Rss size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-xl">Your Feeds</h2>
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
          </div>

          <div className="space-y-8">
            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                  <Download size={20} className="text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-xl">Export Your Data</h2>
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

            <section className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center">
                  <Mail size={20} className="text-[var(--text-tertiary)]" />
                </div>
                <h2 className="font-display text-xl">Account</h2>
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

            <section className="rounded-2xl border border-[var(--error)]/20 bg-[var(--error)]/5 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--error)]/10 flex items-center justify-center">
                  <Shield size={20} className="text-[var(--error)]" />
                </div>
                <h2 className="font-display text-xl">Danger Zone</h2>
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
      </div>
    </main>
  )
}
