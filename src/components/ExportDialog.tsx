'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Download, FileText, FileCode, FileJson, BookOpen,
  Loader2, Check, X
} from 'lucide-react'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

type ExportFormat = 'json' | 'html' | 'markdown' | 'pdf' | 'epub'

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('json')
  const [exporting, setExporting] = useState(false)
  const [includeComments, setIncludeComments] = useState(false)
  const [includeStats, setIncludeStats] = useState(false)
  const [success, setSuccess] = useState(false)

  const supabase = createClient()

  const formats = [
    {
      value: 'json' as const,
      label: 'JSON',
      description: 'All data in JSON format',
      icon: FileJson,
      color: 'text-blue-500',
    },
    {
      value: 'html' as const,
      label: 'HTML',
      description: 'Posts as HTML files',
      icon: FileCode,
      color: 'text-orange-500',
    },
    {
      value: 'markdown' as const,
      label: 'Markdown',
      description: 'Posts as Markdown files',
      icon: FileText,
      color: 'text-green-500',
    },
    {
      value: 'pdf' as const,
      label: 'PDF',
      description: 'Print-ready PDF documents',
      icon: FileText,
      color: 'text-red-500',
      badge: 'Premium',
    },
    {
      value: 'epub' as const,
      label: 'EPUB',
      description: 'E-reader compatible format',
      icon: BookOpen,
      color: 'text-purple-500',
      badge: 'Premium',
    },
  ]

  const handleExport = async () => {
    setExporting(true)
    setSuccess(false)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        alert('Please sign in to export')
        return
      }

      const params = new URLSearchParams({
        format,
        includeComments: includeComments.toString(),
        includeStats: includeStats.toString(),
      })

      const response = await fetch(`/api/export?${params}`, {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error('Export failed')
      }

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `neolog-export-${format}-${new Date().toISOString().split('T')[0]}.${format === 'json' ? 'json' : format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        onClose()
      }, 2000)
    } catch (error) {
      console.error('Export error:', error)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[var(--border-light)]">
            <div>
              <h2 className="text-2xl font-display font-bold">Export Your Content</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Download all your posts and data
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Format selection */}
            <div>
              <label className="block text-sm font-medium mb-3">Export Format</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {formats.map((f) => {
                  const Icon = f.icon
                  return (
                    <button
                      key={f.value}
                      onClick={() => setFormat(f.value)}
                      disabled={f.badge === 'Premium'}
                      className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                        format === f.value
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-light)] hover:border-[var(--border-medium)]'
                      } ${f.badge === 'Premium' ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {f.badge && (
                        <span className="absolute top-2 right-2 px-2 py-1 text-xs rounded-full bg-[var(--accent)] text-white">
                          {f.badge}
                        </span>
                      )}
                      <div className="flex items-start gap-3">
                        <Icon size={24} className={f.color} />
                        <div className="flex-1">
                          <p className="font-semibold mb-1">{f.label}</p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {f.description}
                          </p>
                        </div>
                        {format === f.value && (
                          <Check size={20} className="text-[var(--accent)]" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <label className="block text-sm font-medium">Export Options</label>

              <label className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeComments}
                  onChange={(e) => setIncludeComments(e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <div>
                  <p className="font-medium">Include Comments</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Export all comments and replies
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStats}
                  onChange={(e) => setIncludeStats(e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <div>
                  <p className="font-medium">Include Analytics</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Export view counts and engagement metrics
                  </p>
                </div>
              </label>
            </div>

            {/* Info */}
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <p className="text-sm text-[var(--text-secondary)]">
                <strong>Note:</strong> Your export will include all published posts, drafts, and profile information. The download may take a few moments depending on the size of your content.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--border-light)]">
            <button
              onClick={onClose}
              disabled={exporting}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn btn-primary"
            >
              {exporting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Exporting...
                </>
              ) : success ? (
                <>
                  <Check size={16} />
                  Downloaded!
                </>
              ) : (
                <>
                  <Download size={16} />
                  Export {format.toUpperCase()}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
