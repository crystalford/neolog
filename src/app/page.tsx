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
        <section className="relative px-6 lg:px-12 pt-14 pb-10 overflow-hidden bg-[var(--bg-secondary)] border-b border-[var(--border-light)]">
          <div
            className="absolute inset-0 opacity-[0.35] pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(var(--border-light) 1px, transparent 1px), linear-gradient(90deg, var(--border-light) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(circle at 25% 0%, black 0%, transparent 72%)',
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
            <div className="grid lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-6">
                <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--border-light)] rounded-full px-3 py-1.5 mb-6">
                  Capture → Vault → Publish
                </p>

                <h1 className="font-display text-5xl md:text-6xl leading-tight tracking-tight text-[var(--text-primary)] mb-6">
                  Capture-first publishing.
                  <span className="block text-[var(--text-tertiary)]">Capture, shape, and ship — without losing the truth.</span>
                </h1>

                <p className="text-lg leading-relaxed text-[var(--text-secondary)] mb-7 max-w-xl">
                  Collect inputs from anywhere, turn them into durable publications, write posts with provenance, then distribute and measure —
                  all from one core.
                </p>

                <div className="flex flex-wrap gap-2 mb-7">
                  {['Inbox-first capture', 'Publications as containers', 'Distribution + analytics'].map((label) => (
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

                {(stats.posts > 0 || stats.creators > 0) && (
                  <div className="mt-7 flex flex-wrap gap-3">
                    {stats.posts > 0 && (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 py-2">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {stats.posts.toLocaleString()}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">posts published</span>
                      </div>
                    )}
                    {stats.creators > 0 && (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 py-2">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {stats.creators.toLocaleString()}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">writers</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hero preview */}
              <div className="hidden lg:block lg:col-span-6">
                <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] shadow-[var(--surface-shadow)] overflow-hidden">
                  {/* Faux app chrome */}
                  <div className="px-4 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-medium)]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-medium)]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-medium)]" />
                      </span>
                      <span className="ml-2 inline-flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                        <Boxes size={14} /> neolog.app
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--border-light)] rounded-full px-3 py-1">
                      <Sparkles size={14} /> Preview
                    </span>
                  </div>

                  {/* Tabs + content */}
                  <div className="px-5 pt-4 pb-5">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        {[
                          { label: 'Inbox', icon: Inbox, active: true },
                          { label: 'Vault', icon: Boxes, active: false },
                          { label: 'Publish', icon: PenLine, active: false },
                        ].map((t) => {
                          const Icon = t.icon
                          return (
                            <span
                              key={t.label}
                              className={
                                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ' +
                                (t.active
                                  ? 'bg-[var(--accent-soft)] border-[var(--border-light)] text-[var(--accent)]'
                                  : 'bg-[var(--bg-primary)] border-[var(--border-light)] text-[var(--text-tertiary)]')
                              }
                            >
                              <Icon size={13} /> {t.label}
                            </span>
                          )
                        })}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
                          <Search size={14} /> Search
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)]">
                          <MoreHorizontal size={16} className="text-[var(--text-tertiary)]" />
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-4 items-stretch">
                      {/* Left list */}
                      <div className="col-span-5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] overflow-hidden">
                        <div className="px-3 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] flex items-center justify-between">
                          <p className="text-xs font-medium text-[var(--text-primary)]">Inbox</p>
                          <span className="text-[11px] text-[var(--text-tertiary)]">2 new</span>
                        </div>

                        <div className="p-3 space-y-2">
                          <div className="rounded-lg border border-[var(--border-light)] bg-[var(--accent-soft)] px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs text-[var(--text-primary)] font-medium">Link: research memo</p>
                                <p className="text-[11px] text-[var(--text-tertiary)] mt-1 inline-flex items-center gap-1">
                                  <Link2 size={12} /> Saved 2m ago
                                </p>
                              </div>
                              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
                                <Tag size={11} /> tagged
                              </span>
                            </div>
                          </div>

                          <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs text-[var(--text-primary)] font-medium">Snippet: launch copy</p>
                                <p className="text-[11px] text-[var(--text-tertiary)] mt-1 inline-flex items-center gap-1">
                                  <PenLine size={12} /> Draft
                                </p>
                              </div>
                              <span className="inline-flex items-center rounded-full border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
                                needs review
                              </span>
                            </div>
                          </div>

                          <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs text-[var(--text-primary)] font-medium">Prompt: series outline</p>
                                <p className="text-[11px] text-[var(--text-tertiary)] mt-1 inline-flex items-center gap-1">
                                  <Sparkles size={12} /> Captured
                                </p>
                              </div>
                              <span className="inline-flex items-center rounded-full border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
                                idea
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right detail */}
                      <div className="col-span-7 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] overflow-hidden">
                        <div className="px-4 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Selected</p>
                            <p className="text-sm font-medium text-[var(--text-primary)] mt-1">research memo</p>
                          </div>
                          <span className="inline-flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                            <Clock size={14} /> 7 min read
                          </span>
                        </div>

                        <div className="p-4">
                          <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
                            <p className="text-sm text-[var(--text-primary)] font-medium mb-2">Key points</p>
                            <div className="space-y-2">
                              {[
                                'Capture sources as atoms, not docs',
                                'Keep provenance attached to every draft',
                                'Ship outward without forking the truth',
                              ].map((line) => (
                                <div key={line} className="flex items-start gap-2">
                                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-[var(--bg-primary)] border border-[var(--border-light)]">
                                    <CheckCircle2 size={12} className="text-[var(--accent)]" />
                                  </span>
                                  <p className="text-xs text-[var(--text-secondary)]">{line}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-3">
                              <p className="text-xs text-[var(--text-tertiary)]">Convert to</p>
                              <p className="text-sm font-medium text-[var(--text-primary)] mt-1">Draft post</p>
                              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">Keeps source + tags</p>
                            </div>
                            <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-3">
                              <p className="text-xs text-[var(--text-tertiary)]">Send to</p>
                              <p className="text-sm font-medium text-[var(--text-primary)] mt-1">Distribution pack</p>
                              <p className="text-[11px] text-[var(--text-tertiary)] mt-1 inline-flex items-center gap-1">
                                <Share2 size={12} /> Threads + copies
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-[var(--border-light)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {[Rss, Webhook, Mail, Globe].map((Icon, idx) => (
                          <span key={idx} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                            <Icon size={14} className="text-[var(--text-secondary)]" />
                          </span>
                        ))}
                        <span className="text-xs text-[var(--text-tertiary)]">Integrations</span>
                      </div>
                      <span className="text-xs text-[var(--text-tertiary)]">Synced 2m ago</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Workflows */}
        <section className="relative px-6 lg:px-12 py-10">
          <div
            className="absolute inset-0 opacity-[0.18] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 15%, var(--accent-soft) 0%, transparent 55%), radial-gradient(circle at 88% 25%, var(--accent-soft) 0%, transparent 50%)',
            }}
          />

          <div className="max-w-6xl mx-auto">
            <div className="rounded-3xl border border-[var(--border-light)] bg-[var(--bg-primary)] shadow-[var(--surface-shadow)] overflow-hidden">
              <div className="px-6 py-5 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Workflows</p>
                  <h2 className="font-display text-2xl text-[var(--text-primary)] mt-1">Start with a task</h2>
                </div>

                <Link
                  href={session ? '/dashboard' : '/signup'}
                  className="inline-flex items-center gap-2 text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--border-light)] rounded-full px-4 py-2 hover:opacity-90 transition-opacity"
                >
                  {session ? 'Open dashboard' : 'Get started'}
                  <ArrowRight size={14} />
                </Link>
              </div>

              <div className="p-6">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    {
                      label: 'Write a post',
                      description: 'Draft, preview, and publish with provenance.',
                      href: session ? '/write' : '/signup',
                      icon: PenLine,
                    },
                    {
                      label: 'Triage inbox',
                      description: 'Turn captured items into drafts or notes.',
                      href: session ? '/inbox' : '/signup',
                      icon: Inbox,
                    },
                    {
                      label: 'Sync sources',
                      description: 'Pull from RSS feeds and keep your vault fresh.',
                      href: session ? '/sources' : '/signup',
                      icon: Globe,
                    },
                    {
                      label: 'Distribution pack',
                      description: 'Generate threads + variants from a post.',
                      href: session ? '/dashboard' : '/signup',
                      icon: Share2,
                    },
                    {
                      label: 'Analytics snapshot',
                      description: 'Understand what’s landing with readers.',
                      href: session ? '/analytics' : '/signup',
                      icon: BarChart3,
                    },
                  ].map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="group flex items-start justify-between gap-3 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] px-4 py-4 hover:border-[var(--border-medium)] shadow-[var(--surface-shadow)] hover:shadow-[var(--surface-shadow-hover)] transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] border border-[var(--border-light)]">
                            <Icon size={16} className="text-[var(--accent)]" />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">{item.description}</p>
                          </div>
                        </div>

                        <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)] transition-colors">
                          <ArrowRight size={16} />
                        </span>
                      </Link>
                    )
                  })}

                  <Link
                    href="/explore"
                    className="group flex items-start justify-between gap-3 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] px-4 py-4 hover:border-[var(--border-medium)] shadow-[var(--surface-shadow)] hover:shadow-[var(--surface-shadow-hover)] transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                        <ArrowRight size={16} className="text-[var(--text-secondary)]" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">Explore posts</p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">See what the community is publishing.</p>
                      </div>
                    </div>

                    <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)] transition-colors">
                      <ArrowRight size={16} />
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 lg:px-12 py-10 bg-[var(--bg-secondary)] border-y border-[var(--border-light)]">
          <div className="max-w-6xl mx-auto">
            <div className="rounded-3xl border border-[var(--border-light)] bg-[var(--bg-primary)] shadow-[var(--surface-shadow)] overflow-hidden">
              <div className="px-6 py-5 bg-[var(--bg-secondary)] border-b border-[var(--border-light)]">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">How it works</p>
                <h2 className="font-display text-2xl text-[var(--text-primary)] mt-1">One system, three motions</h2>
              </div>

              <div className="p-6">
                <div className="grid md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-stretch">
                  {[
                    {
                      title: 'Capture',
                      copy: 'Save links, prompts, snippets, and notes from anywhere.',
                      icon: Inbox,
                    },
                    {
                      title: 'Vault + Publications',
                      copy: 'Organize by project, with provenance + fast search.',
                      icon: Boxes,
                    },
                    {
                      title: 'Publish + Distribute',
                      copy: 'Write once, ship outward as posts, feeds, and newsletters.',
                      icon: Share2,
                    },
                  ].map((item, idx) => {
                    const Icon = item.icon
                    return (
                      <div key={item.title} className="contents">
                        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5 shadow-[var(--surface-shadow)]">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] border border-[var(--border-light)]">
                              <Icon size={16} className="text-[var(--accent)]" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Step {idx + 1}</p>
                              <p className="text-sm font-medium text-[var(--text-primary)] mt-1">{item.title}</p>
                            </div>
                          </div>
                          <p className="text-sm text-[var(--text-secondary)]">{item.copy}</p>
                        </div>

                        {idx < 2 && (
                          <div className="hidden md:flex items-center justify-center">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                              <ArrowRight size={16} className="text-[var(--text-secondary)]" />
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        {(stats.posts > 0 || stats.creators > 0) && (
          <section className="px-6 lg:px-12 py-10">
            <div className="max-w-6xl mx-auto">
              <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] shadow-[var(--surface-shadow)] p-8">
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
              Build a core you control — then broadcast outward.
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

