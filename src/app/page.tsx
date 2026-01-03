import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { 
  Code, Eye, Terminal, FileDown, Zap, Layout,
  ArrowRight, Upload, Sparkles, GitFork, Radio,
  TrendingUp, Users, BookOpen
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
      
      <main className="pt-20">
        {/* Hero - Editorial, confident, minimal */}
        <section className="relative px-6 pt-24 pb-32 overflow-hidden">
          {/* Subtle gradient orb */}
          <div 
            className="absolute top-0 right-0 w-[800px] h-[800px] opacity-[0.03] pointer-events-none"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
              transform: 'translate(30%, -30%)',
            }}
          />
          
          <div className="max-w-3xl mx-auto animate-fade-up">
            {/* Eyebrow */}
            <div className="flex items-center gap-3 mb-8">
              <span className="doc-badge doc-badge-live">
                Now in Beta
              </span>
            </div>

            {/* Main headline */}
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl leading-[1.08] tracking-tight mb-8">
              The publishing platform that{' '}
              <span className="italic">respects</span>{' '}
              your code
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl leading-relaxed text-[var(--text-secondary)] max-w-2xl mb-12">
              Drop an HTML file and publish it exactly as you wrote it. 
              Your CSS. Your scripts. Your formatting. No compromises.
            </p>

            {/* CTA */}
            <div className="flex flex-wrap gap-4 items-center">
              <Link href="/signup" className="btn btn-primary btn-lg">
                Start writing free
                <ArrowRight size={18} />
              </Link>
              <Link href="/explore" className="btn btn-ghost btn-lg">
                See examples
              </Link>
            </div>
          </div>
        </section>

        {/* Demo/Upload section */}
        <section className="px-6 pb-24">
          <div className="max-w-4xl mx-auto">
            <Link 
              href="/write"
              className="group block relative bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-all duration-500 overflow-hidden"
            >
              {/* Animated border gradient on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div 
                  className="absolute inset-[-1px] rounded-2xl"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent) 0%, transparent 50%, var(--accent) 100%)',
                    opacity: 0.2,
                  }}
                />
              </div>
              
              <div className="relative p-12 md:p-16 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[var(--accent-soft)] mb-8 group-hover:scale-110 transition-transform duration-500">
                  <Upload size={32} className="text-[var(--accent)]" />
                </div>
                
                <h2 className="font-display text-2xl md:text-3xl mb-4">
                  Start writing now
                </h2>
                
                <p className="text-[var(--text-secondary)] text-lg max-w-md mx-auto">
                  Rich editor with formatting, images, code blocks, and more.
                </p>
              </div>
            </Link>
          </div>
        </section>

        {/* Stats */}
        {(stats.posts > 0 || stats.creators > 0) && (
          <section className="px-6 pb-16">
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <BookOpen size={24} className="mx-auto mb-3 text-[var(--accent)]" />
                  <p className="font-display text-3xl mb-1">{stats.posts.toLocaleString()}</p>
                  <p className="text-sm text-[var(--text-tertiary)]">Posts published</p>
                </div>
                <div className="text-center p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <Users size={24} className="mx-auto mb-3 text-[var(--accent)]" />
                  <p className="font-display text-3xl mb-1">{stats.creators.toLocaleString()}</p>
                  <p className="text-sm text-[var(--text-tertiary)]">Writers</p>
                </div>
                <div className="text-center p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <TrendingUp size={24} className="mx-auto mb-3 text-[var(--accent)]" />
                  <p className="font-display text-3xl mb-1">100%</p>
                  <p className="text-sm text-[var(--text-tertiary)]">Your content</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Featured Posts */}
        {featuredPosts.length > 0 && (
          <section className="px-6 py-16 bg-[var(--bg-secondary)] border-y border-[var(--border-light)]">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="font-display text-2xl">Latest from the community</h2>
                <Link href="/explore" className="btn btn-secondary btn-sm">
                  View all
                  <ArrowRight size={14} />
                </Link>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {featuredPosts.map((post: any) => (
                  <PostCard key={post.id} post={post} variant="compact" />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* The Problem / Solution */}
        <section className="px-6 py-24 bg-[var(--bg-secondary)] border-y border-[var(--border-light)]">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16">
              <div>
                <span className="text-[var(--text-tertiary)] text-sm font-medium uppercase tracking-wider mb-4 block">
                  The problem
                </span>
                <h3 className="font-display text-2xl md:text-3xl mb-6 leading-snug">
                  You spent hours crafting an HTML document. Then Medium destroyed it.
                </h3>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Stripped your CSS. Mangled your code blocks. Broke your embeds. 
                  Forced everything into their template. Your work, their format.
                </p>
              </div>
              
              <div>
                <span className="text-[var(--accent)] text-sm font-medium uppercase tracking-wider mb-4 block">
                  The solution
                </span>
                <h3 className="font-display text-2xl md:text-3xl mb-6 leading-snug">
                  Neolog renders your HTML exactly as you wrote it. Full stop.
                </h3>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Drag. Drop. Publish. Your CSS runs. Your scripts execute. 
                  Interactive demos work. It's your document, just on the web.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features - Clean grid */}
        <section className="px-6 py-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-20 stagger-children">
              <h2 className="font-display text-4xl md:text-5xl mb-6">
                Everything you'd expect.
                <br />
                <span className="text-[var(--text-secondary)]">And things you wouldn't.</span>
              </h2>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
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
                  className="group p-8 rounded-xl border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:bg-[var(--bg-secondary)] transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[var(--accent-softer)] flex items-center justify-center group-hover:bg-[var(--accent-soft)] transition-colors">
                      <feature.icon size={22} className="text-[var(--accent)]" />
                    </div>
                    {feature.badge && (
                      <span className={`doc-badge ${feature.badge === 'interactive' ? 'doc-badge-interactive' : ''}`}>
                        {feature.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-xl mb-3">{feature.title}</h3>
                  <p className="text-[var(--text-secondary)] text-[0.9375rem] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 py-32 bg-[var(--bg-inverse)] text-[var(--text-inverse)]">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display text-4xl md:text-5xl mb-6">
              Ready to publish without compromise?
            </h2>
            <p className="text-xl opacity-70 mb-12">
              Join writers and developers who want their work rendered right.
            </p>
            <Link 
              href="/signup" 
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[var(--bg-inverse)] rounded-lg font-medium hover:bg-opacity-90 transition-all hover:-translate-y-0.5"
            >
              Create your account
              <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 py-12 border-t border-[var(--border-light)]">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 bg-[var(--accent)] rounded-md flex items-center justify-center font-mono text-xs font-medium text-white">
                N
              </span>
              <span className="font-display text-lg">Neolog</span>
            </div>
            
            <nav className="flex gap-8 text-sm text-[var(--text-secondary)]">
              <Link href="/explore" className="hover:text-[var(--text-primary)] transition-colors">Explore</Link>
              <Link href="/docs" className="hover:text-[var(--text-primary)] transition-colors">Docs</Link>
              <Link href="/pricing" className="hover:text-[var(--text-primary)] transition-colors">Pricing</Link>
              <a href="https://twitter.com/neolog" className="hover:text-[var(--text-primary)] transition-colors">Twitter</a>
            </nav>
            
            <p className="text-sm text-[var(--text-tertiary)]">
              © 2025 Neolog
            </p>
          </div>
        </footer>
      </main>
    </>
  )
}
