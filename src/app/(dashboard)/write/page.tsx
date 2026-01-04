'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/profile'
import { RichEditor } from '@/components/RichEditor'
import { TagSelect } from '@/components/TagSelect'
import {
  Loader2, Settings, BookOpen, Upload, X, CheckCircle2
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
  const [importError, setImportError] = useState<string | null>(null)
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [publicationId, setPublicationId] = useState<string | null>(null)
  const [hasNoPublications, setHasNoPublications] = useState(false)
  const [publications, setPublications] = useState<any[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importHtml, setImportHtml] = useState('')
  const [htmlMode, setHtmlMode] = useState(false)

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

      // Load all user publications
      const { data: pubs, error } = await supabase
        .from('publications')
        .select('id, name, slug')
        .eq('owner_id', session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading publications:', error)
        return
      }

      if (!pubs || pubs.length === 0) {
        setHasNoPublications(true)
        return
      }

      setPublications(pubs)

      // Try to get selected publication from localStorage
      const selectedId = typeof window !== 'undefined'
        ? localStorage.getItem('selectedPublicationId')
        : null

      if (selectedId) {
        // Verify this publication exists in the list
        const pub = pubs.find(p => p.id === selectedId)
        if (pub) {
          setPublicationId(selectedId)
          return
        }
      }

      // If no valid selection, use first publication
      if (pubs[0]) {
        setPublicationId(pubs[0].id)
        if (typeof window !== 'undefined') {
          localStorage.setItem('selectedPublicationId', pubs[0].id)
        }
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
      setHtmlMode(shouldUseHtmlMode(post.content || ''))
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
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
    const words = text.trim().split(' ').length
    return Math.max(1, Math.ceil(words / 200))
  }

  const getWordCount = (html: string) => {
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
    return text.trim().split(' ').filter(Boolean).length
  }

  const shouldUseHtmlMode = (html: string) => {
    return /<(html|head|body|style|script|link[^>]+rel=["']stylesheet["'])/i.test(html)
  }

  const extractHtmlContent = (html: string) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    const cleanText = (value?: string | null) => {
      if (!value) return ''
      return value.replace(/\s+/g, ' ').trim()
    }

    const titleFromMeta = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
    const titleFromDoc = doc.querySelector('title')?.textContent
    const titleFromH1 = doc.querySelector('h1')?.textContent
    const descriptionMeta = doc.querySelector('meta[name="description"]')?.getAttribute('content')
      || doc.querySelector('meta[property="og:description"]')?.getAttribute('content')
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
    const firstImage = doc.querySelector('img')?.getAttribute('src')
    const contentRoot = doc.querySelector('article') || doc.querySelector('main') || doc.body
    const titleText = cleanText(titleFromMeta || titleFromDoc || titleFromH1)
    const findSubtitle = () => {
      if (!contentRoot) return ''
      const headerText = contentRoot.querySelector('header h2, header p')?.textContent
      if (headerText) return cleanText(headerText)
      const paragraphs = Array.from(contentRoot.querySelectorAll('p'))
      const candidate = paragraphs.find((p) => {
        const text = cleanText(p.textContent)
        return text.length >= 40 && text.length <= 180
      })
      return candidate ? cleanText(candidate.textContent) : ''
    }
    const subtitleText = cleanText(descriptionMeta) || findSubtitle()

    const stripSelectors = ['nav', '[role="navigation"]', 'header']
    doc.querySelectorAll(stripSelectors.join(',')).forEach((node) => {
      const inContent = node.closest('article, main')
      if (!inContent) {
        node.remove()
      }
    })

    doc.body?.querySelectorAll('meta, title, base, link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((node) => {
      node.remove()
    })

    const forceWhite = doc.createElement('style')
    forceWhite.setAttribute('data-neolog', 'force-white-bg')
    forceWhite.textContent = 'html, body { background: #ffffff !important; }'
    doc.head.appendChild(forceWhite)
    if (doc.body) {
      doc.body.style.backgroundColor = '#ffffff'
    }
    if (doc.documentElement) {
      doc.documentElement.style.backgroundColor = '#ffffff'
    }

    const tailwindCdn = doc.querySelector('script[src*="cdn.tailwindcss.com"]')
    const tailwindConfig = Array.from(doc.querySelectorAll('script'))
      .find((script) => !script.src && script.textContent?.includes('tailwind.config'))
    if (tailwindCdn && tailwindConfig && tailwindConfig.compareDocumentPosition(tailwindCdn) & Node.DOCUMENT_POSITION_FOLLOWING) {
      tailwindCdn.parentNode?.insertBefore(tailwindConfig, tailwindCdn)
    }

    const normalizedHtml = `<!doctype html>\n${doc.documentElement.outerHTML}`

    return {
      title: titleText,
      subtitle: subtitleText && subtitleText !== titleText ? subtitleText : '',
      coverImage: ogImage || firstImage || '',
      contentHtml: normalizedHtml,
    }
  }

  const applyHtmlImport = (html: string) => {
    setImportError(null)
    setImportNotice(null)

    if (!html.trim()) {
      setImportError('Please provide HTML to import.')
      return
    }

    const hasExisting = Boolean(title || subtitle || content || coverImage)
    if (hasExisting) {
      const confirmReplace = window.confirm(
        'Importing HTML will replace your current title, content, and cover image. Continue?'
      )
      if (!confirmReplace) return
    }

    const parsed = extractHtmlContent(html)

    if (!parsed.contentHtml) {
      setImportError('Could not find any content to import.')
      return
    }

    setTitle(parsed.title || title)
    setSubtitle(parsed.subtitle || subtitle)
    setCoverImage(parsed.coverImage || coverImage)
    setContent(parsed.contentHtml)
    setHtmlMode(shouldUseHtmlMode(parsed.contentHtml) || html.includes('<html') || html.includes('<head'))
    setImportNotice('HTML imported. Review the content before publishing.')
  }

  const handleHtmlFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const html = typeof reader.result === 'string' ? reader.result : ''
      applyHtmlImport(html)
      setImportHtml('')
    }
    reader.onerror = () => {
      setImportError('Unable to read that file. Please try again.')
    }
    reader.readAsText(file)
  }

  const handlePasteImport = () => {
    applyHtmlImport(importHtml)
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
      const textContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
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
            <div className="mb-6 p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <h3 className="font-display text-lg mb-2">
                Create a Publication First
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
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
            <div className="mb-6 p-4 rounded-xl border border-[var(--error)]/30 bg-[var(--error)]/10 text-sm text-[var(--error)]">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/10 text-sm text-[var(--success)]">
              {success}
            </div>
          )}

          {/* Publication selector */}
          {publications.length > 0 && (
            <div className="mb-6">
              <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                Publishing to
              </label>
              <select
                value={publicationId || ''}
                onChange={(e) => {
                  const newId = e.target.value
                  setPublicationId(newId)
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('selectedPublicationId', newId)
                  }
                }}
                className="input max-w-md"
              >
                {publications.map((pub) => (
                  <option key={pub.id} value={pub.id}>
                    {pub.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Header actions */}
          <div className="flex items-center justify-between py-3 mb-8 sticky top-0 bg-[var(--bg-secondary)]/90 backdrop-blur border-b border-[var(--border-light)] z-10">
            <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
              {saving && (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  Saving...
                </span>
              )}
              {!saving && lastSaved && (
                <span className="flex items-center gap-1.5">
                  Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport((prev) => !prev)}
              className="btn btn-ghost btn-sm"
            >
              Import HTML
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="btn btn-ghost btn-sm"
            >
              <Settings size={14} />
              Publish settings
            </button>
            {profile && postId && (
              <a
                href={`/${profile.username}/${generateSlug(title)}?preview=true`}
                target="_blank"
                className="btn btn-ghost btn-sm"
              >
                Preview
              </a>
            )}

              <button
                onClick={handlePublish}
                disabled={publishing || !title || !content || !publicationId}
                className="btn btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>

          {showImport && (
            <div className="mb-8 p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display text-lg">Import HTML</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Upload an HTML file or paste raw HTML to convert it into a post.
                  </p>
                </div>
                <button
                  onClick={() => setShowImport(false)}
                  className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                  aria-label="Close import panel"
                >
                  <X size={16} />
                </button>
              </div>

              {importError && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-sm text-[var(--error)]">
                  {importError}
                </div>
              )}
              {importNotice && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/20 text-sm text-[var(--success)]">
                  {importNotice}
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-2">Upload HTML file</p>
                  <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-[var(--border-light)] rounded-xl cursor-pointer hover:border-[var(--border-medium)] transition-colors text-sm text-[var(--text-secondary)] bg-[var(--bg-secondary)]">
                    <Upload size={16} />
                    Choose HTML file
                    <input
                      type="file"
                      accept=".html,.htm,.txt"
                      onChange={handleHtmlFileImport}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-[var(--text-tertiary)] mt-2">
                    Tip: HTML with inline CSS works best. External assets may need absolute URLs.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-2">Paste HTML</p>
                  <textarea
                    value={importHtml}
                    onChange={(e) => setImportHtml(e.target.value)}
                    placeholder="Paste full HTML here..."
                    className="input font-mono min-h-[140px]"
                  />
                  <button
                    onClick={handlePasteImport}
                    className="mt-3 btn btn-primary btn-sm"
                  >
                    Import from paste
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSettings && (
            <div className="fixed inset-0 z-40">
              <div
                className="absolute inset-0 bg-black/30"
                onClick={() => setShowSettings(false)}
              />
              <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--bg-primary)] border-l border-[var(--border-light)] shadow-2xl overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-light)]">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      Publish
                    </p>
                    <h2 className="font-display text-xl">Post settings</h2>
                  </div>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                    aria-label="Close settings"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="px-6 py-6 space-y-6">
                  <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                    <div className="flex items-center justify-between text-sm text-[var(--text-tertiary)]">
                      <span>Words</span>
                      <span>{getWordCount(content).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-[var(--text-tertiary)] mt-2">
                      <span>Reading time</span>
                      <span>{calculateReadingTime(content)} min</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-[var(--text-tertiary)] mt-2">
                      <span>Editor</span>
                      <span>{htmlMode ? 'HTML' : 'Visual'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Cover image URL
                    </label>
                    <input
                      type="url"
                      value={coverImage}
                      onChange={(e) => setCoverImage(e.target.value)}
                      placeholder="https://..."
                      className="input"
                    />
                    {coverImage && (
                      <img
                        src={coverImage}
                        alt="Cover preview"
                        className="mt-3 rounded-lg border border-[var(--border-light)]"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Tags
                    </label>
                    <TagSelect selectedTags={tags} onChange={setTags} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Canonical URL
                    </label>
                    <input
                      type="url"
                      value={canonicalUrl}
                      onChange={(e) => setCanonicalUrl(e.target.value)}
                      placeholder="https://original.com/post"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Original source
                    </label>
                    <input
                      type="text"
                      value={originalSource}
                      onChange={(e) => setOriginalSource(e.target.value)}
                      placeholder="Publication name"
                      className="input"
                    />
                  </div>

                  <label className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">Premium only</p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Restrict this post to paid subscribers
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isPremium}
                      onChange={(e) => setIsPremium(e.target.checked)}
                      className="w-5 h-5 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                  </label>

                  <div className="p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)]">
                    <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Preflight checks</h3>
                    {[
                      { label: 'Title added', ok: title.trim().length >= 5 },
                      { label: 'Subtitle added', ok: subtitle.trim().length >= 5 },
                      { label: 'Cover image set', ok: coverImage.trim().length > 0 },
                      { label: 'At least 200 words', ok: getWordCount(content) >= 200 },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-2 last:mb-0">
                        <CheckCircle2 size={14} className={item.ok ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'} />
                        <span className={item.ok ? 'text-[var(--text-primary)]' : ''}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}

          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full text-4xl font-display bg-transparent border-none outline-none focus:outline-none focus:ring-0 placeholder:text-[var(--text-tertiary)] text-[var(--text-primary)] mb-4 px-0 pt-2"
            autoFocus
          />

          {/* Subtitle */}
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle (optional)"
            className="w-full text-xl text-[var(--text-secondary)] bg-transparent border-none outline-none focus:outline-none focus:ring-0 placeholder:text-[var(--text-tertiary)] mb-8 px-0"
          />

          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
              Editor mode: {htmlMode ? 'HTML' : 'Visual'}
            </span>
            <button
              onClick={() => {
                if (htmlMode) {
                  const confirmSwitch = window.confirm(
                    'Switching to the visual editor may remove advanced HTML, scripts, or styles. Continue?'
                  )
                  if (!confirmSwitch) return
                }
                setHtmlMode(!htmlMode)
              }}
              className="btn btn-ghost btn-sm"
            >
              Switch to {htmlMode ? 'Visual editor' : 'HTML editor'}
            </button>
          </div>

          {htmlMode ? (
            <div className="border border-[var(--border-light)] rounded-xl p-4 bg-[var(--bg-primary)]">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste or write raw HTML..."
                className="editor-textarea min-h-[360px]"
              />
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                Raw HTML mode preserves scripts and styles. Preview to verify the final layout.
              </p>
            </div>
          ) : (
            <RichEditor
              content={content}
              onChange={setContent}
              placeholder="Tell your story..."
              onImageUpload={handleImageUpload}
            />
          )}
      </div>
    </main>
  )
}
