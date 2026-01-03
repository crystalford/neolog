import { Twitter, Github, Linkedin, Globe } from 'lucide-react'

interface SocialLinksProps {
  twitter?: string | null
  github?: string | null
  linkedin?: string | null
  website?: string | null
  className?: string
}

export function SocialLinks({ twitter, github, linkedin, website, className = '' }: SocialLinksProps) {
  const links = [
    { url: twitter, icon: Twitter, label: 'Twitter' },
    { url: github, icon: Github, label: 'GitHub' },
    { url: linkedin, icon: Linkedin, label: 'LinkedIn' },
    { url: website, icon: Globe, label: 'Website' },
  ].filter(l => l.url)

  if (links.length === 0) return null

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {links.map(({ url, icon: Icon, label }) => (
        <a
          key={label}
          href={url!}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center hover:border-[var(--border-medium)] transition-colors"
          title={label}
        >
          <Icon size={14} className="text-[var(--text-tertiary)]" />
        </a>
      ))}
    </div>
  )
}
