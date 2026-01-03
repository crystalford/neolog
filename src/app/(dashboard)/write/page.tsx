'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/profile'
import { RichEditor } from '@/components/RichEditor'
import { TagSelect } from '@/components/TagSelect'
import {
  Save, Send, Loader2, Eye, Settings, Image as ImageIcon,
  ChevronDown, Clock, BookOpen
} from 'lucide-react'

export default function WritePage() {
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
  const [showSettings, setShowSettings] = useState(false)
  const [isPremium, setIsPremium] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [canonicalUrl, setCanonicalUrl] = useState('')
  const [originalSource, setOriginalSource] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [publicationId, setPublicationId] = useState<string | null>(null)
  const [hasNoPublications, setHasNoPublications] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    loadUser()
    loadSelectedPublication()

    // Load existing post if editing
    const editId = searchParams.get('edit')
    if (editId) {
      loadPost(editId)
    }
  }, [searchParams])

  const loadSelectedPublication = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Check if user has any publications
      const { data: publications, error } = await supabase
        .from('publications')
        .select('id')
        .eq('owner_id', session.user.id)
        .eq('is_active', true)
        .limit(1)

      if (error) {
        console.error('Error loading publications:', error)
        return
      }

      if (!publications || publications.length === 0) {
        setHasNoPublications(true)
        return
      }

      // Try to get selected publication from localStorage
      const selectedId = typeof window !== 'undefined'
        ? localStorage.getItem('selectedPublicationId')
        : null

      if (selectedId) {
        // Verify this publication exists and belongs to user
        const { data: pub } = await supabase
          .from('publications')
          .select('id')
          .eq('id', selectedId)
          .eq('owner_id', session.user.id)
          .eq('is_active', true)
          .single()

        if (pub) {
          setPublicationId(selectedId)
          return
        }
      }

      // If no valid selection, use first publication
      if (publications[0]) {
        setPublicationId(publications[0].id)
      }
    } catch (error) {
      console.error('Error loading publication:', error)
    }
  }

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login?redirect=/write')
      return
    }
    
    setUser(session.user)
    
    const profileData = await ensureProfile(supabase, session.user)

    if (profileData) {
      setProfile(profileData)
    }
    
    setLoading(false)
  }

  const loadPost = async (id: string) => {
    const { data: post } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .single()
    
    if (post) {
      setPostId(post.id)
      setTitle(post.title)
      setSubtitle(post.subtitle || '')
      setContent(post.content || '')
      setCoverImage(post.cover_image_url || '')
      setCanonicalUrl(post.canonical_url || '')
      setOriginalSource(post.original_source || '')
      setIsPremium(post.is_premium || false)
    }
  }

  // Generate slug from title
  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
  }

  // Calculate reading time
  const calculateReadingTime = (html: string) => {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
    const words = text.trim().split(' ').length
    return Math.max(1, Math.ceil(words / 200))
  }

  // Auto-save
  const autoSave = useCallback(async () => {
    if (!user || !title) return
    
    setSaving(true)

    const slug = generateSlug(title)
    const readingTime = calculateReadingTime(content)
    
    const postData = {
      author_id: user.id,
      publication_id: publicationId,
      title,
      subtitle: subtitle || null,
      slug,
      content,
      content_html: content,
      content_type: 'html',
      cover_image_url: coverImage || null,
      reading_time_minutes: readingTime,
      status: 'draft',
      canonical_url: canonicalUrl || null,
      original_source: originalSource || null,
      is_premium: isPremium,
    }

    try {
      if (postId) {
        await supabase
          .from('posts')
          .update(postData)
          .eq('id', postId)
      } else {
        const { data: newPost } = await supabase
          .from('posts')
          .insert(postData)
          .select('id')
          .single()
        
        if (newPost) {
          setPostId(newPost.id)
        }
      }
      
      setLastSaved(new Date())
    } catch (error) {
      console.error('Auto-save error:', error)
    } finally {
      setSaving(false)
    }
  }, [user, postId, title, subtitle, content, coverImage, canonicalUrl, originalSource, isPremium])

  // Debounced auto-save
  useEffect(() => {
    if (!title) return
    
    const timer = setTimeout(autoSave, 2000)
    return () => clearTimeout(timer)
  }, [title, subtitle, content, coverImage])

  // Publish
  const handlePublish = async () => {
    if (!user || !title || !content) {
      setError('Please add a title and content before publishing')
      return
    }

    setPublishing(true)
    setError(null)
    setSuccess(null)

    try {
      const currentProfile = profile || (user ? await ensureProfile(supabase, user) : null)
      if (!currentProfile) {
        setError('Unable to load your profile. Please try refreshing the page.')
        setPublishing(false)
        return
      }
      if (!profile) {
        setProfile(currentProfile)
      }

      const slug = generateSlug(title)
      const readingTime = calculateReadingTime(content)

      // Generate excerpt
      const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const excerpt = textContent.substring(0, 160) + (textContent.length > 160 ? '...' : '')

      const postData = {
        author_id: user.id,
        publication_id: publicationId,
        title,
        subtitle: subtitle || null,
        slug,
        content,
        content_html: content,
        content_type: 'html',
        cover_image_url: coverImage || null,
        reading_time_minutes: readingTime,
        excerpt,
        status: 'published',
        published_at: new Date().toISOString(),
      }

      let finalSlug = slug
      let finalPostId = postId

      if (postId) {
        const { data, error: updateError } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', postId)
          .select('id, slug')
          .single()

        if (updateError) {
          console.error('Update error:', updateError)
          setError(`Failed to publish: ${updateError.message}`)
          setPublishing(false)
          return
        }

        if (data) finalSlug = data.slug
      } else {
        const { data, error: insertError } = await supabase
          .from('posts')
          .insert(postData)
          .select('id, slug')
          .single()

        if (insertError) {
          console.error('Insert error:', insertError)
          setError(`Failed to publish: ${insertError.message}`)
          setPublishing(false)
          return
        }

        if (data) {
          setPostId(data.id)
          finalPostId = data.id
          finalSlug = data.slug
        }
      }

      // Send notifications via API
      if (finalPostId) {
        try {
          const response = await fetch('/api/posts/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: finalPostId, notify: true }),
          })

          if (!response.ok) {
            console.error('Notification API error:', await response.text())
            // Don't fail publishing if notifications fail
          }

          // Save tags
          if (tags.length > 0) {
            const { error: tagsError } = await supabase.rpc('set_post_tags', {
              p_post_id: finalPostId,
              p_tag_names: tags,
            })

            if (tagsError) {
              console.error('Tags error:', tagsError)
              // Don't fail publishing if tags fail
            }
          }
        } catch (notifyError) {
          console.error('Notification error:', notifyError)
          // Don't fail publishing if notifications fail
        }
      }

      // Show success and redirect to published post
      setSuccess('Post published successfully! Redirecting...')

      setTimeout(() => {
        if (currentProfile) {
          router.push(`/${currentProfile.username}/${finalSlug}`)
        }
      }, 1000)
    } catch (error) {
      console.error('Publish error:', error)
      setError('An unexpected error occurred while publishing. Please try again.')
    } finally {
      setPublishing(false)
    }
  }

  // Image upload handler
  const handleImageUpload = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not authenticated')

    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}/${Date.now()}.${fileExt}`

    const { data, error } = await supabase.storage
      .from('images')
      .upload(fileName, file)

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(fileName)

    return publicUrl
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    )
  }

  return (
    <main className="pb-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Error/Success Messages */}
          {hasNoPublications && (
            <div className="mb-4 p-6 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                Create a Publication First
              </h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-4">
                Before you can write posts, you need to create at least one publication.
                Publications are like separate blogs that you can manage.
              </p>
              <Link href="/publications" className="btn btn-primary">
                <BookOpen size={16} />
                Create Your First Publication
              </Link>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200">
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200">
              <p className="text-sm font-medium">{success}</p>
            </div>
          )}

          {/* Header actions */}
          <div className="flex items-center justify-between py-3 mb-6 sticky top-16 bg-[var(--bg-primary)] z-10 border-b border-[var(--border-light)]">
            <div className="flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
              {saving && (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </span>
              )}
              {!saving && lastSaved && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="btn btn-ghost btn-sm"
              >
                <Settings size={16} />
                Settings
              </button>

              {profile && postId && (
                <a
                  href={`/${profile.username}/${generateSlug(title)}?preview=true`}
                  target="_blank"
                  className="btn btn-ghost btn-sm"
                >
                  <Eye size={16} />
                  Preview
                </a>
              )}

              <button
                onClick={handlePublish}
                disabled={publishing || !title || !content}
                className="btn btn-primary btn-sm"
              >
                {publishing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Publish
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="mb-6 p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <h3 className="font-semibold text-lg mb-4">Post Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Cover Image</label>
                  <div className="flex gap-3">
                    <input
                      type="url"
                      value={coverImage}
                      onChange={(e) => setCoverImage(e.target.value)}
                      placeholder="https://... or upload"
                      className="input flex-1"
                    />
                    <label className="btn btn-secondary cursor-pointer">
                      <ImageIcon size={16} />
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            try {
                              const url = await handleImageUpload(file)
                              setCoverImage(url)
                            } catch (error) {
                              console.error('Upload failed:', error)
                            }
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {coverImage && (
                    <img 
                      src={coverImage} 
                      alt="Cover preview" 
                      className="mt-3 rounded-lg max-h-40 object-cover"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">URL Slug</label>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                    <span>/{profile?.username}/</span>
                    <code className="px-2 py-1 bg-[var(--bg-tertiary)] rounded">
                      {generateSlug(title) || 'your-post-title'}
                    </code>
                  </div>
                </div>

                <TagSelect 
                  selectedTags={tags}
                  onChange={setTags}
                  maxTags={5}
                />

                <div>
                  <label className="block text-sm font-medium mb-2">Schedule</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={scheduledAt}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Leave empty to publish immediately
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Canonical URL
                    <span className="font-normal text-[var(--text-tertiary)] ml-1">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={canonicalUrl}
                    onChange={(e) => setCanonicalUrl(e.target.value)}
                    placeholder="https://... (original publication URL)"
                    className="input"
                  />
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    If cross-posting, link to the original
                  </p>
                </div>

                {canonicalUrl && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Original Source</label>
                    <input
                      type="text"
                      value={originalSource}
                      onChange={(e) => setOriginalSource(e.target.value)}
                      placeholder="e.g., Medium, Substack, My Blog"
                      className="input"
                    />
                  </div>
                )}

                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPremium}
                      onChange={(e) => setIsPremium(e.target.checked)}
                      className="w-5 h-5 rounded"
                    />
                    <div>
                      <span className="font-medium">Premium post</span>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Only paid subscribers can read the full post
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Title */}
          <label htmlFor="post-title" className="block text-sm font-medium text-[var(--text-tertiary)] mb-2">
            Article title
          </label>
          <input
            id="post-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter your title"
            className="w-full text-4xl font-display font-bold text-[var(--text-primary)] bg-transparent border-none outline-none placeholder:text-[var(--text-tertiary)] mb-6"
          />

          {/* Subtitle */}
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle (optional)"
            className="w-full text-xl text-[var(--text-secondary)] bg-transparent border-none outline-none placeholder:text-[var(--text-tertiary)] mb-8"
          />

          {/* Rich Editor */}
          <RichEditor
            content={content}
            onChange={setContent}
            placeholder="Tell your story..."
            onImageUpload={handleImageUpload}
          />
      </div>
    </main>
  )
}
