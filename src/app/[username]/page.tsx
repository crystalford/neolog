import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { SubscribeButton } from '@/components/SubscribeButton'
import { SocialLinks } from '@/components/SocialLinks'
import { generateSEO } from '@/lib/seo'
import { Calendar, MapPin, Link as LinkIcon, Users } from 'lucide-react'

interface Props {
  params: { username: string }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
   
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, bio, avatar_url')
    .eq('username', params.username)
    .single()

  if (!profile) return { title: 'Not Found' }

  return generateSEO({
    title: profile.display_name || profile.username,
    description: profile.bio || `Read posts by ${profile.display_name || profile.username}`,
    image: profile.avatar_url || undefined,
    url: `/${params.username}`,
  })
}

export default async function ProfilePage({ params }: Props) {
  const supabase = createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .single()

  if (!profile) notFound()

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', profile.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  const { count: followerCount } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', profile.id)

  const { count: subscriberCount } = await supabase
    .from('email_subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', profile.id)
    .eq('status', 'active')

  let topicTags: Array<{ id: string; name: string; slug: string; color: string; count: number }> = []
  if (posts && posts.length > 0) {
    const postIds = posts.map((post) => post.id)
    const { data: tagRows } = await supabase
      .from('post_tags')
      .select('tag:tags(id, name, slug, color), post_id')
      .in('post_id', postIds)

    const tagMap = new Map<string, { id: string; name: string; slug: string; color: string; count: number }>()
    ;(tagRows || []).forEach((row: any) => {
      const tag = row.tag
      if (!tag) return
      const existing = tagMap.get(tag.id)
      if (existing) {
        existing.count += 1
      } else {
        tagMap.set(tag.id, { id: tag.id, name: tag.name, slug: tag.slug, color: tag.color, count: 1 })
      }
    })
    topicTags = Array.from(tagMap.values()).sort((a, b) => b.count - a.count).slice(0, 8)
  }

  const joinedDate = new Date(profile.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  })

  const postsWithAuthor = posts?.map(post => ({
    ...post,
    author: profile
  })) || []

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Profile Header */}
          <div className="pt-8 pb-8 border-b border-[var(--border-light)]">
            <div className="flex items-start gap-6">
              {profile.avatar_url ? (
                <img 
                  src={profile.avatar_url} 
                  alt={profile.display_name || profile.username}
                  className="w-24 h-24 rounded-full"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-[var(--accent)] flex items-center justify-center text-3xl font-medium text-white">
                  {(profile.display_name || profile.username)[0].toUpperCase()}
                </div>
              )}
               
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="font-display text-3xl mb-1">
                      {profile.display_name || profile.username}
                    </h1>
                    <p className="text-[var(--text-secondary)]">@{profile.username}</p>
                  </div>
                   
                  {/* FIXED: Renamed authorId to creatorId and added creatorUsername */}
                  <SubscribeButton 
                    creatorId={profile.id} 
                    creatorUsername={profile.username} 
                  />
                </div>
                 
                {profile.bio && (
                  <p className="mt-4 text-[var(--text-secondary)]">{profile.bio}</p>
                )}
                 
                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-[var(--text-tertiary)]">
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    Joined {joinedDate}
                  </span>
                   
                  {profile.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={14} />
                      {profile.location}
                    </span>
                  )}
                   
                  {profile.website && (
                    <a 
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
                    >
                      <LinkIcon size={14} />
                      {profile.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                   
                  <span className="flex items-center gap-1">
                    <Users size={14} />
                    {followerCount || 0} followers - {subscriberCount || 0} subscribers
                  </span>
                </div>

                {/* Social links */}
                <div className="mt-4">
                  <SocialLinks profile={profile} />
                </div>
              </div>
            </div>
          </div>

          {/* Posts */}
          <section className="mt-8">
            <h2 className="font-display text-xl mb-6">Posts</h2>
             
            {postsWithAuthor.length === 0 ? (
              <p className="text-[var(--text-secondary)] text-center py-12">
                No posts yet
              </p>
            ) : (
              <div className="space-y-6">
                {postsWithAuthor.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </section>

          {topicTags.length > 0 && (
            <section className="mt-10 border-t border-[var(--border-light)] pt-8">
              <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-display text-xl">Topic map</h2>
                    <p className="text-sm text-[var(--text-tertiary)]">
                      The subjects this writer comes back to the most.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Link
                      href={`/${profile.username}/topics`}
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    >
                      View topics
                    </Link>
                    <Link
                      href="/explore"
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    >
                      Explore tags
                    </Link>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {topicTags.map((tag) => (
                    <Link
                      key={tag.id}
                      href={`/tag/${tag.slug}`}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                    >
                      #{tag.name} - {tag.count}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  )
}


