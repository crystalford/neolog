'use client'

import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import Typography from '@tiptap/extension-typography'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { useCallback, useEffect, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Code, Link as LinkIcon, Image as ImageIcon, List, ListOrdered,
  Quote, Minus, Heading1, Heading2, Heading3, Undo, Redo,
  AlignLeft, Code2, X, Check, Upload
} from 'lucide-react'

const lowlight = createLowlight(common)

interface RichEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  onImageUpload?: (file: File) => Promise<string>
  editable?: boolean
  className?: string
}

export function RichEditor({
  content,
  onChange,
  placeholder = 'Start writing...',
  onImageUpload,
  editable = true,
  className = '',
}: RichEditorProps) {
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [showImageUpload, setShowImageUpload] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We use CodeBlockLowlight instead
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[var(--accent)] underline',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full my-4',
        },
      }),
      Underline,
      Typography,
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'bg-[var(--bg-tertiary)] rounded-lg p-4 my-4 overflow-x-auto text-sm font-mono',
        },
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[300px]',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Update content when it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  const addLink = useCallback(() => {
    if (!editor || !linkUrl) return
    
    if (linkUrl === '') {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: linkUrl }).run()
    }
    
    setLinkUrl('')
    setShowLinkInput(false)
  }, [editor, linkUrl])

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onImageUpload || !editor) return

    try {
      const url = await onImageUpload(file)
      editor.chain().focus().setImage({ src: url }).run()
    } catch (error) {
      console.error('Image upload failed:', error)
    }
    
    setShowImageUpload(false)
  }, [editor, onImageUpload])

  const addImageByUrl = useCallback((url: string) => {
    if (!editor || !url) return
    editor.chain().focus().setImage({ src: url }).run()
    setShowImageUpload(false)
  }, [editor])

  if (!editor) {
    return (
      <div className={`min-h-[300px] bg-[var(--bg-secondary)] rounded-lg animate-pulse ${className}`} />
    )
  }

  const ToolbarButton = ({ 
    onClick, 
    active = false, 
    disabled = false,
    children,
    title,
  }: { 
    onClick: () => void
    active?: boolean
    disabled?: boolean
    children: React.ReactNode
    title?: string
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded-md transition-all ${
        active
          ? 'bg-[var(--accent)] text-white'
          : 'hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
      } ${disabled ? 'opacity-38 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )

  return (
    <div className={`rich-editor ${className}`}>
      {/* Toolbar */}
      {editable && (
        <div className="flex flex-wrap items-center gap-1 p-2 mb-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-light)] sticky top-24 z-10">
          {/* Text formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold (⌘B)"
          >
            <Bold size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic (⌘I)"
          >
            <Italic size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title="Underline (⌘U)"
          >
            <UnderlineIcon size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title="Strikethrough"
          >
            <Strikethrough size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
            title="Inline code"
          >
            <Code size={18} />
          </ToolbarButton>

          <div className="w-px h-6 bg-[var(--border-light)] mx-1" />

          {/* Headings */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            <Heading1 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <Heading2 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            <Heading3 size={18} />
          </ToolbarButton>

          <div className="w-px h-6 bg-[var(--border-light)] mx-1" />

          {/* Lists and blocks */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet list"
          >
            <List size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Numbered list"
          >
            <ListOrdered size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            title="Quote"
          >
            <Quote size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive('codeBlock')}
            title="Code block"
          >
            <Code2 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal rule"
          >
            <Minus size={18} />
          </ToolbarButton>

          <div className="w-px h-6 bg-[var(--border-light)] mx-1" />

          {/* Link */}
          <div className="relative">
            <ToolbarButton
              onClick={() => setShowLinkInput(!showLinkInput)}
              active={editor.isActive('link') || showLinkInput}
              title="Add link"
            >
              <LinkIcon size={18} />
            </ToolbarButton>
            
            {showLinkInput && (
              <div className="absolute top-full left-0 mt-2 p-2 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-lg shadow-lg z-20 flex gap-2">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="input py-1.5 text-sm w-48"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addLink()
                    }
                    if (e.key === 'Escape') {
                      setShowLinkInput(false)
                    }
                  }}
                />
                <button
                  onClick={addLink}
                  className="p-1.5 rounded bg-[var(--accent)] text-white"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => setShowLinkInput(false)}
                  className="p-1.5 rounded hover:bg-[var(--bg-tertiary)]"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Image */}
          <div className="relative">
            <ToolbarButton
              onClick={() => setShowImageUpload(!showImageUpload)}
              active={showImageUpload}
              title="Add image"
            >
              <ImageIcon size={18} />
            </ToolbarButton>
            
            {showImageUpload && (
              <div className="absolute top-full left-0 mt-2 p-3 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-lg shadow-lg z-20 w-64">
                <p className="text-sm font-medium mb-2">Add image</p>
                
                {onImageUpload && (
                  <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[var(--border-light)] rounded-lg cursor-pointer hover:border-[var(--accent)] transition-colors mb-2">
                    <Upload size={18} className="text-[var(--text-tertiary)]" />
                    <span className="text-sm text-[var(--text-secondary)]">Upload image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
                
                <div className="text-xs text-[var(--text-tertiary)] text-center mb-2">or</div>
                
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="Paste image URL"
                    className="input py-1.5 text-sm flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addImageByUrl((e.target as HTMLInputElement).value)
                      }
                    }}
                  />
                  <button
                    onClick={() => setShowImageUpload(false)}
                    className="p-1.5 rounded hover:bg-[var(--bg-tertiary)]"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Undo/Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo (⌘Z)"
          >
            <Undo size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo (⌘⇧Z)"
          >
            <Redo size={18} />
          </ToolbarButton>
        </div>
      )}

      {/* Bubble menu for selected text */}
      {editable && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-1 p-1 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-lg shadow-lg"
        >
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
          >
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
          >
            <Italic size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
          >
            <UnderlineIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
          >
            <Code size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              const url = window.prompt('Enter URL')
              if (url) {
                editor.chain().focus().setLink({ href: url }).run()
              }
            }}
            active={editor.isActive('link')}
          >
            <LinkIcon size={16} />
          </ToolbarButton>
        </BubbleMenu>
      )}

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Editor styles */}
      <style jsx global>{`
        .ProseMirror {
          min-height: 300px;
          outline: none;
        }
        
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--text-tertiary);
          pointer-events: none;
          height: 0;
        }

        .ProseMirror h1 {
          font-size: 2rem;
          font-weight: 700;
          margin: 1.5rem 0 0.75rem;
          font-family: var(--font-display);
        }

        .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 1.25rem 0 0.5rem;
          font-family: var(--font-display);
        }

        .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 1rem 0 0.5rem;
          font-family: var(--font-display);
        }

        .ProseMirror p {
          margin: 0.75rem 0;
          line-height: 1.7;
        }

        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.75rem 0;
        }

        .ProseMirror li {
          margin: 0.25rem 0;
        }

        .ProseMirror blockquote {
          border-left: 3px solid var(--accent);
          padding-left: 1rem;
          margin: 1rem 0;
          color: var(--text-secondary);
          font-style: italic;
        }

        .ProseMirror code {
          background: var(--bg-tertiary);
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          font-size: 0.9em;
        }

        .ProseMirror pre {
          background: var(--bg-tertiary);
          padding: 1rem;
          border-radius: 8px;
          overflow-x: auto;
          margin: 1rem 0;
        }

        .ProseMirror pre code {
          background: none;
          padding: 0;
        }

        .ProseMirror hr {
          border: none;
          border-top: 1px solid var(--border-light);
          margin: 2rem 0;
        }

        .ProseMirror img {
          max-width: 100%;
          border-radius: 8px;
          margin: 1rem 0;
        }

        .ProseMirror a {
          color: var(--accent);
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}
