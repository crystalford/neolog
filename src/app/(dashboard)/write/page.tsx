'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { readSelectedPublicationId, writeSelectedPublicationId } from '@/lib/publicationContext'
import { RichEditor } from '@/components/RichEditor'
import { Loader2, Settings, X, CheckCircle2, ChevronDown } from 'lucide-react'

export default function WritePageV2() {
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
  const [content, setContent] = useState('')
  const [publicationId, setPublicationId] = useState<string | null>(null)
  const [publications, setPublications] = useState<any[]>([])
  const [existingStatus, setExistingStatus] = useState<string | null>(null)

  // UI state
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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
    const { data: pubs } = await supabase
      .from('publications')
      .select('id, name, slug')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: false })

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
        setContent(post.content || '')
        setPublicationId(post.publication_id)
        setExistingStatus(post.status)
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
  }, [title, content, user])

  const saveDraft = async () => {
    if (!user || !title || !publicationId) return
    if (existingStatus === 'published') return // Don't auto-save published posts

    setSaving(true)

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80)

    const postData = {
      author_id: user.id,
      publication_id: publicationId,
      title,
      content,
      content_html: content,
      content_type: 'html',
      slug,
      status: 'draft',
    }

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
      }
    }

    setSaving(false)
    setLastSaved(new Date())
  }

  const handlePublish = async () => {
    if (!user || !title || !content || !publicationId) return

    setPublishing(true)
    setError(null)

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80)

    const postData = {
      author_id: user.id,
      publication_id: publicationId,
      title,
      content,
      content_html: content,
      content_type: 'html',
      slug,
      status: 'published',
      published_at: existingStatus === 'published' ? undefined : new Date().toISOString(),
    }

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
    }

    setPublishing(false)
    setSuccess(existingStatus === 'published' ? 'Post updated!' : 'Post published!')
    setExistingStatus('published')

    // Redirect to published post
    setTimeout(() => {
      if (profile?.username) {
        router.push(`/${profile.username}/${slug}`)
      }
    }, 1000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (publications.length === 0) {
    return (
      <main className="px-6 py-10 max-w-4xl mx-auto">
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
    )
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/posts" className="text-sm text-gray-600 hover:text-gray-900">
              ← All posts
            </Link>

            {/* Publication selector */}
            <div className="relative">
              <select
                value={publicationId || ''}
                onChange={(e) => {
                  const newId = e.target.value
                  setPublicationId(newId)
                  writeSelectedPublicationId(newId)
                }}
                className="text-sm border-none bg-transparent text-gray-600 hover:text-gray-900 cursor-pointer pr-6 appearance-none"
              >
                {publications.map((pub) => (
                  <option key={pub.id} value={pub.id}>
                    {pub.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
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

            {/* Settings button */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Settings"
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
                  Publishing...
                </>
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
        <div className="max-w-4xl mx-auto px-6 pt-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        </div>
      )}
      {success && (
        <div className="max-w-4xl mx-auto px-6 pt-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {success}
          </div>
        </div>
      )}

      {/* Main editor */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          className="w-full text-5xl font-bold border-none outline-none placeholder-gray-300 mb-8"
          autoFocus
        />

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

      {/* Settings sidebar */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto">
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
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Post Status
                  </label>
                  <div className="text-sm text-gray-600">
                    {existingStatus === 'published' ? 'Published' : 'Draft'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Publication
                  </label>
                  <select
                    value={publicationId || ''}
                    onChange={(e) => {
                      const newId = e.target.value
                      setPublicationId(newId)
                      writeSelectedPublicationId(newId)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {publications.map((pub) => (
                      <option key={pub.id} value={pub.id}>
                        {pub.name}
                      </option>
                    ))}
                  </select>
                </div>

                {postId && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Post URL
                    </label>
                    <div className="text-sm text-gray-600 break-all">
                      {profile?.username && existingStatus === 'published' && (
                        <a
                          href={`/${profile.username}/${title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View post →
                        </a>
                      )}
                    </div>
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
