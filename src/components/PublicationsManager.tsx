'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BookOpen, Plus, Settings, Users, BarChart3,
  Edit, Trash2, ExternalLink, Loader2, Check, X
} from 'lucide-react'
import Link from 'next/link'

interface Publication {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  cover_url: string | null
  custom_domain: string | null
  primary_color: string
  accent_color: string
  is_active: boolean
  total_posts: number
  total_subscribers: number
  total_views: number
  created_at: string
}

export function PublicationsManager() {
  const [publications, setPublications] = useState<Publication[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [creating, setCreating] = useState(false)

  const [newPub, setNewPub] = useState({
    name: '',
    slug: '',
    description: '',
  })

  const supabase = createClient()

  useEffect(() => {
    loadPublications()
  }, [])

  const loadPublications = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('publications')
        .select('*')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (data) setPublications(data)
    } catch (error) {
      console.error('Error loading publications:', error)
    } finally {
      setLoading(false)
    }
  }

  const createPublication = async () => {
    if (!newPub.name || !newPub.slug) {
      alert('Please fill in name and slug')
      return
    }

    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('publications')
        .insert({
          owner_id: session.user.id,
          name: newPub.name,
          slug: newPub.slug,
          description: newPub.description || null,
        })
        .select()
        .single()

      if (error) throw error

      if (data) {
        setPublications([data, ...publications])
        setNewPub({ name: '', slug: '', description: '' })
        setShowCreateDialog(false)
      }
    } catch (error) {
      console.error('Error creating publication:', error)
      alert('Failed to create publication. Slug might be taken.')
    } finally {
      setCreating(false)
    }
  }

  const deletePublication = async (id: string) => {
    if (!confirm('Delete this publication? All associated posts will be removed.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('publications')
        .delete()
        .eq('id', id)

      if (error) throw error

      setPublications(publications.filter(p => p.id !== id))
    } catch (error) {
      console.error('Error deleting publication:', error)
      alert('Failed to delete publication')
    }
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 pt-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Workspace</p>
          <h1 className="font-display text-3xl text-[var(--text-primary)]">Publications</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage all your blogs and publications in one place.
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="btn btn-primary btn-sm"
        >
          <Plus size={16} />
          New publication
        </button>
      </div>

      {/* Publications grid */}
      {publications.length === 0 ? (
        <div className="text-center py-16 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)] shadow-sm">
          <BookOpen size={48} className="mx-auto mb-4 text-[var(--text-tertiary)] opacity-50" />
          <h3 className="font-semibold text-lg mb-2 text-[var(--text-primary)]">No publications yet</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Create your first publication to start publishing
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="btn btn-primary btn-sm"
          >
            <Plus size={16} />
            Create publication
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {publications.map(pub => (
            <div
              key={pub.id}
              className="group relative p-6 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:shadow-lg transition-all"
            >
              {/* Cover/Logo */}
              <div className="mb-4">
                {pub.logo_url ? (
                  <img
                    src={pub.logo_url}
                    alt={pub.name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-lg flex items-center justify-center font-display font-bold text-2xl text-white"
                    style={{ backgroundColor: pub.primary_color }}
                  >
                    {pub.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="mb-4">
                <h3 className="font-semibold text-lg mb-1 text-[var(--text-primary)]">{pub.name}</h3>
                <p className="text-sm text-[var(--text-tertiary)] mb-2">
                  @{pub.slug}
                </p>
                {pub.description && (
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                    {pub.description}
                  </p>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4 pb-4 border-b border-[var(--border-light)]">
                <div>
                  <p className="text-xl font-semibold text-[var(--text-primary)] leading-tight">{pub.total_posts}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Posts</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-[var(--text-primary)] leading-tight">{pub.total_subscribers}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Subscribers</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-[var(--text-primary)] leading-tight">{pub.total_views}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Views</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Link
                  href={`/publications/${pub.slug}`}
                  className="flex-1 btn btn-secondary btn-sm"
                >
                  <BookOpen size={14} />
                  View
                </Link>
                <Link
                  href={`/publications/${pub.slug}/settings`}
                  className="btn btn-secondary btn-sm"
                  title="Settings"
                >
                  <Settings size={14} />
                </Link>
                <Link
                  href={`/publications/${pub.slug}/analytics`}
                  className="btn btn-secondary btn-sm"
                  title="Analytics"
                >
                  <BarChart3 size={14} />
                </Link>
                <button
                  onClick={() => deletePublication(pub.id)}
                  className="btn btn-secondary btn-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Status badge */}
              {!pub.is_active && (
                <div className="absolute top-3 right-3">
                  <span className="px-2 py-1 text-xs rounded-full bg-yellow-500/10 text-yellow-500">
                    Inactive
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowCreateDialog(false)}
          />

          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-2xl shadow-2xl max-w-lg w-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-[var(--border-light)]">
                <h2 className="text-2xl font-display font-bold">
                  Create New Publication
                </h2>
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Publication Name *
                  </label>
                  <input
                    type="text"
                    value={newPub.name}
                    onChange={(e) => {
                      setNewPub({
                        ...newPub,
                        name: e.target.value,
                        slug: newPub.slug || generateSlug(e.target.value)
                      })
                    }}
                    placeholder="My Awesome Blog"
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Slug * (URL: /publications/your-slug)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-tertiary)]">/publications/</span>
                    <input
                      type="text"
                      value={newPub.slug}
                      onChange={(e) => setNewPub({
                        ...newPub,
                        slug: generateSlug(e.target.value)
                      })}
                      placeholder="my-awesome-blog"
                      className="input flex-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Description
                  </label>
                  <textarea
                    value={newPub.description}
                    onChange={(e) => setNewPub({
                      ...newPub,
                      description: e.target.value
                    })}
                    placeholder="Tell readers what your publication is about..."
                    className="input min-h-[100px]"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 p-6 border-t border-[var(--border-light)]">
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={createPublication}
                  disabled={creating || !newPub.name || !newPub.slug}
                  className="btn btn-primary"
                >
                  {creating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      Create Publication
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
