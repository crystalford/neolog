'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { readSelectedPublicationId, writeSelectedPublicationId } from '@/lib/publicationContext'
import { SyndicationOptions } from '@/components/SyndicationOptions'
import dynamic from 'next/dynamic'
import { Loader2, Settings, X, CheckCircle2, ChevronDown, Upload, Calendar, Tag, Link2, Lock, Globe, ExternalLink } from 'lucide-react'

const RichEditor = dynamic(
  () => import('@/components/RichEditor').then((mod) => mod.RichEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[420px] bg-[var(--bg-secondary)] rounded-lg animate-pulse" />
    ),
  }
)

const TagSelect = dynamic(
  () => import('@/components/TagSelect').then((mod) => mod.TagSelect),
  {
    ssr: false,
    loading: () => (
      <div className="h-11 bg-[var(--bg-secondary)] rounded-lg animate-pulse" />
    ),
  }
)

const GenerativeCover = dynamic(
  () => import('@/components/GenerativeCover').then((mod) => mod.GenerativeCover),
  {
    ssr: false,
    loading: () => (
      <div className="h-32 w-full bg-[var(--bg-secondary)] rounded-lg animate-pulse" />
    ),
  }
)

const SEOAnalyzer = dynamic(
  () => import('@/components/SEOAnalyzer').then((mod) => mod.SEOAnalyzer),
  { ssr: false }
)

