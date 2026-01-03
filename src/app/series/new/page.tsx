'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { ArrowLeft, Loader2, Image as ImageIcon } from 'lucide-react'

export default function NewSeriesPage() {
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const slug = generateSlug(title)

    const { data, error: dbError } = await supabase
      .from('series')
      .insert({
        author_id: session.user.id,
        title: title.trim(),
        slug,
        description: description.trim() || null,
        cover_image_url: coverImage || null,
      })
      .select()
      .single()

    if (dbError) {
      if (dbError.code === '23505') {
        setError('You already have a series with this title')
      } else {
        setError('Failed to create series')
      }
      setSaving(false)
      return
    }

    router.push(`/series/${data.id}`)
  }

  return (
    <>
      <Header />
      <main className="pt-20 pb-16">
        <div className="max-w-2xl mx-auto px-6">
          <div className="pt-8 mb-8">
            <Link 
              href="/series" 
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-4"
            >
              <ArrowLeft size={14} />
              Back to Series
            </Link>
            <h1 className="font-display text-3xl">Create Series</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Series Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input"
                placeholder="e.g., Building a Startup, Learning Rust"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input min-h-[100px] resize-none"
                placeholder="What's this series about?"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Cover Image URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  className="input flex-1"
                  placeholder="https://..."
                />
              </div>
              {coverImage && (
                <img 
                  src={coverImage} 
                  alt="Cover preview" 
                  className="mt-3 w-full h-32 object-cover rounded-lg"
                />
              )}
            </div>

            {error && (
              <p className="text-sm text-[var(--error)]">{error}</p>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Series'
                )}
              </button>
              <Link href="/series" className="btn btn-secondary">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
