'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { ArrowLeft, Loader2, Globe, Lock, Trash2 } from 'lucide-react'

interface Props {
  params: { id: string }
}

export default function EditListPage({ params }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [postCount, setPostCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadList()
  }, [params.id])

  const loadList = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { data: list, error } = await supabase
      .from('reading_lists')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .single()

    if (error || !list) {
      router.push('/lists')
      return
    }

    setName(list.name)
    setDescription(list.description || '')
    setIsPublic(list.is_public)
    setPostCount(list.post_count)
    setLoading(false)
  }

  const handleSave = async () => {
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setSaving(true)

    const { error: updateError } = await supabase
      .from('reading_lists')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        is_public: isPublic,
      })
      .eq('id', params.id)

    if (updateError) {
      setError('Failed to update list')
      setSaving(false)
      return
    }

    router.push(`/lists/${params.id}`)
  }

  const handleDelete = async () => {
    if (!confirm('Delete this list? Posts won\'t be affected.')) return

    setDeleting(true)

    await supabase
      .from('reading_lists')
      .delete()
      .eq('id', params.id)

    router.push('/lists')
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="pt-20 pb-16 flex items-center justify-center min-h-screen">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="pt-20 pb-16">
        <div className="max-w-2xl mx-auto px-6">
          <div className="pt-8 mb-8">
            <Link 
              href={`/lists/${params.id}`}
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-4"
            >
              <ArrowLeft size={14} />
              Back to List
            </Link>
            <h1 className="font-display text-3xl">Edit List</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              {postCount} post{postCount !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
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
              <label className="block text-sm font-medium mb-2">Description</label>
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

            <div className="flex items-center justify-between pt-4 border-t border-[var(--border-light)]">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn btn-secondary text-[var(--error)] hover:bg-[var(--error)]/10"
              >
                {deleting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete List
              </button>

              <div className="flex gap-3">
                <Link href={`/lists/${params.id}`} className="btn btn-secondary">
                  Cancel
                </Link>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
