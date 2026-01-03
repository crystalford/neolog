import { Twitter, Github, Linkedin, Globe } from 'lucide-react'

interface SocialLinksProps {
  profile: any // Using 'any' here ensures it works regardless of your database schema
  className?: string
}

export function SocialLinks({ profile, className = '' }: SocialLinksProps) {
  const links = [
    { url: profile.twitter_url || profile.twitter, icon: Twitter, label: 'Twitter' },
    { url: profile.github_url || profile.github, icon: Github, label: 'GitHub' },
    { url: profile.linkedin_url || profile.linkedin, icon: Linkedin, label: 'LinkedIn' },
    { url: profile.website_url || profile.website, icon: Globe, label: 'Website' },
  ].filter(l => l.url)

  if (links.length === 0) return null

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {links.map(({ url, icon: Icon, label }) => (
        <a
          key={label}
          href={url}
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
