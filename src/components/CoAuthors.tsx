'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Users, Plus, X, Loader2, Search } from 'lucide-react'

interface CoAuthorsProps {
  postId: string
  isAuthor: boolean
}

type CoAuthor = {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  role: string
  accepted: boolean
}

type UserSearchResult = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export function CoAuthors({ postId, isAuthor }: CoAuthorsProps) {
  const [coauthors, setCoauthors] = useState<CoAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  
  const supabase = useMemo(() => createClient(), [])

  const loadCoauthors = useCallback(async () => {
    const { data } = await supabase.rpc('get_post_coauthors', { p_post_id: postId })
    if (data) {
      setCoauthors(data)
    }
    setLoading(false)
  }, [postId, supabase])

  useEffect(() => {
    loadCoauthors()
  }, [loadCoauthors])

  const searchUsers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .limit(5)

    // Filter out existing coauthors and current user
    const existing = new Set(coauthors.map(c => c.user_id))
    const { data: { session } } = await supabase.auth.getSession()
    if (session) existing.add(session.user.id)

    setSearchResults((data || []).filter(u => !existing.has(u.id)))
    setSearching(false)
  }, [coauthors, supabase])

  const addCoauthor = useCallback(async (userId: string, role: string = 'coauthor') => {
    setAdding(true)
    const { data: { session } } = await supabase.auth.getSession()

    await supabase.from('post_coauthors').insert({
      post_id: postId,
      user_id: userId,
      role,
      added_by: session?.user?.id,
    })

    // Notify the user
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'coauthor_invite',
      actor_id: session?.user?.id,
      post_id: postId,
      title: 'Co-author invitation',
      body: 'You\'ve been invited to co-author a post',
    })

    loadCoauthors()
    setShowAddModal(false)
    setSearchQuery('')
    setSearchResults([])
    setAdding(false)
  }, [loadCoauthors, postId, supabase])

  const removeCoauthor = useCallback(async (userId: string) => {
    await supabase
      .from('post_coauthors')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)

    setCoauthors(prev => prev.filter(c => c.user_id !== userId))
  }, [postId, supabase])

  // Only show accepted coauthors to non-authors
  const visibleCoauthors = isAuthor 
    ? coauthors 
    : coauthors.filter(c => c.accepted)

  if (loading) return null
  if (!isAuthor && visibleCoauthors.length === 0) return null

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Users size={16} className="text-[var(--text-tertiary)]" />
        <span className="text-sm text-[var(--text-secondary)]">
          {isAuthor ? 'Co-authors' : 'Written with'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {visibleCoauthors.map(coauthor => (
          <div 
            key={coauthor.user_id}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              coauthor.accepted 
                ? 'bg-[var(--bg-secondary)]' 
                : 'bg-[var(--warning)]/10 border border-[var(--warning)]/20'
            }`}
          >
            <Link href={`/${coauthor.username}`} className="flex items-center gap-2">
              {coauthor.avatar_url ? (
                <img
                  src={coauthor.avatar_url}
                  alt={`${coauthor.display_name || coauthor.username} avatar`}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xs">
                  {(coauthor.display_name || coauthor.username)[0].toUpperCase()}
                </div>
              )}
              <span>{coauthor.display_name || coauthor.username}</span>
            </Link>
            
            {!coauthor.accepted && (
              <span className="text-xs text-[var(--warning)]">pending</span>
            )}
            
            {isAuthor && (
              <button
                onClick={() => removeCoauthor(coauthor.user_id)}
                className="p-0.5 hover:text-[var(--error)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}

        {isAuthor && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        )}
      </div>

      {/* Add coauthor modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddModal(false)} />
          
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-display text-xl mb-4">Add Co-author</h2>
            
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  searchUsers(e.target.value)
                }}
                placeholder="Search by username..."
                className="input pl-10"
                autoFocus
              />
            </div>

            {searching ? (
              <div className="py-4 text-center">
                <Loader2 size={20} className="animate-spin mx-auto text-[var(--text-tertiary)]" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]"
                  >
                    <div className="flex items-center gap-3">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={`${user.display_name || user.username} avatar`}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-sm">
                          {(user.display_name || user.username)[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{user.display_name || user.username}</p>
                        <p className="text-sm text-[var(--text-tertiary)]">@{user.username}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => addCoauthor(user.id)}
                      disabled={adding}
                      className="btn btn-primary btn-sm"
                    >
                      {adding ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            ) : searchQuery.length >= 2 ? (
              <p className="text-center text-[var(--text-tertiary)] py-4">No matching users yet</p>
            ) : (
              <p className="text-center text-[var(--text-tertiary)] py-4">
                Type at least 2 characters to search
              </p>
            )}

            <button
              onClick={() => setShowAddModal(false)}
              className="btn btn-secondary w-full mt-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Display-only version for post pages
export function CoAuthorsList({ postId }: { postId: string }) {
  const [coauthors, setCoauthors] = useState<CoAuthor[]>([])
  const supabase = useMemo(() => createClient(), [])

  const loadCoauthors = useCallback(async () => {
    const { data } = await supabase.rpc('get_post_coauthors', { p_post_id: postId })
    if (data) {
      setCoauthors(data.filter((c: CoAuthor) => c.accepted))
    }
  }, [postId, supabase])

  useEffect(() => {
    loadCoauthors()
  }, [loadCoauthors])

  if (coauthors.length === 0) return null

  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
      <span>with</span>
      {coauthors.map((coauthor, i) => (
        <span key={coauthor.user_id}>
          <Link 
            href={`/${coauthor.username}`}
            className="hover:text-[var(--accent)]"
          >
            {coauthor.display_name || coauthor.username}
          </Link>
          {i < coauthors.length - 1 && ', '}
        </span>
      ))}
    </div>
  )
}
