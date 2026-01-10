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
    <div>
      <Header />
      <main className="pt-14 bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center px-6 py-24 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/20 mb-6">
            <Sparkles size={16} className="text-[var(--accent)]" />
            <span className="text-sm font-medium text-[var(--accent)]">The publishing platform that actually gets you readers</span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-bold leading-tight tracking-tight text-[var(--text-primary)] mb-6">
            Publish once.<br />Reach everywhere.
          </h1>
          <p className="text-xl md:text-2xl text-[var(--text-secondary)] mb-12 max-w-3xl leading-relaxed">
            Built-in discovery. Advanced SEO. Multi-platform distribution. Zero revenue tax.
            <span className="font-semibold text-[var(--text-primary)]"> You own everything.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-16">
            <Link
              href={session ? "/write" : "/signup"}
              className="btn btn-primary btn-xl px-10 py-5 text-xl font-semibold shadow-xl hover:shadow-2xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {session ? "Start Writing" : "Start Free — Get Readers"}
              <ArrowRight size={24} className="ml-3" />
            </Link>
            <Link
              href="/explore"
              className="btn btn-secondary btn-xl px-10 py-5 text-xl font-semibold"
            >
              Explore Posts
            </Link>
          </div>

          {/* Comparison badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[var(--text-tertiary)] mb-8">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-500" />
              <span>Better discovery than <strong className="text-[var(--text-secondary)]">Ghost</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-500" />
              <span>No 10% tax like <strong className="text-[var(--text-secondary)]">Substack</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-500" />
              <span>Your audience, not <strong className="text-[var(--text-secondary)]">Medium's</strong></span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-8 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <FileText size={16} />
              <span>{stats.posts} posts published</span>
            </div>
            <div className="flex items-center gap-2">
              <PenLine size={16} />
              <span>{stats.creators} creators</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe size={16} />
              <span>RSS, ActivityPub, ePub</span>
            </div>
          </div>

          {/* Trending Topics */}
          {trendingTags.length > 0 && (
            <div className="mt-12 max-w-2xl mx-auto">
              <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={18} className="text-[var(--accent)]" />
                  <h3 className="font-display text-lg">Trending Topics This Week</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {trendingTags.map((tag) => (
                    <Link
                      key={tag.slug}
                      href={`/explore?tag=${tag.slug}`}
                      className="px-3 py-1.5 rounded-full text-sm font-medium border border-[var(--border-light)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
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
        <section className="px-6 py-20 max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
              Features Nobody Else Has
            </h2>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
              Not just another blogging platform. These features actually get you readers.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Traffic-First */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-[var(--bg-primary)] to-[var(--bg-secondary)] border-2 border-[var(--accent)]/30 shadow-lg hover:shadow-2xl hover:border-[var(--accent)]/50 transition-all duration-300">
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50/80 shadow-inner">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-600/30 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                  <BarChart3 className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              <h3 className="font-display text-2xl mb-3 text-[var(--text-primary)]">Traffic-First SEO</h3>
              <p className="text-[var(--text-secondary)] mb-4">
                Real-time optimization suggestions, readability scoring, and keyword insights. See your SEO score while you write.
              </p>
              <div className="text-sm text-green-600 font-medium">✅ Live now in Write page</div>
            </div>

            {/* ActivityPub Native */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-[var(--bg-primary)] to-[var(--bg-secondary)] border-2 border-[var(--accent)]/30 shadow-lg hover:shadow-2xl hover:border-purple-500/50 transition-all duration-300">
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-200 bg-purple-50/80 shadow-inner">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/30 to-purple-700/30 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                  <Globe className="w-8 h-8 text-purple-600" />
                </div>
              </div>
              <h3 className="font-display text-2xl mb-3 text-[var(--text-primary)]">Fediverse Native</h3>
              <p className="text-[var(--text-secondary)] mb-4">
                Your posts appear in Mastodon feeds automatically. Not as links—as native content. Reach 10M+ fediverse users instantly.
              </p>
              <div className="text-sm text-purple-600 font-medium">🚧 Coming Q1 2026</div>
            </div>

            {/* Generative Covers */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-[var(--bg-primary)] to-[var(--bg-secondary)] border-2 border-[var(--accent)]/30 shadow-lg hover:shadow-2xl hover:border-pink-500/50 transition-all duration-300">
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-pink-200 bg-pink-50/80 shadow-inner">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-500/30 to-rose-700/30 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                  <Palette className="w-8 h-8 text-pink-600" />
                </div>
              </div>
              <h3 className="font-display text-2xl mb-3 text-[var(--text-primary)]">Generative Covers</h3>
              <p className="text-[var(--text-secondary)] mb-4">
                Every post gets a unique visual generated from its content hash. No stock photos. No AI slop. Your words create your aesthetic.
              </p>
              <div className="text-sm text-green-600 font-medium">✅ Live now on all posts</div>
            </div>

            {/* ePub Export */}
            <div className="group p-8 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-blue-500/50 hover:shadow-xl transition-all duration-300">
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50/80 shadow-inner">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-600/30 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                  <BookOpen className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              <h3 className="font-display text-2xl mb-3">One-Click Book Export</h3>
              <p className="text-[var(--text-secondary)] mb-4">
                Export your entire publication as a properly formatted ePub book. Table of contents, chapters, metadata—done.
              </p>
              <div className="text-sm text-green-600 font-medium">✅ Live now on profile pages</div>
            </div>

            {/* Multi-Platform Distribution */}
            <div className="group p-8 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-orange-500/50 hover:shadow-xl transition-all duration-300">
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50/80 shadow-inner">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-orange-500/30 to-amber-600/30 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                  <Rocket className="w-8 h-8 text-orange-600" />
                </div>
              </div>
              <h3 className="font-display text-2xl mb-3">Multi-Platform Reach</h3>
              <p className="text-[var(--text-secondary)] mb-4">
                One post becomes: a webpage, ActivityPub object, RSS item, ePub chapter, and social posts for X/LinkedIn/Reddit.
              </p>
              <div className="text-sm text-green-600 font-medium">✅ Medium & Dev.to live now</div>
            </div>

            {/* Ownership */}
            <div className="group p-8 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-emerald-500/50 hover:shadow-xl transition-all duration-300">
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/80 shadow-inner">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-green-600/30 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                  <Lock className="w-8 h-8 text-emerald-600" strokeWidth={1.5} />
                </div>
              </div>
              <h3 className="font-display text-2xl mb-3">Radical Ownership</h3>
              <p className="text-[var(--text-secondary)] mb-4">
                Export everything (JSON, Markdown, ePub). RSS feeds are first-class. No algorithmic mystery. You can leave anytime.
              </p>
              <div className="text-sm text-green-600 font-medium">✅ Available now</div>
            </div>
          </div>
        </section>

        {/* Traditional Features */}
        <section className="px-6 py-16 max-w-6xl mx-auto">
          <h3 className="font-display text-3xl text-center mb-12 text-[var(--text-secondary)]">Plus Everything You Expect</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Rich Editor */}
            <div className="group relative flex flex-col items-center text-center p-6 rounded-2xl border border-[var(--border-light)]/50 bg-[var(--bg-primary)]/50 backdrop-blur-sm hover:bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/50 shadow-inner">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-80 group-hover:opacity-100 transition-opacity">
                  <PenLine className="w-6 h-6 text-[var(--text-primary)]" />
                </div>
              </div>
              <h4 className="text-lg font-medium text-[var(--text-primary)] mb-1">Rich Editor</h4>
              <p className="text-sm text-[var(--text-secondary)]">Markdown, code, embeds</p>
            </div>

            {/* Newsletters */}
            <div className="group relative flex flex-col items-center text-center p-6 rounded-2xl border border-[var(--border-light)]/50 bg-[var(--bg-primary)]/50 backdrop-blur-sm hover:bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/50 shadow-inner">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-80 group-hover:opacity-100 transition-opacity">
                  <Mail className="w-6 h-6 text-[var(--text-primary)]" />
                </div>
              </div>
              <h4 className="text-lg font-medium text-[var(--text-primary)] mb-1">Newsletters</h4>
              <p className="text-sm text-[var(--text-secondary)]">Email your subscribers</p>
            </div>

            {/* Series */}
            <div className="group relative flex flex-col items-center text-center p-6 rounded-2xl border border-[var(--border-light)]/50 bg-[var(--bg-primary)]/50 backdrop-blur-sm hover:bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/50 shadow-inner">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-80 group-hover:opacity-100 transition-opacity">
                  <Layers className="w-6 h-6 text-[var(--text-primary)]" />
                </div>
              </div>
              <h4 className="text-lg font-medium text-[var(--text-primary)] mb-1">Series</h4>
              <p className="text-sm text-[var(--text-secondary)]">Organize related posts</p>
            </div>

            {/* Scheduling */}
            <div className="group relative flex flex-col items-center text-center p-6 rounded-2xl border border-[var(--border-light)]/50 bg-[var(--bg-primary)]/50 backdrop-blur-sm hover:bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/50 shadow-inner">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-80 group-hover:opacity-100 transition-opacity">
                  <Clock className="w-6 h-6 text-[var(--text-primary)]" />
                </div>
              </div>
              <h4 className="text-lg font-medium text-[var(--text-primary)] mb-1">Scheduling</h4>
              <p className="text-sm text-[var(--text-secondary)]">Queue your posts</p>
            </div>

            {/* Topics */}
            <div className="group relative flex flex-col items-center text-center p-6 rounded-2xl border border-[var(--border-light)]/50 bg-[var(--bg-primary)]/50 backdrop-blur-sm hover:bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/50 shadow-inner">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-80 group-hover:opacity-100 transition-opacity">
                  <Tag className="w-6 h-6 text-[var(--text-primary)]" />
                </div>
              </div>
              <h4 className="text-lg font-medium text-[var(--text-primary)] mb-1">Topics</h4>
              <p className="text-sm text-[var(--text-secondary)]">Categorize content</p>
            </div>

            {/* RSS Feeds */}
            <div className="group relative flex flex-col items-center text-center p-6 rounded-2xl border border-[var(--border-light)]/50 bg-[var(--bg-primary)]/50 backdrop-blur-sm hover:bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/50 shadow-inner">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-80 group-hover:opacity-100 transition-opacity">
                  <Rss className="w-6 h-6 text-[var(--text-primary)]" />
                </div>
              </div>
              <h4 className="text-lg font-medium text-[var(--text-primary)] mb-1">RSS Feeds</h4>
              <p className="text-sm text-[var(--text-secondary)]">Atom, JSON too</p>
            </div>

            {/* Semantic Search */}
            <div className="group relative flex flex-col items-center text-center p-6 rounded-2xl border border-[var(--border-light)]/50 bg-[var(--bg-primary)]/50 backdrop-blur-sm hover:bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/50 shadow-inner">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-80 group-hover:opacity-100 transition-opacity">
                  <Sparkles className="w-6 h-6 text-[var(--text-primary)]" />
                </div>
              </div>
              <h4 className="text-lg font-medium text-[var(--text-primary)] mb-1">Semantic Search</h4>
              <p className="text-sm text-[var(--text-secondary)]">AI-powered discovery</p>
            </div>

            {/* Version History */}
            <div className="group relative flex flex-col items-center text-center p-6 rounded-2xl border border-[var(--border-light)]/50 bg-[var(--bg-primary)]/50 backdrop-blur-sm hover:bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-all duration-300">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/50 shadow-inner">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-zinc-500/20 to-slate-500/20 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 opacity-80 group-hover:opacity-100 transition-opacity">
                  <History className="w-6 h-6 text-[var(--text-primary)]" />
                </div>
              </div>
              <h4 className="text-lg font-medium text-[var(--text-primary)] mb-1">Version History</h4>
              <p className="text-sm text-[var(--text-secondary)]">Never lose work</p>
            </div>
          </div>
        </section>

        {/* Import Section */}
        <section className="px-6 py-20 max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-primary)] rounded-3xl border-2 border-[var(--accent)]/20 p-12 text-center shadow-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/30 mb-6">
              <Inbox size={16} className="text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--accent)]">Switch in 60 seconds</span>
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
              Already Publishing?<br />Bring Your Content.
            </h2>
            <p className="text-xl text-[var(--text-secondary)] mb-10 max-w-2xl mx-auto">
              <strong className="text-[var(--text-primary)]">Switch in minutes.</strong> Import from Ghost, Substack, Medium, or WordPress. Keep your URLs, preserve your SEO, own your audience.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Link
                href="/import"
                className="btn btn-primary btn-lg px-8 py-4 text-lg font-semibold"
              >
                Import Your Content
                <ArrowRight size={20} className="ml-2" />
              </Link>
              <Link
                href="/roadmap"
                className="btn btn-secondary btn-lg px-8 py-4 text-lg font-semibold"
              >
                See What's Coming
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-[var(--text-tertiary)]">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500" />
                <span>Ghost JSON</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500" />
                <span>Substack ZIP</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500" />
                <span>Medium HTML</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500" />
                <span>RSS/Atom</span>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Posts */}
        {featuredPosts.length > 0 && (
          <section className="px-6 py-16 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-display text-3xl">Recent Posts on Neolog</h2>
              <Link href="/explore" className="text-[var(--accent)] hover:underline flex items-center gap-1">
                Explore all
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredPosts.map((post: any) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}

        <footer className="px-6 py-12 bg-[var(--bg-primary)] border-t border-[var(--border-light)] mt-16">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-4 gap-8 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="logo-mark">N</span>
                  <span className="font-display text-lg font-bold text-[var(--text-primary)]">Neolog</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  The publishing platform that actually gets you readers.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-3">Platform</h4>
                <nav className="flex flex-col gap-2">
                  <Link href="/explore" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Explore
                  </Link>
                  <Link href="/search" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Search
                  </Link>
                  <Link href="/import" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Import
                  </Link>
                </nav>
              </div>
              <div>
                <h4 className="font-semibold mb-3">Resources</h4>
                <nav className="flex flex-col gap-2">
                  <Link href="/roadmap" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Roadmap
                  </Link>
                  <Link href="/readme" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    README
                  </Link>
                  <Link href="/architecture" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Architecture
                  </Link>
                </nav>
              </div>
              <div>
                <h4 className="font-semibold mb-3">Legal</h4>
                <nav className="flex flex-col gap-2">
                  <Link href="/tos" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Terms
                  </Link>
                  <Link href="/privacy" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Privacy
                  </Link>
                </nav>
              </div>
            </div>
            <div className="pt-8 border-t border-[var(--border-light)] text-center">
              <p className="text-sm text-[var(--text-tertiary)]">
                © 2026 Neolog. Open source. MIT License. Own your content.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}

