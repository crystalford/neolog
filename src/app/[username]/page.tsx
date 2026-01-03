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
      <main className="pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-6">
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
                  
                  <SubscribeButton authorId={profile.id} />
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
                    {followerCount || 0} followers · {subscriberCount || 0} subscribers
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
        </div>
      </main>
    </>
  )
}
