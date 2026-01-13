'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  Bell, UserPlus, MessageSquare, ChevronUp, GitFork,
  Rocket, DollarSign, Check, X, Loader2
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
  new_subscriber: 'text-[var(--accent)]',
  new_comment: 'text-[var(--accent)]',
  comment_reply: 'text-[var(--accent)]',
  comment_upvote: 'text-[var(--success)]',
  post_upvote: 'text-[var(--success)]',
  post_forked: 'text-purple-500',
  referral_conversion: 'text-[var(--success)]',
  boost_exhausted: 'text-[var(--warning)]',
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showDropdown, setShowDropdown] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    loadUnreadCount()
  }, [])

  const loadUnreadCount = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data } = await supabase
      .rpc('get_unread_notification_count', { p_user_id: session.user.id })
    
    if (data !== null) {
      setUnreadCount(data)
    }
  }

  const loadNotifications = async () => {
    setLoading(true)
    
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data } = await supabase
      .from('notifications')
      .select(`
        *,
        actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)
      `)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    
    if (data) {
      setNotifications(data as Notification[])
    }
    
    setLoading(false)
  }

  const markAllRead = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await supabase.rpc('mark_notifications_read', { p_user_id: session.user.id })
    setUnreadCount(0)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleToggle = () => {
    if (!showDropdown) {
      loadNotifications()
    }
    setShowDropdown(!showDropdown)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="relative w-9 h-9 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center hover:border-[var(--border-medium)] transition-colors"
        aria-label={showDropdown ? 'Close notifications' : 'Open notifications'}
      >
        <Bell size={18} className="text-[var(--text-secondary)]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--accent)] text-white text-xs font-medium flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setShowDropdown(false)} 
          />
          
          <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-xl shadow-xl z-20 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-light)]">
              <h3 className="font-medium">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Notifications list */}
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-[var(--text-tertiary)]">
                  <Bell size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-light)]">
                  {notifications.map(notification => {
                    const Icon = typeIcons[notification.type] || Bell
                    const color = typeColors[notification.type] || 'text-[var(--text-tertiary)]'
                    
                    const content = (
                      <div 
                        className={`flex gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors ${
                          !notification.read ? 'bg-[var(--accent-soft)]/30' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          !notification.read ? 'bg-[var(--accent-soft)]' : 'bg-[var(--bg-tertiary)]'
                        }`}>
                          <Icon size={16} className={color} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${!notification.read ? 'font-medium' : ''}`}>
                            {notification.title}
                          </p>
                          {notification.body && (
                            <p className="text-xs text-[var(--text-tertiary)] line-clamp-2 mt-0.5">
                              {notification.body}
                            </p>
                          )}
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {formatTime(notification.created_at)}
                          </p>
                        </div>
                        
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0 mt-2" />
                        )}
                      </div>
                    )
                    
                    return notification.url ? (
                      <Link 
                        key={notification.id} 
                        href={notification.url}
                        onClick={() => setShowDropdown(false)}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={notification.id}>{content}</div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <Link
              href="/notifications"
              onClick={() => setShowDropdown(false)}
              className="block px-4 py-3 text-center text-sm text-[var(--accent)] hover:bg-[var(--bg-secondary)] border-t border-[var(--border-light)]"
            >
              View all notifications
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
