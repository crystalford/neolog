import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { CuratorBadge } from '@/components/CuratorBadge'
import { SubscribeButton } from '@/components/SubscribeButton'
import { SocialLinks } from '@/components/SocialLinks'
import { Globe, MapPin, Rss, Pin, Mail } from 'lucide-react'

interface Props {
  params: {
    username: string
  }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, bio')
    .eq('username', params.username)
    .single()
  
  if (!profile) return { title: 'Not Found' }

  return {
    title: `${profile.display_name || profile.username} — Neolog`,
    description: profile.bio || `Posts by ${profile.display_name || profile.username}`,
  }
}

export default async function ProfilePage({ params }: Props) {
  const supabase = createClient()
  
  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .single()
  
  if (!profile) notFound()

  // Get pinned posts
  const { data: pinnedPosts } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', profile.id)
    .eq('status', 'published')
    .eq('is_pinned', true)
    .order('pin_order', { ascending: false })

  // Get other published posts (not pinned)
  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', profile.id)
    .eq('status', 'published')
    .or('is_pinned.is.null,is_pinned.eq.false')
    .order('published_at', { ascending: false })

  // Get curator score
  const { data: curatorScore } = await supabase
    .from('curator_scores')
    .select('*')
    .eq('user_id', profile.id)
    .single()

  const pinnedWithAuthor = (pinnedPosts || []).map(post => ({
    ...post,
    author: profile
  }))

  const postsWithAuthor = (posts || []).map(post => ({
    ...post,
    author: profile
  }))

  const allPosts = [...pinnedWithAuthor, ...postsWithAuthor]

  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Profile header */}
        <section className="px-6 py-12 border-b border-border">
          <div className="max-w-2xl mx-auto animate-fade-up">
            <div className="flex items-start gap-6">
              {profile.avatar_url ? (
                <img 
                  src={profile.avatar_url} 
                  alt={profile.display_name || profile.username}
                  className="w-20 h-20 rounded-full"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center text-2xl font-medium text-bg">
                  {(profile.display_name || profile.username)[0].toUpperCase()}
                </div>
              )}
              
              <div className="flex-1">
                <h1 className="font-display text-3xl mb-1">
                  {profile.display_name || profile.username}
                </h1>
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-text-muted">@{profile.username}</p>
                  {curatorScore && curatorScore.score > 50 && (
                    <CuratorBadge 
                      score={curatorScore.score} 
                      earlyUpvotes={curatorScore.early_upvotes}
                      size="sm"
                    />
                  )}
                </div>
                
                {profile.bio && (
                  <p className="text-text-primary mb-4">{profile.bio}</p>
                )}
                
                <SocialLinks 
                  twitter={profile.twitter_url}
                  github={profile.github_url}
                  linkedin={profile.linkedin_url}
                  website={profile.website_url}
                  className="mb-4"
                />
                
                {/* Actions */}
                <div className="flex items-center gap-3 mt-4">
                  <SubscribeButton 
                    creatorId={profile.id}
                    creatorUsername={profile.username}
                    showCount
                  />
                  <a
                    href={`/${profile.username}/feed`}
                    className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
                    title="RSS Feed"
                  >
                    <Rss size={18} className="text-[var(--text-tertiary)]" />
                  </a>
                  <Link
                    href={`/${profile.username}/newsletters`}
                    className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
                    title="Newsletter Archive"
                  >
                    <Mail size={18} className="text-[var(--text-tertiary)]" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Posts */}
        <section className="px-6 py-12 max-w-2xl mx-auto">
          {allPosts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-muted">No posts yet</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pinned posts */}
              {pinnedWithAuthor.length > 0 && (
                <div className="space-y-4">
                  {pinnedWithAuthor.map((post) => (
                    <div key={post.id} className="relative">
                      <div className="absolute -left-8 top-4 flex items-center gap-1 text-xs text-[var(--accent)]">
                        <Pin size={12} className="fill-current" />
                      </div>
                      <PostCard post={post} />
                    </div>
                  ))}
                </div>
              )}
              
              {/* Divider if there are both pinned and regular posts */}
              {pinnedWithAuthor.length > 0 && postsWithAuthor.length > 0 && (
                <div className="border-t border-[var(--border-light)] pt-6" />
              )}
              
              {/* Regular posts */}
              {postsWithAuthor.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
