'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MoreHorizontal, EyeOff, Eye, Flag, Trash2, Loader2 } from 'lucide-react'

interface CommentModerationProps {
  commentId: string
  isPostAuthor: boolean
  isCommentAuthor: boolean
  isHidden?: boolean
  onHide?: () => void
  onUnhide?: () => void
  onDelete?: () => void
}

export function CommentModeration({
  commentId,
  isPostAuthor,
  isCommentAuthor,
  isHidden = false,
  onHide,
  onUnhide,
  onDelete,
}: CommentModerationProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportDescription, setReportDescription] = useState('')
  
  const supabase = createClient()

  const handleHide = async () => {
    setLoading(true)
    const { data } = await supabase.rpc('hide_comment', { 
      p_comment_id: commentId 
    })
    if (data) {
      onHide?.()
    }
    setLoading(false)
    setShowMenu(false)
  }

  const handleUnhide = async () => {
    setLoading(true)
    const { data } = await supabase.rpc('unhide_comment', { 
      p_comment_id: commentId 
    })
    if (data) {
      onUnhide?.()
    }
    setLoading(false)
    setShowMenu(false)
  }

  const handleDelete = async () => {
    if (!confirm('Delete this comment? This cannot be undone.')) return
    
    setLoading(true)
    await supabase.from('comments').delete().eq('id', commentId)
    onDelete?.()
    setLoading(false)
    setShowMenu(false)
  }

  const handleReport = async () => {
    if (!reportReason) return
    
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    
    await supabase.from('reports').insert({
      reporter_id: session?.user?.id,
      content_type: 'comment',
      content_id: commentId,
      reason: reportReason,
      description: reportDescription || null,
    })
    
    setLoading(false)
    setShowReportModal(false)
    setShowMenu(false)
    alert('Report submitted. Thank you.')
  }

  // Only show if user has some action available
  if (!isPostAuthor && !isCommentAuthor) {
    return (
      <button
        onClick={() => setShowReportModal(true)}
        className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
        title="Report"
      >
        <Flag size={14} />
      </button>
    )
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreHorizontal size={14} />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-lg shadow-lg z-20 py-1">
              {isPostAuthor && !isHidden && (
                <button
                  onClick={handleHide}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <EyeOff size={14} />}
                  Hide comment
                </button>
              )}
              
              {isPostAuthor && isHidden && (
                <button
                  onClick={handleUnhide}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  Unhide comment
                </button>
              )}
              
              {isCommentAuthor && (
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--error)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete
                </button>
              )}
              
              {!isCommentAuthor && (
                <button
                  onClick={() => { setShowMenu(false); setShowReportModal(true) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <Flag size={14} />
                  Report
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowReportModal(false)} />
          
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-display text-xl mb-4">Report Comment</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="input"
                >
                  <option value="">Select a reason</option>
                  <option value="spam">Spam</option>
                  <option value="harassment">Harassment</option>
                  <option value="hate_speech">Hate speech</option>
                  <option value="misinformation">Misinformation</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Details (optional)</label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  className="input min-h-[100px] resize-none"
                  placeholder="Provide additional context..."
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleReport}
                disabled={!reportReason || loading}
                className="btn btn-primary flex-1"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Submit Report'}
              </button>
              <button
                onClick={() => setShowReportModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
