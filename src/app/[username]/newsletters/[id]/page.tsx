import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Mail, Calendar, ArrowLeft, Share2 } from 'lucide-react'

interface Props {
  params: {
    username: string
    id: string
  }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
  
  const { data: newsletter } = await supabase
    .from('newsletters')
    .select('subject, author:profiles(display_name, username)')
    .eq('id', params.id)
    .eq('is_public', true)
    .single()
  
  if (!newsletter) return { title: 'Not Found' }

  return {
    title: `${newsletter.subject} — Neolog`,
  }
}

export default async function NewsletterDetailPage({ params }: Props) {
  const supabase = createClient()
  
  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .single()
  
  if (!profile) notFound()

  // Get newsletter
  const { data: newsletter } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', params.id)
    .eq('author_id', profile.id)
    .eq('is_public', true)
    .not('sent_at', 'is', null)
    .single()

  if (!newsletter) notFound()

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="pt-8 mb-8">
            <Link 
              href={`/${params.username}/newsletters`}
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-6"
            >
              <ArrowLeft size={14} />
              Newsletter Archive
            </Link>
            
            <h1 className="font-display text-3xl md:text-4xl mb-4">
              {newsletter.subject}
            </h1>
            
            <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
              <Link href={`/${params.username}`} className="flex items-center gap-2 hover:text-[var(--accent)]">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xs">
                    {(profile.display_name || profile.username)[0].toUpperCase()}
                  </div>
                )}
                {profile.display_name || profile.username}
              </Link>
              
              <span className="flex items-center gap-1">
                <Calendar size={14} />
                {formatDate(newsletter.sent_at!)}
              </span>
            </div>
          </div>

          {/* Newsletter content */}
          <article 
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: newsletter.content_html }}
          />

          {/* Subscribe CTA */}
          <div className="mt-12 p-8 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20 text-center">
            <Mail size={32} className="mx-auto mb-4 text-[var(--accent)]" />
            <h2 className="font-display text-xl mb-2">Enjoyed this newsletter?</h2>
            <p className="text-[var(--text-secondary)] mb-6">
              Subscribe to get future newsletters directly in your inbox
            </p>
            <Link href={`/${params.username}`} className="btn btn-primary">
              Subscribe to {profile.display_name || profile.username}
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
