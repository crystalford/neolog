'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, AlertCircle, Check, Loader2, ExternalLink } from 'lucide-react'

export default function ImportPage() {
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<{ success: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleFileUploadWithSource = (source: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSource(source)
    handleFileUpload(e)
  }

  const [source, setSource] = useState('')

  return (
    <>
      <main className="pt-16 pb-16">
        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          <div className="pt-8 mb-10">
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
              <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <span className="text-xl font-bold text-orange-500">S</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="font-medium text-lg mb-1">Import from Substack</h2>
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
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={importing}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Medium */}
              <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#00ab6c]/10 flex items-center justify-center">
                    <span className="text-xl font-bold text-[#00ab6c]">M</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="font-medium text-lg mb-1">Import from Medium</h2>
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
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={importing}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* WordPress */}
              <div className="p-6 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#21759b]/10 flex items-center justify-center">
                    <span className="text-xl font-bold text-[#21759b]">W</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="font-medium text-lg mb-1">Import from WordPress</h2>
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
                        onChange={handleFileUpload}
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
              <a href="/write" className="btn btn-primary">
                <FileText size={16} />
                Write a Post
              </a>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}



