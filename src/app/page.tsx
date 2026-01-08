import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock,
  FileText,
  Link2,
  Globe,
  Inbox,
  Mail,
  MoreHorizontal,
  PenLine,
  Rss,
  Search,
  Share2,
  Sparkles,
  Tag,
  Webhook,
} from 'lucide-react'

export default async function Home() {
  const supabase = createClient()

  const [{ data: auth }, featuredPostsRes, postsCountRes, creatorsCountRes] = await Promise.all([
    supabase.auth.getSession(),
    supabase
      .from('posts')
      .select(
        [
          'id',
          'title',
          'slug',
          'subtitle',
          'excerpt',
          'cover_image_url',
          'published_at',
          'reading_time_minutes',
          'author:profiles(id, username, display_name, avatar_url)',
          'series:series(title, slug)',
        ].join(','),
      )
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(6),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ])

  const session = auth?.session ?? null
  const featuredPosts = featuredPostsRes.data || []
  const stats = {
    posts: postsCountRes.count || 0,
    creators: creatorsCountRes.count || 0,
  }

  return (
    <div>
      <Header />
      <main className="pt-14 bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center px-6 py-24 max-w-4xl mx-auto text-center">
          <h1 className="font-display text-5xl md:text-6xl font-bold leading-tight tracking-tight text-[var(--text-primary)] mb-6">
            Write, publish, and share your ideas
          </h1>
          <p className="text-lg text-[var(--text-secondary)] mb-10 max-w-2xl">
            A clean, powerful platform for writers. Publish beautiful posts, build your audience, and own your content. No algorithms, no distractions.
          </p>
          <Link
            href={session ? "/dashboard" : "/signup"}
            className="btn btn-primary btn-xl px-10 py-5 text-2xl font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            {session ? "Go to Dashboard" : "Start Writing Free"}
            <ArrowRight size={28} className="ml-3" />
          </Link>

          {/* Stats */}
          <div className="flex items-center gap-8 mt-12 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <FileText size={16} />
              <span>{stats.posts} posts published</span>
            </div>
            <div className="flex items-center gap-2">
              <PenLine size={16} />
              <span>{stats.creators} writers</span>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="px-6 py-16 max-w-6xl mx-auto">
          <h2 className="font-display text-3xl text-center mb-12">Everything you need to publish</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mb-4">
                <PenLine size={24} className="text-[var(--accent)]" />
              </div>
              <h3 className="font-display text-xl mb-2">Rich Editor</h3>
              <p className="text-[var(--text-secondary)]">
                Beautiful visual editor with markdown support, code highlighting, embeds, and HTML import.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mb-4">
                <BarChart3 size={24} className="text-[var(--accent)]" />
              </div>
              <h3 className="font-display text-xl mb-2">Analytics</h3>
              <p className="text-[var(--text-secondary)]">
                Track views, engagement, and understand your audience with detailed insights.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mb-4">
                <Mail size={24} className="text-[var(--accent)]" />
              </div>
              <h3 className="font-display text-xl mb-2">Newsletter</h3>
              <p className="text-[var(--text-secondary)]">
                Build your email list and send beautiful newsletters directly from your posts.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mb-4">
                <Boxes size={24} className="text-[var(--accent)]" />
              </div>
              <h3 className="font-display text-xl mb-2">Series</h3>
              <p className="text-[var(--text-secondary)]">
                Organize posts into series and guide readers through connected content.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mb-4">
                <Sparkles size={24} className="text-[var(--accent)]" />
              </div>
              <h3 className="font-display text-xl mb-2">AI Tools</h3>
              <p className="text-[var(--text-secondary)]">
                Bring your own AI keys for summaries, expansions, and research assistance.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mb-4">
                <Share2 size={24} className="text-[var(--accent)]" />
              </div>
              <h3 className="font-display text-xl mb-2">Distribution</h3>
              <p className="text-[var(--text-secondary)]">
                Cross-post to Medium, Dev.to, and other platforms with one click.
              </p>
            </div>
          </div>
        </section>

        {/* Featured Posts */}
        {featuredPosts.length > 0 && (
          <section className="px-6 py-16 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-display text-3xl">Recent Posts</h2>
              <Link href="/explore" className="text-[var(--accent)] hover:underline">
                Explore all →
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredPosts.map((post: any) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="px-6 py-16 max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/20">
            <h2 className="font-display text-3xl mb-4">Ready to start writing?</h2>
            <p className="text-lg text-[var(--text-secondary)] mb-8">
              Join our community of writers. Free to start, upgrade for advanced features.
            </p>
            <Link
              href={session ? "/write" : "/signup"}
              className="btn btn-primary btn-xl px-10 py-4 text-xl font-semibold"
            >
              {session ? "Create Your First Post" : "Sign Up Free"}
            </Link>
          </div>
        </section>

        <footer className="px-6 py-12 bg-[var(--bg-primary)] border-t border-[var(--border-light)] mt-16">
          <div className="max-w-2xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="logo-mark">N</span>
              <span className="font-display text-base font-semibold text-[var(--text-primary)]">Neolog</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Your creative core. Calm, continuous, always yours.
            </p>
            <nav className="flex justify-center gap-8">
              <Link href="/tos" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                Privacy
              </Link>
            </nav>
            <div className="mt-8 pt-8 border-t border-[var(--border-light)]">
              <p className="text-xs text-[var(--text-tertiary)] text-center">
                (c) 2026 Neolog
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}