export default function WritePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Core state
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Post data
  const [postId, setPostId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [content, setContent] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [slug, setSlug] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [canonicalUrl, setCanonicalUrl] = useState('')
  const [isPremium, setIsPremium] = useState(false)
  const [publicationId, setPublicationId] = useState<string | null>(null)
  const [publications, setPublications] = useState<any[]>([])
  const [existingStatus, setExistingStatus] = useState<string | null>(null)
  const [publishIntent, setPublishIntent] = useState<'draft' | 'publish' | 'schedule'>('publish')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])

  // UI state
  const [showSettings, setShowSettings] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importHtml, setImportHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deletingPost, setDeletingPost] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    setUser(session.user)

    // Load profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    setProfile(profileData)

    // Load publications
    let { data: pubs } = await supabase
      .from('publications')
      .select('id, name, slug')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: false })

    // Auto-create publication if none exists (for legacy users)
    if (!pubs || pubs.length === 0) {
      const username = profileData?.username || session.user.email?.split('@')[0] || 'user'
      const displayName = profileData?.display_name || username

      const { data: newPub, error: pubError } = await supabase
        .from('publications')
        .insert({
          owner_id: session.user.id,
          name: displayName,
          slug: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
          description: profileData?.bio || null,
        })
        .select('id, name, slug')
        .single()

      if (!pubError && newPub) {
        pubs = [newPub]
      }
    }

    setPublications(pubs || [])

    // Auto-select publication
    if (pubs && pubs.length > 0) {
      const stored = readSelectedPublicationId()
      const selected = stored || pubs[0].id
      setPublicationId(selected)
    }

    // Load existing post if editing
    const editId = searchParams.get('edit')
    if (editId) {
      const { data: post } = await supabase
        .from('posts')
        .select('*')
        .eq('id', editId)
        .eq('author_id', session.user.id)
        .single()

      if (post) {
        setPostId(post.id)
        setTitle(post.title || '')
        setSubtitle(post.subtitle || '')
        setContent(post.content || '')
        setCoverImage(post.cover_image_url || '')
        setSlug(post.slug || '')
        setScheduledAt(post.scheduled_at || '')
        setCanonicalUrl(post.canonical_url || '')
        setIsPremium(post.is_premium || false)
        setPublicationId(post.publication_id)
        setExistingStatus(post.status)

        // Load tags
        const { data: tagRows } = await supabase
          .from('post_tags')
          .select('tag:tags(name)')
          .eq('post_id', post.id)

        if (tagRows) {
          const tagNames = tagRows.map((row: any) => row.tag?.name).filter(Boolean)
          setTags(tagNames)
        }
      }
    }

    setLoading(false)
  }

  // Auto-save draft every 5 seconds
  useEffect(() => {
    if (!user || !title) return

    const timer = setTimeout(async () => {
      await saveDraft()
    }, 5000)

    return () => clearTimeout(timer)
  }, [title, subtitle, content, coverImage, tags, user])

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80)
  }

  const ensureUniqueSlug = async (baseSlug: string, currentPostId?: string | null) => {
    if (!user || !baseSlug) return baseSlug
    const normalized = baseSlug.replace(/-+$/g, '')
    let candidate = normalized
    for (let i = 0; i < 50; i++) {
      let query = supabase
        .from('posts')
        .select('id')
        .eq('author_id', user.id)
        .eq('slug', candidate)
        .limit(1)

      if (currentPostId) {
        query = query.neq('id', currentPostId)
      }

      const { data, error } = await query
      if (error) {
        return candidate
      }
      if (!data || data.length === 0) {
        return candidate
      }
      candidate = `${normalized}-${i + 2}`
    }
    return `${normalized}-${Date.now().toString(36)}`
  }

  const saveDraft = async () => {
    if (!user || !title || !publicationId) return
    if (existingStatus === 'published') return // Don't auto-save published posts

    setSaving(true)

    let autoSlug = slug || generateSlug(title)
    if (!postId) {
      autoSlug = await ensureUniqueSlug(autoSlug, postId)
      if (autoSlug !== slug) {
        setSlug(autoSlug)
      }
    }

    const postData: any = {
      author_id: user.id,
      publication_id: publicationId,
      title,
      subtitle: subtitle || null,
      content,
      content_html: content,
      content_type: 'html',
      slug: autoSlug,
      cover_image_url: coverImage || null,
      canonical_url: canonicalUrl || null,
      is_premium: isPremium,
      status: 'draft',
    }

    try {
      if (postId) {
        await supabase
          .from('posts')
          .update(postData)
          .eq('id', postId)
      } else {
        const { data } = await supabase
          .from('posts')
          .insert(postData)
          .select('id')
          .single()

        if (data) {
          setPostId(data.id)
          // Update URL to include edit param
          const url = new URL(window.location.href)
          url.searchParams.set('edit', data.id)
          window.history.replaceState({}, '', url)

          // Save tags
          if (tags.length > 0) {
            await supabase.rpc('set_post_tags', {
              p_post_id: data.id,
              p_tag_names: tags,
            })
          }
        }
      }

      // Update tags if post exists
      if (postId && tags.length > 0) {
        await supabase.rpc('set_post_tags', {
          p_post_id: postId,
          p_tag_names: tags,
        })
      }

      setSaving(false)
      setLastSaved(new Date())
    } catch (err) {
      console.error('Save error:', err)
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!user || !title || !content || !publicationId) return

    setPublishing(true)
    setError(null)

    const isScheduling = publishIntent === 'schedule' && scheduledAt
    let autoSlug = slug || generateSlug(title)
    autoSlug = await ensureUniqueSlug(autoSlug, postId)
    if (autoSlug !== slug && !postId) {
      setSlug(autoSlug)
    }
    const isUpdate = existingStatus === 'published'

    const postData: any = {
      author_id: user.id,
      publication_id: publicationId,
      title,
      subtitle: subtitle || null,
      content,
      content_html: content,
      content_type: 'html',
      slug: autoSlug,
      cover_image_url: coverImage || null,
      canonical_url: canonicalUrl || null,
      is_premium: isPremium,
      status: isScheduling ? 'scheduled' : 'published',
    }

    if (isScheduling) {
      postData.scheduled_at = new Date(scheduledAt).toISOString()
      postData.published_at = null
    } else {
      postData.status = 'published'
      if (!isUpdate) {
        postData.published_at = new Date().toISOString()
      }
      postData.scheduled_at = null
    }

    try {
      let finalPostId = postId

      if (postId) {
        const { error: updateError } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', postId)

        if (updateError) {
          setError(updateError.message)
          setPublishing(false)
          return
        }
      } else {
        const { data, error: insertError } = await supabase
          .from('posts')
          .insert(postData)
          .select('id, slug')
          .single()

        if (insertError) {
          setError(insertError.message)
          setPublishing(false)
          return
        }

        setPostId(data.id)
        finalPostId = data.id
      }

      // Save tags
      if (finalPostId && tags.length > 0) {
        await supabase.rpc('set_post_tags', {
          p_post_id: finalPostId,
          p_tag_names: tags,
        })
      }

      // Cross-platform publishing (if platforms selected and not scheduling)
      if (finalPostId && selectedPlatforms.length > 0 && !isScheduling) {
        try {
          await fetch('/api/syndication/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postId: finalPostId,
              platforms: selectedPlatforms,
            }),
          })
          // Don't block on syndication errors
        } catch (syndicationError) {
          console.error('Syndication error:', syndicationError)
        }
      }

      setPublishing(false)
      setSuccess(
        isScheduling
          ? 'Post scheduled successfully!'
          : isUpdate
            ? 'Post updated successfully!'
            : selectedPlatforms.length > 0
              ? 'Post published and cross-posted successfully!'
              : 'Post published successfully!'
      )
      setExistingStatus(isScheduling ? 'scheduled' : 'published')

      // Only redirect if it's a new publish, not an update
      if (!isUpdate) {
        const selectedPublication = publications.find((pub) => pub.id === publicationId)
        const publicationSlug = selectedPublication?.slug || profile?.username
        setTimeout(() => {
          if (isScheduling) {
            router.push('/posts')
          } else if (publicationSlug) {
            router.push(`/${publicationSlug}/${autoSlug}`)
          }
        }, 1000)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to publish')
      setPublishing(false)
    }
  }

  const handleImportHtml = () => {
    if (!importHtml.trim()) return
    setContent(importHtml)
    setImportHtml('')
    setShowImport(false)
    setSuccess('HTML imported successfully!')
  }

  const handleDeletePost = async () => {
    if (!postId) {
      setError('Save the draft before deleting.')
      return
    }

    if (!user?.id) {
      setError('You must be signed in to delete a post.')
      return
    }

    const confirmed = window.confirm('Delete this post? This cannot be undone.')
    if (!confirmed) return

    setDeletingPost(true)
    setError(null)
    setSuccess(null)

    try {
      const { error: deleteError } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('author_id', user.id)

      if (deleteError) {
        throw deleteError
      }

      setSuccess('Post deleted.')
      setTimeout(() => {
        router.push('/posts')
      }, 600)
    } catch (err: any) {
      setError(err.message || 'Failed to delete post')
    } finally {
      setDeletingPost(false)
    }
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploadingCover(true)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      const { error } = await supabase.storage
        .from('images')
        .upload(fileName, file)

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(fileName)

      setCoverImage(publicUrl)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploadingCover(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Create a Publication First</h1>
          <p className="text-gray-600 mb-6">
            Before you can write posts, you need to create at least one publication.
          </p>
          <Link href="/publications" className="btn btn-primary">
            Create Publication
          </Link>
        </div>
      </main>

  const selectedPublication = publications.find((pub) => pub.id === publicationId)
  const publicationSlug = selectedPublication?.slug || profile?.username

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      {/* Top bar */}
      <div className="border-b border-[var(--border-medium)] bg-[var(--bg-primary)] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/posts" className="text-sm text-gray-600 hover:text-gray-900">
              {'<- All posts'}
            </Link>

            {/* Publication selector */}
            <div className="relative">
              {publications.length > 1 ? (
                <>
                  <select
                    value={publicationId || ''}
                    onChange={(e) => {
                      const newId = e.target.value
                      setPublicationId(newId)
                      writeSelectedPublicationId(newId)
                    }}
                    className="text-sm border-none bg-transparent text-gray-600 hover:text-gray-900 cursor-pointer pr-6 appearance-none focus:outline-none"
                  >
                    {publications.map((pub) => (
                      <option key={pub.id} value={pub.id}>
                        {pub.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </>
              ) : (
                <span className="text-sm text-gray-600">{publications[0]?.name || 'Publication'}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Save status */}
            {saving && (
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </span>
            )}
            {!saving && lastSaved && (
              <span className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 size={14} />
                Saved
              </span>
            )}

            {/* Preview/View link for published posts */}
            {postId && existingStatus === 'published' && publicationSlug && (
              <a
                href={`/${publicationSlug}/${slug || generateSlug(title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View post
                <ExternalLink size={14} />
              </a>
            )}

            {/* Import HTML button */}
            <button
              onClick={() => setShowImport(true)}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Upload size={16} />
              Import HTML
            </button>

            {/* Settings button */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Post settings"
            >
              <Settings size={20} className="text-gray-600" />
            </button>

            {/* Publish button */}
            <button
              onClick={handlePublish}
              disabled={publishing || !title || !content}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {publishing ? (
                <>
                  <Loader2 size={16} className="animate-spin inline mr-2" />
                  {publishIntent === 'schedule' ? 'Scheduling...' : 'Publishing...'}
                </>
              ) : publishIntent === 'schedule' ? (
                'Schedule'
              ) : existingStatus === 'published' ? (
                'Update'
              ) : (
                'Publish'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="max-w-6xl mx-auto px-6 pt-4">
          <div
            role="alert"
            aria-live="assertive"
            className="p-4 bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-lg text-sm text-[var(--error)]"
          >
            {error}
          </div>
        </div>
      )}
      {success && (
        <div className="max-w-6xl mx-auto px-6 pt-4">
          <div
            role="status"
            aria-live="polite"
            className="p-4 bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-lg text-sm text-[var(--success)]"
          >
            {success}
          </div>
        </div>
      )}

      {/* Main editor */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          aria-label="Post title"
          className="w-full text-3xl font-bold border border-transparent rounded-2xl bg-[var(--bg-secondary)] px-5 py-4 outline-none placeholder-[var(--text-tertiary)] mb-4 focus:border-[var(--border-medium)] focus:bg-[var(--bg-primary)] transition-colors text-[var(--text-primary)]"
          autoFocus
        />

        <input
          type="text"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Add a subtitle or excerpt (optional)"
          aria-label="Post subtitle"
          className="w-full text-lg text-[var(--text-secondary)] border border-transparent rounded-2xl bg-[var(--bg-secondary)] px-5 py-3 outline-none placeholder-[var(--text-tertiary)] mb-8 focus:border-[var(--border-medium)] focus:bg-[var(--bg-primary)] transition-colors"
        />

        <div>
          <RichEditor
            content={content}
            onChange={setContent}
            onImageUpload={async (file) => {
              const fileExt = file.name.split('.').pop()
              const fileName = `${user.id}/${Date.now()}.${fileExt}`

              const { error } = await supabase.storage
                .from('images')
                .upload(fileName, file)

              if (error) throw error

              const { data: { publicUrl } } = supabase.storage
                .from('images')
                .getPublicUrl(fileName)

              return publicUrl
            }}
            className="min-h-[600px]"
          />
        </div>
      </div>

      {/* HTML Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowImport(false)}
          />
          <div className="relative w-full max-w-2xl bg-[var(--bg-primary)] rounded-lg shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Import HTML</h2>
                <button
                  onClick={() => setShowImport(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>

              <textarea
                value={importHtml}
                onChange={(e) => setImportHtml(e.target.value)}
                placeholder="Paste your HTML code here..."
                className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />

              <div className="flex items-center justify-end gap-3 mt-4">
                <button
                  onClick={() => setShowImport(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportHtml}
                  disabled={!importHtml.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings sidebar */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative w-full max-w-md h-full bg-[var(--bg-primary)] shadow-2xl overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Post Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Publishing */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Calendar size={16} />
                    Publishing
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Post Status
                      </label>
                      <div className="text-sm text-gray-600">
                        {existingStatus === 'published' ? 'Published' : existingStatus === 'scheduled' ? 'Scheduled' : 'Draft'}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Publish Options
                      </label>
                      <select
                        value={publishIntent}
                        onChange={(e) => setPublishIntent(e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="publish">Publish now</option>
                        <option value="schedule">Schedule for later</option>
                        <option value="draft">Save as draft</option>
                      </select>
                    </div>

                    {publishIntent === 'schedule' && (
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Schedule Date & Time
                        </label>
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* SEO & Display */}
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Globe size={16} />
                    SEO & Display
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Cover Image
                      </label>
                      <input
                        type="url"
                        value={coverImage}
                        onChange={(e) => setCoverImage(e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                      />
                      <div className="flex items-center gap-2">
                        <label className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer text-sm flex items-center gap-2">
                          <Upload size={14} />
                          {uploadingCover ? 'Uploading...' : 'Upload'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleCoverUpload}
                            className="hidden"
                            disabled={uploadingCover}
                          />
                        </label>
                      </div>
                      {coverImage ? (
                        <img src={coverImage} alt="Cover" className="w-full h-32 object-cover rounded-lg mt-2" />
                      ) : (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-2">Auto-generated cover preview:</p>
                          <GenerativeCover
                            contentSeed={`${postId || 'new'}-${title}`}
                            width={400}
                            height={225}
                            title={title || 'Your Post Title'}
                            author={profile?.display_name || profile?.username || 'Author'}
                            className="rounded-lg"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        URL Slug
                      </label>
                      <input
                        type="text"
                        value={slug || generateSlug(title)}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="url-slug"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {publicationSlug && `/${publicationSlug}/${slug || generateSlug(title)}`}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                        <Tag size={14} />
                        Tags
                      </label>
                      <TagSelect
                        selectedTags={tags}
                        onChange={setTags}
                      />
                    </div>

                    <details className="group border border-gray-200 rounded-lg">
                      <summary className="cursor-pointer px-3 py-2 font-medium text-sm flex items-center justify-between hover:bg-gray-50">
                        <span>SEO Analysis</span>
                        <span className="text-xs text-gray-500">(optional)</span>
                      </summary>
                      <div className="px-3 pb-3 pt-2">
                        <SEOAnalyzer
                          title={title}
                          description={subtitle}
                          content={content}
                        />
                      </div>
                    </details>
                  </div>
                </div>

                {/* Advanced */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Link2 size={16} />
                    Advanced
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Canonical URL
                      </label>
                      <input
                        type="url"
                        value={canonicalUrl}
                        onChange={(e) => setCanonicalUrl(e.target.value)}
                        placeholder="https://original-site.com/post"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        If this was originally published elsewhere
                      </p>
                    </div>

                    {/* Cross-Platform Publishing */}
                    {publishIntent === 'publish' && (
                      <div className="pt-4 border-t border-gray-200">
                        <SyndicationOptions
                          selectedPlatforms={selectedPlatforms}
                          onToggle={(platform) => {
                            setSelectedPlatforms(prev =>
                              prev.includes(platform)
                                ? prev.filter(p => p !== platform)
                                : [...prev, platform]
                            )
                          }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between p-3 border border-gray-300 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Lock size={16} className="text-gray-600" />
                        <div>
                          <p className="text-sm font-medium">Premium Only</p>
                          <p className="text-xs text-gray-500">Restrict to paid subscribers</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isPremium}
                        onChange={(e) => setIsPremium(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300"
                      />
                    </div>
                  </div>
                </div>

                {postId && existingStatus === 'published' && publicationSlug && (
                  <div className="pt-6 border-t border-gray-200">
                    <label className="block text-sm font-medium mb-2">
                      View Published Post
                    </label>
                    <a
                      href={`/${publicationSlug}/${slug || generateSlug(title)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {'Open in new tab ->'}
                    </a>
                  </div>
                )}

                {postId && (
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Danger Zone</h3>
                    <button
                      onClick={handleDeletePost}
                      disabled={deletingPost}
                      className="w-full px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {deletingPost ? 'Deleting...' : 'Delete post'}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      This deletes the post and its tags. This action cannot be undone.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
