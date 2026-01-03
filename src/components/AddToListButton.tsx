'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Plus, Check, Loader2, X } from 'lucide-react'

interface AddToListButtonProps {
  postId: string
}

type ReadingList = {
  id: string
  name: string
  has_post: boolean
}

export function AddToListButton({ postId }: AddToListButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lists, setLists] = useState<ReadingList[]>([])
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (showModal) {
      loadLists()
    }
  }, [showModal])

  const loadLists = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      setShowModal(false)
      router.push('/login')
      return
    }

    // Get user's lists with info about whether post is already in them
    const { data: userLists } = await supabase
      .from('reading_lists')
      .select('id, name')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (userLists) {
      // Check which lists already have this post
      const { data: existingItems } = await supabase
        .from('reading_list_items')
        .select('list_id')
        .eq('post_id', postId)
        .in('list_id', userLists.map(l => l.id))

      const existingListIds = new Set(existingItems?.map(i => i.list_id) || [])

      setLists(userLists.map(l => ({
        ...l,
        has_post: existingListIds.has(l.id),
      })))
    }

    setLoading(false)
  }

  const toggleList = async (listId: string, hasPost: boolean) => {
    if (hasPost) {
      // Remove from list
      await supabase
        .from('reading_list_items')
        .delete()
        .eq('list_id', listId)
        .eq('post_id', postId)
    } else {
      // Add to list
      await supabase
        .from('reading_list_items')
        .insert({ list_id: listId, post_id: postId })
    }

    setLists(lists.map(l => 
      l.id === listId ? { ...l, has_post: !hasPost } : l
    ))
  }

  const createList = async () => {
    if (!newListName.trim()) return
    
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    
    const { data: newList, error } = await supabase
      .from('reading_lists')
      .insert({
        user_id: session!.user.id,
        name: newListName.trim(),
        is_public: false,
      })
      .select()
      .single()

    if (newList) {
      // Add post to new list
      await supabase
        .from('reading_list_items')
        .insert({ list_id: newList.id, post_id: postId })

      setLists([{ id: newList.id, name: newList.name, has_post: true }, ...lists])
      setNewListName('')
    }
    
    setCreating(false)
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
        title="Add to list"
      >
        <BookOpen size={18} className="text-[var(--text-tertiary)]" />
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-light)]">
              <h2 className="font-medium">Save to list</h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1 rounded hover:bg-[var(--bg-secondary)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
                </div>
              ) : lists.length === 0 ? (
                <p className="text-center text-[var(--text-secondary)] py-8 px-4">
                  You don't have any lists yet
                </p>
              ) : (
                <div className="py-2">
                  {lists.map(list => (
                    <button
                      key={list.id}
                      onClick={() => toggleList(list.id, list.has_post)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <span className="font-medium">{list.name}</span>
                      {list.has_post ? (
                        <Check size={18} className="text-[var(--success)]" />
                      ) : (
                        <Plus size={18} className="text-[var(--text-tertiary)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[var(--border-light)]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Create new list..."
                  className="input flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && createList()}
                />
                <button
                  onClick={createList}
                  disabled={!newListName.trim() || creating}
                  className="btn btn-primary btn-sm"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
