'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Link as LinkIcon, Copy, Check, Eye, EyeOff, Trash2,
  Calendar, Loader2, X, Share2
} from 'lucide-react'

interface DraftShareDialogProps {
  postId: string
  isOpen: boolean
  onClose: () => void
}

interface ShareLink {
  id: string
  token: string
  url: string
  created_at: string
  expires_at: string | null
  view_count: number
  is_active: boolean
}

export function DraftShareDialog({ postId, isOpen, onClose }: DraftShareDialogProps) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [expiresIn, setExpiresIn] = useState<number>(7) // days

  const supabase = createClient()

  useEffect(() => {
    if (isOpen) {
      loadShareLinks()
    }
  }, [isOpen, postId])

  const loadShareLinks = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('draft_share_links')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        setLinks(
          data.map(link => ({
            ...link,
            url: `${window.location.origin}/draft/${link.token}`,
          }))
        )
      }
    } catch (error) {
      console.error('Error loading share links:', error)
    } finally {
      setLoading(false)
    }
  }

  const createShareLink = async () => {
    setCreating(true)
    try {
      const token = generateToken()
      const expiresAt = expiresIn > 0
        ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000).toISOString()
        : null

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('draft_share_links')
        .insert({
          post_id: postId,
          token,
          created_by: session.user.id,
          expires_at: expiresAt,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error

      if (data) {
        setLinks([
          {
            ...data,
            url: `${window.location.origin}/draft/${data.token}`,
          },
          ...links,
        ])
      }
    } catch (error) {
      console.error('Error creating share link:', error)
      alert('Failed to create share link')
    } finally {
      setCreating(false)
    }
  }

  const toggleLinkStatus = async (linkId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('draft_share_links')
        .update({ is_active: !isActive })
        .eq('id', linkId)

      if (error) throw error

      setLinks(links.map(l =>
        l.id === linkId ? { ...l, is_active: !isActive } : l
      ))
    } catch (error) {
      console.error('Error toggling link status:', error)
    }
  }

  const deleteLink = async (linkId: string) => {
    if (!confirm('Delete this share link?')) return

    try {
      const { error } = await supabase
        .from('draft_share_links')
        .delete()
        .eq('id', linkId)

      if (error) throw error

      setLinks(links.filter(l => l.id !== linkId))
    } catch (error) {
      console.error('Error deleting link:', error)
    }
  }

  const copyToClipboard = async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(link.id)
      setTimeout(() => setCopied(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const generateToken = () => {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 32)
  }

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[var(--border-light)]">
            <div>
              <h2 className="text-2xl font-display font-bold flex items-center gap-2">
                <Share2 size={24} />
                Share Draft
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Create a link to share your draft with others
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
              aria-label="Close share dialog"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Create new link */}
            <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <h3 className="font-semibold mb-4">Create New Share Link</h3>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">
                    Link expires in
                  </label>
                  <select
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(Number(e.target.value))}
                    className="input"
                  >
                    <option value={1}>1 day</option>
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={0}>Never</option>
                  </select>
                </div>
                <button
                  onClick={createShareLink}
                  disabled={creating}
                  className="btn btn-primary"
                >
                  {creating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <LinkIcon size={16} />
                      Create Link
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Existing links */}
            <div>
              <h3 className="font-semibold mb-4">Active Share Links</h3>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
                </div>
              ) : links.length === 0 ? (
                <div className="text-center py-12 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
                  <LinkIcon size={48} className="mx-auto mb-4 text-[var(--text-tertiary)] opacity-50" />
                  <p className="text-[var(--text-secondary)]">
                    No share links yet. Create one to share this draft.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {links.map(link => {
                    const expired = isExpired(link.expires_at)
                    return (
                      <div
                        key={link.id}
                        className={`p-4 rounded-xl border transition-all ${
                          !link.is_active || expired
                            ? 'bg-[var(--bg-tertiary)] border-[var(--border-light)] opacity-60'
                            : 'bg-[var(--bg-secondary)] border-[var(--border-light)] hover:border-[var(--border-medium)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              {link.is_active && !expired ? (
                                <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-500">
                                  Active
                                </span>
                              ) : expired ? (
                                <span className="px-2 py-1 text-xs rounded-full bg-red-500/10 text-red-500">
                                  Expired
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs rounded-full bg-gray-500/10 text-gray-500">
                                  Inactive
                                </span>
                              )}
                              <span className="text-xs text-[var(--text-tertiary)]">
                                Created {new Date(link.created_at).toLocaleDateString()}
                              </span>
                            </div>

                            <code className="block text-sm font-mono px-3 py-2 bg-[var(--bg-primary)] rounded border border-[var(--border-light)] mb-2 truncate">
                              {link.url}
                            </code>

                            <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                              <span className="flex items-center gap-1">
                                <Eye size={12} />
                                {link.view_count || 0} views
                              </span>
                              {link.expires_at && (
                                <span className="flex items-center gap-1">
                                  <Calendar size={12} />
                                  Expires {new Date(link.expires_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => copyToClipboard(link)}
                              className="p-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                              title="Copy link"
                              aria-label="Copy share link"
                            >
                              {copied === link.id ? (
                                <Check size={16} className="text-green-500" />
                              ) : (
                                <Copy size={16} />
                              )}
                            </button>
                            <button
                              onClick={() => toggleLinkStatus(link.id, link.is_active)}
                              className="p-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                              title={link.is_active ? 'Deactivate' : 'Activate'}
                              aria-label={link.is_active ? 'Deactivate share link' : 'Activate share link'}
                            >
                              {link.is_active ? (
                                <EyeOff size={16} />
                              ) : (
                                <Eye size={16} />
                              )}
                            </button>
                            <button
                              onClick={() => deleteLink(link.id)}
                              className="p-2 rounded hover:bg-[var(--bg-tertiary)] text-red-600 transition-colors"
                              title="Delete"
                              aria-label="Delete share link"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Note:</strong> Anyone with the link can view your draft, even if it's not published. Deactivate or delete links when you no longer need them.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end p-6 border-t border-[var(--border-light)]">
            <button onClick={onClose} className="btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
