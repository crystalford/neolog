import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Boxes,
  CheckCircle2,
  Clock,
  FileText,
  Link2,
  Globe,
  History,
  Inbox,
  Layers,
  Lock,
  Mail,
  MoreHorizontal,
  Palette,
  PenLine,
  Rocket,
  Rss,
  Search,
  Share2,
  Sparkles,
  Tag,
  TrendingUp,
  Webhook,
} from 'lucide-react'

export default async function Home() {
  const supabase = createClient()

  const [{ data: auth }, featuredPostsRes, postsCountRes, creatorsCountRes, trendingTagsRes] = await Promise.all([
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
          'publication:publications(id, slug, name, logo_url)',
          'series:series(title, slug)',
        ].join(','),
      )
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(6),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('post_tags').select('tag_id, tags(id, name, slug)').limit(1000),
  ])

  const session = auth?.session ?? null
  const featuredPosts = featuredPostsRes.data || []
  const stats = {
    posts: postsCountRes.count || 0,
    creators: creatorsCountRes.count || 0,
  }

  // Trending tags
  const tagCounts = new Map<string, { name: string; slug: string; count: number }>()
  const tagData = trendingTagsRes.data || []
  tagData.forEach((pt: any) => {
    if (pt.tags) {
      const key = pt.tags.slug
      const existing = tagCounts.get(key)
      if (existing) {
        existing.count++
      } else {
        tagCounts.set(key, { name: pt.tags.name, slug: pt.tags.slug, count: 1 })
      }
    }
  })
  const trendingTags = Array.from(tagCounts.values()).sort((a, b) => b.count - a.count).slice(0, 5)

  return (
    <div className="bg-[var(--bg-primary)] min-h-screen">
      <Header />
      <main className="pt-14">
        {/* Hero Section - Vercel-inspired */}
        <section className="relative flex flex-col items-center justify-center px-6 py-32 max-w-6xl mx-auto text-center overflow-hidden">
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
          
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-medium)] mb-8 backdrop-blur-sm">
              <Sparkles size={14} className="text-[var(--accent)]" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">The publishing platform that gets you readers</span>
            </div>

            <h1 className="font-display text-6xl md:text-8xl font-bold leading-[1.1] tracking-tighter text-[var(--text-primary)] mb-6 text-balance">
              Publish once.
              <br />
              <span className="bg-gradient-to-r from-[var(--accent)] via-[var(--accent-purple)] to-[var(--accent-cyan)] bg-clip-text text-transparent">
                Reach everywhere.
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-[var(--text-secondary)] mb-12 max-w-2xl mx-auto leading-relaxed">
              Built-in discovery. Advanced SEO. Multi-platform distribution.
              <br />
              <span className="text-[var(--text-primary)]">Zero revenue tax. You own everything.</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-16 justify-center">
              <Link
                href={session ? "/write" : "/signup"}
                className="btn btn-primary btn-lg group"
              >
                {session ? "Start Writing" : "Get Started Free"}
                <ArrowRight size={20} className="ml-2 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/explore"
                className="btn btn-secondary btn-lg"
              >
                Explore Posts
              </Link>
            </div>

            {/* Comparison badges */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[var(--text-tertiary)] mb-10">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-light)]">
                <CheckCircle2 size={14} className="text-[var(--success)]" />
                <span>Better discovery than <strong className="text-[var(--text-secondary)]">Ghost</strong></span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-light)]">
                <CheckCircle2 size={14} className="text-[var(--success)]" />
                <span>No 10% tax like <strong className="text-[var(--text-secondary)]">Substack</strong></span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-light)]">
                <CheckCircle2 size={14} className="text-[var(--success)]" />
                <span>Your audience, not <strong className="text-[var(--text-secondary)]">Medium's</strong></span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[var(--text-tertiary)]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                <span>{stats.posts} posts published</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-purple)]" />
                <span>{stats.creators} creators</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)]" />
                <span>RSS, ActivityPub, ePub</span>
              </div>
            </div>

          {/* Trending Topics */}
          {trendingTags.length > 0 && (
            <div className="mt-16 max-w-3xl mx-auto relative z-10">
              <div className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-medium)] backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-[var(--accent)]" />
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Trending Topics</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {trendingTags.map((tag) => (
                    <Link
                      key={tag.slug}
                      href={`/explore?tag=${tag.slug}`}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border-light)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all"
                    >
                      #{tag.name} <span className="text-[var(--text-tertiary)]">({tag.count})</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Unique Features Section */}
        <section className="px-6 py-24 max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-medium)] mb-6">
              <Boxes size={14} className="text-[var(--accent)]" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">Features</span>
            </div>
            <h2 className="font-display text-5xl md:text-6xl font-bold mb-6 tracking-tight">
              Features Nobody Else Has
            </h2>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
              Not just another blogging platform. These features actually get you readers.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Traffic-First */}
            <div className="group relative p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-medium)] hover:border-[var(--accent)]/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--accent)]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  <BarChart3 className="w-6 h-6 text-[var(--accent)]" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2 text-[var(--text-primary)]">Traffic-First SEO</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Real-time optimization suggestions, readability scoring, and keyword insights. See your SEO score while you write.
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--success)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                  Live now
                </div>
              </div>
            </div>

            {/* ActivityPub Native */}
            <div className="group relative p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-medium)] hover:border-[var(--accent-purple)]/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--accent-purple)]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/20">
                  <Globe className="w-6 h-6 text-[var(--accent-purple)]" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2 text-[var(--text-primary)]">Fediverse Native</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Your posts appear in Mastodon feeds automatically. Not as links - as native content. Reach 10M+ fediverse users instantly.
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-purple)]">
                  <Clock size={12} />
                  Coming Q1 2026
                </div>
              </div>
            </div>

            {/* Generative Covers */}
            <div className="group relative p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-medium)] hover:border-[var(--accent-cyan)]/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--accent-cyan)]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20">
                  <Palette className="w-6 h-6 text-[var(--accent-cyan)]" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2 text-[var(--text-primary)]">Generative Covers</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Every post gets a unique visual generated from its content hash. No stock photos. No AI slop. Your words create your aesthetic.
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--success)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                  Live now
                </div>
              </div>
            </div>

            {/* ePub Export */}
            <div className="group relative p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-medium)] hover:border-[var(--accent)]/50 transition-all duration-300">
              <div className="relative z-10">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  <BookOpen className="w-6 h-6 text-[var(--accent)]" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2 text-[var(--text-primary)]">One-Click Book Export</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Export your entire publication as a properly formatted ePub book. Table of contents, chapters, metadata - done.
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--success)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                  Live now
                </div>
              </div>
            </div>

            {/* Multi-Platform Distribution */}
            <div className="group relative p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-medium)] hover:border-[var(--accent-purple)]/50 transition-all duration-300">
              <div className="relative z-10">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/20">
                  <Rocket className="w-6 h-6 text-[var(--accent-purple)]" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2 text-[var(--text-primary)]">Multi-Platform Reach</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                  One post becomes: a webpage, ActivityPub object, RSS item, ePub chapter, and social posts for X/LinkedIn/Reddit.
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--success)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                  Live now
                </div>
              </div>
            </div>

            {/* Ownership */}
            <div className="group relative p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-medium)] hover:border-[var(--accent-cyan)]/50 transition-all duration-300">
              <div className="relative z-10">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20">
                  <Lock className="w-6 h-6 text-[var(--accent-cyan)]" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2 text-[var(--text-primary)]">Radical Ownership</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Export everything (JSON, Markdown, ePub). RSS feeds are first-class. No algorithmic mystery. You can leave anytime.
                </p>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--success)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                  Live now
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Traditional Features */}
        <section className="px-6 py-20 max-w-7xl mx-auto">
          <h3 className="font-display text-2xl text-center mb-12 text-[var(--text-secondary)]">Plus Everything You Expect</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
            {/* Rich Editor */}
            <div className="group relative flex flex-col items-center text-center p-5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                <PenLine className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Rich Editor</h4>
              <p className="text-xs text-[var(--text-tertiary)]">Markdown, code, embeds</p>
            </div>

            {/* Newsletters */}
            <div className="group relative flex flex-col items-center text-center p-5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                <Mail className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Newsletters</h4>
              <p className="text-xs text-[var(--text-tertiary)]">Email your subscribers</p>
            </div>

            {/* Series */}
            <div className="group relative flex flex-col items-center text-center p-5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                <Layers className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Series</h4>
              <p className="text-xs text-[var(--text-tertiary)]">Organize related posts</p>
            </div>

            {/* Scheduling */}
            <div className="group relative flex flex-col items-center text-center p-5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                <Clock className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Scheduling</h4>
              <p className="text-xs text-[var(--text-tertiary)]">Queue your posts</p>
            </div>

            {/* Topics */}
            <div className="group relative flex flex-col items-center text-center p-5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                <Tag className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Topics</h4>
              <p className="text-xs text-[var(--text-tertiary)]">Categorize content</p>
            </div>

            {/* RSS Feeds */}
            <div className="group relative flex flex-col items-center text-center p-5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                <Rss className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">RSS Feeds</h4>
              <p className="text-xs text-[var(--text-tertiary)]">Atom, JSON too</p>
            </div>

            {/* Semantic Search */}
            <div className="group relative flex flex-col items-center text-center p-5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                <Sparkles className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Semantic Search</h4>
              <p className="text-xs text-[var(--text-tertiary)]">AI-powered discovery</p>
            </div>

            {/* Version History */}
            <div className="group relative flex flex-col items-center text-center p-5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                <History className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Version History</h4>
              <p className="text-xs text-[var(--text-tertiary)]">Never lose work</p>
            </div>
          </div>
        </section>

        {/* Import Section */}
        <section className="px-6 py-24 max-w-5xl mx-auto">
          <div className="relative overflow-hidden bg-[var(--bg-card)] rounded-2xl border border-[var(--border-medium)] p-12 text-center">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-medium)] mb-6">
                <Inbox size={14} className="text-[var(--accent)]" />
                <span className="text-xs font-medium text-[var(--text-secondary)]">Switch in 60 seconds</span>
              </div>
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                Already Publishing?
                <br />
                <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-purple)] bg-clip-text text-transparent">
                  Bring Your Content.
                </span>
              </h2>
              <p className="text-lg text-[var(--text-secondary)] mb-10 max-w-2xl mx-auto">
                <span className="text-[var(--text-primary)]">Switch in minutes.</span> Import from Ghost, Substack, Medium, or WordPress. Keep your URLs, preserve your SEO, own your audience.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
                <Link
                  href="/import"
                  className="btn btn-primary btn-lg group"
                >
                  Import Your Content
                  <ArrowRight size={20} className="ml-2 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/roadmap"
                  className="btn btn-secondary btn-lg"
                >
                  See What's Coming
                </Link>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-[var(--text-tertiary)]">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[var(--success)]" />
                  <span>Ghost JSON</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[var(--success)]" />
                  <span>Substack ZIP</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[var(--success)]" />
                  <span>Medium HTML</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[var(--success)]" />
                  <span>RSS/Atom</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Posts */}
        {featuredPosts.length > 0 && (
          <section className="px-6 py-20 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-10">
              <h2 className="font-display text-3xl font-semibold">Recent Posts on Neolog</h2>
              <Link href="/explore" className="text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1.5 text-sm font-medium transition-colors group">
                Explore all
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredPosts.map((post: any) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}

        <footer className="px-6 py-16 bg-[var(--bg-secondary)] border-t border-[var(--border-medium)] mt-24">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-4 gap-12 mb-12">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="logo-mark">N</span>
                  <span className="font-display text-lg font-bold text-[var(--text-primary)]">Neolog</span>
                </div>
                <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
                  The publishing platform that actually gets you readers.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-4 text-[var(--text-primary)]">Platform</h4>
                <nav className="flex flex-col gap-2.5">
                  <Link href="/explore" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    Explore
                  </Link>
                  <Link href="/search" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    Search
                  </Link>
                  <Link href="/import" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    Import
                  </Link>
                </nav>
              </div>
              <div>
                <h4 className="font-semibold mb-4 text-[var(--text-primary)]">Resources</h4>
                <nav className="flex flex-col gap-2.5">
                  <Link href="/roadmap" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    Roadmap
                  </Link>
                  <Link href="/readme" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    README
                  </Link>
                  <Link href="/architecture" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    Architecture
                  </Link>
                </nav>
              </div>
              <div>
                <h4 className="font-semibold mb-4 text-[var(--text-primary)]">Legal</h4>
                <nav className="flex flex-col gap-2.5">
                  <Link href="/tos" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    Terms
                  </Link>
                  <Link href="/privacy" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    Privacy
                  </Link>
                </nav>
              </div>
            </div>
            <div className="pt-8 border-t border-[var(--border-medium)] text-center">
              <p className="text-xs text-[var(--text-tertiary)]">
                © 2026 Neolog. Open source. MIT License. Own your content.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
