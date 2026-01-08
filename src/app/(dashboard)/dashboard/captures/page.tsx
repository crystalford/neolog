"use client"

import { useEffect, useState } from 'react'
import { QuickCaptureModal } from '@/components/QuickCaptureModal'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus } from 'lucide-react'

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

  if (loading) return <main className="p-8">Loading captures…</main>

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <QuickCaptureModal isOpen={captureModalOpen} onClose={()=>setCaptureModalOpen(false)} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Captures</h1>
        <button onClick={()=>setCaptureModalOpen(true)} className="btn btn-primary"><Plus size={16}/> Add Capture</button>
      </div>

      {captures.length === 0 ? (
        <div className="p-8 border rounded">No captures yet. <Link href="/dashboard/settings">Configure sources</Link></div>
      ) : (
        <ul className="space-y-4">
          {captures.map(c => (
            <li key={c.id} className="p-4 border rounded hover:bg-gray-50 cursor-pointer">
              <Link href={`/dashboard/captures/${c.id}`}>
                <div className="text-sm font-medium">{c.title || c.content.slice(0,80)}</div>
                <div className="text-xs text-muted">{new Date(c.created_at).toLocaleString()}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
