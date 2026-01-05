'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, ChevronDown, Plus, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { writeSelectedPublicationId } from '@/lib/publicationContext'

interface Publication {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
}

interface PublicationSwitcherProps {
  currentPublicationId?: string | null
  onPublicationChange?: (publicationId: string) => void
}

export function PublicationSwitcher({
  currentPublicationId,
  onPublicationChange
}: PublicationSwitcherProps) {
  const [publications, setPublications] = useState<Publication[]>([])
  const [selectedPub, setSelectedPub] = useState<Publication | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    loadPublications()
  }, [])

  useEffect(() => {
    if (currentPublicationId && publications.length > 0) {
      const pub = publications.find(p => p.id === currentPublicationId)
      setSelectedPub(pub || publications[0])
    } else if (publications.length > 0) {
      setSelectedPub(publications[0])
    }
  }, [currentPublicationId, publications])

  useEffect(() => {
    if (!selectedPub) return
    if (currentPublicationId) return
    if (typeof window === 'undefined') return

    const stored = window.localStorage.getItem('selectedPublicationId')
    if (!stored) {
      window.localStorage.setItem('selectedPublicationId', selectedPub.id)
      onPublicationChange?.(selectedPub.id)
    }
  }, [currentPublicationId, onPublicationChange, selectedPub])

  const loadPublications = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('publications')
        .select('id, name, slug, logo_url, primary_color')
        .eq('owner_id', session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (data && data.length > 0) {
        setPublications(data)
      }
    } catch (error) {
      console.error('Error loading publications:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectPublication = (pub: Publication) => {
    setSelectedPub(pub)
    setMenuOpen(false)
    onPublicationChange?.(pub.id)

    writeSelectedPublicationId(pub.id)
  }

  if (loading || publications.length === 0) {
    return null
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:bg-[var(--bg-tertiary)] transition-all"
      >
        {selectedPub?.logo_url ? (
          <img
            src={selectedPub.logo_url}
            alt={selectedPub.name}
            className="w-5 h-5 rounded object-cover"
          />
        ) : (
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: selectedPub?.primary_color || 'var(--accent)' }}
          >
            {selectedPub?.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium hidden lg:inline max-w-[120px] truncate">
          {selectedPub?.name || 'Select Publication'}
        </span>
        <ChevronDown size={16} className="text-[var(--text-tertiary)]" />
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuOpen(false)}
          />

          <div className="absolute left-0 top-full mt-2 w-64 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-xl shadow-2xl z-20 py-2 animate-scale-in origin-top-left">
            <div className="px-3 py-2 text-xs font-medium text-[var(--text-tertiary)] uppercase">
              Your Publications
            </div>

            <div className="max-h-64 overflow-y-auto">
              {publications.map(pub => (
                <button
                  key={pub.id}
                  onClick={() => selectPublication(pub)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {pub.logo_url ? (
                    <img
                      src={pub.logo_url}
                      alt={pub.name}
                      className="w-6 h-6 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: pub.primary_color }}
                    >
                      {pub.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 text-left truncate">
                    {pub.name}
                  </span>
                  {selectedPub?.id === pub.id && (
                    <Check size={16} className="text-[var(--accent)] flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="h-px bg-[var(--border-light)] my-1" />

            <button
              onClick={() => {
                setMenuOpen(false)
                router.push('/publications')
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <Plus size={16} />
              New Publication
            </button>

            <button
              onClick={() => {
                setMenuOpen(false)
                router.push('/publications')
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <BookOpen size={16} />
              Manage All
            </button>
          </div>
        </>
      )}
    </div>
  )
}
