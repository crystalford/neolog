import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import {
  Code, Eye, Terminal, FileDown, Zap, Layout,
  ArrowRight, Upload, Sparkles, GitFork, Radio,
  TrendingUp, Users, BookOpen, PenLine
} from 'lucide-react'

async function getFeaturedPosts() {
  const supabase = createClient()
  
  // Get recent popular posts
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      id,
      title,
      slug,
      subtitle,
      excerpt,
      cover_image_url,
      published_at,
      reading_time_minutes,
      author:profiles(id, username, display_name, avatar_url)
    `)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(6)
  
  return posts || []
}

async function getStats() {
  const supabase = createClient()
  
  const [postsCount, creatorsCount] = await Promise.all([
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ])
  
  return {
    posts: postsCount.count || 0,
    creators: creatorsCount.count || 0,
  }
}

export default async function Home() {
  const [featuredPosts, stats] = await Promise.all([
    getFeaturedPosts(),
    getStats(),
  ])
  return (
    <>
      <Header />

      <main className="pt-14">
        {/* Hero - Compact and professional */}
        <section className="relative px-6 lg:px-12 pt-16 pb-16 overflow-hidden">
          {/* Subtle gradient background */}
          <div
            className="absolute top-0 right-0 w-[1000px] h-[1000px] opacity-[0.02] pointer-events-none blur-3xl"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
              transform: 'translate(40%, -40%)',
            }}
          />

          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div className="animate-fade-up">
                {/* Main headline */}
                <h1 className="font-display text-5xl md:text-6xl leading-tight tracking-tight text-[var(--text-primary)] mb-6">
                  Build a sovereign node{' '}
                  <span className="text-[var(--text-tertiary)]">for ideas.</span>
                </h1>

                {/* Subheadline */}
                <p className="text-lg leading-relaxed text-[var(--text-secondary)] mb-7 max-w-xl">
                  Ingest signals. Shape knowledge. Broadcast everywhere. HTML-native, BYOK, and versioned by default.
                </p>

                {/* CTA */}
                <div className="flex flex-wrap gap-3 items-center">
                  <Link href="/signup" className="btn btn-primary">
                    Start writing
                  </Link>
                  <Link href="/explore" className="btn btn-secondary">
                    Explore
                  </Link>
                </div>
              </div>

              {/* Visual element - Code preview */}
              <div className="hidden lg:block">
                <div className="relative bg-[var(--bg-inverse)] rounded-lg p-6 border border-[var(--border-heavy)]">
                  <div className="font-mono text-sm leading-relaxed">
                    <div className="text-purple-400">&lt;article&gt;</div>
                    <div className="pl-4 text-blue-400">&lt;h1&gt;</div>
                    <div className="pl-8 text-gray-300">Publish HTML</div>
                    <div className="pl-4 text-blue-400">&lt;/h1&gt;</div>
                    <div className="pl-4 text-blue-400 mt-2">&lt;p&gt;</div>
                    <div className="pl-8 text-gray-300">No friction.</div>
                    <div className="pl-4 text-blue-400">&lt;/p&gt;</div>
                    <div className="text-purple-400 mt-2">&lt;/article&gt;</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Signal flow */}
        <section className="px-6 lg:px-12 py-8">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
            {[
              { title: 'Ingest', copy: 'Pull from feeds, URLs, or voice notes.' },
              { title: 'Core', copy: 'Versioned posts + knowledge graph.' },
              { title: 'Broadcast', copy: 'Distribute to channels + email.' },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                  {item.title}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        {(stats.posts > 0 || stats.creators > 0) && (
          <section className="px-6 lg:px-12 py-10 bg-[var(--bg-secondary)] border-y border-[var(--border-light)]">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <div className="text-center">
                  <p className="font-display text-3xl text-[var(--text-primary)] mb-1">{stats.posts.toLocaleString()}</p>
                  <p className="text-sm text-[var(--text-secondary)]">Posts published</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-3xl text-[var(--text-primary)] mb-1">{stats.creators.toLocaleString()}</p>
                  <p className="text-sm text-[var(--text-secondary)]">Writers</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-3xl text-[var(--text-primary)] mb-1">100%</p>
                  <p className="text-sm text-[var(--text-secondary)]">Your content</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-3xl text-[var(--text-primary)] mb-1">&lt;1s</p>
                  <p className="text-sm text-[var(--text-secondary)]">To publish</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Featured Posts */}
        {featuredPosts.length > 0 && (
          <section className="px-6 lg:px-12 py-14 bg-[var(--bg-primary)]">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="font-display text-2xl text-[var(--text-primary)] mb-1">Latest posts</h2>
                  <p className="text-sm text-[var(--text-secondary)]">From the community</p>
                </div>
                <Link href="/explore" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors hidden sm:inline-flex items-center gap-1">
                  View all
                  <ArrowRight size={14} />
                </Link>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {featuredPosts.map((post: any) => (
                  <PostCard key={post.id} post={post} variant="compact" />
                ))}
              </div>

              <div className="mt-8 text-center sm:hidden">
                <Link href="/explore" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1">
                  View all posts
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* The Problem / Solution */}
        <section className="px-6 lg:px-12 py-24">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-14 items-center">
              <div className="space-y-12">
                <div>
                  <span className="inline-flex items-center gap-2 text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wider mb-6 px-3 py-1.5 bg-[var(--bg-secondary)] rounded-full">
                    The problem
                  </span>
                  <h3 className="font-display text-3xl md:text-4xl lg:text-5xl mb-6 leading-tight">
                    Publishing tools turn your work into their format and their feed.
                  </h3>
                  <p className="text-[var(--text-secondary)] text-lg leading-relaxed">
                    Your writing becomes a destination link, throttled by algorithms and trapped in templates.
                    The result is content without a true source of truth.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
                    <p className="text-2xl mb-1">X</p>
                    <p className="text-sm text-[var(--text-secondary)]">Custom CSS stripped</p>
                  </div>
                  <div className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
                    <p className="text-2xl mb-1">X</p>
                    <p className="text-sm text-[var(--text-secondary)]">Scripts blocked</p>
                  </div>
                  <div className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
                    <p className="text-2xl mb-1">X</p>
                    <p className="text-sm text-[var(--text-secondary)]">Format destroyed</p>
                  </div>
                  <div className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
                    <p className="text-2xl mb-1">X</p>
                    <p className="text-sm text-[var(--text-secondary)]">Lock-in forever</p>
                  </div>
                </div>
              </div>

              <div className="space-y-12">
                <div>
                  <span className="inline-flex items-center gap-2 text-[var(--accent)] text-xs font-medium uppercase tracking-wider mb-6 px-3 py-1.5 bg-[var(--accent-soft)] rounded-full">
                    The solution
                  </span>
                  <h3 className="font-display text-3xl md:text-4xl lg:text-5xl mb-6 leading-tight">
                    Neolog is the core node. Everything else is a broadcast.
                  </h3>
                  <p className="text-[var(--text-secondary)] text-lg leading-relaxed">
                    Your content lives in a structured, versioned core, then ships outward as feeds,
                    threads, newsletters, and integrations.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 bg-[var(--accent-soft)] rounded-xl border border-[var(--accent)]/20">
                    <p className="text-2xl mb-1">OK</p>
                    <p className="text-sm text-[var(--text-primary)]">Full CSS support</p>
                  </div>
                  <div className="p-6 bg-[var(--accent-soft)] rounded-xl border border-[var(--accent)]/20">
                    <p className="text-2xl mb-1">OK</p>
                    <p className="text-sm text-[var(--text-primary)]">Scripts allowed</p>
                  </div>
                  <div className="p-6 bg-[var(--accent-soft)] rounded-xl border border-[var(--accent)]/20">
                    <p className="text-2xl mb-1">OK</p>
                    <p className="text-sm text-[var(--text-primary)]">Perfect rendering</p>
                  </div>
                  <div className="p-6 bg-[var(--accent-soft)] rounded-xl border border-[var(--accent)]/20">
                    <p className="text-2xl mb-1">OK</p>
                    <p className="text-sm text-[var(--text-primary)]">Export anytime</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features - Clean grid */}
        <section className="px-6 lg:px-12 py-24 bg-[var(--bg-primary)]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-display text-4xl md:text-5xl lg:text-6xl mb-6 leading-tight">
                Everything you need.{' '}
                <span className="italic text-[var(--text-secondary)]">Nothing you don't.</span>
              </h2>
              <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
                Built for creators who want full control
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: Code,
                  title: 'Native HTML',
                  description: 'Full document support. Your CSS, your scripts, your formatting - rendered exactly.',
                  badge: null,
                },
                {
                  icon: Eye,
                  title: 'Live preview',
                  description: 'Side-by-side editing. See exactly what readers will see, in real time.',
                  badge: null,
                },
                {
                  icon: Terminal,
                  title: 'Code that runs',
                  description: 'Interactive demos, syntax highlighting, copy buttons. Code should be alive.',
                  badge: 'interactive',
                },
                {
                  icon: GitFork,
                  title: 'Forkable posts',
                  description: 'Readers can fork your work. See the lineage. Build on ideas.',
                  badge: 'coming soon',
                },
                {
                  icon: Radio,
                  title: 'Live documents',
                  description: 'Posts that update themselves. Pull live data. Real-time embeds.',
                  badge: 'coming soon',
                },
                {
                  icon: FileDown,
                  title: 'Export anywhere',
                  description: 'HTML, Markdown, PDF, EPUB. Your content is yours. No lock-in.',
                  badge: null,
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="group p-8 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:shadow-xl transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--accent-softer)] flex items-center justify-center group-hover:bg-[var(--accent-soft)] group-hover:scale-110 transition-all duration-300">
                      <feature.icon size={24} className="text-[var(--accent)]" />
                    </div>
                    {feature.badge && (
                      <span className={`doc-badge ${feature.badge === 'interactive' ? 'doc-badge-interactive' : ''}`}>
                        {feature.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-xl mb-3">{feature.title}</h3>
                  <p className="text-[var(--text-secondary)] text-base leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative px-6 lg:px-12 py-16 bg-[var(--bg-secondary)] border-t border-[var(--border-light)]">
          <div className="relative max-w-4xl mx-auto text-center">
            <h2 className="font-display text-3xl md:text-4xl text-[var(--text-primary)] mb-4 leading-tight">
              Ready to start publishing?
            </h2>

            <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-2xl mx-auto">
              Join writers who want their work rendered exactly as intended.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link href="/signup" className="btn btn-primary">
                Start writing
              </Link>
              <Link href="/explore" className="btn btn-secondary">
                Explore
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 lg:px-12 py-12 bg-[var(--bg-primary)] border-t border-[var(--border-light)]">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="logo-mark">N</span>
                  <span className="font-display text-base font-semibold text-[var(--text-primary)]">Neolog</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] max-w-md">
                  The sovereign node for ideas. Ingest, shape, broadcast.
                </p>
              </div>

              <nav className="flex gap-8">
                <Link href="/explore" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                  Explore
                </Link>
                <Link href="/tos" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                  Terms
                </Link>
                <Link href="/privacy" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                  Privacy
                </Link>
              </nav>
            </div>

            <div className="mt-8 pt-8 border-t border-[var(--border-light)]">
              <p className="text-xs text-[var(--text-tertiary)] text-center">
                (c) 2025 Neolog
              </p>
            </div>
          </div>
        </footer>
      </main>
    </>
  )
}

