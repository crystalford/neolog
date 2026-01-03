'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShareDraftButton } from '@/components/ShareDraftButton'
import type { Post, Profile } from '@/types/database'
import {
  PenLine, MoreHorizontal, Eye, Edit2, Trash2,
  Globe, FileText, Clock
} from 'lucide-react'

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    // Load profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
    
    setProfile(profileData)

    // Load posts
    const { data: postsData } = await supabase
      .from('posts')
      .select('*')
      .eq('author_id', session.user.id)
      .order('updated_at', { ascending: false })
    
    setPosts(postsData || [])
    setLoading(false)
  }

  const handleDelete = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return

    await supabase.from('posts').delete().eq('id', postId)
    setPosts(posts.filter(p => p.id !== postId))
    setActiveMenu(null)
  }

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-12 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-100 rounded" />
          <div className="h-4 w-32 bg-gray-100 rounded" />
          <div className="mt-8 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-md" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-12 py-12 max-w-7xl mx-auto animate-fade-up">
      <div className="flex justify-between items-start gap-4 mb-8">
        <div>
          <h1 className="font-serif text-3xl tracking-tight text-gray-900">Your posts</h1>
          <p className="font-sans text-sm text-gray-600 mt-1">
            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
          </p>
        </div>
        <Link href="/write" className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white font-sans text-sm font-medium rounded-md hover:bg-gray-800 transition-colors flex-shrink-0">
          <PenLine size={16} />
          New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-md bg-gray-100 flex items-center justify-center mx-auto mb-4 border border-gray-200">
            <FileText size={28} className="text-gray-400" />
          </div>
          <h2 className="font-serif text-xl tracking-tight text-gray-900 mb-2">No posts yet</h2>
          <p className="font-sans text-sm text-gray-600 mb-6">Create your first post to get started</p>
          <Link href="/write" className="inline-flex items-center gap-2 px-6 py-2.5 bg-black text-white font-sans text-sm font-medium rounded-md hover:bg-gray-800 transition-colors">
            <PenLine size={16} />
            Write your first post
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-white border border-gray-200 rounded-md p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {post.status === 'published' ? (
                      <span className="flex items-center gap-1 font-sans text-xs font-medium text-green-600">
                        <Globe size={12} />
                        Published
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 font-sans text-xs font-medium text-gray-500">
                        <FileText size={12} />
                        Draft
                      </span>
                    )}
                    <span className="text-gray-400">·</span>
                    <span className="font-sans text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(post.updated_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h2 className="font-serif text-lg tracking-tight text-gray-900 truncate">
                    {post.title || 'Untitled'}
                  </h2>

                  {post.excerpt && (
                    <p className="font-sans text-sm text-gray-600 line-clamp-1 mt-1">
                      {post.excerpt}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {post.status === 'draft' && (
                    <ShareDraftButton
                      postId={post.id}
                      existingToken={(post as any).preview_token}
                      expiresAt={(post as any).preview_expires_at}
                    />
                  )}

                  <div className="relative">
                    <button
                      onClick={() => setActiveMenu(activeMenu === post.id ? null : post.id)}
                      className="w-8 h-8 rounded-md hover:bg-gray-100 flex items-center justify-center transition-colors"
                    >
                      <MoreHorizontal size={18} className="text-gray-500" />
                    </button>

                    {activeMenu === post.id && (
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10 py-1">
                        {post.status === 'published' && profile && (
                          <Link
                            href={`/${profile.username}/${post.slug}`}
                            className="flex items-center gap-2 px-3 py-2 font-sans text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                          >
                            <Eye size={14} />
                            View
                          </Link>
                        )}
                        <Link
                          href={`/write?edit=${post.id}`}
                          className="flex items-center gap-2 px-3 py-2 font-sans text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                        >
                          <Edit2 size={14} />
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 font-sans text-sm font-medium text-red-600 hover:bg-gray-50 transition-colors"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
