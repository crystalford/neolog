'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BookOpen, Plus, Edit2, Trash2, GripVertical,
  Loader2, ArrowUp, ArrowDown, X
} from 'lucide-react'
import Link from 'next/link'

interface Series {
  id: string
  title: string
  description: string | null
  slug: string
  created_at: string
  post_count: number
}

interface SeriesPost {
  id: string
  title: string
  slug: string
  position: number
}

export function SeriesManager() {
  const [series, setSeries] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingSeries, setEditingSeries] = useState<Series | null>(null)
  const [managingPosts, setManagingPosts] = useState<string | null>(null)
  const [seriesPosts, setSeriesPosts] = useState<SeriesPost[]>([])

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadSeries()
  }, [])

  const loadSeries = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('series')
        .select(`
          id,
          title,
          description,
          slug,
          created_at,
          series_posts(count)
        `)
        .eq('author_id', session.user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        setSeries(data.map(s => ({
          ...s,
          post_count: s.series_posts?.[0]?.count || 0,
        })))
      }
    } catch (error) {
      console.error('Error loading series:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSeriesPosts = async (seriesId: string) => {
    try {
      const { data, error } = await supabase
        .from('series_posts')
        .select(`
          id,
          position,
          post:posts(id, title, slug)
        `)
        .eq('series_id', seriesId)
        .order('position', { ascending: true })

      if (error) throw error

      if (data) {
        setSeriesPosts(data.map(sp => {
          const post = Array.isArray(sp.post) ? sp.post[0] : sp.post
          return {
            id: post?.id || '',
            title: post?.title || '',
            slug: post?.slug || '',
            position: sp.position,
          }
        }))
      }
    } catch (error) {
      console.error('Error loading series posts:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')

      if (editingSeries) {
        // Update existing series
        const { error } = await supabase
          .from('series')
          .update({
            title,
            description: description || null,
            slug,
          })
          .eq('id', editingSeries.id)

        if (error) throw error
      } else {
        // Create new series
        const { error } = await supabase
          .from('series')
          .insert({
            author_id: session.user.id,
            title,
            description: description || null,
            slug,
          })

        if (error) throw error
      }

      // Reset form
      setTitle('')
      setDescription('')
      setShowCreateForm(false)
      setEditingSeries(null)

      // Reload series
      loadSeries()
    } catch (error) {
      console.error('Error saving series:', error)
      alert('Failed to save series')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (seriesId: string) => {
    if (!confirm('Delete this series? Posts will not be deleted.')) return

    try {
      const { error } = await supabase
        .from('series')
        .delete()
        .eq('id', seriesId)

      if (error) throw error

      loadSeries()
    } catch (error) {
      console.error('Error deleting series:', error)
      alert('Failed to delete series')
    }
  }

  const movePost = async (seriesId: string, postId: string, direction: 'up' | 'down') => {
    const currentIndex = seriesPosts.findIndex(p => p.id === postId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= seriesPosts.length) return

    const newPosts = [...seriesPosts]
    const [movedPost] = newPosts.splice(currentIndex, 1)
    newPosts.splice(newIndex, 0, movedPost)

    // Update positions
    const updates = newPosts.map((post, index) => ({
      series_id: seriesId,
      post_id: post.id,
      position: index,
    }))

    try {
      // Delete all existing positions
      await supabase
        .from('series_posts')
        .delete()
        .eq('series_id', seriesId)

      // Insert new positions
      await supabase
        .from('series_posts')
        .insert(updates)

      setSeriesPosts(newPosts)
    } catch (error) {
      console.error('Error reordering posts:', error)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <BookOpen size={32} />
          Stacks & Collections
        </h1>
        <button
          onClick={() => {
            setShowCreateForm(true)
            setEditingSeries(null)
            setTitle('')
            setDescription('')
          }}
          className="btn btn-primary"
        >
          <Plus size={16} />
          New Stack
        </button>
      </div>

      {/* Create/Edit form */}
      {(showCreateForm || editingSeries) && (
        <div className="mb-8 p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">
              {editingSeries ? 'Edit Stack' : 'Create New Stack'}
            </h3>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setEditingSeries(null)
              }}
              className="p-1 hover:bg-[var(--bg-tertiary)] rounded"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Building a SaaS App"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description <span className="text-[var(--text-tertiary)]">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of this stack..."
                className="input w-full min-h-[100px] resize-y"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false)
                  setEditingSeries(null)
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  editingSeries ? 'Update Stack' : 'Create Stack'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Series list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : series.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg mb-2">No stacks yet</p>
          <p className="text-sm">
            Organize your posts into stacks to help readers follow along
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {series.map((s) => (
            <div
              key={s.id}
              className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-xl mb-1">{s.title}</h3>
                  {s.description && (
                    <p className="text-[var(--text-secondary)] text-sm mb-2">
                      {s.description}
                    </p>
                  )}
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {s.post_count} post{s.post_count !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingSeries(s)
                      setTitle(s.title)
                      setDescription(s.description || '')
                      setShowCreateForm(false)
                    }}
                    className="p-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (managingPosts === s.id) {
                        setManagingPosts(null)
                      } else {
                        setManagingPosts(s.id)
                        loadSeriesPosts(s.id)
                      }
                    }}
                    className="p-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <GripVertical size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-2 rounded hover:bg-[var(--bg-tertiary)] text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Manage posts */}
              {managingPosts === s.id && (
                <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
                  <h4 className="text-sm font-medium mb-3">Posts in this stack</h4>
                  {seriesPosts.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)]">
                      No posts in this stack yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {seriesPosts.map((post, index) => (
                        <div
                          key={post.id}
                          className="flex items-center gap-3 p-3 bg-[var(--bg-tertiary)] rounded-lg"
                        >
                          <span className="text-sm font-medium text-[var(--text-tertiary)] w-6">
                            {index + 1}
                          </span>
                          <Link
                            href={`/write?edit=${post.id}`}
                            className="flex-1 text-sm hover:text-[var(--accent)] transition-colors"
                          >
                            {post.title}
                          </Link>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => movePost(s.id, post.id, 'up')}
                              disabled={index === 0}
                              className="p-1 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              onClick={() => movePost(s.id, post.id, 'down')}
                              disabled={index === seriesPosts.length - 1}
                              className="p-1 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
