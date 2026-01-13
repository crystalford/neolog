import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { generateSEO } from '@/lib/seo'
import { Mail, Calendar, ArrowLeft } from 'lucide-react'

interface Props {
  params: {
    username: string
    id: string
  }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
  
  const { data: publication } = await supabase
    .from('publications')
    .select('name, slug, owner_id, is_active')
    .eq('slug', params.username)
    .maybeSingle()

  if (!publication || !publication.is_active) return { title: 'Not Found' }

  const { data: newsletter } = await supabase
    .from('newsletters')
    .select('subject')
    .eq('id', params.id)
    .eq('author_id', publication.owner_id)
    .eq('is_public', true)
    .single()
  
  if (!newsletter) return { title: 'Not Found' }

  const authorName = publication.name || 'Neolog'

  return generateSEO({
    title: newsletter.subject,
    description: `Newsletter from ${authorName}`,
    url: `/${publication.slug}/newsletters/${params.id}`,
  })
}

export default async function NewsletterDetailPage({ params }: Props) {
  const supabase = createClient()
  
  // Get publication
  const { data: publication } = await supabase
    .from('publications')
    .select('id, name, slug, logo_url, owner_id, is_active')
    .eq('slug', params.username)
    .maybeSingle()
  
  if (!publication || !publication.is_active) notFound()

  // Get newsletter
  const { data: newsletter } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', params.id)
    .eq('author_id', publication.owner_id)
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
              href={`/${publication.slug}/newsletters`}
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-6"
            >
              <ArrowLeft size={14} />
              Newsletter Archive
            </Link>
            
            <h1 className="font-display text-3xl md:text-4xl mb-4">
              {newsletter.subject}
            </h1>
            
            <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
              <Link href={`/${publication.slug}`} className="flex items-center gap-2 hover:text-[var(--accent)]">
                {publication.logo_url ? (
                  <img
                    src={publication.logo_url}
                    alt={`${publication.name} logo`}
                    loading="lazy"
                    className="w-6 h-6 rounded-2xl"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-2xl bg-[var(--accent)] flex items-center justify-center text-white text-xs">
                    {publication.name[0].toUpperCase()}
                  </div>
                )}
                {publication.name}
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
            <Link href={`/${publication.slug}`} className="btn btn-primary">
              Subscribe to {publication.name}
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
