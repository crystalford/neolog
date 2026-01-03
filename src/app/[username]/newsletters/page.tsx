import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Mail, Calendar, Users, ArrowLeft } from 'lucide-react'

interface Props {
  params: {
    username: string
  }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('username', params.username)
    .single()
  
  if (!profile) return { title: 'Not Found' }

  return {
    title: `Newsletter Archive — ${profile.display_name || profile.username} — Neolog`,
    description: `Past newsletters from ${profile.display_name || profile.username}`,
  }
}

export default async function NewsletterArchivePage({ params }: Props) {
  const supabase = createClient()
  
  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .single()
  
  if (!profile) notFound()

  // Get public newsletters
  const { data: newsletters } = await supabase
    .from('newsletters')
    .select('*')
    .eq('author_id', profile.id)
    .eq('is_public', true)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })

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
              href={`/${params.username}`}
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-4"
            >
              <ArrowLeft size={14} />
              Back to {profile.display_name || profile.username}
            </Link>
            
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <Mail size={24} className="text-[var(--accent)]" />
              </div>
              <div>
                <h1 className="font-display text-3xl">Newsletter Archive</h1>
                <p className="text-[var(--text-secondary)]">
                  Past newsletters from {profile.display_name || profile.username}
                </p>
              </div>
            </div>
          </div>

          {!newsletters || newsletters.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <Mail size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No newsletters yet</h2>
              <p className="text-[var(--text-secondary)]">
                Check back later for past newsletters
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {newsletters.map(newsletter => (
                <Link
                  key={newsletter.id}
                  href={`/${params.username}/newsletters/${newsletter.id}`}
                  className="block p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
                >
                  <h2 className="font-display text-xl mb-2 hover:text-[var(--accent)] transition-colors">
                    {newsletter.subject}
                  </h2>
                  
                  {newsletter.preview_text && (
                    <p className="text-[var(--text-secondary)] mb-4 line-clamp-2">
                      {newsletter.preview_text}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {formatDate(newsletter.sent_at!)}
                    </span>
                    {newsletter.recipient_count > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {newsletter.recipient_count} recipients
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
