'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Bell, Heart, MessageCircle, UserPlus, TrendingUp,
  X, Check, CheckCheck, Loader2, Settings
} from 'lucide-react'

interface Notification {
  id: string
  type: string
  created_at: string
  read: boolean
  data: any
  actor_username?: string
  actor_display_name?: string
  actor_avatar_url?: string
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    loadNotifications()

    // Subscribe to new notifications
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      }, () => {
        loadNotifications()
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [])

  const loadNotifications = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      if (data) {
        setNotifications(data)
        setUnreadCount(data.filter(n => !n.read).length)
      }
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', session.user.id)
        .eq('read', false)

      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const clearAll = async () => {
    if (!confirm('Clear all notifications?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', session.user.id)

      setNotifications([])
      setUnreadCount(0)
    } catch (error) {
      console.error('Error clearing notifications:', error)
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)

    // Navigate based on notification type
    switch (notification.type) {
      case 'new_comment':
        router.push(`/${notification.data.post_author}/${notification.data.post_slug}#comments`)
        break
      case 'comment_reply':
        router.push(`/${notification.data.post_author}/${notification.data.post_slug}#comment-${notification.data.comment_id}`)
        break
      case 'post_upvote':
      case 'post_reaction':
        router.push(`/${notification.data.post_author}/${notification.data.post_slug}`)
        break
      case 'new_follower':
        router.push(`/${notification.data.follower_username}`)
        break
      case 'post_milestone':
        router.push(`/${notification.data.post_author}/${notification.data.post_slug}`)
        break
    }

    setIsOpen(false)
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_comment':
      case 'comment_reply':
        return <MessageCircle size={18} className="text-blue-500" />
      case 'post_upvote':
      case 'post_reaction':
        return <Heart size={18} className="text-red-500" />
      case 'new_follower':
        return <UserPlus size={18} className="text-green-500" />
      case 'post_milestone':
        return <TrendingUp size={18} className="text-purple-500" />
      default:
        return <Bell size={18} className="text-[var(--text-tertiary)]" />
    }
  }

  const getNotificationText = (notification: Notification) => {
    const actor = notification.actor_display_name || notification.actor_username || 'Someone'

    switch (notification.type) {
      case 'new_comment':
        return `${actor} commented on your post "${notification.data.post_title}"`
      case 'comment_reply':
        return `${actor} replied to your comment on "${notification.data.post_title}"`
      case 'post_upvote':
        return `${actor} upvoted your post "${notification.data.post_title}"`
      case 'post_reaction':
        return `${actor} reacted to your post "${notification.data.post_title}"`
      case 'new_follower':
        return `${actor} started following you`
      case 'post_milestone':
        return `Your post "${notification.data.post_title}" reached ${notification.data.milestone} views!`
      default:
        return notification.data.message || 'New notification'
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications

  return (
    <div className="relative">
      {/* Bell icon button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
        aria-label={isOpen ? 'Close notifications' : 'Open notifications'}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--accent)] rounded-full" />
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-96 max-h-[600px] bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-[var(--border-light)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                      title="Mark all as read"
                      aria-label="Mark all notifications as read"
                    >
                      <CheckCheck size={16} />
                    </button>
                  )}
                  <button
                    onClick={clearAll}
                    className="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                    title="Clear all"
                    aria-label="Clear all notifications"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg">
                <button
                  onClick={() => setFilter('all')}
                  className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                    filter === 'all'
                      ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                      : 'text-[var(--text-secondary)]'
                  }`}
                  aria-pressed={filter === 'all'}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('unread')}
                  className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                    filter === 'unread'
                      ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                      : 'text-[var(--text-secondary)]'
                  }`}
                  aria-pressed={filter === 'unread'}
                >
                  Unread {unreadCount > 0 && `(${unreadCount})`}
                </button>
              </div>
            </div>

            {/* Notifications list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-tertiary)]">
                  <Bell size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                  </p>
                </div>
              ) : (
                <div>
                  {filteredNotifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left p-4 border-b border-[var(--border-light)] hover:bg-[var(--bg-secondary)] transition-colors ${
                        !notification.read ? 'bg-[var(--accent-softer)]' : ''
                      }`}
                      aria-label={getNotificationText(notification)}
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm mb-1 ${!notification.read ? 'font-medium' : ''}`}>
                            {getNotificationText(notification)}
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)]">
                            {formatTime(notification.created_at)}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0 mt-2" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-[var(--border-light)] text-center">
                <button
                  onClick={() => {
                    router.push('/notifications')
                    setIsOpen(false)
                  }}
                  className="text-sm text-[var(--accent)] hover:underline"
                  aria-label="View all notifications"
                >
                  View all notifications
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
