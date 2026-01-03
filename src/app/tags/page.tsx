import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Hash, TrendingUp } from 'lucide-react'

export const metadata = {
  title: 'Browse Tags — Neolog',
  description: 'Explore topics and discover posts by category',
}

export default async function TagsPage() {
  const supabase = createClient()
  
  const { data: tags } = await supabase
    .from('tags')
    .select('*')
    .gt('post_count', 0)
    .order('post_count', { ascending: false })
  
  return (
    <>
      <Header />
      <main className="pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header */}
          <div className="pt-8 mb-8">
            <h1 className="font-display text-4xl mb-2">Browse Topics</h1>
            <p className="text-[var(--text-secondary)]">
              Discover posts by category
            </p>
          </div>

          {/* Tags grid */}
          {tags && tags.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tags.map(tag => (
                <Link
                  key={tag.id}
                  href={`/tag/${tag.slug}`}
                  className="group p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${tag.color}15` }}
                    >
                      <Hash size={20} style={{ color: tag.color }} />
                    </div>
                    {tag.post_count > 10 && (
                      <TrendingUp size={16} className="text-[var(--accent)]" />
                    )}
                  </div>
                  
                  <h2 className="font-medium text-lg mb-1 group-hover:text-[var(--accent)] transition-colors">
                    {tag.name}
                  </h2>
                  
                  <p className="text-sm text-[var(--text-tertiary)]">
                    {tag.post_count} {tag.post_count === 1 ? 'post' : 'posts'}
                  </p>
                  
                  {tag.description && (
                    <p className="text-sm text-[var(--text-secondary)] mt-2 line-clamp-2">
                      {tag.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <Hash size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No topics yet</h2>
              <p className="text-[var(--text-secondary)]">
                Topics will appear here once posts are tagged
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
