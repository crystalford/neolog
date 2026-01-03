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

      <main className="pt-16">
        {/* Hero - Wide, spacious, modern */}
        <section className="relative px-6 lg:px-12 pt-32 pb-40 overflow-hidden">
          {/* Multiple gradient orbs for depth */}
          <div
            className="absolute top-0 right-0 w-[1000px] h-[1000px] opacity-[0.04] pointer-events-none blur-3xl"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
              transform: 'translate(40%, -40%)',
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-[800px] h-[800px] opacity-[0.02] pointer-events-none blur-3xl"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
              transform: 'translate(-40%, 40%)',
            }}
          />

          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-12 gap-16 items-center">
              <div className="lg:col-span-7 animate-fade-up">
                {/* Eyebrow */}
                <div className="flex items-center gap-3 mb-10">
                  <span className="doc-badge doc-badge-live">
                    Now in Beta
                  </span>
                  <span className="text-sm text-[var(--text-tertiary)]">
                    Join 100+ writers
                  </span>
                </div>

                {/* Main headline */}
                <h1 className="font-display text-6xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight mb-10">
                  The publishing platform that{' '}
                  <span className="italic text-[var(--accent)]">respects</span>{' '}
                  your code
                </h1>

                {/* Subheadline */}
                <p className="text-xl md:text-2xl leading-relaxed text-[var(--text-secondary)] mb-14">
                  Drop an HTML file and publish it exactly as you wrote it.
                  Your CSS. Your scripts. Your formatting. No compromises.
                </p>

                {/* CTA */}
                <div className="flex flex-wrap gap-4 items-center">
                  <Link href="/signup" className="btn btn-primary btn-lg">
                    Start writing free
                    <ArrowRight size={18} />
                  </Link>
                  <Link href="/explore" className="btn btn-secondary btn-lg">
                    See examples
                  </Link>
                </div>

                {/* Trust indicators */}
                <div className="flex flex-wrap gap-8 mt-16 pt-12 border-t border-[var(--border-light)]">
                  <div>
                    <p className="font-display text-3xl mb-1">100%</p>
                    <p className="text-sm text-[var(--text-tertiary)]">Your content</p>
                  </div>
                  <div>
                    <p className="font-display text-3xl mb-1">0</p>
                    <p className="text-sm text-[var(--text-tertiary)]">Lock-in</p>
                  </div>
                  <div>
                    <p className="font-display text-3xl mb-1">Free</p>
                    <p className="text-sm text-[var(--text-tertiary)]">Forever plan</p>
                  </div>
                </div>
              </div>

              {/* Visual element */}
              <div className="lg:col-span-5 hidden lg:block">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-soft)] to-transparent rounded-3xl blur-3xl opacity-30" />
                  <div className="relative bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl p-8 shadow-2xl">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-4 border-b border-[var(--border-light)]">
                        <div className="w-3 h-3 rounded-full bg-[var(--error)]" />
                        <div className="w-3 h-3 rounded-full bg-[var(--warning)]" />
                        <div className="w-3 h-3 rounded-full bg-[var(--success)]" />
                      </div>
                      <div className="font-mono text-sm space-y-2">
                        <div className="text-[var(--text-tertiary)]">// Your HTML, your way</div>
                        <div className="text-[var(--accent)]">&lt;article&gt;</div>
                        <div className="pl-4 text-[var(--text-secondary)]">&lt;style&gt;</div>
                        <div className="pl-8 text-[var(--text-tertiary)]">/* Custom CSS */</div>
                        <div className="pl-4 text-[var(--text-secondary)]">&lt;/style&gt;</div>
                        <div className="pl-4 text-[var(--text-primary)]">&lt;h1&gt;Hello World&lt;/h1&gt;</div>
                        <div className="text-[var(--accent)]">&lt;/article&gt;</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick start CTA */}
        <section className="px-6 lg:px-12 pb-32">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-8">
              <Link
                href="/write"
                className="group block relative bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] rounded-3xl p-12 hover:shadow-2xl transition-all duration-500 overflow-hidden"
              >
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-50" />

                <div className="relative">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm mb-6 group-hover:scale-110 transition-transform duration-500">
                    <PenLine size={28} className="text-white" />
                  </div>

                  <h2 className="font-display text-3xl md:text-4xl mb-4 text-white">
                    Start writing
                  </h2>

                  <p className="text-white/90 text-lg mb-8">
                    Rich editor with formatting, images, code blocks, embeds, and more. No learning curve.
                  </p>

                  <div className="inline-flex items-center gap-2 text-white font-medium">
                    Launch editor
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>

              <Link
                href="/explore"
                className="group block relative bg-[var(--bg-secondary)] rounded-3xl p-12 border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:shadow-xl transition-all duration-500"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent-soft)] mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Sparkles size={28} className="text-[var(--accent)]" />
                </div>

                <h2 className="font-display text-3xl md:text-4xl mb-4">
                  Explore posts
                </h2>

                <p className="text-[var(--text-secondary)] text-lg mb-8">
                  Discover what others are creating. From technical tutorials to interactive demos.
                </p>

                <div className="inline-flex items-center gap-2 text-[var(--accent)] font-medium">
                  Browse community
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        {(stats.posts > 0 || stats.creators > 0) && (
          <section className="px-6 lg:px-12 pb-24">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8">
                <div className="text-center p-8 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-all">
                  <BookOpen size={28} className="mx-auto mb-4 text-[var(--accent)]" />
                  <p className="font-display text-4xl mb-2">{stats.posts.toLocaleString()}</p>
                  <p className="text-sm text-[var(--text-tertiary)]">Posts published</p>
                </div>
                <div className="text-center p-8 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-all">
                  <Users size={28} className="mx-auto mb-4 text-[var(--accent)]" />
                  <p className="font-display text-4xl mb-2">{stats.creators.toLocaleString()}</p>
                  <p className="text-sm text-[var(--text-tertiary)]">Writers</p>
                </div>
                <div className="text-center p-8 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-all">
                  <TrendingUp size={28} className="mx-auto mb-4 text-[var(--accent)]" />
                  <p className="font-display text-4xl mb-2">100%</p>
                  <p className="text-sm text-[var(--text-tertiary)]">Your content</p>
                </div>
                <div className="text-center p-8 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-all">
                  <Zap size={28} className="mx-auto mb-4 text-[var(--accent)]" />
                  <p className="font-display text-4xl mb-2">&lt;1s</p>
                  <p className="text-sm text-[var(--text-tertiary)]">To publish</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Featured Posts */}
        {featuredPosts.length > 0 && (
          <section className="px-6 lg:px-12 py-24 bg-[var(--bg-secondary)] border-y border-[var(--border-light)]">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="font-display text-3xl md:text-4xl mb-2">Latest from the community</h2>
                  <p className="text-[var(--text-secondary)]">See what writers are creating on Neolog</p>
                </div>
                <Link href="/explore" className="btn btn-secondary hidden sm:inline-flex">
                  View all
                  <ArrowRight size={16} />
                </Link>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {featuredPosts.map((post: any) => (
                  <PostCard key={post.id} post={post} variant="compact" />
                ))}
              </div>

              <div className="mt-12 text-center sm:hidden">
                <Link href="/explore" className="btn btn-secondary">
                  View all posts
                  <ArrowRight size={16} />
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
                    <p className="text-2xl mb-1">❌</p>
                    <p className="text-sm text-[var(--text-secondary)]">Custom CSS stripped</p>
                  </div>
                  <div className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
                    <p className="text-2xl mb-1">❌</p>
                    <p className="text-sm text-[var(--text-secondary)]">Scripts blocked</p>
                  </div>
                  <div className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
                    <p className="text-2xl mb-1">❌</p>
                    <p className="text-sm text-[var(--text-secondary)]">Format destroyed</p>
                  </div>
                  <div className="p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
                    <p className="text-2xl mb-1">❌</p>
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
                    <p className="text-2xl mb-1">✓</p>
                    <p className="text-sm text-[var(--text-primary)]">Full CSS support</p>
                  </div>
                  <div className="p-6 bg-[var(--accent-soft)] rounded-xl border border-[var(--accent)]/20">
                    <p className="text-2xl mb-1">✓</p>
                    <p className="text-sm text-[var(--text-primary)]">Scripts allowed</p>
                  </div>
                  <div className="p-6 bg-[var(--accent-soft)] rounded-xl border border-[var(--accent)]/20">
                    <p className="text-2xl mb-1">✓</p>
                    <p className="text-sm text-[var(--text-primary)]">Perfect rendering</p>
                  </div>
                  <div className="p-6 bg-[var(--accent-soft)] rounded-xl border border-[var(--accent)]/20">
                    <p className="text-2xl mb-1">✓</p>
                    <p className="text-sm text-[var(--text-primary)]">Export anytime</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features - Clean grid */}
        <section className="px-6 lg:px-12 py-32 bg-[var(--bg-secondary)] border-y border-[var(--border-light)]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="font-display text-4xl md:text-5xl lg:text-6xl mb-6">
                Everything you'd expect.
                <br />
                <span className="text-[var(--text-secondary)]">And things you wouldn't.</span>
              </h2>
              <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
                Built for writers who want full control over their content
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Code,
                  title: 'Native HTML',
                  description: 'Full document support. Your CSS, your scripts, your formatting—rendered exactly.',
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
        <section className="relative px-6 lg:px-12 py-40 bg-[var(--bg-inverse)] text-[var(--text-inverse)] overflow-hidden">
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] " />
          </div>

          <div className="relative max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full mb-8">
              <Sparkles size={16} className="text-[var(--accent)]" />
              <span className="text-sm font-medium">Join the beta</span>
            </div>

            <h2 className="font-display text-5xl md:text-6xl lg:text-7xl mb-8 leading-tight">
              Ready to publish without compromise?
            </h2>

            <p className="text-2xl opacity-80 mb-16 max-w-2xl mx-auto leading-relaxed">
              Join writers and developers who want their work rendered right.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/signup"
                className="btn btn-primary btn-lg"
                style={{ backgroundColor: 'white', color: 'var(--bg-inverse)' }}
              >
                Create your account
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/explore"
                className="btn btn-ghost btn-lg"
                style={{ color: 'white' }}
              >
                Explore examples
              </Link>
            </div>

            <p className="mt-12 text-sm opacity-60">
              Free forever. No credit card required.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 lg:px-12 py-16 border-t border-[var(--border-light)] bg-[var(--bg-secondary)]">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-4 gap-12 mb-12">
              <div className="md:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <span className="logo-mark logo-mark-lg">
                    N
                  </span>
                  <span className="font-display text-2xl">neolog</span>
                </div>
                <p className="text-[var(--text-secondary)] max-w-sm">
                  The publishing platform that respects your code. Built for writers who want full control.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Product</h4>
                <nav className="flex flex-col gap-3">
                  <Link href="/explore" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Explore</Link>
                  <Link href="/tags" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Topics</Link>
                  <Link href="/curators" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Curators</Link>
                  <Link href="/write" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Start writing</Link>
                </nav>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Legal</h4>
                <nav className="flex flex-col gap-3">
                  <Link href="/tos" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Terms</Link>
                  <Link href="/privacy" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Privacy</Link>
                  <a href="https://x.com/neologx" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 1200 1227" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M714.163 519.284L1160.89 0H1055.03L666.689 450.887L357.328 0H0L468.492 681.821L0 1227H105.866L515.439 751.218L842.672 1227H1200L714.163 519.284ZM569.165 687.828L521.797 619.934L144.011 79.694H306.615L611.412 515.685L658.78 583.579L1055.08 1150.3H892.476L569.165 687.828Z"
                      />
                    </svg>
                    X / Twitter
                  </a>
                </nav>
              </div>
            </div>

            <div className="pt-8 border-t border-[var(--border-light)] flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-[var(--text-tertiary)]">
                © 2025 Neolog. All rights reserved.
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                Made with care for the web
              </p>
            </div>
          </div>
        </footer>
      </main>
    </>
  )
}
