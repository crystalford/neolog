import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { Sparkles } from 'lucide-react'

export default async function VisualsPage() {
  const supabase = createClient()

  const { data: posts } = await supabase
    .from('posts')
    .select('*, author:profiles(id, username, display_name, avatar_url)')
    .eq('status', 'published')
    .eq('content_type', 'html')
    .order('published_at', { ascending: false })
    .limit(24)

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="pt-8 mb-8">
            <div className="flex items-center gap-3 text-[var(--text-tertiary)] text-xs uppercase tracking-[0.2em]">
              <Sparkles size={14} />
              Visuals
            </div>
            <h1 className="font-display text-3xl text-[var(--text-primary)] mt-2">Interactive posts</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              HTML-first stories, infographics, and micro-apps from the community.
            </p>
          </div>

          {!posts || posts.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <Sparkles size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No visuals yet</h2>
              <p className="text-[var(--text-secondary)] mb-4">
                Publish an HTML post to appear here.
              </p>
              <Link href="/write" className="btn btn-primary btn-sm">
                Create a visual
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <PostCard key={post.id} post={post as any} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
