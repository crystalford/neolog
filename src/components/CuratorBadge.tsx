import { Award, Star, TrendingUp, Eye } from 'lucide-react'

interface CuratorBadgeProps {
  score: number
  earlyUpvotes?: number
  size?: 'sm' | 'md' | 'lg'
  showDetails?: boolean
}

// Curator tiers based on score
function getCuratorTier(score: number): {
  name: string
  color: string
  bgColor: string
  icon: typeof Star
} {
  if (score >= 90) {
    return {
      name: 'Legendary Curator',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      icon: Award,
    }
  }
  if (score >= 75) {
    return {
      name: 'Expert Curator',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      icon: Star,
    }
  }
  if (score >= 60) {
    return {
      name: 'Rising Curator',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      icon: TrendingUp,
    }
  }
  if (score >= 40) {
    return {
      name: 'Active Curator',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      icon: Eye,
    }
  }
  return {
    name: 'New Curator',
    color: 'text-[var(--text-tertiary)]',
    bgColor: 'bg-[var(--bg-tertiary)]',
    icon: Eye,
  }
}

export function CuratorBadge({ 
  score, 
  earlyUpvotes = 0,
  size = 'md',
  showDetails = false 
}: CuratorBadgeProps) {
  const tier = getCuratorTier(score)
  const Icon = tier.icon

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2',
  }

  const iconSizes = {
    sm: 10,
    md: 12,
    lg: 14,
  }

  if (!showDetails) {
    return (
      <span 
        className={`
          inline-flex items-center rounded-full font-medium
          ${tier.bgColor} ${tier.color} ${sizeClasses[size]}
        `}
        title={`${tier.name} (Score: ${score})`}
      >
        <Icon size={iconSizes[size]} />
        {score}
      </span>
    )
  }

  return (
    <div className={`rounded-lg ${tier.bgColor} p-3`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={tier.color} />
        <span className={`font-medium ${tier.color}`}>{tier.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[var(--text-tertiary)] text-xs">Score</p>
          <p className="font-mono font-medium">{score}/100</p>
        </div>
        <div>
          <p className="text-[var(--text-tertiary)] text-xs">Early Finds</p>
          <p className="font-mono font-medium">{earlyUpvotes}</p>
        </div>
      </div>
    </div>
  )
}
