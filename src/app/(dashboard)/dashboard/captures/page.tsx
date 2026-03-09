'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
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

const QuickCaptureModal = dynamic(
  () => import('@/components/QuickCaptureModal').then((mod) => mod.QuickCaptureModal),
  { ssr: false }
)

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
      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-40 skeleton rounded" />
          <div className="h-24 skeleton rounded-2xl" />
          <div className="h-24 skeleton rounded-2xl" />
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
      {captureModalOpen && (
        <QuickCaptureModal isOpen={captureModalOpen} onClose={() => setCaptureModalOpen(false)} />
      )}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            RAW INPUT
          </p>
          <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Captures
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Save raw ideas, links, quotes, and fragments. Everything starts here.
          </p>
        </div>
        <button onClick={() => setCaptureModalOpen(true)} className="btn btn-primary">
          <Plus size={16} /> Add Capture
        </button>
      </div>

      {captures.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-primary)]/70 p-10 text-center shadow">
          <span className="text-4xl mx-auto mb-4 opacity-70 block text-center">📥</span>
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
            <li key={c.id} className="p-4 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)]/90 shadow hover:border-[var(--border-medium)] transition-colors">
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
