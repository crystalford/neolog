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
        <section className="flex flex-col items-center justify-center px-6 py-24 max-w-2xl mx-auto text-center">
          <h1 className="font-display text-5xl md:text-6xl font-bold leading-tight tracking-tight text-[var(--text-primary)] mb-6">
            Your ideas, always in progress
          </h1>
          <p className="text-lg text-[var(--text-secondary)] mb-10">
            Neolog is a workspace for ongoing creation. Enter your workspace to continue, refine, or begin something new. Your work is never lost, always evolving.
          </p>
          <Link
            href={session ? "/dashboard" : "/signup"}
            className="btn btn-primary btn-xl px-10 py-5 text-2xl font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            Enter Workspace
            <ArrowRight size={28} className="ml-3" />
          </Link>
        </section>
        <footer className="px-6 py-12 bg-[var(--bg-primary)] border-t border-[var(--border-light)] mt-24">
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

