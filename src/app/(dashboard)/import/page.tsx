'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, AlertCircle, Check, Loader2, ExternalLink } from 'lucide-react'

export default function ImportPage() {
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<{ success: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [htmlImporting, setHtmlImporting] = useState(false)
  const [htmlProgress, setHtmlProgress] = useState<{ total: number; done: number } | null>(null)
  const [htmlResults, setHtmlResults] = useState<{ imported: number; failed: number; created: Array<{ id: string; title: string }> } | null>(null)
  const [rssUrl, setRssUrl] = useState('')
  const [rssLimit, setRssLimit] = useState('50')
  const [rssStatus, setRssStatus] = useState<'draft' | 'published'>('draft')
  const [rssImporting, setRssImporting] = useState(false)
  const router = useRouter()

  const handleHtmlBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setHtmlImporting(true)
    setHtmlProgress({ total: files.length, done: 0 })
    setHtmlResults(null)
    setError(null)

    try {
      const formData = new FormData()
      for (const file of files) {
        formData.append('files', file)
      }

      const res = await fetch('/api/import/html-bulk', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Bulk HTML import failed')
      }

      setHtmlResults({
        imported: data?.imported || 0,
        failed: data?.failed || 0,
        created: Array.isArray(data?.created) ? data.created : [],
      })

      if ((data?.imported || 0) > 0) {
        // Send them somewhere predictable; drafts will show up in dashboard.
        setTimeout(() => router.push('/dashboard'), 2000)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to import HTML files. Please try again.')
    } finally {
      setHtmlImporting(false)
      setHtmlProgress(null)
      e.target.value = ''
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, source: string) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setError(null)
    setResults(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('source', source)

      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Import failed')

      const data = await res.json()
      setResults({ success: data.success, failed: data.failed })
      
      if (data.success > 0) {
        // Redirect to dashboard after short delay
        setTimeout(() => router.push('/dashboard'), 2000)
      }
    } catch (err) {
      setError('Failed to process file. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  const importFromRss = async () => {
    const feedUrl = rssUrl.trim()
    if (!feedUrl) {
      setError('Paste an RSS/Atom feed URL to import.')
      return
    }

    setRssImporting(true)
    setError(null)
    setResults(null)

    const limit = Math.max(1, Math.min(200, Number(rssLimit) || 50))

    try {
      const res = await fetch('/api/import/rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl, limit, status: rssStatus }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'RSS import failed')
      }

      setResults({ success: data.imported || 0, failed: data.failed || 0 })
      if ((data.imported || 0) > 0) {
        setTimeout(() => router.push('/dashboard'), 2000)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to import RSS feed. Please try again.')
    } finally {
      setRssImporting(false)
    }
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-6xl mx-auto">
      <div className="mb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
              Import
            </p>
            <h1 className="font-display text-3xl mb-2">Import Your Content</h1>
            <p className="text-[var(--text-secondary)] max-w-2xl">
              Bring your existing posts from Substack, Medium, or WordPress.
            </p>
      </div>

      <div className="space-y-8">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Substack */}
              <div className="p-5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <span className="text-xl font-bold text-orange-500">S</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="font-medium text-base mb-1">Import from Substack</h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-4">
                      Export your Substack posts and upload the ZIP file here
                    </p>

                    <ol className="text-sm text-[var(--text-tertiary)] mb-4 space-y-1">
                      <li>1. Go to Substack &gt; Settings &gt; Export</li>
                      <li>2. Download your posts as a ZIP file</li>
                      <li>3. Upload the ZIP file below</li>
                    </ol>

                    <label className="btn btn-secondary cursor-pointer inline-flex">
                      {importing ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          Upload Substack Export
                        </>
                      )}
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => handleFileUpload(e, 'substack')}
                        className="hidden"
                        disabled={importing}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Medium */}
              <div className="p-5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#00ab6c]/10 flex items-center justify-center">
                    <span className="text-xl font-bold text-[#00ab6c]">M</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="font-medium text-base mb-1">Import from Medium</h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-4">
                      Download your Medium posts and upload the HTML files
                    </p>

                    <ol className="text-sm text-[var(--text-tertiary)] mb-4 space-y-1">
                      <li>1. Go to Medium &gt; Settings &gt; Security &gt; Download your information</li>
                      <li>2. Wait for the export email (can take a few minutes)</li>
                      <li>3. Upload the ZIP file below</li>
                    </ol>

                    <label className="btn btn-secondary cursor-pointer inline-flex">
                      <Upload size={16} />
                      Upload Medium Export
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => handleFileUpload(e, 'medium')}
                        className="hidden"
                        disabled={importing}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* WordPress */}
              <div className="p-5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#21759b]/10 flex items-center justify-center">
                    <span className="text-xl font-bold text-[#21759b]">W</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="font-medium text-base mb-1">Import from WordPress</h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-4">
                      Export your WordPress posts as XML and upload here
                    </p>

                    <ol className="text-sm text-[var(--text-tertiary)] mb-4 space-y-1">
                      <li>1. Go to WordPress &gt; Tools &gt; Export</li>
                      <li>2. Choose "Posts" and download the XML</li>
                      <li>3. Upload the XML file below</li>
                    </ol>

                    <label className="btn btn-secondary cursor-pointer inline-flex">
                      <Upload size={16} />
                      Upload WordPress Export
                      <input
                        type="file"
                        accept=".xml"
                        onChange={(e) => handleFileUpload(e, 'wordpress')}
                        className="hidden"
                        disabled={importing}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Status messages */}
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/20">
                <AlertCircle size={20} className="text-[var(--warning)]" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {results && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/20">
                <Check size={20} className="text-[var(--success)]" />
                <p className="text-sm">
                  Imported {results.success} posts successfully
                  {results.failed > 0 && `, ${results.failed} failed`}
                </p>
              </div>
            )}

            {/* Manual option */}
            <div className="text-center py-6 border-t border-[var(--border-light)]">
              <p className="text-sm text-[var(--text-tertiary)] mb-2">
                Prefer to copy-paste? You can also create posts manually
              </p>
              <a href="/write" className="btn btn-primary btn-sm">
                <FileText size={16} />
                Write a Post
              </a>
            </div>

            {/* Bulk HTML import */}
            <div className="p-5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center">
                  <span className="text-xl font-bold text-[var(--text-primary)]">HTML</span>
                </div>
                <div className="flex-1">
                  <h2 className="font-medium text-base mb-1">Bulk import HTML files</h2>
                  <p className="text-sm text-[var(--text-secondary)] mb-4">
                    Upload many HTML files at once. Neolog will auto-detect titles/subtitles and strip headers/footers.
                  </p>

                  <label className="btn btn-secondary cursor-pointer inline-flex">
                    {htmlImporting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        Upload HTML files
                      </>
                    )}
                    <input
                      type="file"
                      accept=".html,.htm"
                      multiple
                      onChange={handleHtmlBulkUpload}
                      className="hidden"
                      disabled={htmlImporting || importing || rssImporting}
                    />
                  </label>

                  {htmlProgress && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-3">
                      Reading files: {htmlProgress.done}/{htmlProgress.total}
                    </p>
                  )}

                  {htmlResults && (
                    <div className="mt-4">
                      <p className="text-sm text-[var(--text-secondary)]">
                        Imported {htmlResults.imported} drafts{htmlResults.failed ? `, ${htmlResults.failed} failed` : ''}.
                      </p>
                      {htmlResults.created.length > 0 && (
                        <div className="mt-3 grid gap-2">
                          {htmlResults.created.slice(0, 10).map((row) => (
                            <a
                              key={row.id}
                              href={`/write?edit=${encodeURIComponent(row.id)}`}
                              className="inline-flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--border-light)] hover:bg-[var(--bg-secondary)]"
                            >
                              <span className="text-sm text-[var(--text-primary)] truncate">{row.title}</span>
                              <ExternalLink size={16} className="text-[var(--text-tertiary)]" />
                            </a>
                          ))}
                          {htmlResults.created.length > 10 && (
                            <p className="text-xs text-[var(--text-tertiary)]">
                              Showing first 10. Find the rest in your Dashboard.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RSS import */}
            <div className="p-5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center">
                  <span className="text-xl font-bold text-[var(--text-primary)]">RSS</span>
                </div>
                <div className="flex-1">
                  <h2 className="font-medium text-base mb-1">Import from RSS / Atom</h2>
                  <p className="text-sm text-[var(--text-secondary)] mb-4">
                    Paste your publication feed URL to import posts in bulk.
                  </p>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="md:col-span-2">
                      <input
                        className="input w-full"
                        placeholder="https://example.com/feed.xml"
                        value={rssUrl}
                        onChange={(e) => setRssUrl(e.target.value)}
                        disabled={rssImporting}
                      />
                    </div>
                    <div>
                      <input
                        className="input w-full"
                        placeholder="Limit"
                        value={rssLimit}
                        onChange={(e) => setRssLimit(e.target.value)}
                        disabled={rssImporting}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    <select
                      className="input"
                      value={rssStatus}
                      onChange={(e) => setRssStatus(e.target.value as any)}
                      disabled={rssImporting}
                    >
                      <option value="draft">Import as drafts</option>
                      <option value="published">Import as published</option>
                    </select>
                    <button
                      onClick={importFromRss}
                      className="btn btn-secondary"
                      disabled={rssImporting}
                    >
                      {rssImporting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          Import RSS
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-[var(--text-tertiary)] mt-3">
                    Tip: Draft imports are safest; published imports won’t run publish side-effects (embeddings/syndication) until you explicitly Update.
                  </p>
                </div>
              </div>
            </div>
      </div>
    </main>
  )
}



