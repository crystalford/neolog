'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckSquare, Trash2, Archive, Send, Calendar,
  Tag, Loader2, AlertTriangle, Check
} from 'lucide-react'

interface BulkPostActionsProps {
  selectedPostIds: string[]
  onComplete: () => void
  onCancel: () => void
}

type BulkAction = 'publish' | 'archive' | 'delete' | 'schedule' | 'add-tags'

export function BulkPostActions({
  selectedPostIds,
  onComplete,
  onCancel,
}: BulkPostActionsProps) {
  const [action, setAction] = useState<BulkAction | null>(null)
  const [processing, setProcessing] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [scheduleDate, setScheduleDate] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const supabase = createClient()

  const handleExecute = async () => {
    if (!action) return

    setProcessing(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      switch (action) {
        case 'publish':
          await supabase
            .from('posts')
            .update({
              status: 'published',
              published_at: new Date().toISOString(),
            })
            .in('id', selectedPostIds)
            .eq('author_id', session.user.id)
          break

        case 'archive':
          await supabase
            .from('posts')
            .update({ status: 'archived' })
            .in('id', selectedPostIds)
            .eq('author_id', session.user.id)
          break

        case 'delete':
          if (!confirmDelete) {
            setConfirmDelete(true)
            setProcessing(false)
            return
          }
          await supabase
            .from('posts')
            .delete()
            .in('id', selectedPostIds)
            .eq('author_id', session.user.id)
          break

        case 'schedule':
          if (!scheduleDate) {
            alert('Please select a date and time')
            setProcessing(false)
            return
          }
          await supabase
            .from('posts')
            .update({
              status: 'scheduled',
              scheduled_at: new Date(scheduleDate).toISOString(),
            })
            .in('id', selectedPostIds)
            .eq('author_id', session.user.id)
          break

        case 'add-tags':
          if (tags.length === 0) {
            alert('Please enter at least one tag')
            setProcessing(false)
            return
          }
          // Add tags to each post
          for (const postId of selectedPostIds) {
            await supabase.rpc('set_post_tags', {
              p_post_id: postId,
              p_tag_names: tags,
            })
          }
          break
      }

      onComplete()
    } catch (error) {
      console.error('Bulk action error:', error)
      alert('An error occurred. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  const actions = [
    {
      value: 'publish' as const,
      label: 'Publish Posts',
      description: 'Make posts live immediately',
      icon: Send,
      color: 'text-green-500',
      dangerous: false,
    },
    {
      value: 'schedule' as const,
      label: 'Schedule Posts',
      description: 'Set a future publish date',
      icon: Calendar,
      color: 'text-blue-500',
      dangerous: false,
    },
    {
      value: 'add-tags' as const,
      label: 'Add Tags',
      description: 'Apply tags to all selected',
      icon: Tag,
      color: 'text-purple-500',
      dangerous: false,
    },
    {
      value: 'archive' as const,
      label: 'Archive Posts',
      description: 'Hide from public view',
      icon: Archive,
      color: 'text-yellow-500',
      dangerous: false,
    },
    {
      value: 'delete' as const,
      label: 'Delete Posts',
      description: 'Permanently remove posts',
      icon: Trash2,
      color: 'text-red-500',
      dangerous: true,
    },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-medium)] shadow-2xl max-w-2xl w-full">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-light)]">
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <CheckSquare size={24} />
            Bulk Actions
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {selectedPostIds.length} post{selectedPostIds.length !== 1 ? 's' : ''} selected
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Action selection */}
          {!action ? (
            <div className="grid gap-3">
              {actions.map(a => {
                const Icon = a.icon
                return (
                  <button
                    key={a.value}
                    onClick={() => setAction(a.value)}
                    className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left hover:border-[var(--accent)] ${
                      a.dangerous ? 'border-red-500/20' : 'border-[var(--border-light)]'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-lg ${
                      a.dangerous ? 'bg-red-500/10' : 'bg-[var(--bg-secondary)]'
                    } flex items-center justify-center`}>
                      <Icon size={24} className={a.color} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold mb-1">{a.label}</p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {a.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Schedule date picker */}
              {action === 'schedule' && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Schedule Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="input w-full"
                  />
                </div>
              )}

              {/* Tags input */}
              {action === 'add-tags' && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={tags.join(', ')}
                    onChange={(e) =>
                      setTags(
                        e.target.value
                          .split(',')
                          .map(t => t.trim())
                          .filter(Boolean)
                      )
                    }
                    placeholder="e.g., tutorial, javascript, react"
                    className="input w-full"
                  />
                </div>
              )}

              {/* Delete confirmation */}
              {action === 'delete' && confirmDelete && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-800 dark:text-red-200 mb-1">
                        Are you absolutely sure?
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        This will permanently delete {selectedPostIds.length} post
                        {selectedPostIds.length !== 1 ? 's' : ''}. This action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action info */}
              <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <p className="text-sm">
                  <strong>Action:</strong>{' '}
                  {actions.find(a => a.value === action)?.label}
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  This will affect {selectedPostIds.length} post
                  {selectedPostIds.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-[var(--border-light)]">
          <button
            onClick={() => {
              if (action && !confirmDelete) {
                setAction(null)
              } else {
                onCancel()
              }
            }}
            disabled={processing}
            className="btn btn-secondary"
          >
            {action ? 'Back' : 'Cancel'}
          </button>
          {action && (
            <button
              onClick={handleExecute}
              disabled={processing}
              className={`btn ${
                action === 'delete' && confirmDelete
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'btn-primary'
              }`}
            >
              {processing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : action === 'delete' && !confirmDelete ? (
                'Delete Posts'
              ) : action === 'delete' && confirmDelete ? (
                'Confirm Delete'
              ) : (
                <>
                  <Check size={16} />
                  Apply Action
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
