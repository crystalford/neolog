'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GitFork, Loader2 } from 'lucide-react'
import slugify from 'slugify'

interface ForkButtonProps {
  postId: string
  postTitle: string
  postContent: string | null
  postContentType: string
  allowForks: boolean
  forkCount: number
  className?: string
}

export function ForkButton({ 
  postId, 
  postTitle, 
  postContent,
  postContentType,
  allowForks, 
  forkCount,
  className = ''
}: ForkButtonProps) {
  const [forking, setForking] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [forkTitle, setForkTitle] = useState(`Fork of ${postTitle}`)
  const router = useRouter()
  const supabase = createClient()

  const handleFork = async () => {
    setForking(true)

    try {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      // Get the original post to find root_post_id
      const { data: originalPost } = await supabase
        .from('posts')
        .select('root_post_id, fork_depth')
        .eq('id', postId)
        .single()

      // Create the forked post
      const slug = slugify(forkTitle, { lower: true, strict: true })
      const rootId = originalPost?.root_post_id || postId // If no root, original is the root

      const { data: newPost, error } = await supabase
        .from('posts')
        .insert({
          author_id: session.user.id,
          title: forkTitle,
          slug: `${slug}-${Date.now().toString(36)}`, // Ensure unique slug
          content: postContent,
          content_type: postContentType,
          forked_from_id: postId,
          root_post_id: rootId,
          fork_depth: (originalPost?.fork_depth || 0) + 1,
          status: 'draft',
        })
        .select()
        .single()

      if (error) {
        console.error('Fork error:', error)
        alert('Failed to fork post. Please try again.')
        return
      }

      // Navigate to edit the forked post
      router.push(`/write/${newPost.id}`)
    } catch (error) {
      console.error('Fork error:', error)
    } finally {
      setForking(false)
      setShowModal(false)
    }
  }

  if (!allowForks) {
    return (
      <button
        disabled
        className={`btn btn-ghost opacity-50 cursor-not-allowed ${className}`}
        title="Forking is disabled for this post"
      >
        <GitFork size={16} />
        <span>Fork disabled</span>
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`btn btn-secondary group ${className}`}
      >
        <GitFork size={16} className="group-hover:text-[var(--accent)] transition-colors" />
        <span>Fork</span>
        {forkCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
            {forkCount}
          </span>
        )}
      </button>

      {/* Fork Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-medium)] shadow-2xl w-full max-w-md animate-scale-in">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                  <GitFork size={24} className="text-[var(--accent)]" />
                </div>
                <div>
                  <h2 className="font-display text-xl">Fork this post</h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Create your own version to edit and publish
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Title for your fork
                </label>
                <input
                  type="text"
                  value={forkTitle}
                  onChange={(e) => setForkTitle(e.target.value)}
                  className="input"
                  placeholder="Enter a title..."
                />
              </div>

              <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] mb-6">
                <p className="text-sm text-[var(--text-secondary)]">
                  <strong className="text-[var(--text-primary)]">What happens when you fork:</strong>
                </p>
                <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
                  <li>- A copy is created in your drafts</li>
                  <li>- You can edit it freely</li>
                  <li>- It links back to the original</li>
                  <li>- The author is credited automatically</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary flex-1"
                  disabled={forking}
                >
                  Cancel
                </button>
                <button
                  onClick={handleFork}
                  disabled={forking || !forkTitle.trim()}
                  className="btn btn-primary flex-1"
                >
                  {forking ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Forking...
                    </>
                  ) : (
                    <>
                      <GitFork size={16} />
                      Create fork
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

