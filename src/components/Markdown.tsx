'use client'

import React, { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface MarkdownProps {
  content: string
  className?: string
}

/**
 * Renders markdown content safely using marked and dompurify.
 * Designed for chat messages and assistant responses.
 */
export default function Markdown({ content, className = '' }: MarkdownProps) {
  const html = useMemo(() => {
    if (!content) return ''
    
    // Parse markdown to HTML
    const rawHtml = marked.parse(content, { 
      breaks: true,
      gfm: true
    }) as string

    // Sanitize on the client side
    if (typeof window !== 'undefined') {
      return DOMPurify.sanitize(rawHtml)
    }
    
    return rawHtml
  }, [content])

  return (
    <div 
      className={`prose prose-sm prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit' }}
    />
  )
}
