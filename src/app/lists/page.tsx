'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  BookOpen, Plus, Lock, Globe, MoreHorizontal, 
  Edit2, Trash2, Loader2 
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
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadLists()
  }, [])

  const loadLists = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login?redirect=/lists')
      return
    }

    const { data } = await supabase
      .from('reading_lists')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (data) {
      setLists(data)
    }

    setLoading(false)
  }

  const deleteList = async (listId: string) => {
    if (!confirm('Delete this list? Posts won\'t be affected.')) return

    await supabase.from('reading_lists').delete().eq('id', listId)
    setLists(lists.filter(l => l.id !== listId))
    setActiveMenu(null)
  }

  return (
    <>
      <Header />
      <main className="pt-20 pb-16">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex items-center justify-between pt-8 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <BookOpen size={24} className="text-[var(--accent)]" />
              </div>
              <div>
                <h1 className="font-display text-3xl">Reading Lists</h1>
                <p className="text-[var(--text-secondary)]">
                  Organize posts into collections
                </p>
              </div>
            </div>
            
            <Link href="/lists/new" className="btn btn-primary">
              <Plus size={16} />
              New List
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : lists.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <BookOpen size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No reading lists yet</h2>
              <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                Create lists to organize posts you want to read or share
              </p>
              <Link href="/lists/new" className="btn btn-primary">
                <Plus size={16} />
                Create Your First List
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {lists.map(list => (
                <div
                  key={list.id}
                  className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <Link href={`/lists/${list.id}`} className="flex-1">
                      <h3 className="font-medium text-lg hover:text-[var(--accent)] transition-colors">
                        {list.name}
                      </h3>
                    </Link>
                    
                    <div className="flex items-center gap-2">
                      {list.is_public ? (
                        <Globe size={14} className="text-[var(--text-tertiary)]" />
                      ) : (
                        <Lock size={14} className="text-[var(--text-tertiary)]" />
                      )}
                      
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenu(activeMenu === list.id ? null : list.id)}
                          className="p-1 rounded hover:bg-[var(--bg-tertiary)]"
                        >
                          <MoreHorizontal size={16} className="text-[var(--text-tertiary)]" />
                        </button>
                        
                        {activeMenu === list.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                            <div className="absolute right-0 top-full mt-1 w-36 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-lg shadow-lg z-20 py-1">
                              <Link
                                href={`/lists/${list.id}/edit`}
                                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)]"
                              >
                                <Edit2 size={14} />
                                Edit
                              </Link>
                              <button
                                onClick={() => deleteList(list.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--error)] hover:bg-[var(--bg-secondary)]"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {list.description && (
                    <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">
                      {list.description}
                    </p>
                  )}
                  
                  <p className="text-sm text-[var(--text-tertiary)]">
                    {list.post_count} post{list.post_count !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
