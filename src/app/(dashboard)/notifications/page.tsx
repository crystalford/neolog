'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  Bell, UserPlus, MessageSquare, ChevronUp, GitFork,
  Rocket, DollarSign, Check, Loader2
} from 'lucide-react'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  url: string | null
  read: boolean
  created_at: string
  actor?: {
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

const typeIcons: Record<string, any> = {
  new_subscriber: UserPlus,
  new_comment: MessageSquare,
  comment_reply: MessageSquare,
  comment_upvote: ChevronUp,
  post_upvote: ChevronUp,
  post_forked: GitFork,
  referral_conversion: DollarSign,
  boost_exhausted: Rocket,
}

const typeColors: Record<string, string> = {
  new_subscriber: 'text-[var(--accent)] bg-[var(--accent-soft)]',
  new_comment: 'text-[var(--accent)] bg-[var(--accent-soft)]',
  comment_reply: 'text-[var(--accent)] bg-[var(--accent-soft)]',
  comment_upvote: 'text-[var(--success)] bg-[var(--success)]/10',
  post_upvote: 'text-[var(--success)] bg-[var(--success)]/10',
  post_forked: 'text-purple-500 bg-purple-500/10',
  referral_conversion: 'text-[var(--success)] bg-[var(--success)]/10',
  boost_exhausted: 'text-[var(--warning)] bg-[var(--warning)]/10',
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    const { data } = await supabase
      .from('notifications')
      .select(`
        *,
        actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)
      `)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (data) {
      setNotifications(data as Notification[])
    }
    
    // Mark all as read
    await supabase.rpc('mark_notifications_read', { p_user_id: session.user.id })
    
    setLoading(false)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} minutes ago`
    if (hours < 24) return `${hours} hours ago`
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days} days ago`
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  }

  // Group notifications by date
  const groupedNotifications = notifications.reduce((groups, notification) => {
    const date = new Date(notification.created_at)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    let key: string
    if (date.toDateString() === today.toDateString()) {
      key = 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = 'Yesterday'
    } else {
      key = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    }
    
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(notification)
    return groups
  }, {} as Record<string, Notification[]>)

  return (
    <main className="px-6 lg:px-12 py-10 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Bell size={24} className="text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="font-display text-3xl">Notifications</h1>
              <p className="text-[var(--text-secondary)]">
                {notifications.length > 0 
                  ? `${notifications.length} notification${notifications.length !== 1 ? 's' : ''}`
                  : 'No notifications yet'
                }
              </p>
            </div>
          </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <Bell size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h2 className="font-display text-xl mb-2">All caught up!</h2>
          <p className="text-[var(--text-secondary)]">
            You'll see notifications here when people interact with your content.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedNotifications).map(([date, items]) => (
            <div key={date}>
              <h2 className="text-sm font-medium text-[var(--text-tertiary)] mb-3">
                {date}
              </h2>
              
              <div className="space-y-2">
                {items.map(notification => {
                      const Icon = typeIcons[notification.type] || Bell
                      const colorClasses = typeColors[notification.type] || 'text-[var(--text-tertiary)] bg-[var(--bg-tertiary)]'
                      
                      const content = (
                        <div 
                          className={`flex gap-4 p-4 rounded-xl border transition-colors ${
                            !notification.read 
                              ? 'bg-[var(--accent-soft)]/20 border-[var(--accent)]/20' 
                              : 'bg-[var(--bg-secondary)] border-[var(--border-light)] hover:border-[var(--border-medium)]'
                          }`}
                        >
                          {notification.actor?.avatar_url ? (
                            <img 
                              src={notification.actor.avatar_url}
                              alt=""
                              className="w-10 h-10 rounded-full"
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colorClasses}`}>
                              <Icon size={18} />
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <p className={!notification.read ? 'font-medium' : ''}>
                              {notification.title}
                            </p>
                            {notification.body && (
                              <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">
                                {notification.body}
                              </p>
                            )}
                            <p className="text-xs text-[var(--text-tertiary)] mt-2">
                              {formatDate(notification.created_at)}
                            </p>
                          </div>
                        </div>
                      )
                      
                  return notification.url ? (
                    <Link key={notification.id} href={notification.url}>
                      {content}
                    </Link>
                  ) : (
                    <div key={notification.id}>{content}</div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}


