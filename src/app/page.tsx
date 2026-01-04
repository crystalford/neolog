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
        <section className="relative px-6 lg:px-12 pt-20 pb-20 overflow-hidden">
          {/* Subtle gradient background */}
          <div
            className="absolute top-0 right-0 w-[1000px] h-[1000px] opacity-[0.02] pointer-events-none blur-3xl"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
              transform: 'translate(40%, -40%)',
            }}
          />

          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="animate-fade-up">
                {/* Main headline */}
                <h1 className="font-serif text-5xl md:text-6xl leading-tight tracking-tight text-gray-900 mb-6">
                  Publish raw HTML.{' '}
                  <span className="text-gray-500">No friction.</span>
                </h1>

                {/* Subheadline */}
                <p className="text-lg leading-relaxed text-gray-600 mb-8 max-w-xl">
                  A publishing platform that respects your code. Drop HTML, paste markdown, publish instantly.
                </p>

                {/* CTA */}
                <div className="flex flex-wrap gap-3 items-center">
                  <Link href="/signup" className="px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors">
                    Start writing
                  </Link>
                  <Link href="/explore" className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-50 transition-colors">
                    Explore
                  </Link>
                </div>
              </div>

              {/* Visual element - Code preview */}
              <div className="hidden lg:block">
                <div className="relative bg-gray-900 rounded-lg p-6 border border-gray-800">
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

        {/* Stats */}
        {(stats.posts > 0 || stats.creators > 0) && (
          <section className="px-6 lg:px-12 py-12 bg-gray-50 border-y border-gray-200">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <div className="text-center">
                  <p className="font-serif text-3xl text-gray-900 mb-1">{stats.posts.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Posts published</p>
                </div>
                <div className="text-center">
                  <p className="font-serif text-3xl text-gray-900 mb-1">{stats.creators.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Writers</p>
                </div>
                <div className="text-center">
                  <p className="font-serif text-3xl text-gray-900 mb-1">100%</p>
                  <p className="text-sm text-gray-600">Your content</p>
                </div>
                <div className="text-center">
                  <p className="font-serif text-3xl text-gray-900 mb-1">&lt;1s</p>
                  <p className="text-sm text-gray-600">To publish</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Featured Posts */}
        {featuredPosts.length > 0 && (
          <section className="px-6 lg:px-12 py-16 bg-white">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="font-serif text-2xl text-gray-900 mb-1">Latest posts</h2>
                  <p className="text-sm text-gray-600">From the community</p>
                </div>
                <Link href="/explore" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors hidden sm:inline-flex items-center gap-1">
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
                <Link href="/explore" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors inline-flex items-center gap-1">
                  View all posts
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* The Problem / Solution */}
        <section className="px-6 lg:px-12 py-32">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div className="space-y-12">
                <div>
                  <span className="inline-flex items-center gap-2 text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wider mb-6 px-3 py-1.5 bg-[var(--bg-secondary)] rounded-full">
                    The problem
                  </span>
                  <h3 className="font-display text-3xl md:text-4xl lg:text-5xl mb-6 leading-tight">
                    You spent hours crafting an HTML document. Then Medium destroyed it.
                  </h3>
                  <p className="text-[var(--text-secondary)] text-lg leading-relaxed">
                    Stripped your CSS. Mangled your code blocks. Broke your embeds.
                    Forced everything into their template. Your work, their format.
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
                    Neolog renders your HTML exactly as you wrote it. Full stop.
                  </h3>
                  <p className="text-[var(--text-secondary)] text-lg leading-relaxed">
                    Drag. Drop. Publish. Your CSS runs. Your scripts execute.
                    Interactive demos work. It's your document, just on the web.
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
        <section className="px-6 lg:px-12 py-32 bg-[var(--bg-primary)]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="font-display text-4xl md:text-5xl lg:text-6xl mb-6 leading-tight">
                Everything you need.{' '}
                <span className="italic text-[var(--text-secondary)]">Nothing you don't.</span>
              </h2>
              <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
                Built for creators who want full control
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                  className="group p-10 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:shadow-xl transition-all duration-300"
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
                  <h3 className="font-display text-2xl mb-4">{feature.title}</h3>
                  <p className="text-[var(--text-secondary)] text-base leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative px-6 lg:px-12 py-20 bg-gray-50 border-t border-gray-200">
          <div className="relative max-w-4xl mx-auto text-center">
            <h2 className="font-serif text-3xl md:text-4xl text-gray-900 mb-4 leading-tight">
              Ready to start publishing?
            </h2>

            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join writers who want their work rendered exactly as intended.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link href="/signup" className="px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors">
                Start writing
              </Link>
              <Link href="/explore" className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-50 transition-colors">
                Explore
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 lg:px-12 py-12 bg-white border-t border-gray-200">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 bg-black rounded-sm flex items-center justify-center">
                    <span className="text-white font-bold text-xs">N</span>
                  </div>
                  <span className="font-sans text-base font-semibold text-gray-900">Neolog</span>
                </div>
                <p className="text-sm text-gray-600 max-w-md">
                  Publish raw HTML. No friction.
                </p>
              </div>

              <nav className="flex gap-8">
                <Link href="/explore" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Explore
                </Link>
                <Link href="/tos" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Terms
                </Link>
                <Link href="/privacy" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Privacy
                </Link>
              </nav>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                (c) 2025 Neolog
              </p>
            </div>
          </div>
        </footer>
      </main>
    </>
  )
}

