'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, Eye, Code, FileText, Type, Save, Globe } from 'lucide-react'
import clsx from 'clsx'

type EditorMode = 'html' | 'markdown' | 'rich'

interface EditorProps {
  initialContent?: string
  initialTitle?: string
  initialMode?: EditorMode
  onSave?: (data: { title: string; content: string; mode: EditorMode }) => void
  onPublish?: (data: { title: string; content: string; mode: EditorMode }) => void
  saving?: boolean
}

export function Editor({ 
  initialContent = '', 
  initialTitle = '',
  initialMode = 'html',
  onSave,
  onPublish,
  saving = false
}: EditorProps) {
  const [mode, setMode] = useState<EditorMode>(initialMode)
  const [content, setContent] = useState(initialContent)
  const [title, setTitle] = useState(initialTitle)
  const [isDragging, setIsDragging] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const richEditorRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const autoSaveTimeout = useRef<NodeJS.Timeout>()

  // Update preview when content changes
  useEffect(() => {
    if (!iframeRef.current) return
    
    let html = content
    
    // Convert markdown if needed
    if (mode === 'markdown') {
      html = convertMarkdownToHtml(content)
    }
    
    // Wrap in base template if not a full document
    if (!html.trim().toLowerCase().startsWith('<!doctype')) {
      html = wrapInTemplate(html)
    }
    
    iframeRef.current.srcdoc = html
  }, [content, mode])

  // Auto-save after 2 seconds of no typing
  useEffect(() => {
    if (autoSaveTimeout.current) {
      clearTimeout(autoSaveTimeout.current)
    }
    
    autoSaveTimeout.current = setTimeout(() => {
      if (onSave && (title || content)) {
        onSave({ title, content, mode })
        setLastSaved(new Date())
      }
    }, 2000)

    return () => {
      if (autoSaveTimeout.current) {
        clearTimeout(autoSaveTimeout.current)
      }
    }
  }, [title, content, mode, onSave])

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setContent(text)
      
      // Try to extract title
      const titleMatch = text.match(/<title>([^<]+)<\/title>/i) ||
                         text.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                         text.match(/^#\s+(.+)$/m)
      
      if (titleMatch) {
        setTitle(titleMatch[1])
      } else {
        setTitle(file.name.replace(/\.[^/.]+$/, ''))
      }
      
      // Detect mode from file extension
      if (file.name.endsWith('.md')) {
        setMode('markdown')
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        setMode('html')
      }
    }
    reader.readAsText(file)
  }, [])

  // Handle file input
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Create a fake drag event
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setContent(text)
      
      const titleMatch = text.match(/<title>([^<]+)<\/title>/i) ||
                         text.match(/<h1[^>]*>([^<]+)<\/h1>/i)
      if (titleMatch) setTitle(titleMatch[1])
    }
    reader.readAsText(file)
  }

  // Handle tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.currentTarget.selectionStart
      const end = e.currentTarget.selectionEnd
      const value = e.currentTarget.value
      e.currentTarget.value = value.substring(0, start) + '  ' + value.substring(end)
      e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2
      setContent(e.currentTarget.value)
    }
  }

  const handlePublish = () => {
    if (onPublish) {
      onPublish({ title, content, mode })
    }
  }

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Toolbar */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled post"
            className="font-display text-2xl bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted w-80"
          />
          {lastSaved && (
            <span className="text-xs text-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          {saving && (
            <span className="text-xs text-text-muted">Saving...</span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onSave?.({ title, content, mode })}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Save size={16} />
            Save draft
          </button>
          <button 
            onClick={handlePublish}
            className="btn btn-primary flex items-center gap-2"
          >
            <Globe size={16} />
            Publish
          </button>
        </div>
      </div>

      {/* Editor panels */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* Left panel - Editor */}
        <div 
          className="relative bg-surface rounded-xl border border-border flex flex-col overflow-hidden"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {/* Mode tabs */}
          <div className="flex justify-between items-center px-4 py-3 bg-surface-elevated border-b border-border">
            <div className="flex gap-1">
              {[
                { id: 'html', icon: Code, label: 'HTML' },
                { id: 'markdown', icon: FileText, label: 'Markdown' },
                { id: 'rich', icon: Type, label: 'Rich Text' },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setMode(id as EditorMode)}
                  className={clsx(
                    'px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors',
                    mode === id 
                      ? 'bg-accent-soft text-accent' 
                      : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            
            <label className="cursor-pointer">
              <input 
                type="file" 
                accept=".html,.htm,.md,.txt" 
                className="hidden" 
                onChange={handleFileInput}
              />
              <span className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1.5 transition-colors">
                <Upload size={14} />
                Upload
              </span>
            </label>
          </div>

          {/* Editor content */}
          <div className="flex-1 overflow-auto">
            {mode === 'rich' ? (
              <div
                ref={richEditorRef}
                contentEditable
                className="rich-editor p-5"
                data-placeholder="Start writing..."
                onInput={(e) => setContent(e.currentTarget.innerHTML)}
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'markdown' 
                  ? "# Your Title\n\nWrite your content in **Markdown**..." 
                  : "<!-- Paste or write your HTML here -->\n\n<h1>Your content</h1>"
                }
                className="editor-textarea p-5"
                spellCheck={false}
              />
            )}
          </div>

          {/* Drop overlay */}
          {isDragging && (
            <div className="absolute inset-0 bg-accent/5 border-2 border-dashed border-accent rounded-xl flex flex-col items-center justify-center gap-3 z-10">
              <div className="w-16 h-16 rounded-2xl bg-accent-soft flex items-center justify-center">
                <Upload size={28} className="text-accent" />
              </div>
              <p className="font-display text-xl">Drop to import</p>
              <p className="text-sm text-text-muted">Release to import your file</p>
            </div>
          )}
        </div>

        {/* Right panel - Preview */}
        <div className="bg-surface rounded-xl border border-border flex flex-col overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 bg-surface-elevated border-b border-border">
            <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
              <Eye size={14} />
              Preview
            </div>
            <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Live</span>
          </div>
          
          <div className="flex-1 bg-white rounded-b-xl overflow-hidden">
            <iframe
              ref={iframeRef}
              className="w-full h-full border-none"
              sandbox="allow-scripts"
              title="Preview"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper functions
function convertMarkdownToHtml(md: string): string {
  return md
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n\n/g, '</p><p>')
}

function wrapInTemplate(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 700px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    h1, h2, h3 { line-height: 1.3; margin-top: 2rem; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    img { max-width: 100%; height: auto; }
    a { color: #ff6b35; }
    blockquote { border-left: 3px solid #ddd; margin: 1.5rem 0; padding-left: 1rem; color: #666; }
  </style>
</head>
<body>${content}</body>
</html>`
}
