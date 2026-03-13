'use client'

import { useState, useRef } from 'react'
import { Terminal, Send, History, Layers, Zap, Brain, Globe, MessageSquare, Code, Camera, Image as ImageIcon, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function QuickIngestPage() {
  const [input, setInput] = useState('')
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const supabase = createClient()

  const handleIngest = async () => {
    if (!input.trim() || processing) return
    
    setProcessing(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/ingest/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim() })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ingestion failed')

      setSuccess(true)
      setInput('')
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}/${Date.now()}.${fileExt}`
      const filePath = `images/${fileName}`

      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('neural-signals')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('neural-signals')
        .getPublicUrl(filePath)

      // 2. Register Signal via API
      const res = await fetch('/api/ingest/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: publicUrl, fileName: file.name })
      })

      if (!res.ok) throw new Error('Failed to register neural signal')

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:py-12 space-y-8">
      {/* HUD Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[var(--border-light)] pb-6">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--accent)] mb-2 flex items-center gap-2">
             <Zap size={12} className="animate-pulse" /> Signal Ingestion Node
          </h2>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Quick Ingest</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-2">Drop raw text, chat logs, or code snippets directly into your intelligence graph.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Terminal Input */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--accent)] to-cyan-500 rounded-2xl blur opacity-[0.05] group-focus-within:opacity-20 transition duration-500"></div>
            <div className="relative flex flex-col bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/40 border-b border-[var(--border-light)] text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">
                <Terminal size={12} /> session_input.log
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste raw data here... (Conversations, Meeting notes, Code commit logs)"
                className="w-full min-h-[400px] p-6 bg-transparent border-none focus:ring-0 font-mono text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]/30 resize-none selection:bg-[var(--accent)] selection:text-white"
                autoFocus
                disabled={processing}
              />
              <div className="p-4 bg-black/20 border-t border-[var(--border-light)] flex items-center justify-between">
                <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--text-tertiary)]">
                  <span>CHAR_COUNT: {input.length}</span>
                  {processing && <span className="text-[var(--accent)] animate-pulse">EXTRACTING_ENTITIES...</span>}
                  {uploadingImage && <span className="text-cyan-400 animate-pulse">UPLOADING_NEURAL_MANIFEST...</span>}
                  {success && <span className="text-emerald-500 animate-bounce">SIGNAL_RECEIVED</span>}
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleImageUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage || processing}
                    className="p-2 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[var(--text-tertiary)] hover:text-cyan-400 transition-colors"
                    title="Upload Neural Image"
                  >
                    {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  </button>
                  <button
                    onClick={handleIngest}
                    disabled={!input.trim() || processing}
                    className="btn btn-primary btn-sm flex items-center gap-2 px-6"
                  >
                    <Send size={14} /> Ingest Signal
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {error && (
             <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-mono text-xs uppercase tracking-tight">
               Error: {error}
             </div>
          )}
        </div>

        {/* Info Panels */}
        <div className="space-y-6">
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] p-6 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-2">
              <Layers size={14} className="text-cyan-400" /> Supported Formats
            </h3>
            <div className="space-y-3">
              {[
                { icon: MessageSquare, label: 'Chat Logs', color: 'text-blue-400' },
                { icon: Code, label: 'GitHub Commits', color: 'text-purple-400' },
                { icon: Brain, label: 'Meeting Notes', color: 'text-amber-400' },
                { icon: Globe, label: 'Article Text', color: 'text-emerald-400' },
                { icon: Camera, label: 'Neural Headshots', color: 'text-cyan-400' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                  <item.icon size={14} className={item.color} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-cyan-500/5 rounded-2xl border border-cyan-500/20 p-6 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-widest text-cyan-400 flex items-center gap-2">
              <ImageIcon size={14} /> Neural Manifest
            </h3>
            <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
              Upload clear headshots to fine-tune your virtual character. Use high-contrast, well-lit photos for the best results.
            </p>
            <div className="pt-2">
               <div className="h-1 w-full bg-cyan-500/10 rounded-full overflow-hidden">
                 <div className="h-full bg-cyan-500 w-1/4 animate-pulse" />
               </div>
               <p className="text-[8px] font-mono uppercase text-cyan-500/60 mt-2">Training Data: 20% Required</p>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-light)] p-6 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-2">
              <History size={14} className="text-[var(--accent)]" /> Last Ingestion
            </h3>
            <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed italic">
              Wait for data to propagate through the neural net before visiting your character sheet.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
