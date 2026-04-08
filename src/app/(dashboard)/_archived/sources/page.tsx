'use client'

export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExternalLink, Eye, Plus, RefreshCw, Rss, Trash2, Wand2 } from 'lucide-react'
import { onSelectedPublicationIdChange, readSelectedPublicationId } from '@/lib/publicationContext'

type SocialNetwork = 'auto' | 'x' | 'youtube' | 'substack' | 'medium' | 'github' | 'reddit' | 'tumblr'

function tryParseHttpUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed
  } catch {
    return null
  }
}

function normalizePathSegments(url: URL): string[] {
  return url.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
}

function generateFeedUrlFromSocial(profileUrl: string, network: SocialNetwork):
  | { feedUrl: string; helpText?: undefined; openUrl?: undefined }
  | { feedUrl?: undefined; helpText: string; openUrl?: string } {
  const parsed = tryParseHttpUrl(profileUrl)
  if (!parsed) {
    return { helpText: 'Enter a valid http(s) profile URL.' }
  }

  if (network === 'auto') {
    return {
      helpText:
        'We will try to auto-detect RSS/Atom/JSON Feed links from this page (server-side). If it fails, paste the feed URL directly.',
    }
  }

  const hostname = parsed.hostname.toLowerCase()
  const segments = normalizePathSegments(parsed)

  if (network === 'x') {
    return {
      helpText:
        'X/Twitter does not provide a stable public RSS feed. Use an external provider (e.g. rss.app) or the official API, then paste the resulting RSS URL above.',
      openUrl: 'https://rss.app/en/rss-feed/create-twitter-rss-feed',
    }
  }

  if (network === 'youtube') {
    // Works for URLs like https://www.youtube.com/channel/UCxxxx
    const channelIdx = segments.findIndex((s) => s === 'channel')
    const channelId = channelIdx >= 0 ? segments[channelIdx + 1] : null
    if (channelId && channelId.startsWith('UC')) {
      return { feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` }
    }
    return {
      helpText:
        'For YouTube, paste a channel URL that contains the channel id (…/channel/UCxxxx). @handle URLs need extra resolution.',
    }
  }

  if (network === 'substack') {
    if (hostname.endsWith('substack.com')) {
      return { feedUrl: `https://${hostname}/feed` }
    }
    return { helpText: 'Paste a Substack publication URL (…substack.com).', }
  }

  if (network === 'medium') {
    if (hostname.endsWith('medium.com')) {
      // Medium supports /feed/@user and /feed/publication
      const path = parsed.pathname
      if (path.startsWith('/@')) {
        return { feedUrl: `https://medium.com/feed${path}` }
      }
      if (segments.length >= 1) {
        return { feedUrl: `https://medium.com/feed/${segments[0]}` }
      }
    }
    return { helpText: 'Paste a Medium profile or publication URL (medium.com).', }
  }

  if (network === 'github') {
    if (hostname === 'github.com') {
      // https://github.com/{user}.atom
      const owner = segments[0]
      if (owner) {
        return { feedUrl: `https://github.com/${owner}.atom` }
      }
    }
    return { helpText: 'Paste a GitHub profile URL (https://github.com/{user}).', }
  }

  if (network === 'reddit') {
    if (hostname.endsWith('reddit.com')) {
      // /r/{sub}/.rss or /user/{name}/.rss
      if (segments[0] === 'r' && segments[1]) {
        return { feedUrl: `https://www.reddit.com/r/${segments[1]}/.rss` }
      }
      if (segments[0] === 'user' && segments[1]) {
        return { feedUrl: `https://www.reddit.com/user/${segments[1]}/.rss` }
      }
    }
    return { helpText: 'Paste a Reddit community or user URL (reddit.com/r/... or reddit.com/user/...).', }
  }

  if (network === 'tumblr') {
    if (hostname.endsWith('tumblr.com')) {
      return { feedUrl: `https://${hostname}/rss` }
    }
    return { helpText: 'Paste a Tumblr blog URL (…tumblr.com).', }
  }

  return { helpText: 'Unsupported network.' }
}

type FeedSource = {
  id: string
  name: string | null
  url: string
  source_type: string
  publication_id?: string | null
  auto_convert_to_drafts?: boolean | null
  last_fetched_at: string | null
  created_at: string
}

type Publication = {
  id: string
  name: string
}

type FeedPreviewItem = {
  title: string
  link: string
  published_at: string | null
}

type DiscoveredFeed = {
  url: string
  type: string | null
  title: string | null
}

export default function SourcesPage() {
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState<FeedSource[]>([])
  const [publications, setPublications] = useState<Publication[]>([])
  const [defaultPublicationId, setDefaultPublicationId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [socialUrl, setSocialUrl] = useState('')
  const [socialNetwork, setSocialNetwork] = useState<SocialNetwork>('auto')
  const [generatedFeedUrl, setGeneratedFeedUrl] = useState<string | null>(null)
  const [generatedHelpText, setGeneratedHelpText] = useState<string | null>(null)
  const [generatedOpenUrl, setGeneratedOpenUrl] = useState<string | null>(null)
  const [discoveredFeeds, setDiscoveredFeeds] = useState<DiscoveredFeed[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testItems, setTestItems] = useState<FeedPreviewItem[] | null>(null)
  const [testMeta, setTestMeta] = useState<{ fetchedUrl?: string | null; contentType?: string | null } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [opmlImporting, setOpmlImporting] = useState(false)
  const [opmlText, setOpmlText] = useState<string | null>(null)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [fetchingAll, setFetchingAll] = useState(false)
  const [savingSettingsId, setSavingSettingsId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadSources()
  }, [])

  useEffect(() => {
    setDefaultPublicationId(readSelectedPublicationId())
    const unsubscribe = onSelectedPublicationIdChange((publicationId) => {
      setDefaultPublicationId(publicationId)
    })
    return unsubscribe
  }, [])

  const defaultPublicationName =
    defaultPublicationId
      ? publications.find((p) => p.id === defaultPublicationId)?.name || null
      : null

  const loadSources = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { data: pubs } = await supabase
      .from('publications')
      .select('id, name')
      .eq('owner_id', session.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    setPublications((pubs || []) as Publication[])

    const { data } = await supabase
      .from('feed_sources')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    setSources((data || []) as FeedSource[])
    setLoading(false)
  }

  const updateSourceSettings = async (
    id: string,
    update: { publicationId?: string | null; autoConvertToDrafts?: boolean }
  ) => {
    setError(null)
    setSuccess(null)
    setSavingSettingsId(id)
    try {
      const response = await fetch('/api/sources/rss', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...update }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update source.')
      }
      setSources((prev) => prev.map((s) => (s.id === id ? (data.source as FeedSource) : s)))
      setSuccess('Source updated.')
    } catch (err: any) {
      setError(err.message || 'Failed to update source.')
    } finally {
      setSavingSettingsId(null)
    }
  }

  const addSource = async () => {
    setError(null)
    setSuccess(null)
    setTestItems(null)
    setTestMeta(null)
    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      setError('Enter a valid RSS URL.')
      return
    }
    try {
      const parsed = new URL(trimmedUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError('RSS URL must start with http or https.')
        return
      }
    } catch {
      setError('Enter a valid RSS URL.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/sources/rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || null, url: trimmedUrl }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add source.')
      }
      setName('')
      setUrl('')
      setSuccess('Source added.')
      await loadSources()
    } catch (err: any) {
      setError(err.message || 'Failed to add source.')
    } finally {
      setSaving(false)
    }
  }

  const testFeedUrl = async (feedUrl: string) => {
    setError(null)
    setSuccess(null)
    setTestItems(null)
    setTestMeta(null)

    const trimmedUrl = feedUrl.trim()
    if (!trimmedUrl) {
      setError('Enter a valid feed URL to test.')
      return
    }
    try {
      const parsed = new URL(trimmedUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError('Feed URL must start with http or https.')
        return
      }
    } catch {
      setError('Enter a valid feed URL to test.')
      return
    }

    setTesting(true)
    try {
      const response = await fetch('/api/sources/rss/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl: trimmedUrl }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to test feed.')
      }
      const items = Array.isArray(data.items) ? (data.items as FeedPreviewItem[]) : []
      setTestItems(items)
      setTestMeta({
        fetchedUrl: typeof data.fetchedUrl === 'string' ? data.fetchedUrl : null,
        contentType: typeof data.contentType === 'string' ? data.contentType : null,
      })
      setSuccess(items.length > 0 ? `Looks good — parsed ${items.length} item(s).` : 'Fetched feed, but found no items.')
    } catch (err: any) {
      setError(err.message || 'Failed to test feed.')
    } finally {
      setTesting(false)
    }
  }

  const sendNewestToInbox = async () => {
    setError(null)
    setSuccess(null)
    const feedUrl = url.trim()
    if (!feedUrl) {
      setError('Enter a feed URL first.')
      return
    }
    setVerifying(true)
    try {
      const response = await fetch('/api/sources/rss/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send item to inbox.')
      }
      setSuccess(data.deduped ? 'Already in inbox.' : 'Sent newest item to inbox.')
    } catch (err: any) {
      setError(err.message || 'Failed to send item to inbox.')
    } finally {
      setVerifying(false)
    }
  }

  const testFeed = async () => {
    await testFeedUrl(url)
  }

  const generateFromSocial = async () => {
    setError(null)
    setSuccess(null)
    setDiscoveredFeeds(null)
    if (socialNetwork === 'auto') {
      setGeneratedFeedUrl(null)
      setGeneratedHelpText('Detecting feed links…')
      setGeneratedOpenUrl(null)
      try {
        const response = await fetch('/api/sources/social/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: socialUrl.trim() }),
        })
        const data = await response.json()
        if (!response.ok) {
          setGeneratedFeedUrl(null)
          setGeneratedHelpText(data.error || 'Failed to detect feeds.')
          setGeneratedOpenUrl(null)
          return
        }
        const feeds = Array.isArray(data?.feeds) ? (data.feeds as DiscoveredFeed[]) : []
        const bestUrl = typeof data?.best?.url === 'string' ? data.best.url : null
        const count = feeds.length
        setDiscoveredFeeds(count > 0 ? feeds : null)
        setGeneratedFeedUrl(bestUrl)
        setGeneratedHelpText(
          count > 1 ? `Found ${count} feeds. Using the best match.` : null,
        )
        setGeneratedOpenUrl(null)

        // One-click path: fill the Add form and immediately preview.
        // If multiple feeds exist, we still preview the default selection; the chooser lets you switch.
        if (bestUrl) {
          setUrl(bestUrl)
          if (!name.trim()) {
            setName('Auto-detected feed')
          }
          await testFeedUrl(bestUrl)
        }
      } catch (err: any) {
        setGeneratedFeedUrl(null)
        setGeneratedHelpText(err?.message || 'Failed to detect feeds.')
        setGeneratedOpenUrl(null)
      }
      return
    }

    // For YouTube, try local derivation first; if that fails (e.g. @handle), ask the server to resolve.
    if (socialNetwork === 'youtube') {
      const local = generateFeedUrlFromSocial(socialUrl, socialNetwork)
      if (local.feedUrl) {
        setGeneratedFeedUrl(local.feedUrl)
        setGeneratedHelpText(null)
        setGeneratedOpenUrl(null)
        setDiscoveredFeeds(null)
        return
      }

      setGeneratedFeedUrl(null)
      setGeneratedHelpText('Resolving YouTube channel…')
      setGeneratedOpenUrl(null)

      try {
        const response = await fetch('/api/sources/social/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: 'youtube', url: socialUrl.trim() }),
        })
        const data = await response.json()
        if (!response.ok) {
          setGeneratedFeedUrl(null)
          setGeneratedHelpText(data.error || 'Failed to resolve YouTube channel.')
          setGeneratedOpenUrl(null)
          return
        }
        setGeneratedFeedUrl(typeof data.feedUrl === 'string' ? data.feedUrl : null)
        setGeneratedHelpText(null)
        setGeneratedOpenUrl(null)
        setDiscoveredFeeds(null)
      } catch (err: any) {
        setGeneratedFeedUrl(null)
        setGeneratedHelpText(err?.message || 'Failed to resolve YouTube channel.')
        setGeneratedOpenUrl(null)
        setDiscoveredFeeds(null)
      }
      return
    }

    const result = generateFeedUrlFromSocial(socialUrl, socialNetwork)
    setGeneratedFeedUrl(result.feedUrl || null)
    setGeneratedHelpText(result.helpText || null)
    setGeneratedOpenUrl(result.openUrl || null)
    setDiscoveredFeeds(null)
  }

  const useGeneratedFeed = () => {
    if (!generatedFeedUrl) return
    setUrl(generatedFeedUrl)
    if (!name.trim()) {
      const label =
        socialNetwork === 'x'
          ? 'X'
          : socialNetwork === 'youtube'
            ? 'YouTube'
            : socialNetwork === 'substack'
              ? 'Substack'
              : socialNetwork === 'medium'
                ? 'Medium'
                : socialNetwork === 'github'
                  ? 'GitHub'
                  : socialNetwork === 'reddit'
                    ? 'Reddit'
                    : socialNetwork === 'tumblr'
                      ? 'Tumblr'
                      : 'Social'
      setName(label)
    }
    setSuccess('Feed URL filled in. Click Add to connect it.')
  }

  const removeSource = async (id: string) => {
    setError(null)
    setSuccess(null)
    const response = await fetch('/api/sources/rss', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) {
      const data = await response.json()
      setError(data.error || 'Failed to remove source.')
      return
    }
    setSources((prev) => prev.filter((item) => item.id !== id))
  }

  const exportOpml = async () => {
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/sources/opml/export')
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Failed to export OPML.')
      }
      const xml = await response.text()
      const blob = new Blob([xml], { type: 'text/xml;charset=utf-8' })
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = 'neolog-sources.opml'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(downloadUrl)
      setSuccess('OPML exported.')
    } catch (err: any) {
      setError(err.message || 'Failed to export OPML.')
    }
  }

  const importOpml = async () => {
    setError(null)
    setSuccess(null)
    if (!opmlText || !opmlText.trim()) {
      setError('Choose an OPML file to import.')
      return
    }

    setOpmlImporting(true)
    try {
      const response = await fetch('/api/sources/opml/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opml: opmlText }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import OPML.')
      }
      setSuccess(`Imported ${data.imported || 0} feed(s). Skipped ${data.skipped || 0}.`)
      setOpmlText(null)
      await loadSources()
    } catch (err: any) {
      setError(err.message || 'Failed to import OPML.')
    } finally {
      setOpmlImporting(false)
    }
  }

  const fetchNow = async (id?: string) => {
    setError(null)
    setSuccess(null)
    if (id) {
      setFetchingId(id)
    } else {
      setFetchingAll(true)
    }
    const response = await fetch('/api/sources/rss/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: id || null }),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error || 'Fetch failed.')
      setFetchingId(null)
      setFetchingAll(false)
      return
    }
    setSuccess(`Fetched ${data.inserted || 0} new item(s).`)
    await loadSources()
    setFetchingId(null)
    setFetchingAll(false)
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Sources</p>
          <h1 className="font-display text-3xl text-[var(--text-primary)]">Pull content in</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Connect RSS feeds to populate your inbox automatically. Fetching runs in the background, or trigger it manually.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-2">
            Auto-pull uses the RSS fetch endpoint (<span className="font-mono">/api/sources/rss/fetch</span>) when you wire a scheduled job.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => fetchNow()} className="btn btn-secondary btn-sm" disabled={fetchingAll}>
            <RefreshCw size={14} />
            {fetchingAll ? 'Fetching...' : 'Fetch all'}
          </button>
          <button onClick={() => router.push('/inbox')} className="btn btn-secondary btn-sm">
            View inbox
          </button>
        </div>
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

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-4 space-y-3">
        <h2 className="font-display text-lg text-[var(--text-primary)]">Add RSS feed</h2>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <input
            id="rss-name"
            name="rss-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Feed name (optional)"
            className="input"
          />
          <input
            id="rss-url"
            name="rss-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/rss.xml"
            className="input"
          />
          <div className="flex items-center gap-2">
            <button onClick={testFeed} className="btn btn-secondary btn-sm" disabled={testing || saving}>
              <Eye size={14} />
              {testing ? 'Testing...' : 'Test'}
            </button>
            <button onClick={addSource} className="btn btn-primary btn-sm" disabled={saving || testing}>
              <Plus size={14} />
              {saving ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          Tip: add the full feed URL (often <span className="font-mono">/rss</span> or <span className="font-mono">/feed</span>).
        </p>

        {testMeta && (
          <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Test result</p>
            {testMeta.fetchedUrl && (
              <p className="text-xs text-[var(--text-tertiary)] break-all">
                Fetched: {testMeta.fetchedUrl}
              </p>
            )}
            {testMeta.contentType && (
              <p className="text-xs text-[var(--text-tertiary)] break-all">
                Content-Type: {testMeta.contentType}
              </p>
            )}
            {testItems && testItems.length > 0 ? (
              <div className="space-y-2">
                {testItems.map((item) => (
                  <div key={item.link} className="text-sm">
                    <p className="text-[var(--text-primary)] truncate">{item.title}</p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{item.link}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">No items found in this feed.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void sendNewestToInbox()}
                className="btn btn-secondary btn-sm"
                disabled={verifying}
              >
                {verifying ? 'Sending…' : 'Send newest to inbox'}
              </button>
              <button onClick={() => router.push('/inbox')} className="btn btn-secondary btn-sm">
                View inbox
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-4 space-y-3">
        <h2 className="font-display text-lg text-[var(--text-primary)]">OPML</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Import/export subscriptions to move between readers.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void exportOpml()} className="btn btn-secondary btn-sm">
            Export OPML
          </button>
          <label className="btn btn-secondary btn-sm">
            Choose file
            <input
              type="file"
              accept=".opml,.xml,text/xml,application/xml"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] || null
                if (!file) {
                  setOpmlText(null)
                  return
                }
                const reader = new FileReader()
                reader.onload = () => setOpmlText(typeof reader.result === 'string' ? reader.result : null)
                reader.readAsText(file)
              }}
            />
          </label>
          <button
            onClick={() => void importOpml()}
            className="btn btn-primary btn-sm"
            disabled={opmlImporting || !opmlText}
          >
            {opmlImporting ? 'Importing…' : 'Import OPML'}
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          Import supports up to 200 feeds per file.
        </p>
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-4 space-y-3">
        <h2 className="font-display text-lg text-[var(--text-primary)]">Create RSS from a social profile</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Paste a profile URL and we’ll generate a feed URL when it’s deterministic. For networks without RSS, we’ll point you at a provider.
        </p>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <select
            className="input h-9"
            value={socialNetwork}
            onChange={(event) => setSocialNetwork(event.target.value as SocialNetwork)}
          >
            <option value="auto">Auto-detect (site)</option>
            <option value="x">X (Twitter)</option>
            <option value="youtube">YouTube</option>
            <option value="substack">Substack</option>
            <option value="medium">Medium</option>
            <option value="github">GitHub</option>
            <option value="reddit">Reddit</option>
            <option value="tumblr">Tumblr</option>
          </select>
          <input
            value={socialUrl}
            onChange={(event) => setSocialUrl(event.target.value)}
            placeholder="https://x.com/username"
            className="input"
          />
          <button onClick={() => void generateFromSocial()} className="btn btn-secondary btn-sm">
            <Wand2 size={14} />
            Generate
          </button>
        </div>

        {(generatedFeedUrl || generatedHelpText) && (
          <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3 space-y-2">
            {discoveredFeeds && discoveredFeeds.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Choose a feed</p>
                <select
                  className="input h-9"
                  value={generatedFeedUrl || ''}
                  onChange={(event) => {
                    const next = event.target.value
                    setGeneratedFeedUrl(next || null)
                    if (next) {
                      setUrl(next)
                      setTestItems(null)
                      setTestMeta(null)
                    }
                  }}
                >
                  {discoveredFeeds.map((feed) => (
                    <option key={feed.url} value={feed.url}>
                      {(feed.title || feed.type || 'Feed') + ' — ' + feed.url}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap items-center gap-2">
                  {generatedFeedUrl && (
                    <button
                      onClick={() => void testFeedUrl(generatedFeedUrl)}
                      className="btn btn-secondary btn-sm"
                      disabled={testing}
                    >
                      <Eye size={14} />
                      {testing ? 'Testing...' : 'Test selected'}
                    </button>
                  )}
                </div>
              </div>
            )}
            {generatedFeedUrl && (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Generated feed URL</p>
                <p className="text-sm text-[var(--text-primary)] break-all">{generatedFeedUrl}</p>
              </div>
            )}
            {generatedHelpText && (
              <p className="text-sm text-[var(--text-secondary)]">{generatedHelpText}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {generatedFeedUrl && (
                <button onClick={useGeneratedFeed} className="btn btn-primary btn-sm">
                  <Plus size={14} />
                  Use this feed
                </button>
              )}
              {generatedOpenUrl && (
                <button
                  onClick={() => window.open(generatedOpenUrl, '_blank', 'noopener,noreferrer')}
                  className="btn btn-secondary btn-sm"
                >
                  <ExternalLink size={14} />
                  Open generator
                </button>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-[var(--text-tertiary)]">
          Note: Some networks block scraping or require API access. This tool avoids scraping and instead generates known feed URLs or sends you to a provider.
        </p>
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-light)]">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Connected feeds</p>
        </div>
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-tertiary)]">Loading sources...</div>
        ) : sources.length === 0 ? (
          <div className="p-6 text-sm text-[var(--text-tertiary)]">No sources connected yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {sources.map((source) => (
              <div key={source.id} className="px-4 py-3 space-y-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {source.name || source.url}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">
                    {source.url}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Last fetched: {source.last_fetched_at ? new Date(source.last_fetched_at).toLocaleString() : 'Never'}
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                      Destination publication
                    </label>
                    <select
                      className="input h-9"
                      value={source.publication_id || ''}
                      onChange={(event) => {
                        const next = event.target.value || null
                        void updateSourceSettings(source.id, { publicationId: next })
                      }}
                      disabled={savingSettingsId === source.id}
                    >
                      <option value="">
                        {defaultPublicationName
                          ? `(Use default: ${defaultPublicationName})`
                          : '(Use default)'}
                      </option>
                      {publications.map((pub) => (
                        <option key={pub.id} value={pub.id}>
                          {pub.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      Used when auto-converting RSS items into drafts.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                      Auto-convert to drafts
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={savingSettingsId === source.id}
                        onClick={() => {
                          void updateSourceSettings(source.id, {
                            autoConvertToDrafts: !Boolean(source.auto_convert_to_drafts),
                          })
                        }}
                      >
                        {Boolean(source.auto_convert_to_drafts) ? 'On' : 'Off'}
                      </button>

                      <button
                        onClick={() => fetchNow(source.id)}
                        className="btn btn-secondary btn-sm"
                        disabled={fetchingId === source.id}
                      >
                        <Rss size={14} />
                        {fetchingId === source.id ? 'Fetching...' : 'Fetch'}
                      </button>

                      <button onClick={() => removeSource(source.id)} className="btn btn-secondary btn-sm text-[var(--error)]">
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      Requires the scheduled RSS pull to be running.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
