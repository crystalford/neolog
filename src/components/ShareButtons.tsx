'use client'

import { useState } from 'react'
import { Share2, Twitter, Linkedin, Link as LinkIcon, Check, Mail } from 'lucide-react'

interface ShareButtonsProps {
  url: string
  title: string
  className?: string
}

export function ShareButtons({ url, title, className = '' }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=Check out this post: ${encodedUrl}`,
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Try native share first on mobile
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // User cancelled or error, fall through to menu
      }
    }
    setShowMenu(!showMenu)
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleShare}
        className="flex items-center gap-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        title="Share"
      >
        <Share2 size={18} />
      </button>

      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setShowMenu(false)} 
          />
          
          <div className="absolute right-0 bottom-full mb-2 w-48 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-xl shadow-lg z-20 py-1 animate-scale-in origin-bottom-right">
            <a
              href={shareLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
              onClick={() => setShowMenu(false)}
            >
              <Twitter size={16} />
              Twitter
            </a>
            <a
              href={shareLinks.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
              onClick={() => setShowMenu(false)}
            >
              <Linkedin size={16} />
              LinkedIn
            </a>
            <a
              href={shareLinks.email}
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
              onClick={() => setShowMenu(false)}
            >
              <Mail size={16} />
              Email
            </a>
            <div className="border-t border-[var(--border-light)] my-1" />
            <button
              onClick={() => {
                copyLink()
                setShowMenu(false)
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
            >
              {copied ? (
                <>
                  <Check size={16} className="text-[var(--success)]" />
                  <span className="text-[var(--success)]">Copied!</span>
                </>
              ) : (
                <>
                  <LinkIcon size={16} />
                  Copy link
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Inline share bar for end of posts
export function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const copyLink = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-center gap-3 py-6 border-t border-[var(--border-light)]">
      <span className="text-sm text-[var(--text-tertiary)]">Share this post:</span>
      
      <div className="flex items-center gap-2">
        <a
          href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-9 h-9 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center hover:border-[var(--border-medium)] transition-colors"
          title="Share on Twitter"
        >
          <Twitter size={16} className="text-[var(--text-tertiary)]" />
        </a>
        
        <a
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-9 h-9 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center hover:border-[var(--border-medium)] transition-colors"
          title="Share on LinkedIn"
        >
          <Linkedin size={16} className="text-[var(--text-tertiary)]" />
        </a>
        
        <button
          onClick={copyLink}
          className="w-9 h-9 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center hover:border-[var(--border-medium)] transition-colors"
          title="Copy link"
        >
          {copied ? (
            <Check size={16} className="text-[var(--success)]" />
          ) : (
            <LinkIcon size={16} className="text-[var(--text-tertiary)]" />
          )}
        </button>
      </div>
    </div>
  )
}
