'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { onSelectedPublicationIdChange, readSelectedPublicationId, writeSelectedPublicationId } from '@/lib/publicationContext'
import { ensureProfile } from '@/lib/profile'
import { RichEditor } from '@/components/RichEditor'
import { TagSelect } from '@/components/TagSelect'
import { VersionHistory } from '@/components/VersionHistory'
import { SEOAnalyzer } from '@/components/SEOAnalyzer'
import { GenerativeCover } from '@/components/GenerativeCover'
import {
  Loader2, Settings, BookOpen, Upload, X, CheckCircle2, Copy, ExternalLink
} from 'lucide-react'

type CaptureAsset = {
  id: string
  type: 'prompt' | 'image' | 'code' | 'text' | 'link' | 'quote' | 'fragment'
  title?: string | null
  content: string
  tags: string[]
  source_platform?: string | null
  source_url?: string | null
  meta: any
  created_at: string
}

type PostAssetLink = {
  id: string
  asset_id: string
  created_at: string
  assets?: CaptureAsset[]
}

export default function WritePage() {
  // Defaults
  const fallbackCover = '/default-cover.jpg'
  const defaultTags = ['writing', 'neolog', 'product']

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
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingAsset, setUploadingAsset] = useState(false)
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [videoBrief, setVideoBrief] = useState<any>(null)
  const [videoBriefLoading, setVideoBriefLoading] = useState(false)
  const [videoBriefError, setVideoBriefError] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>(defaultTags)
  const [showSettings, setShowSettings] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showCaptureDrawer, setShowCaptureDrawer] = useState(false)
  const [isPremium, setIsPremium] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [canonicalUrl, setCanonicalUrl] = useState('')
  const [originalSource, setOriginalSource] = useState('')
  const [existingStatus, setExistingStatus] = useState<string | null>(null)
  const [publishIntent, setPublishIntent] = useState<'draft' | 'publish' | 'schedule'>('draft')
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
  const [showHistory, setShowHistory] = useState(false)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [lastVersion, setLastVersion] = useState<{ title: string; content: string | null } | null>(null)
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([])
  const [showPack, setShowPack] = useState(false)
  const [packLoading, setPackLoading] = useState(false)
  const [packError, setPackError] = useState<string | null>(null)
  const [pack, setPack] = useState<any>(null)
  const [packTab, setPackTab] = useState<'x' | 'threads' | 'bluesky' | 'linkedin' | 'reddit' | 'medium' | 'devto' | 'newsletter' | 'hooks' | 'og' | 'markdown' | 'html'>('x')
  const [syndicationLoading, setSyndicationLoading] = useState(false)
  const [syndicationError, setSyndicationError] = useState<string | null>(null)
  const [syndications, setSyndications] = useState<
    Array<{
      provider: string
      status: string
      external_url: string | null
      external_id: string | null
      error_message: string | null
      created_at: string | null
      updated_at: string | null
    }>
  >([])
  const [commentUrl, setCommentUrl] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [curatedComments, setCuratedComments] = useState<any[]>([])
  const [manualHighlight, setManualHighlight] = useState('')
  const [commentFilter, setCommentFilter] = useState<'all' | 'reddit' | 'x' | 'manual'>('all')
  const [commentSort, setCommentSort] = useState<'score' | 'recent'>('score')

  const [captureDrawerAssets, setCaptureDrawerAssets] = useState<CaptureAsset[]>([])
  const [captureDrawerLoading, setCaptureDrawerLoading] = useState(false)
  const [captureDrawerQuery, setCaptureDrawerQuery] = useState('')
  const [captureDrawerType, setCaptureDrawerType] = useState<string>('')
  const [captureInsertAssetId, setCaptureInsertAssetId] = useState<string | null>(null)

  const escapeHtml = (input: string) =>
    input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const formatAssetAsHtml = (asset: CaptureAsset) => {
    const title = (asset.title || '').trim()
    const contentText = (asset.content || '').trim()
    const sourceUrl = (asset.source_url || '').trim()

    if (asset.type === 'image') {
      const src = contentText
      const alt = escapeHtml(title || 'Image')
      const caption = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : ''
      return `<figure><img src="${escapeHtml(src)}" alt="${alt}" />${caption}</figure>`
    }

    if (asset.type === 'link') {
      const href = contentText
      const label = escapeHtml(title || contentText)
      return `<p><a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a></p>`
    }

    if (asset.type === 'quote') {
      const body = escapeHtml(contentText)
      const cite = sourceUrl
        ? `<cite><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">source</a></cite>`
        : ''
      return `<blockquote><p>${body}</p>${cite}</blockquote>`
    }

    if (asset.type === 'prompt' || asset.type === 'code') {
      return `<pre><code>${escapeHtml(contentText)}</code></pre>`
    }

    // text / fragment
    return `<p>${escapeHtml(contentText)}</p>`
  }

  const loadCaptureDrawerAssets = async (opts?: { q?: string; type?: string }) => {
    if (captureDrawerLoading) return
    setCaptureDrawerLoading(true)
    try {
      const q = (opts?.q ?? captureDrawerQuery).trim()
      const t = (opts?.type ?? captureDrawerType).trim()

      const params = new URLSearchParams()
      params.set('limit', '100')
      if (q) params.set('q', q)
      if (t) params.set('type', t)
      if (publicationId) params.set('publication_id', publicationId)

      const resp = await fetch(`/api/assets?${params.toString()}`)
      const json = await resp.json().catch(() => null)
      if (!resp.ok) {
        setError(json?.error || 'Failed to load capture assets.')
        setCaptureDrawerAssets([])
        return
      }
      setCaptureDrawerAssets((json?.assets || []) as CaptureAsset[])
    } finally {
      setCaptureDrawerLoading(false)
    }
  }

  const attachAssetToPost = async (assetId: string) => {
    if (!postId) {
      setError('Save the draft first before inserting assets.')
      return false
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login?redirect=/write')
      return false
    }

    const { error } = await supabase
      .from('post_assets')
      .insert({
        post_id: postId,
        asset_id: assetId,
        added_by: session.user.id,
      })

    if (error) {
      const code = String((error as any)?.code || '')
      if (code !== '23505') {
        setError('Failed to attach asset.')
        return false
      }
    }

    await loadPostAssets(postId)
    return true
  }

  const insertAssetIntoDraft = async (asset: CaptureAsset) => {
    if (captureInsertAssetId) return

    setCaptureInsertAssetId(asset.id)
    setError(null)
    setSuccess(null)
    try {
      const ok = await attachAssetToPost(asset.id)
      if (!ok) return

      const snippet = formatAssetAsHtml(asset)
      const next = content
        ? `${content}\n\n${snippet}\n`
        : `${snippet}\n`
      setContent(next)
      setSuccess('Inserted asset.')
    } finally {
      setCaptureInsertAssetId(null)
    }
  }

  // Capture attachments
  const [captureAssets, setCaptureAssets] = useState<CaptureAsset[]>([])
  const [captureAssetsLoading, setCaptureAssetsLoading] = useState(false)
  const [postAssets, setPostAssets] = useState<PostAssetLink[]>([])
  const [postAssetsLoading, setPostAssetsLoading] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string>('')
  const [assetLinkSaving, setAssetLinkSaving] = useState(false)

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

  useEffect(() => {
    const openPack = searchParams.get('pack')
    if (openPack === '1') {
      setShowPack(true)
    }
  }, [searchParams])

  useEffect(() => {
    if (showPack && postId && !pack && !packLoading) {
      loadDistributionPack()
    }
  }, [showPack, postId, pack, packLoading])

  useEffect(() => {
    if (showPack && postId) {
      loadSyndications(postId)
    }
  }, [showPack, postId])

  useEffect(() => {
    if (!showSettings) return
    void loadCaptureAssets()
    if (postId) {
      void loadPostAssets(postId)
    }
  }, [showSettings, postId])

  const loadCaptureAssets = async () => {
    if (captureAssetsLoading) return
    setCaptureAssetsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('assets')
        .select('id, type, content, tags, meta, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (!error) {
        setCaptureAssets((data || []) as CaptureAsset[])
      }
    } finally {
      setCaptureAssetsLoading(false)
    }
  }

  const loadPostAssets = async (id: string) => {
    if (postAssetsLoading) return
    setPostAssetsLoading(true)
    try {
      const { data, error } = await supabase
        .from('post_assets')
        .select('id, asset_id, created_at, assets(id, type, content, tags, meta, created_at)')
        .eq('post_id', id)
        .order('created_at', { ascending: false })

      if (!error) {
        setPostAssets((data || []) as unknown as PostAssetLink[])
      }
    } finally {
      setPostAssetsLoading(false)
    }
  }

  const attachSelectedAsset = async () => {
    if (!postId) {
      setError('Save the draft first before attaching assets.')
      return
    }
    if (!selectedAssetId) return
    if (assetLinkSaving) return

    setAssetLinkSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { error } = await supabase
        .from('post_assets')
        .insert({
          post_id: postId,
          asset_id: selectedAssetId,
          added_by: session.user.id,
        })

      if (error) {
        const code = String((error as any)?.code || '')
        if (code !== '23505') {
          setError('Failed to attach asset.')
        }
      }

      setSelectedAssetId('')
      await loadPostAssets(postId)
    } finally {
      setAssetLinkSaving(false)
    }
  }

  const detachAsset = async (linkId: string) => {
    if (!postId) return
    if (assetLinkSaving) return

    setAssetLinkSaving(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('post_assets')
        .delete()
        .eq('id', linkId)

      if (error) {
        setError('Failed to remove asset.')
      }

      await loadPostAssets(postId)
    } finally {
      setAssetLinkSaving(false)
    }
  }

  useEffect(() => {
    if (!postId) return
    if (typeof window === 'undefined') return

    try {
      localStorage.setItem(
        'neolog:lastEditingPost',
        JSON.stringify({ id: postId, title: title || null })
      )
    } catch {
      // ignore
    }
  }, [postId, title])

  useEffect(() => {
    if (postId) {
      loadCuratedComments(postId)
    }
  }, [postId])

  useEffect(() => {
    if (!user || !publicationId) return
    loadScheduledQueue(user.id, publicationId)
  }, [user, publicationId])

  useEffect(() => {
    if (!showCaptureDrawer) return
    void loadCaptureDrawerAssets({ q: captureDrawerQuery, type: captureDrawerType })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCaptureDrawer])

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
      const selectedId = readSelectedPublicationId()

      if (selectedId) {
        // Verify this publication exists in the list
        const pub = pubs.find(p => p.id === selectedId)
        if (pub) {
          setPublicationId(selectedId)
          return
        }
      }

      // If no valid selection, use first publication as default
      if (pubs[0]) {
        setPublicationId(pubs[0].id)
        writeSelectedPublicationId(pubs[0].id)
      }
    } catch (error) {
      console.error('Error loading publication:', error)
    }
  }

  useEffect(() => {
    const unsubscribe = onSelectedPublicationIdChange((nextPublicationId) => {
      if (!nextPublicationId) return
      // Only auto-follow context when composing a new post.
      if (postId) return
      setPublicationId(nextPublicationId)
    })
    return unsubscribe
  }, [postId])

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
      // Backwards compatibility for legacy posts
      const scheduledValue = post.scheduled_at
        ? new Date(post.scheduled_at).toISOString().slice(0, 16)
        : ''
      setPostId(post.id)
      setTitle(post.title)
      setSubtitle(typeof post.subtitle === 'string' ? post.subtitle : '')
      setContent(typeof post.content === 'string' ? post.content : '')
      setCoverImage(typeof post.cover_image_url === 'string' && post.cover_image_url ? post.cover_image_url : fallbackCover)
      setCanonicalUrl(typeof post.canonical_url === 'string' ? post.canonical_url : '')
      setOriginalSource(typeof post.original_source === 'string' ? post.original_source : '')
      setIsPremium(!!post.is_premium)
      setScheduledAt(scheduledValue)
      setHtmlMode(shouldUseHtmlMode(post.content || ''))
      setExistingStatus(post.status || null)
      if (post.status === 'published') {
        setPublishIntent('publish')
      } else if (post.status === 'scheduled') {
        setPublishIntent('schedule')
      } else {
        setPublishIntent('draft')
      }

      const { data: version } = await supabase
        .from('post_versions')
        .select('title, content, content_html')
        .eq('post_id', post.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (version) {
        setLastVersion({
          title: version.title,
          content: version.content_html || version.content,
        })
      }
    }
  }

  const loadScheduledQueue = async (userId: string, publication: string) => {
    const { data } = await supabase
      .from('posts')
      .select('id, title, scheduled_at, status')
      .eq('author_id', userId)
      .eq('publication_id', publication)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(5)

    setScheduledPosts(data || [])
  }

  const loadCuratedComments = async (id: string) => {
    const { data } = await supabase
      .from('curated_comments')
      .select('id, source, author_name, author_url, body, score, source_url, created_at, is_pinned')
      .eq('post_id', id)
      .order('is_pinned', { ascending: false })
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })

    setCuratedComments(data || [])
  }

  const importComments = async () => {
    if (!postId || !commentUrl.trim()) return
    setCommentLoading(true)
    setCommentError(null)
    try {
      const response = await fetch('/api/comments/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, url: commentUrl.trim() }),
      })
      const data = await response.json()
      if (!response.ok) {
        setCommentError(data.error || 'Failed to import comments')
        return
      }
      await loadCuratedComments(postId)
    } catch (error) {
      console.error('Import comments error:', error)
      setCommentError('Failed to import comments')
    } finally {
      setCommentLoading(false)
    }
  }

  const clearCuratedComments = async () => {
    if (!postId) return
    setCommentLoading(true)
    setCommentError(null)
    try {
      await supabase
        .from('curated_comments')
        .delete()
        .eq('post_id', postId)
        .eq('author_id', user?.id || '')
      await loadCuratedComments(postId)
    } catch (error) {
      console.error('Clear comments error:', error)
      setCommentError('Failed to clear comments')
    } finally {
      setCommentLoading(false)
    }
  }

  const addManualHighlight = async () => {
    if (!postId || !manualHighlight.trim()) return
    setCommentLoading(true)
    setCommentError(null)
    try {
      await supabase
        .from('curated_comments')
        .insert({
          post_id: postId,
          author_id: user?.id,
          source: 'manual',
          author_name: profile?.display_name || profile?.username || 'You',
          body: manualHighlight.trim(),
          score: 0,
          created_at: new Date().toISOString(),
        })
      setManualHighlight('')
      await loadCuratedComments(postId)
    } catch (error) {
      console.error('Manual highlight error:', error)
      setCommentError('Failed to add highlight')
    } finally {
      setCommentLoading(false)
    }
  }

  const togglePin = async (commentId: string, pinned: boolean) => {
    if (!postId) return
    setCommentLoading(true)
    try {
      await supabase
        .from('curated_comments')
        .update({ is_pinned: !pinned })
        .eq('id', commentId)
      await loadCuratedComments(postId)
    } catch (error) {
      console.error('Pin update error:', error)
    } finally {
      setCommentLoading(false)
    }
  }

  const loadDistributionPack = async () => {
    if (!postId) return
    setPackLoading(true)
    setPackError(null)
    try {
      const response = await fetch('/api/posts/distribution-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      const data = await response.json()
      if (!response.ok) {
        setPackError(data.error || 'Failed to generate pack')
        return
      }
      setPack(data.pack)
      void loadSyndications(postId)
    } catch (error) {
      console.error('Distribution pack error:', error)
      setPackError('Failed to generate pack')
    } finally {
      setPackLoading(false)
    }
  }

  const loadSyndications = async (targetPostId: string) => {
    setSyndicationLoading(true)
    setSyndicationError(null)
    try {
      const url = `/api/posts/syndications?postId=${encodeURIComponent(targetPostId)}`
      const response = await fetch(url)
      const data = await response.json()
      if (!response.ok) {
        setSyndicationError(data.error || 'Failed to load syndication status.')
        setSyndications([])
        return
      }
      setSyndications(Array.isArray(data?.syndications) ? data.syndications : [])
    } catch (e) {
      setSyndicationError('Failed to load syndication status.')
      setSyndications([])
    } finally {
      setSyndicationLoading(false)
    }
  }

  const copyPack = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch (error) {
      console.error('Clipboard error:', error)
    }
  }

  const formatCount = (value: string, limit?: number) => {
    const count = value.length
    return limit ? `${count} / ${limit} chars` : `${count} chars`
  }

  const uploadToStorage = async (file: File) => {
    setUploadNotice(null)
    try {
      const response = await fetch('/api/storage/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sign upload.')
      }

      const putRes = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      })

      if (!putRes.ok) {
        throw new Error('Upload failed.')
      }

      return data.publicUrl as string
    } catch (error: any) {
      setUploadNotice(error.message || 'Upload failed.')
      return null
    }
  }

  const stripHtml = (input: string) =>
    input
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const handleCoverUpload = async (file: File | null) => {
    if (!file) return
    setUploadingCover(true)
    const url = await uploadToStorage(file)
    if (url) {
      setCoverImage(url)
    }
    setUploadingCover(false)
  }

  const handleAssetUpload = async (file: File | null) => {
    if (!file) return
    setUploadingAsset(true)
    const url = await uploadToStorage(file)
    if (url) {
      setAssetUrl(url)
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        // ignore clipboard errors
      }
    }
    setUploadingAsset(false)
  }

  const generateVideoBrief = async () => {
    if (!postId) return
    setVideoBriefLoading(true)
    setVideoBriefError(null)
    try {
      const response = await fetch('/api/video/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, provider: 'heygen' }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate brief.')
      }
      setVideoBrief(data.brief)
    } catch (error: any) {
      setVideoBriefError(error.message || 'Failed to generate brief.')
    } finally {
      setVideoBriefLoading(false)
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

  const calculateReadingTimeFromWords = (words: number) => {
    return Math.max(1, Math.ceil(words / 200))
  }

  const getCurrentWordCount = () => {
    return getWordCount(content)
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
    const wordCount = getCurrentWordCount()
    const readingTime = calculateReadingTimeFromWords(wordCount)
    const resolvedContent = content
    const resolvedContentHtml = content
    const resolvedContentType = 'html'
    let liveStatus = existingStatus
    if (postId) {
      const { data: latestPost } = await supabase
        .from('posts')
        .select('status')
        .eq('id', postId)
        .single()
      if (latestPost?.status) {
        liveStatus = latestPost.status
      }
    }

    const isAlreadyPublished = liveStatus === 'published'

    // High-value safeguard: do not auto-save (write) to published posts.
    // Published edits should only persist via explicit "Update", which runs
    // versioning + embedding refresh on the server.
    if (isAlreadyPublished) {
      setSaving(false)
      return
    }
    const intent = isAlreadyPublished ? 'publish' : publishIntent
    const isScheduling = intent === 'schedule' && Boolean(scheduledAt)
    const statusValue = isScheduling ? 'scheduled' : isAlreadyPublished ? 'published' : 'draft'
    
    const postData = {
      author_id: user.id,
      publication_id: publicationId,
      title,
      subtitle: subtitle || null,
      slug,
      content: resolvedContent,
      content_html: resolvedContentHtml,
      content_type: resolvedContentType,
      cover_image_url: coverImage || null,
      reading_time_minutes: readingTime,
      status: statusValue,
      scheduled_at: isScheduling ? new Date(scheduledAt).toISOString() : null,
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
  }, [user, postId, title, subtitle, content, coverImage, canonicalUrl, originalSource, isPremium, scheduledAt, existingStatus, publicationId, publishIntent])

  // Debounced auto-save
  useEffect(() => {
    if (!title) return
    if (existingStatus === 'published') return
    
    const timer = setTimeout(autoSave, 2000)
    return () => clearTimeout(timer)
  }, [title, subtitle, content, coverImage, existingStatus])

  // Publish
  const handlePublish = async () => {
    if (!user || !title || !content) {
      setError('Add a title and content before publishing.')
      return
    }

    const isAlreadyPublished = existingStatus === 'published'
    const intent = isAlreadyPublished ? 'publish' : publishIntent
    const isScheduling = intent === 'schedule'

    const preflight = [
      { label: 'Title added', ok: title.trim().length >= 5, required: true },
      { label: 'At least 200 words', ok: getWordCount(content) >= 200, required: false },
      { label: 'Cover image set', ok: coverImage.trim().length > 0, required: false },
    ]

    const missingRequired = preflight.filter((item) => item.required && !item.ok)
    if (missingRequired.length > 0) {
      setError('Add a longer title and more content before publishing.')
      return
    }

    const missingOptional = preflight.filter((item) => !item.required && !item.ok)
    if (missingOptional.length > 0) {
      const proceed = window.confirm(
        `Publish anyway? Missing: ${missingOptional.map((item) => item.label).join(', ')}`
      )
      if (!proceed) return
    }

    if (intent === 'draft') {
      setError('This post is still set to Draft. Switch the status to Publish or Schedule.')
      return
    }

    if (isScheduling && !scheduledAt) {
      setError('Pick a schedule time to schedule this post.')
      return
    }

    if (isScheduling && new Date(scheduledAt) <= new Date()) {
      setError('Schedule time must be in the future.')
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
      const wordCount = getCurrentWordCount()
      const readingTime = calculateReadingTimeFromWords(wordCount)

      // Generate excerpt
      const textContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const excerpt = textContent
        ? textContent.substring(0, 160) + (textContent.length > 160 ? '...' : '')
        : ''

      const postData: any = {
        author_id: user.id,
        publication_id: publicationId,
        title,
        subtitle: subtitle || null,
        slug,
        content: content,
        content_html: content,
        content_type: 'html',
        cover_image_url: coverImage || null,
        reading_time_minutes: readingTime,
        excerpt,
      }

      if (isScheduling) {
        postData.status = 'scheduled'
        postData.scheduled_at = new Date(scheduledAt).toISOString()
      } else if (!isAlreadyPublished) {
        // Keep as draft here; the server-side publish endpoint is responsible for
        // transitioning to published and running first-publish side-effects.
        postData.status = 'draft'
        postData.published_at = null
      }
      if (!isScheduling) {
        postData.scheduled_at = null
      }

      let finalSlug = slug
      let finalPostId = postId

      if (postId) {
        let data: any = null
        let updateError: any = null

        if (isAlreadyPublished && !isScheduling) {
          const response = await fetch('/api/posts/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId, patch: postData }),
          })
          const json = await response.json().catch(() => null)
          if (!response.ok) {
            updateError = { message: json?.error || 'Failed to update post.' }
          } else {
            data = json?.post
          }
        } else {
          const res = await supabase
            .from('posts')
            .update(postData)
            .eq('id', postId)
            .select('id, slug')
            .single()
          data = res.data
          updateError = res.error
        }

        if (updateError) {
          console.error('Update error:', updateError)
          if (updateError.message.includes('unique_post_version')) {
            const { data: livePost } = await supabase
              .from('posts')
              .select('status, slug')
              .eq('id', postId)
              .single()
            if (livePost?.status === 'published') {
              setExistingStatus('published')
              setSuccess('Post updated successfully! Redirecting...')
              setTimeout(() => {
                if (currentProfile) {
                  router.push(`/${currentProfile.username}/${livePost.slug || finalSlug}`)
                }
              }, 1000)
              setPublishing(false)
              return
            }
          }
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

      // Save tags
      if (finalPostId && tags.length > 0) {
        const { error: tagsError } = await supabase.rpc('set_post_tags', {
          p_post_id: finalPostId,
          p_tag_names: tags,
        })

        if (tagsError) {
          console.error('Tags error:', tagsError)
          // Don't fail publishing if tags fail
        }
      }

      // Send notifications via API for first publish only
      if (finalPostId && !isAlreadyPublished && !isScheduling) {
        try {
          const response = await fetch('/api/posts/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: finalPostId, notify: true, fast: true }),
          })

          const json = await response.json().catch(() => null)

          if (!response.ok) {
            console.error('Publish API error:', json || (await response.text()))
            // Don't fail publishing if notifications fail
          } else {
            // Kick off heavy publish side-effects in the background.
            // keepalive helps the request complete even if we redirect.
            void fetch('/api/posts/publish-side-effects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ postId: finalPostId, notify: true, firstPublish: true }),
              keepalive: true,
            }).catch(() => {
              // ignore
            })
          }
        } catch (notifyError) {
          console.error('Notification error:', notifyError)
          // Don't fail publishing if notifications fail
        }
      }

      // Show success and redirect to published post
      const successMessage = isScheduling
        ? 'Post scheduled successfully! Redirecting...'
        : isAlreadyPublished
        ? 'Post updated successfully! Redirecting...'
        : 'Post published successfully! Redirecting...'

      setSuccess(successMessage)
      setExistingStatus(isScheduling ? 'scheduled' : 'published')

      setTimeout(() => {
        if (currentProfile) {
          if (isScheduling) {
            router.push('/dashboard')
          } else {
            router.push(`/${currentProfile.username}/${finalSlug}`)
          }
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

  const markdownExport = stripHtml(content)
  const htmlExport = content

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    )
  }

  const resolvedIntent = existingStatus === 'published' ? 'publish' : publishIntent

  const publishLabel = existingStatus === 'published'
    ? 'Update'
    : resolvedIntent === 'schedule'
    ? 'Schedule'
    : 'Publish'

  const previousWordCount = lastVersion?.content
    ? getWordCount(lastVersion.content)
    : 0
  const currentWordCount = getCurrentWordCount()
  const wordDelta = lastVersion ? currentWordCount - previousWordCount : null
  const titleChanged = lastVersion ? lastVersion.title !== title : false

  return (
    <main className="px-6 lg:px-12 py-10">
      <div className="max-w-7xl mx-auto">
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
            <div className="mb-5">
              <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                Publishing to
              </label>
              <select
                value={publicationId || ''}
                onChange={(e) => {
                  const newId = e.target.value
                  setPublicationId(newId)
                  writeSelectedPublicationId(newId)
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

          {/* Two-column layout: Main content + Sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main content column */}
            <div className="lg:col-span-2">
              {/* Title, Subtitle, Cover Image, then Editor */}
              <div className="mb-8">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Title"
              className="font-display text-3xl md:text-4xl w-full px-4 py-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] outline-none focus:border-[var(--accent)] transition-colors mb-3"
              maxLength={120}
              autoFocus
            />
            <input
              type="text"
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder="Subtitle (optional)"
              className="text-lg w-full px-4 py-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] outline-none focus:border-[var(--accent)] transition-colors mb-4 text-[var(--text-secondary)]"
              maxLength={180}
            />
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Cover image
              </label>
              <input
                type="url"
                value={coverImage}
                onChange={e => setCoverImage(e.target.value)}
                placeholder="Paste image URL"
                className="input"
              />
              {!coverImage && (
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Default cover will be used if left blank.</p>
              )}
              <div className="flex items-center gap-3 mt-3">
                <label className="btn btn-secondary btn-sm cursor-pointer">
                  <Upload size={16} />
                  {uploadingCover ? 'Uploading...' : 'Upload cover'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => handleCoverUpload(event.target.files?.[0] || null)}
                    disabled={uploadingCover}
                  />
                </label>
                <span className="text-xs text-[var(--text-tertiary)]">
                  Uses your R2/S3 settings.
                </span>
              </div>
              {uploadNotice && (
                <p className="text-xs text-[var(--error)] mt-2">{uploadNotice}</p>
              )}
              {coverImage && (
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="mt-3 rounded-lg border border-[var(--border-light)] max-h-64"
                />
              )}
            </div>
            {/* Main Editor - moved above the fold */}
            <div className="mb-8">
              {htmlMode ? (
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Paste or write raw HTML..."
                  className="editor-textarea min-h-[360px]"
                />
              ) : (
                <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)]">
                  <RichEditor
                    content={content}
                    onChange={setContent}
                    placeholder="Tell your story..."
                    onImageUpload={handleImageUpload}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Publishing Controls */}
          <div className="mb-8 p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <h3 className="font-display text-lg mb-4">Publishing Settings</h3>

            {/* Tags */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Tags
              </label>
              <TagSelect
                selectedTags={tags}
                onChange={setTags}
              />
            </div>

            {/* Publish Intent */}
            {existingStatus !== 'published' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Status
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPublishIntent('draft')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      publishIntent === 'draft'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Save as Draft
                  </button>
                  <button
                    onClick={() => setPublishIntent('publish')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      publishIntent === 'publish'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Publish Now
                  </button>
                  <button
                    onClick={() => setPublishIntent('schedule')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      publishIntent === 'schedule'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Schedule
                  </button>
                </div>
              </div>
            )}

            {/* Schedule time - only show when schedule is selected */}
            {publishIntent === 'schedule' && existingStatus !== 'published' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Schedule for
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="input max-w-md"
                />
              </div>
            )}

            {/* Advanced Settings Toggle */}
            <div className="mb-4">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {showAdvanced ? '− Hide' : '+ Show'} advanced options
              </button>
            </div>

            {/* Advanced Options */}
            {showAdvanced && (
              <div className="space-y-4 mb-4 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
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
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    If this was originally published elsewhere
                  </p>
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
                <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] cursor-pointer">
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
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowPublishConfirm(true)}
                disabled={publishing || !title || !content}
                className="btn btn-primary"
              >
                {publishing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    {publishLabel}
                  </>
                )}
              </button>

              {postId && (
                <>
                  <button
                    onClick={() => setShowHistory(true)}
                    className="btn btn-secondary"
                  >
                    Version History
                  </button>
                </>
              )}

              <button
                onClick={() => setShowImport(!showImport)}
                className="btn btn-ghost"
              >
                <Upload size={16} />
                Import HTML
              </button>

              {lastSaved && (
                <span className="text-xs text-[var(--text-tertiary)] ml-auto">
                  Last saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          </div> {/* End main content column */}

          {/* Sidebar column */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6 space-y-6">
              {/* SEO Analyzer */}
              <SEOAnalyzer
                title={title}
                description={subtitle}
                content={content}
                className="mb-6"
              />

              {/* Live Cover Preview */}
              {(title || content) && (
                <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
                  <h3 className="font-semibold mb-3 text-sm">Cover Preview</h3>
                  <GenerativeCover
                    contentSeed={`${postId || 'new'}-${title}-${content.slice(0, 100)}`}
                    width={400}
                    height={225}
                    title={title}
                    author={profile?.display_name || profile?.username || 'Author'}
                    className="rounded-lg overflow-hidden"
                  />
                  <p className="text-xs text-[var(--text-tertiary)] mt-2">
                    Unique generative cover based on your content
                  </p>
                </div>
              )}

              {/* Distribution Previews */}
              {(title || content) && (
                <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
                  <h3 className="font-semibold mb-3 text-sm">Social Preview</h3>

                  {/* X (Twitter) Card Preview */}
                  <div className="mb-4 p-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)]">
                    <div className="text-xs text-[var(--text-tertiary)] mb-2 flex items-center gap-1">
                      <ExternalLink size={12} />
                      X (Twitter) Card
                    </div>
                    <div className="aspect-[2/1] bg-gradient-to-br from-purple-100 to-blue-100 rounded mb-2 flex items-center justify-center text-xs text-gray-500">
                      {coverImage ? (
                        <img src={coverImage} alt="Cover" className="w-full h-full object-cover rounded" />
                      ) : (
                        'Generated cover'
                      )}
                    </div>
                    <div className="text-sm font-medium line-clamp-1">{title || 'Untitled'}</div>
                    <div className="text-xs text-[var(--text-tertiary)] line-clamp-2 mt-1">
                      {subtitle || content.replace(/<[^>]*>/g, '').slice(0, 100) || 'No description'}
                    </div>
                  </div>

                  {/* LinkedIn Card Preview */}
                  <div className="p-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)]">
                    <div className="text-xs text-[var(--text-tertiary)] mb-2 flex items-center gap-1">
                      <ExternalLink size={12} />
                      LinkedIn Card
                    </div>
                    <div className="aspect-[2/1] bg-gradient-to-br from-blue-100 to-indigo-100 rounded mb-2 flex items-center justify-center text-xs text-gray-500">
                      {coverImage ? (
                        <img src={coverImage} alt="Cover" className="w-full h-full object-cover rounded" />
                      ) : (
                        'Generated cover'
                      )}
                    </div>
                    <div className="text-sm font-medium line-clamp-1">{title || 'Untitled'}</div>
                    <div className="text-xs text-[var(--text-tertiary)] line-clamp-2 mt-1">
                      {subtitle || content.replace(/<[^>]*>/g, '').slice(0, 100) || 'No description'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          </div> {/* End grid layout */}

          {showImport && (
            <div className="mb-7 p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display text-lg">Import HTML</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Paste HTML or upload a file to create a draft.
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
                    Tip: Inline CSS works best. Use absolute URLs for assets.
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



          {showCaptureDrawer && (
            <div className="fixed inset-0 z-40">
              <div
                className="absolute inset-0 bg-black/30"
                onClick={() => setShowCaptureDrawer(false)}
              />
              <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--bg-primary)] border-l border-[var(--border-light)] shadow-2xl overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-light)]">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      Compose
                    </p>
                    <h2 className="font-display text-xl">Captures</h2>
                  </div>
                  <button
                    onClick={() => setShowCaptureDrawer(false)}
                    className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                    aria-label="Close capture drawer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="px-5 py-5 space-y-4">
                  {!postId ? (
                    <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-sm text-[var(--text-secondary)]">
                      Save the draft first to insert and track asset usage.
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <input
                      value={captureDrawerQuery}
                      onChange={(e) => setCaptureDrawerQuery(e.target.value)}
                      placeholder="Search captures"
                      className="input"
                    />
                    <select
                      value={captureDrawerType}
                      onChange={(e) => setCaptureDrawerType(e.target.value)}
                      className="input"
                      aria-label="Filter asset type"
                    >
                      <option value="">All types</option>
                      <option value="text">text</option>
                      <option value="fragment">fragment</option>
                      <option value="quote">quote</option>
                      <option value="prompt">prompt</option>
                      <option value="code">code</option>
                      <option value="link">link</option>
                      <option value="image">image</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void loadCaptureDrawerAssets({ q: captureDrawerQuery, type: captureDrawerType })}
                        disabled={captureDrawerLoading}
                        className="btn btn-secondary btn-sm"
                      >
                        {captureDrawerLoading ? 'Searching…' : 'Search'}
                      </button>
                      <a href="/dashboard/captures" className="btn btn-ghost btn-sm">
                        Open Captures
                      </a>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]">
                    {captureDrawerLoading ? (
                      <div className="p-3 text-sm text-[var(--text-secondary)]">Loading…</div>
                    ) : captureDrawerAssets.length === 0 ? (
                      <div className="p-3 text-sm text-[var(--text-secondary)]">No matching assets.</div>
                    ) : (
                      <div className="divide-y divide-[var(--border-light)]">
                        {captureDrawerAssets.map((a) => {
                          const preview = String(a.content || '').replace(/\s+/g, ' ').slice(0, 120)
                          return (
                            <div key={a.id} className="p-3 space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                                    {a.type}
                                  </div>
                                  {a.title ? (
                                    <div className="text-sm font-medium text-[var(--text-primary)] break-words">
                                      {a.title}
                                    </div>
                                  ) : null}
                                  <div className="text-sm text-[var(--text-primary)] break-words">
                                    {preview}{preview.length === 120 ? '…' : ''}
                                  </div>
                                  {a.source_platform || a.source_url ? (
                                    <div className="text-xs text-[var(--text-tertiary)] pt-1 flex flex-wrap gap-2">
                                      {a.source_platform ? <span>{a.source_platform}</span> : null}
                                      {a.source_url ? (
                                        <a
                                          href={a.source_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="underline"
                                        >
                                          source
                                        </a>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <button
                                    onClick={() => void insertAssetIntoDraft(a)}
                                    disabled={captureInsertAssetId === a.id || !postId}
                                    className="btn btn-secondary btn-sm"
                                  >
                                    {captureInsertAssetId === a.id ? 'Inserting…' : 'Insert'}
                                  </button>
                                  <a href={`/dashboard/captures/${a.id}`} className="btn btn-ghost btn-sm">
                                    Details
                                  </a>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          )}


          {showHistory && postId && (
            <div className="fixed inset-0 z-40">
              <div
                className="absolute inset-0 bg-black/30"
                onClick={() => setShowHistory(false)}
              />
              <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--bg-primary)] border-l border-[var(--border-light)] shadow-2xl overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-light)]">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      History
                    </p>
                    <h2 className="font-display text-xl">Versions</h2>
                  </div>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                    aria-label="Close history"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="px-6 py-6">
                  <VersionHistory
                    postId={postId}
                    onRestore={(version) => {
                      setTitle(version.title)
                      setContent(version.content_html || version.content || '')
                      setHtmlMode(shouldUseHtmlMode(version.content_html || version.content || ''))
                      setShowHistory(false)
                      setSuccess('Version restored. Review changes before publishing.')
                    }}
                  />
                </div>
              </aside>
            </div>
          )}

          {showPublishConfirm && (
            <div className="fixed inset-0 z-40 flex items-center justify-center px-6">
              <div
                className="absolute inset-0 bg-black/30"
                onClick={() => setShowPublishConfirm(false)}
              />
              <div className="relative w-full max-w-lg rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-2xl p-4">
                <h3 className="font-display text-xl text-[var(--text-primary)] mb-2">
                  {publishLabel} post
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Review the details before you {publishLabel.toLowerCase()}.
                </p>
                <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                  <div className="flex items-center justify-between">
                    <span>Title</span>
                    <span className="text-[var(--text-primary)] font-medium truncate max-w-[220px]">
                      {title || 'Untitled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span className="text-[var(--text-primary)] font-medium">
                      {existingStatus === 'published'
                        ? 'Published'
                        : resolvedIntent === 'schedule'
                        ? 'Scheduled'
                        : resolvedIntent === 'publish'
                        ? 'Publish'
                        : 'Draft'}
                    </span>
                  </div>
                  {resolvedIntent === 'schedule' && scheduledAt && (
                    <div className="flex items-center justify-between">
                      <span>Scheduled for</span>
                      <span className="text-[var(--text-primary)] font-medium">
                        {new Date(scheduledAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span>Tags</span>
                    <span className="text-[var(--text-primary)] font-medium">
                      {tags.length} selected
                    </span>
                  </div>
                  {/* Advanced toggle */}
                  <div className="mt-4">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setShowAdvanced((v: boolean) => !v)}
                    >
                      {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
                    </button>
                  </div>
                  {showAdvanced && (
                    <div className="space-y-3 mt-3 border-t border-[var(--border-light)] pt-3">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                          Canonical URL
                        </label>
                        <input
                          type="url"
                          value={canonicalUrl}
                          onChange={e => setCanonicalUrl(e.target.value)}
                          placeholder="https://original.com/post"
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                          Original source
                        </label>
                        <input
                          type="text"
                          value={originalSource}
                          onChange={e => setOriginalSource(e.target.value)}
                          placeholder="Publication name"
                          className="input"
                        />
                      </div>
                      <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">Premium only</p>
                          <p className="text-xs text-[var(--text-tertiary)]">
                            Restrict this post to paid subscribers
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={isPremium}
                          onChange={e => setIsPremium(e.target.checked)}
                          className="w-5 h-5 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)]"
                        />
                      </label>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                          Schedule time
                        </label>
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={e => setScheduledAt(e.target.value)}
                          disabled={existingStatus === 'published' || resolvedIntent !== 'schedule'}
                          className="input"
                        />
                        {resolvedIntent !== 'schedule' && (
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Choose Schedule to set a publish time.
                          </p>
                        )}
                        {existingStatus === 'published' && (
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Scheduling is only available for drafts.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {lastVersion && (
                  <div className="mt-4 p-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] text-sm text-[var(--text-secondary)]">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                      Changes since last version
                    </p>
                    <div className="flex items-center justify-between">
                      <span>Title</span>
                      <span className="text-[var(--text-primary)] font-medium">
                        {titleChanged ? 'Updated' : 'No change'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span>Word count</span>
                      <span className="text-[var(--text-primary)] font-medium">
                        {currentWordCount.toLocaleString()}
                        {wordDelta !== null && (
                          <span className="text-[var(--text-tertiary)]">
                            {' '}({wordDelta >= 0 ? '+' : ''}{wordDelta})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 mt-5">
                  <button
                    onClick={() => setShowPublishConfirm(false)}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowPublishConfirm(false)
                      handlePublish()
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    {publishLabel}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showPack && (
            <div className="fixed inset-0 z-40 flex items-center justify-center px-6">
              <div
                className="absolute inset-0 bg-black/30"
                onClick={() => setShowPack(false)}
              />
              <div className="relative w-full max-w-3xl rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Distribution pack</p>
                    <h3 className="font-display text-xl text-[var(--text-primary)]">
                      {title || 'Untitled'}
                    </h3>
                    {pack?.model && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        Generated with {pack.model === 'fallback' ? 'fallback copy' : pack.model}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowPack(false)}
                    className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                    aria-label="Close pack"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {([
                    { id: 'x', label: 'X Thread' },
                    { id: 'threads', label: 'Threads' },
                    { id: 'bluesky', label: 'Bluesky' },
                    { id: 'linkedin', label: 'LinkedIn' },
                    { id: 'reddit', label: 'Reddit' },
                    { id: 'medium', label: 'Medium' },
                    { id: 'devto', label: 'Dev.to' },
                    { id: 'newsletter', label: 'Newsletter' },
                    { id: 'hooks', label: 'Hooks' },
                    { id: 'markdown', label: 'Markdown' },
                    { id: 'html', label: 'HTML' },
                    { id: 'og', label: 'OG Image' },
                  ] as const).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setPackTab(item.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        packTab === item.id
                          ? 'bg-[var(--accent)] text-[var(--text-inverse)] border-[var(--accent)]'
                          : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-[var(--border-medium)]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                  <button
                    onClick={loadDistributionPack}
                    disabled={!postId || packLoading}
                    className="ml-auto px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border-light)] text-[var(--text-secondary)] hover:border-[var(--border-medium)]"
                  >
                    {packLoading ? 'Refreshing…' : 'Refresh pack'}
                  </button>
                </div>

                {postId && (
                  <div className="mb-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Syndication</p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          Medium + Dev.to results for this post.
                        </p>
                      </div>
                      <button
                        onClick={() => loadSyndications(postId)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border-light)] text-[var(--text-secondary)] hover:border-[var(--border-medium)]"
                        disabled={syndicationLoading}
                      >
                        {syndicationLoading ? 'Loading…' : 'Refresh'}
                      </button>
                    </div>

                    {syndicationError && (
                      <div className="mt-2 text-xs text-[var(--error)]">
                        {syndicationError}
                      </div>
                    )}

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {(
                        syndications.length > 0
                          ? syndications
                          : [
                              { provider: 'medium', status: 'not_configured' },
                              { provider: 'devto', status: 'not_configured' },
                            ]
                      ).map((row: any) => {
                        const providerLabel = row.provider === 'devto' ? 'Dev.to' : row.provider === 'medium' ? 'Medium' : row.provider
                        const status = String(row.status || '')
                        const statusTone =
                          status === 'sent'
                            ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20'
                            : status === 'error'
                              ? 'bg-[var(--error)]/10 text-[var(--error)] border-[var(--error)]/20'
                              : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)] border-[var(--border-light)]'

                        return (
                          <div key={`${row.provider}`} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-[var(--text-primary)]">{providerLabel}</p>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] border ${statusTone}`}>
                                {status === 'not_configured' ? 'Not configured' : status}
                              </span>
                            </div>
                            {row.external_url && (
                              <a
                                href={row.external_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block mt-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline break-all"
                              >
                                {row.external_url}
                              </a>
                            )}
                            {row.error_message && (
                              <p className="mt-2 text-xs text-[var(--error)]">{row.error_message}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {!postId && (
                  <div className="py-6 text-sm text-[var(--text-tertiary)]">
                    Save this post first to generate a distribution pack.
                  </div>
                )}
                {packLoading && (
                  <div className="py-10 text-center text-sm text-[var(--text-tertiary)]">
                    Generating pack in the background…
                  </div>
                )}
                {packError && (
                  <div className="mb-4 p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-sm text-[var(--error)]">
                    {packError}
                  </div>
                )}
                {!packLoading && postId && pack && (
                  <div className="space-y-4">
                    {packTab === 'x' && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-2">
                          {formatCount((pack.x_thread || []).join('\n\n'))}
                        </p>
                        <textarea
                          className="input min-h-[180px]"
                          value={(pack.x_thread || []).map((tweet: string, index: number) => `${index + 1}. ${tweet}`).join('\n\n')}
                          readOnly
                        />
                        <button
                          onClick={() => copyPack((pack.x_thread || []).join('\n\n'))}
                          className="mt-3 btn btn-secondary btn-sm"
                        >
                          Copy thread
                        </button>
                      </div>
                    )}
                    {packTab === 'threads' && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-2">
                          {formatCount(pack.threads_post || '', 500)}
                        </p>
                        <textarea
                          className="input min-h-[180px]"
                          value={pack.threads_post || ''}
                          readOnly
                        />
                        <button
                          onClick={() => copyPack(pack.threads_post || '')}
                          className="mt-3 btn btn-secondary btn-sm"
                        >
                          Copy Threads
                        </button>
                      </div>
                    )}
                    {packTab === 'bluesky' && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-2">
                          {formatCount(pack.bluesky_post || '', 300)}
                        </p>
                        <textarea
                          className="input min-h-[180px]"
                          value={pack.bluesky_post || ''}
                          readOnly
                        />
                        <button
                          onClick={() => copyPack(pack.bluesky_post || '')}
                          className="mt-3 btn btn-secondary btn-sm"
                        >
                          Copy Bluesky
                        </button>
                      </div>
                    )}
                    {packTab === 'linkedin' && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-2">
                          {formatCount(pack.linkedin_post || '')}
                        </p>
                        <textarea
                          className="input min-h-[180px]"
                          value={pack.linkedin_post || ''}
                          readOnly
                        />
                        <button
                          onClick={() => copyPack(pack.linkedin_post || '')}
                          className="mt-3 btn btn-secondary btn-sm"
                        >
                          Copy LinkedIn
                        </button>
                      </div>
                    )}
                    {packTab === 'reddit' && (
                      <div className="space-y-3">
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {formatCount(pack.reddit_title || '', 300)}
                        </p>
                        <input className="input" value={pack.reddit_title || ''} readOnly />
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {formatCount(pack.reddit_body || '')}
                        </p>
                        <textarea className="input min-h-[180px]" value={pack.reddit_body || ''} readOnly />
                        <button
                          onClick={() => copyPack(`${pack.reddit_title}\n\n${pack.reddit_body}`)}
                          className="btn btn-secondary btn-sm"
                        >
                          Copy Reddit
                        </button>
                      </div>
                    )}
                    {packTab === 'medium' && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-2">
                          {formatCount(pack.medium_html || '')}
                        </p>
                        <textarea
                          className="input min-h-[200px]"
                          value={pack.medium_html || ''}
                          readOnly
                        />
                        <button
                          onClick={() => copyPack(pack.medium_html || '')}
                          className="mt-3 btn btn-secondary btn-sm"
                        >
                          Copy Medium HTML
                        </button>
                      </div>
                    )}
                    {packTab === 'devto' && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-2">
                          {formatCount(pack.devto_markdown || '')}
                        </p>
                        <textarea
                          className="input min-h-[200px]"
                          value={pack.devto_markdown || ''}
                          readOnly
                        />
                        <button
                          onClick={() => copyPack(pack.devto_markdown || '')}
                          className="mt-3 btn btn-secondary btn-sm"
                        >
                          Copy Dev.to Markdown
                        </button>
                      </div>
                    )}
                    {packTab === 'newsletter' && (
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-[var(--text-tertiary)] mb-2">
                            Subject ({formatCount(pack.newsletter_subject || '', 70)})
                          </p>
                          <input className="input" value={pack.newsletter_subject || ''} readOnly />
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-tertiary)] mb-2">
                            Preview ({formatCount(pack.newsletter_preview || '', 140)})
                          </p>
                          <input className="input" value={pack.newsletter_preview || ''} readOnly />
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-tertiary)] mb-2">
                            Body ({formatCount(pack.newsletter_body || '')})
                          </p>
                          <textarea className="input min-h-[200px]" value={pack.newsletter_body || ''} readOnly />
                        </div>
                        <button
                          onClick={() => copyPack([pack.newsletter_subject, pack.newsletter_preview, pack.newsletter_body].filter(Boolean).join('\n\n'))}
                          className="btn btn-secondary btn-sm"
                        >
                          Copy newsletter
                        </button>
                      </div>
                    )}
                    {packTab === 'hooks' && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-2">
                          {formatCount((pack.hooks || []).join('\n'))}
                        </p>
                        <textarea
                          className="input min-h-[160px]"
                          value={(pack.hooks || []).join('\n')}
                          readOnly
                        />
                        <button
                          onClick={() => copyPack((pack.hooks || []).join('\n'))}
                          className="mt-3 btn btn-secondary btn-sm"
                        >
                          Copy hooks
                        </button>
                      </div>
                    )}
                    {packTab === 'markdown' && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-2">
                          {formatCount(markdownExport)}
                        </p>
                        <textarea
                          className="input min-h-[200px]"
                          value={markdownExport}
                          readOnly
                        />
                        <button
                          onClick={() => copyPack(markdownExport)}
                          className="mt-3 btn btn-secondary btn-sm"
                        >
                          Copy markdown
                        </button>
                      </div>
                    )}
                    {packTab === 'html' && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-2">
                          {formatCount(htmlExport)}
                        </p>
                        <textarea
                          className="input min-h-[200px]"
                          value={htmlExport}
                          readOnly
                        />
                        <button
                          onClick={() => copyPack(htmlExport)}
                          className="mt-3 btn btn-secondary btn-sm"
                        >
                          Copy HTML
                        </button>
                      </div>
                    )}
                    {packTab === 'og' && (
                      <div className="space-y-3">
                        {pack.og_image_url ? (
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">OG (1200×630)</p>
                            <img src={pack.og_image_url} alt="OG preview" className="rounded-xl border border-[var(--border-light)]" />
                            <button
                              onClick={() => copyPack(pack.og_image_url || '')}
                              className="btn btn-secondary btn-sm"
                            >
                              Copy OG image URL
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-[var(--text-tertiary)]">No OG image generated.</p>
                        )}

                        {(pack as any).og_square_url && (
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Square (1080×1080)</p>
                            <img
                              src={(pack as any).og_square_url}
                              alt="OG square preview"
                              className="rounded-xl border border-[var(--border-light)] max-w-[420px]"
                            />
                            <button
                              onClick={() => copyPack((pack as any).og_square_url || '')}
                              className="btn btn-secondary btn-sm"
                            >
                              Copy square URL
                            </button>
                          </div>
                        )}

                        {(pack as any).og_story_url && (
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Story (1080×1920)</p>
                            <img
                              src={(pack as any).og_story_url}
                              alt="OG story preview"
                              className="rounded-xl border border-[var(--border-light)] max-w-[320px]"
                            />
                            <button
                              onClick={() => copyPack((pack as any).og_story_url || '')}
                              className="btn btn-secondary btn-sm"
                            >
                              Copy story URL
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

      </div>
    </main>
  )
}
