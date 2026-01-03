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
        <section className="relative px-6 lg:px-12 pt-40 pb-48 overflow-hidden">
          {/* Subtle gradient background */}
          <div
            className="absolute top-0 right-0 w-[1000px] h-[1000px] opacity-[0.02] pointer-events-none blur-3xl"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
              transform: 'translate(40%, -40%)',
            }}
          />

          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-12 gap-20 items-center">
              <div className="lg:col-span-7 animate-fade-up">
                {/* Eyebrow */}
                <div className="flex items-center gap-3 mb-12">
                  <span className="doc-badge doc-badge-live">
                    V1.0 IS LIVE
                  </span>
                </div>

                {/* Main headline */}
                <h1 className="font-display text-6xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight mb-12">
                  The web,{' '}
                  <span className="italic text-[var(--text-secondary)]">unformatted.</span>
                </h1>

                {/* Subheadline */}
                <p className="text-xl md:text-2xl leading-relaxed text-[var(--text-secondary)] mb-16 max-w-2xl">
                  Stop fighting the CMS. Write in raw HTML. We render it exactly as you intended. Your CSS, your scripts, your design.
                </p>

                {/* CTA */}
                <div className="flex flex-wrap gap-4 items-center mb-16">
                  <Link href="/signup" className="btn btn-primary btn-lg">
                    Start Publishing
                  </Link>
                  <Link href="/explore" className="btn btn-secondary btn-lg">
                    Read the Docs
                  </Link>
                </div>

                {/* Trust indicators */}
                <p className="text-sm text-[var(--text-tertiary)]">
                  Free forever. No credit card required.
                </p>
              </div>

              {/* Visual element - Code preview */}
              <div className="lg:col-span-5 hidden lg:block">
                <div className="relative">
                  <div className="relative bg-[var(--bg-inverse)] rounded-2xl p-8 shadow-2xl overflow-hidden">
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 pb-6">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                      </div>
                      <div className="font-mono text-sm leading-relaxed">
                        <div className="text-[#a855f7]">&lt;article&gt;</div>
                        <div className="pl-4 text-[#6366f1]">&lt;style&gt;</div>
                        <div className="pl-8">
                          <span className="text-[#fbbf24]">h1</span>
                          <span className="text-[#ffffff]"> &#123; </span>
                          <span className="text-[#fbbf24]">font-family</span>
                          <span className="text-[#ffffff]">: </span>
                          <span className="text-[#34d399]">'Newsreader'</span>
                          <span className="text-[#ffffff]">; &#125;</span>
                        </div>
                        <div className="pl-4 text-[#6366f1]">&lt;/style&gt;</div>
                        <div className="pl-4 mt-4 text-[#6366f1]">&lt;h1&gt;</div>
                        <div className="pl-8 text-[#ffffff]">Hello World</div>
                        <div className="pl-4 text-[#6366f1]">&lt;/h1&gt;</div>
                        <div className="text-[#a855f7] mt-4">&lt;/article&gt;</div>
                      </div>
                    </div>
                  </div>

                  {/* Output preview */}
                  <div className="mt-8 bg-[var(--bg-primary)] rounded-2xl p-8 border-2 border-[var(--border-light)]">
                    <h2 className="font-display text-4xl">Hello World.</h2>
                    <p className="text-[var(--text-secondary)] mt-3">This is how the web was meant to be read.</p>
                  </div>
                </div>
              </div>
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
        <section className="relative px-6 lg:px-12 py-32 bg-[var(--bg-secondary)] border-y border-[var(--border-light)]">
          <div className="relative max-w-4xl mx-auto text-center">
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl mb-6 leading-tight">
              Ready to publish{' '}
              <span className="italic text-[var(--text-secondary)]">your way?</span>
            </h2>

            <p className="text-xl text-[var(--text-secondary)] mb-12 max-w-2xl mx-auto">
              Join creators who want their work rendered exactly as intended.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/signup" className="btn btn-primary btn-lg">
                Start Publishing
              </Link>
              <Link href="/explore" className="btn btn-secondary btn-lg">
                Explore Examples
              </Link>
            </div>

            <p className="mt-8 text-sm text-[var(--text-tertiary)]">
              Free forever. No credit card required.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 lg:px-12 py-16 bg-[var(--bg-primary)]">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="logo-mark logo-mark-lg">N</span>
                  <span className="font-display text-xl">Neolog</span>
                </div>
                <p className="text-sm text-[var(--text-tertiary)] max-w-md">
                  The publishing platform that respects your code.
                </p>
              </div>

              <nav className="flex flex-wrap gap-8">
                <div className="flex flex-col gap-3">
                  <Link href="/explore" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                    Explore
                  </Link>
                  <Link href="/write" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                    Start Writing
                  </Link>
                </div>
                <div className="flex flex-col gap-3">
                  <Link href="/tos" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                    Terms
                  </Link>
                  <Link href="/privacy" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                    Privacy
                  </Link>
                </div>
              </nav>
            </div>

            <div className="mt-12 pt-8 border-t border-[var(--border-light)] text-center">
              <p className="text-xs text-[var(--text-tertiary)]">
                © 2025 Neolog. Made with care for the web.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </>
  )
}
