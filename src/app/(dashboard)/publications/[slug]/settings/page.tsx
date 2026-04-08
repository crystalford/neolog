'use client'
export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { FediverseBadge } from '@/components/FediverseBadge'

interface Publication {
  id: string
  name: string
  slug: string
  description: string | null
  primary_color: string
  accent_color: string
  custom_domain: string | null
  created_at: string
}

export default function PublicationSettingsPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params
  const [publication, setPublication] = useState<Publication | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [formState, setFormState] = useState({
    description: '',
    primary_color: '#111827',
    accent_color: '#2563eb',
    custom_domain: '',
  })
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Please sign in to view settings.')
        setLoading(false)
        return
      }

      const { data: pub, error: pubError } = await supabase
        .from('publications')
        .select('id, name, slug, description, primary_color, accent_color, custom_domain, created_at')
        .eq('slug', slug)
        .eq('owner_id', session.user.id)
        .single()

      if (pubError || !pub) {
        setError('Publication not found.')
        setLoading(false)
        return
      }

      setPublication(pub)
      setFormState({
        description: pub.description || '',
        primary_color: pub.primary_color || '#111827',
        accent_color: pub.accent_color || '#2563eb',
        custom_domain: pub.custom_domain || '',
      })
      setLoading(false)
    }

    loadData()
  }, [slug, supabase])

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-10 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-4 w-64 skeleton rounded" />
          <div className="h-36 skeleton rounded" />
        </div>
      </main>
    )
  }

  if (error || !publication) {
    return (
      <main className="px-6 lg:px-12 py-10 max-w-4xl mx-auto">
        <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6 text-sm text-[var(--text-secondary)]">
          {error || 'Unable to load publication.'}
        </div>
      </main>
    )
  }

  const isDirty =
    formState.description !== (publication.description || '') ||
    formState.primary_color !== (publication.primary_color || '#111827') ||
    formState.accent_color !== (publication.accent_color || '#2563eb') ||
    formState.custom_domain !== (publication.custom_domain || '')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const fediverseDomain = new URL(appUrl).hostname
  const fediverseHandle = `@${publication.slug}@${fediverseDomain}`
  const fediverseSearchUrl = `https://mastodon.social/search?q=${encodeURIComponent(fediverseHandle)}`

  const saveSettings = async () => {
    if (!publication) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updates = {
        description: formState.description.trim() || null,
        primary_color: formState.primary_color,
        accent_color: formState.accent_color,
        custom_domain: formState.custom_domain.trim() || null,
      }

      const { data, error: updateError } = await supabase
        .from('publications')
        .update(updates)
        .eq('id', publication.id)
        .select('id, name, slug, description, primary_color, accent_color, custom_domain, created_at')
        .single()

      if (updateError || !data) {
        throw updateError || new Error('Unable to save settings')
      }

      setPublication(data)
      setFormState({
        description: data.description || '',
        primary_color: data.primary_color || '#111827',
        accent_color: data.accent_color || '#2563eb',
        custom_domain: data.custom_domain || '',
      })
      setSuccess('Settings saved.')
    } catch (saveError) {
      console.error('Settings save failed:', saveError)
      setError('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Settings</p>
        <h1 className="font-display text-3xl text-[var(--text-primary)]">
          {publication.name} settings
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage branding, domains, and defaults for this publication.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl bg-[var(--error)]/10 border border-[var(--error)]/20 p-4 text-sm text-[var(--error)]">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl bg-[var(--success)]/10 border border-[var(--success)]/20 p-4 text-sm text-[var(--success)]">
          {success}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                Publication name
              </label>
              <div className="input bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                {publication.name}
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                Slug
              </label>
              <div className="input bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                {publication.slug}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
              Fediverse handle
            </label>
            <FediverseBadge handle={fediverseHandle} searchUrl={fediverseSearchUrl} />
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              Followers on Mastodon and other ActivityPub apps will see posts from this publication.
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
              Description
            </label>
            <textarea
              value={formState.description}
              onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
              className="input min-h-[96px] resize-none"
              placeholder="Describe your publication..."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                Primary color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formState.primary_color}
                  onChange={(event) => setFormState((prev) => ({ ...prev, primary_color: event.target.value }))}
                  className="h-10 w-12 rounded-lg border border-[var(--border-light)] bg-transparent p-1"
                  aria-label="Primary color"
                />
                <input
                  type="text"
                  value={formState.primary_color}
                  onChange={(event) => setFormState((prev) => ({ ...prev, primary_color: event.target.value }))}
                  className="input"
                  placeholder="#111827"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                Accent color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formState.accent_color}
                  onChange={(event) => setFormState((prev) => ({ ...prev, accent_color: event.target.value }))}
                  className="h-10 w-12 rounded-lg border border-[var(--border-light)] bg-transparent p-1"
                  aria-label="Accent color"
                />
                <input
                  type="text"
                  value={formState.accent_color}
                  onChange={(event) => setFormState((prev) => ({ ...prev, accent_color: event.target.value }))}
                  className="input"
                  placeholder="#2563eb"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
              Custom domain
            </label>
            <input
              type="text"
              value={formState.custom_domain}
              onChange={(event) => setFormState((prev) => ({ ...prev, custom_domain: event.target.value }))}
              className="input"
              placeholder="yourdomain.com"
            />
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              Domain setup requires DNS verification.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveSettings}
              disabled={saving || !isDirty}
              className="btn btn-primary btn-sm disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save settings'}
            </button>
            <Link href={`/publications/${slug}/fediverse`} className="btn btn-secondary btn-sm">
              Fediverse dashboard
            </Link>
            {isDirty && (
              <button
                onClick={() =>
                  setFormState({
                    description: publication.description || '',
                    primary_color: publication.primary_color || '#111827',
                    accent_color: publication.accent_color || '#2563eb',
                    custom_domain: publication.custom_domain || '',
                  })
                }
                className="btn btn-secondary btn-sm"
              >
                Reset
              </button>
            )}
            <Link href={`/publications/${slug}`} className="btn btn-secondary btn-sm">
              Back to overview
            </Link>
          </div>
        </div>

        <aside className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-5 space-y-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Live preview</p>
          <div className="rounded-xl border border-[var(--border-light)] p-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold text-white"
                style={{ backgroundColor: formState.primary_color }}
              >
                {publication.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{publication.name}</p>
                <p className="text-xs text-[var(--text-tertiary)]">@{publication.slug}</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-3">
              {formState.description.trim() || 'Add a description to introduce your publication.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                style={{
                  backgroundColor: formState.accent_color,
                  color: '#fff',
                }}
              >
                Accent tag
              </span>
              {formState.custom_domain && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                  {formState.custom_domain}
                </span>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-light)] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
              Accent preview
            </p>
            <button
              className="w-full py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: formState.accent_color }}
              type="button"
            >
              Primary action
            </button>
            <button
              className="w-full py-2 rounded-lg text-sm font-medium border mt-2"
              style={{
                borderColor: formState.accent_color,
                color: formState.accent_color,
              }}
              type="button"
            >
              Secondary action
            </button>
          </div>
        </aside>
      </div>
    </main>
  )
}
