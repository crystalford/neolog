import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { SubscribeButton } from '@/components/SubscribeButton'
import { SocialLinks } from '@/components/SocialLinks'
import { generateSEO } from '@/lib/seo'
import { Calendar, MapPin, Link as LinkIcon, Users, BookOpen, Rss, Globe, Download } from 'lucide-react'

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

  return {
    ...generateSEO({
      title: profile.display_name || profile.username,
      description: profile.bio || `Read posts by ${profile.display_name || profile.username}`,
      image: profile.avatar_url || undefined,
      url: `/${params.username}`,
    }),
    alternates: {
      types: {
        'application/rss+xml': `/${params.username}/feed`,
        'application/atom+xml': `/${params.username}/feed`,
      },
    },
  }
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
    .select('*, series:series(title, slug)')
    .eq('author_id', profile.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  const { data: stacks } = await supabase
    .from('series')
    .select('id, title, slug, description, cover_image_url, post_count, created_at')
    .eq('author_id', profile.id)
    .order('created_at', { ascending: false })

  const { count: followerCount } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', profile.id)

  const { data: subscriberCount } = await supabase
    .rpc('get_subscriber_count', { target_creator_id: profile.id })

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
      <main className="pt-14 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Profile Header */}
          <div className="pt-6 pb-6 border-b border-[var(--border-light)]">
            <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/40 p-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              {profile.avatar_url ? (
                <img 
                  src={profile.avatar_url} 
                  alt={profile.display_name || profile.username}
                  className="w-20 h-20 rounded-full"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[var(--accent)] flex items-center justify-center text-2xl font-medium text-white">
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
                 
                <p className="mt-4 text-[var(--text-secondary)]">
                  {profile.bio || 'No bio yet.'}
                </p>

                <div className="grid grid-cols-3 gap-2 mt-5 max-w-md">
                  <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-3">
                    <p className="text-xs text-[var(--text-tertiary)]">Posts</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{postsWithAuthor.length}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-3">
                    <p className="text-xs text-[var(--text-tertiary)]">Followers</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{followerCount || 0}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-3">
                    <p className="text-xs text-[var(--text-tertiary)]">Subscribers</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{subscriberCount || 0}</p>
                  </div>
                </div>
                 
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
                    {followerCount || 0} followers
                  </span>
                </div>

                {/* Distribution & Export Actions */}
                <div className="flex flex-wrap gap-3 mt-5">
                  <Link
                    href={`/${profile.username}/feed`}
                    className="btn btn-sm btn-secondary"
                    target="_blank"
                  >
                    <Rss size={14} />
                    RSS Feed
                  </Link>
                  <a
                    href={`/api/export/epub?username=${profile.username}`}
                    className="btn btn-sm btn-secondary"
                    download
                    title="Download all posts as an ePub book"
                  >
                    <BookOpen size={14} />
                    Export as Book
                    <Download size={12} className="ml-1" />
                  </a>
                  <button
                    className="btn btn-sm btn-ghost"
                    title="ActivityPub profile - Coming Q1 2026"
                    disabled
                  >
                    <Globe size={14} />
                    Fediverse
                    <span className="text-xs opacity-60">(Q1 2026)</span>
                  </button>
                </div>

                {/* Social links */}
                <div className="mt-4">
                  <SocialLinks profile={profile} />
                </div>
              </div>
              </div>
            </div>
          </div>

          {/* Traffic Showcase */}
          {postsWithAuthor.length > 0 && (
            <section className="mt-6">
              <div className="rounded-2xl border border-[var(--border-light)] bg-gradient-to-br from-[var(--bg-secondary)]/40 to-[var(--bg-primary)]/40 p-6">
                <h2 className="font-display text-xl mb-4 flex items-center gap-2">
                  <Globe size={20} className="text-[var(--accent)]" />
                  Distribution Reach
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* RSS Subscribers */}
                  <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Rss size={16} className="text-orange-500" />
                      <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">RSS Feed</span>
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{subscriberCount || 0}</p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">subscribers</p>
                  </div>

                  {/* Fediverse */}
                  <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe size={16} className="text-purple-500" />
                      <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">Fediverse</span>
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{followerCount || 0}</p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">followers</p>
                  </div>

                  {/* Total Posts */}
                  <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen size={16} className="text-blue-500" />
                      <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">Published</span>
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{postsWithAuthor.length}</p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">posts</p>
                  </div>
                </div>

                {/* Multi-platform distribution message */}
                <div className="p-4 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  <p className="text-sm text-[var(--text-secondary)]">
                    <strong className="text-[var(--text-primary)]">Reaching everywhere:</strong> RSS, ActivityPub (Mastodon), X (Twitter), LinkedIn, and direct subscribers.
                    <span className="text-[var(--accent)] font-medium ml-2">→ {(subscriberCount || 0) + (followerCount || 0)} total reach</span>
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Posts */}
          {stacks && stacks.length > 0 && (
            <section className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl">Stacks</h2>
                <span className="text-sm text-[var(--text-tertiary)]">{stacks.length}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {stacks.map((stack) => (
                  <Link
                    key={stack.id}
                    href={`/${profile.username}/stack/${stack.slug}`}
                    className="block rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/40 hover:bg-[var(--bg-secondary)]/60 transition-colors overflow-hidden"
                  >
                    {stack.cover_image_url && (
                      <img
                        src={stack.cover_image_url}
                        alt={stack.title}
                        className="w-full h-36 object-cover"
                      />
                    )}
                    <div className="p-5">
                      <p className="text-xs text-[var(--text-tertiary)]">Stack</p>
                      <p className="font-medium text-[var(--text-primary)] mt-1">{stack.title}</p>
                      {stack.description && (
                        <p className="text-sm text-[var(--text-secondary)] mt-2 line-clamp-2">
                          {stack.description}
                        </p>
                      )}
                      <div className="mt-3 text-xs text-[var(--text-tertiary)]">
                        {(stack.post_count ?? 0).toString()} posts
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="mt-6">
            <h2 className="font-display text-xl mb-4">Posts</h2>
             
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
            <section className="mt-8 border-t border-[var(--border-light)] pt-6">
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


