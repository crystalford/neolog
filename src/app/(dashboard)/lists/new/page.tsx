'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Loader2, Globe, Lock } from 'lucide-react'

export default function NewListPage() {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { data, error: dbError } = await supabase
      .from('reading_lists')
      .insert({
        user_id: session.user.id,
        name: name.trim(),
        description: description.trim() || null,
        is_public: isPublic,
      })
      .select()
      .single()

    if (dbError) {
      setError('Failed to create list')
      setSaving(false)
      return
    }

    router.push(`/lists/${data.id}`)
  }

  return (
    <>
      <main className="pt-16 pb-16">
        <div className="max-w-2xl mx-auto px-6">
          <div className="pt-8 mb-8">
            <Link 
              href="/lists" 
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-4"
            >
              <ArrowLeft size={14} />
              Back to Lists
            </Link>
            <h1 className="font-display text-3xl">Create Reading List</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g., AI Research, Writing Inspiration"
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
                placeholder="What's this list about?"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-3">Visibility</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`flex-1 p-4 rounded-lg border transition-colors ${
                    !isPublic
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-light)] hover:border-[var(--border-medium)]'
                  }`}
                >
                  <Lock size={20} className="mb-2" />
                  <p className="font-medium">Private</p>
                  <p className="text-sm text-[var(--text-secondary)]">Only you can see</p>
                </button>
                
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`flex-1 p-4 rounded-lg border transition-colors ${
                    isPublic
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-light)] hover:border-[var(--border-medium)]'
                  }`}
                >
                  <Globe size={20} className="mb-2" />
                  <p className="font-medium">Public</p>
                  <p className="text-sm text-[var(--text-secondary)]">Anyone can view</p>
                </button>
              </div>
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
                  'Create List'
                )}
              </button>
              <Link href="/lists" className="btn btn-secondary">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}


