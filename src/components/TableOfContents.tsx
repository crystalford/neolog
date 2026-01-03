'use client'

import { useEffect, useState } from 'react'
import { List, ChevronRight } from 'lucide-react'

type Heading = {
  id: string
  text: string
  level: number
}

interface TableOfContentsProps {
  contentSelector?: string
}

export function TableOfContents({ contentSelector = '.prose' }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [isExpanded, setIsExpanded] = useState(true)

  useEffect(() => {
    // Find all headings in content
    const content = document.querySelector(contentSelector)
    if (!content) return

    const elements = content.querySelectorAll('h1, h2, h3')
    const items: Heading[] = []

    elements.forEach((el, index) => {
      // Generate ID if not present
      if (!el.id) {
        el.id = `heading-${index}`
      }
      
      items.push({
        id: el.id,
        text: el.textContent || '',
        level: parseInt(el.tagName[1]),
      })
    })

    setHeadings(items)

    // Set up intersection observer for active heading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '-80px 0px -80% 0px' }
    )

    elements.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [contentSelector])

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100
      const top = element.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  if (headings.length < 3) return null

  return (
    <nav className="sticky top-24">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3 transition-colors"
      >
        <List size={16} />
        On this page
        <ChevronRight 
          size={14} 
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
        />
      </button>

      {isExpanded && (
        <ul className="space-y-1 border-l border-[var(--border-light)] pl-3">
          {headings.map((heading) => (
            <li key={heading.id}>
              <button
                onClick={() => scrollToHeading(heading.id)}
                className={`
                  block text-left text-sm py-1 transition-colors w-full truncate
                  ${heading.level === 1 ? '' : heading.level === 2 ? 'pl-2' : 'pl-4'}
                  ${activeId === heading.id
                    ? 'text-[var(--accent)] font-medium'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }
                `}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

/**
 * Generate table of contents data from HTML content (server-side)
 */
export function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = []
  const regex = /<h([1-3])[^>]*(?:id="([^"]*)")?[^>]*>(.*?)<\/h\1>/gi
  let match
  let index = 0

  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1])
    const id = match[2] || `heading-${index}`
    const text = match[3].replace(/<[^>]*>/g, '') // Strip inner HTML

    headings.push({ id, text, level })
    index++
  }

  return headings
}

/**
 * Add IDs to headings in HTML content
 */
export function addHeadingIds(html: string): string {
  let index = 0
  return html.replace(
    /<h([1-3])([^>]*)>(.*?)<\/h\1>/gi,
    (match, level, attrs, content) => {
      // Check if already has an id
      if (attrs.includes('id="')) {
        return match
      }
      
      // Generate slug from content
      const text = content.replace(/<[^>]*>/g, '')
      const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) || `heading-${index}`
      
      index++
      return `<h${level}${attrs} id="${slug}">${content}</h${level}>`
    }
  )
}
