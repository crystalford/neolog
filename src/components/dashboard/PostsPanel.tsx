'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Clock, Sparkles, MoreVertical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Post {
    id: string
    title: string
    created_at: string
    published_at: string | null
    is_living?: boolean
}

export function PostsPanel() {
    const [posts, setPosts] = useState<Post[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadPosts()
    }, [])

    const loadPosts = async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return

        const { data } = await supabase
            .from('posts')
            .select('id, title, created_at, published_at')
            .eq('author_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10)

        if (data) {
            setPosts(data as Post[])
        }
        setLoading(false)
    }

    return (
        <div className="flex flex-col h-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border-light)]">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <FileText size={20} className="text-[var(--accent)]" />
                            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                                Your Posts
                            </h2>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
                        </p>
                    </div>
                    <Link href="/write" className="text-sm text-[var(--accent)] hover:underline">
                        View All
                    </Link>
                </div>
            </div>

            {/* Posts List */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
                    </div>
                ) : posts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <FileText size={48} className="text-[var(--text-tertiary)] mb-4" />
                        <h3 className="font-semibold text-[var(--text-secondary)] mb-2">
                            No posts yet
                        </h3>
                        <p className="text-sm text-[var(--text-tertiary)] max-w-sm">
                            Start a conversation in the Inbox to create your first post
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {posts.map((post) => (
                            <Link
                                key={post.id}
                                href={`/write?edit=${post.id}`}
                                className="block p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--accent)] transition-all group"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {post.published_at ? (
                                                <span className="w-2 h-2 rounded-full bg-green-500" title="Published" />
                                            ) : (
                                                <span className="w-2 h-2 rounded-full bg-yellow-500" title="Draft" />
                                            )}
                                            <h3 className="font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                                                {post.title || 'Untitled'}
                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                                            <Clock size={12} />
                                            <span>{new Date(post.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-[var(--bg-tertiary)] rounded">
                                        <MoreVertical size={16} className="text-[var(--text-tertiary)]" />
                                    </button>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-[var(--border-light)]">
                <button className="w-full text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center gap-2">
                    <Sparkles size={14} />
                    Graph View (Coming Soon)
                </button>
            </div>
        </div>
    )
}
