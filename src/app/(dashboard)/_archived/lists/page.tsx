'use client'

export const runtime = 'edge'


import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  List, Plus, Lock, Globe, BookOpen, 
  MoreHorizontal, Edit, Trash2, Share2
} from 'lucide-react'

type ReadingList = {
  id: string
  name: string
  description: string | null
  is_public: boolean
  post_count: number
  created_at: string
}

export default function ListsPage() {
  const [loading, setLoading] = useState(true)
  const [lists, setLists] = useState<ReadingList[]>([])
  const [showMenu, setShowMenu] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadLists()
  }, [])

  const loadLists = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { data } = await supabase
      .from('reading_lists')
      .select(`
        *,
        post_count:reading_list_posts(count)
      `)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (data) {
      setLists(data.map(list => ({
        ...list,
        post_count: list.post_count?.[0]?.count || 0
      })))
    }
    setLoading(false)
  }

  const deleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list?')) return

    await supabase
      .from('reading_lists')
      .delete()
      .eq('id', listId)

    setLists(lists.filter(l => l.id !== listId))
    setShowMenu(null)
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <List size={20} className="text-[var(--accent)]" />
              </div>
              <div>
                <h1 className="font-display text-3xl">Reading Lists</h1>
                <p className="text-[var(--text-secondary)]">
                  Organize and save posts for later
                </p>
              </div>
            </div>
            
            <Link href="/lists/new" className="btn btn-primary">
              <Plus size={16} />
              New List
            </Link>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 skeleton rounded-xl" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <BookOpen size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h2 className="font-display text-xl mb-2">No reading lists yet</h2>
          <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            Create lists to organize posts by topic, save them for later, or share curated collections.
          </p>
          <Link href="/lists/new" className="btn btn-primary">
            <Plus size={16} />
            Create Your First List
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map((list) => (
            <div 
              key={list.id}
              className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
            >
              <div className="flex items-start justify-between">
                <Link href={`/lists/${list.id}`} className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium hover:text-[var(--accent)] transition-colors">
                          {list.name}
                        </h3>
                        {list.is_public ? (
                          <Globe size={14} className="text-[var(--text-tertiary)]" />
                        ) : (
                          <Lock size={14} className="text-[var(--text-tertiary)]" />
                        )}
                      </div>
                      {list.description && (
                        <p className="text-sm text-[var(--text-secondary)] mb-2">
                          {list.description}
                        </p>
                      )}
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {list.post_count} {list.post_count === 1 ? 'post' : 'posts'}
                      </p>
                    </Link>

                    <div className="relative">
                      <button
                        onClick={() => setShowMenu(showMenu === list.id ? null : list.id)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                        aria-label="Open list menu"
                      >
                        <MoreHorizontal size={16} className="text-[var(--text-tertiary)]" />
                      </button>

                      {showMenu === list.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setShowMenu(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-lg shadow-lg z-20 py-1">
                            <Link
                              href={`/lists/${list.id}/edit`}
                              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                              onClick={() => setShowMenu(null)}
                            >
                              <Edit size={14} />
                              Edit List
                            </Link>
                            {list.is_public && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    `${window.location.origin}/lists/${list.id}`
                                  )
                                  setShowMenu(null)
                                }}
                                className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors w-full text-left"
                              >
                                <Share2 size={14} />
                                Copy Link
                              </button>
                            )}
                            <button
                              onClick={() => deleteList(list.id)}
                              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors w-full text-left text-red-500"
                            >
                              <Trash2 size={14} />
                              Delete List
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
      )}
    </main>
  )
}


