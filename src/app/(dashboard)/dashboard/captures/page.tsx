'use client'

import { useEffect, useState } from 'react'
import { QuickCaptureModal } from '@/components/QuickCaptureModal'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Archive } from 'lucide-react'

interface Capture {
  id: string
  title: string | null
  content: string
  created_at: string
  processed?: boolean
}

export default function CapturesPage() {
  const [captures, setCaptures] = useState<Capture[]>([])
  const [loading, setLoading] = useState(true)
  const [captureModalOpen, setCaptureModalOpen] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadCaptures() }, [])

  async function loadCaptures() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data } = await supabase.from('assets').select('id,title,content,created_at').eq('user_id', session.user.id).order('created_at', { ascending: false })
      setCaptures((data || []) as Capture[])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="px-8 py-10 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-40 skeleton rounded" />
          <div className="h-24 skeleton rounded-2xl" />
          <div className="h-24 skeleton rounded-2xl" />
        </div>
      </main>
    )
  }

  return (
    <main className="px-8 py-10 max-w-4xl mx-auto">
      <QuickCaptureModal isOpen={captureModalOpen} onClose={() => setCaptureModalOpen(false)} />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[var(--text-primary)]">Captures</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Save raw ideas, links, quotes, and fragments. Everything starts here.
          </p>
        </div>
        <button onClick={() => setCaptureModalOpen(true)} className="btn btn-primary">
          <Plus size={16} /> Add Capture
        </button>
      </div>

      {captures.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-white/70 p-10 text-center shadow">
          <Archive size={36} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">
            No captures yet
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Add a capture now or connect sources to pull in material automatically.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => setCaptureModalOpen(true)} className="btn btn-primary">
              <Plus size={16} />
              Add Capture
            </button>
            <Link href="/dashboard/settings" className="btn btn-secondary">
              Configure sources
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-4">
          {captures.map(c => (
            <li key={c.id} className="p-4 rounded-2xl border border-[var(--border-light)] bg-white/90 shadow hover:border-[var(--border-medium)] transition-colors">
              <Link href={`/dashboard/captures/${c.id}`}>
                <div className="text-base font-medium text-[var(--text-primary)]">
                  {c.title || c.content.slice(0, 80)}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
