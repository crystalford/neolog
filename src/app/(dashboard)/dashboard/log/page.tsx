'use client'

import { useState, useRef } from 'react'
import { Inbox, Upload, Mic, Send, Sparkles, Video, FileText, Clock } from 'lucide-react'

// Placeholder entity types for today's extractions
const ENTITY_ICONS: Record<string, string> = {
  idea: '💡',
  project: '🏗',
  question: '❓',
  commitment: '🎯',
  person: '🤝',
  goal: '⚡',
  decision: '🔑',
  habit: '🔄',
  blocker: '🚧',
}

export default function DailyLogPage() {
  const [inputText, setInputText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim()) return
    setIsSubmitting(true)
    // TODO: wire up to capture endpoint
    setTimeout(() => {
      setInputText('')
      setIsSubmitting(false)
    }, 1000)
  }

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-4rem)]">
      <div className="flex-1 overflow-y-auto px-6 py-8 max-w-4xl mx-auto w-full">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-sm mb-2">
            <Clock size={14} />
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">Daily Log</h1>
          <p className="text-[var(--text-secondary)] mt-1">Drop a video, paste notes, or type a brain dump. Neolog does the rest.</p>
        </div>

        {/* Upload zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group relative mb-8 border-2 border-dashed border-[var(--border-medium)] hover:border-[var(--accent)] rounded-xl p-8 text-center cursor-pointer transition-all duration-200 hover:bg-[var(--accent)]/5"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*"
            className="hidden"
            onChange={() => {/* TODO: trigger upload */}}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-card)] border border-[var(--border-medium)] flex items-center justify-center group-hover:border-[var(--accent)] transition-colors">
              <Upload size={20} className="text-[var(--text-secondary)] group-hover:text-[var(--accent)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)]">Drop a video or audio file</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Up to 4GB · MP4, MOV, MP3, M4A, WAV</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1.5"><Video size={12} /> Videos</span>
              <span className="flex items-center gap-1.5"><Mic size={12} /> Audio</span>
              <span className="flex items-center gap-1.5"><FileText size={12} /> Transcripts</span>
            </div>
          </div>
        </div>

        {/* Today's extractions (placeholder) */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
            Today's Extractions
          </h2>
          <div className="space-y-2">
            {[
              { type: 'idea', text: 'No uploads yet today. Drop a video to start.' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-light)] opacity-50"
              >
                <span className="text-base mt-0.5">{ENTITY_ICONS[item.type]}</span>
                <p className="text-sm text-[var(--text-secondary)]">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent sessions */}
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
            Recent Sessions
          </h2>
          <div className="space-y-2">
            <div className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-light)] text-sm text-[var(--text-tertiary)] text-center py-8">
              No sessions yet. Upload a video to get started.
            </div>
          </div>
        </div>
      </div>

      {/* Bottom input bar */}
      <div className="sticky bottom-0 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-t border-[var(--border-medium)] px-6 py-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSubmit(e)
                }
              }}
              placeholder="Type a brain dump, paste notes, or ask your log a question..."
              rows={2}
              className="w-full resize-none rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={!inputText.trim() || isSubmitting}
            className="btn btn-primary flex-shrink-0 h-11 px-5 flex items-center gap-2"
          >
            {isSubmitting ? <Sparkles size={16} className="animate-spin" /> : <Send size={16} />}
            <span>{isSubmitting ? 'Logging...' : 'Log'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
