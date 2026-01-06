import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import {
  ArrowRight,
  BarChart3,
  Globe,
  Inbox,
  PenLine,
  Share2,
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
    <div data-accent="ember">
      <Header />

      <main className="pt-14">
        {/* Hero */}
        <section className="relative px-6 lg:px-12 pt-16 pb-12 overflow-hidden bg-[var(--bg-secondary)] border-b border-[var(--border-light)]">
          <div
            className="absolute inset-0 opacity-[0.35] pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(var(--border-light) 1px, transparent 1px), linear-gradient(90deg, var(--border-light) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(circle at 30% 0%, black 0%, transparent 70%)',
            }}
          />

          <div
            className="absolute top-0 right-0 w-[900px] h-[900px] opacity-[0.02] pointer-events-none blur-3xl"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
              transform: 'translate(45%, -45%)',
            }}
          />

          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-10 items-start">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--border-light)] rounded-full px-3 py-1.5 mb-6">
                  Capture → Vault → Publish
                </p>

                <h1 className="font-display text-5xl md:text-6xl leading-tight tracking-tight text-[var(--text-primary)] mb-6">
                  Capture-first publishing.
                  <span className="block text-[var(--text-tertiary)]">Own the core. Broadcast everywhere.</span>
                </h1>

                <p className="text-lg leading-relaxed text-[var(--text-secondary)] mb-7 max-w-xl">
                  Collect inputs from anywhere, organize them into publications, turn them into posts, then distribute and measure — without
                  losing the source of truth.
                </p>

                <div className="flex flex-wrap gap-2 mb-7">
                  {["Inbox-first capture", "Publications as containers", "Distribution + analytics"].map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-full px-3 py-1"
                    >
                      {label}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                  {session ? (
                    <>
                      <Link href="/dashboard" className="btn btn-primary btn-lg">
                        Open dashboard
                      </Link>
                      <Link href="/write" className="btn btn-secondary btn-lg">
                        New post
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link href="/signup" className="btn btn-primary btn-lg">
                        Start writing
                      </Link>
                      <Link href="/explore" className="btn btn-secondary btn-lg">
                        Explore
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {/* Compact value summary */}
              <div className="hidden lg:block">
                <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-6 shadow-[var(--surface-shadow)]">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-4">Pipeline</p>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                        <Inbox size={16} className="text-[var(--text-secondary)]" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">Capture</p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">Links, snippets, notes, prompts.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                        <PenLine size={16} className="text-[var(--text-secondary)]" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">Compose</p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">Drafts, revisions, previews.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                        <Share2 size={16} className="text-[var(--text-secondary)]" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">Distribute</p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">Threads, newsletters, feeds.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pipeline cards */}
        <section className="px-6 lg:px-12 py-8">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
            {[
              { title: 'Capture', copy: 'Save prompts, links, snippets, and notes from anywhere.' },
              { title: 'Vault + Publications', copy: 'Organize your knowledge by project, with search and provenance.' },
              { title: 'Publish + Distribute', copy: 'Write once, ship outward as posts, feeds, and newsletters.' },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5 shadow-[var(--surface-shadow)] hover:shadow-[var(--surface-shadow-hover)] transition-shadow"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                  {item.title}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflows */}
        <section className="px-6 lg:px-12 pb-6">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Workflows</p>
                <h2 className="font-display text-2xl text-[var(--text-primary)]">Start with the task</h2>
              </div>
              <Link
                href={session ? '/dashboard' : '/signup'}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {session ? 'Open dashboard' : 'Get started'}
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  label: 'Create post',
                  description: 'Open the editor and start writing.',
                  href: session ? '/write' : '/signup',
                  icon: PenLine,
                },
                {
                  label: 'Review inbox',
                  description: 'Convert incoming drafts into posts.',
                  href: session ? '/inbox' : '/signup',
                  icon: Inbox,
                },
                {
                  label: 'Connect sources',
                  description: 'Add RSS feeds and sync items.',
                  href: session ? '/sources' : '/signup',
                  icon: Globe,
                },
                {
                  label: 'Distribution pack',
                  description: 'Generate threads + copies.',
                  href: session ? '/dashboard' : '/signup',
                  icon: Share2,
                },
                {
                  label: 'Analytics snapshot',
                  description: 'Track reader engagement.',
                  href: session ? '/analytics' : '/signup',
                  icon: BarChart3,
                },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-start gap-3 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] px-4 py-3 hover:border-[var(--border-medium)] shadow-[var(--surface-shadow)] hover:shadow-[var(--surface-shadow-hover)] transition-all"
                  >
                    <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                      <Icon size={16} className="text-[var(--text-secondary)]" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">{item.description}</p>
                    </div>
                  </Link>
                )
              })}

              <Link
                href="/explore"
                className="flex items-start gap-3 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] px-4 py-3 hover:border-[var(--border-medium)] shadow-[var(--surface-shadow)] hover:shadow-[var(--surface-shadow-hover)] transition-all"
              >
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <ArrowRight size={16} className="text-[var(--text-secondary)]" />
                </span>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Explore posts</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">See what the community is publishing.</p>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        {(stats.posts > 0 || stats.creators > 0) && (
          <section className="px-6 lg:px-12 py-10 bg-[var(--bg-secondary)] border-y border-[var(--border-light)]">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-2 gap-8">
                <div className="text-center">
                  <p className="font-display text-3xl text-[var(--text-primary)] mb-1">{stats.posts.toLocaleString()}</p>
                  <p className="text-sm text-[var(--text-secondary)]">Posts published</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-3xl text-[var(--text-primary)] mb-1">{stats.creators.toLocaleString()}</p>
                  <p className="text-sm text-[var(--text-secondary)]">Writers</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Featured Posts */}
        {featuredPosts.length > 0 && (
          <section className="px-6 lg:px-12 py-14 bg-[var(--bg-secondary)] border-y border-[var(--border-light)]">
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
              {session ? (
                <>
                  <Link href="/dashboard" className="btn btn-primary">
                    Open dashboard
                  </Link>
                  <Link href="/explore" className="btn btn-secondary">
                    Explore
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/signup" className="btn btn-primary">
                    Start writing
                  </Link>
                  <Link href="/explore" className="btn btn-secondary">
                    Explore
                  </Link>
                </>
              )}
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
                  Capture-first creative infrastructure. Own the core. Broadcast everywhere.
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
                (c) 2026 Neolog
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}

