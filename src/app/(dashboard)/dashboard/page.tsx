'use client'

import { InboxPanel } from '@/components/dashboard/InboxPanel'
import { PostsPanel } from '@/components/dashboard/PostsPanel'
import { PublishPanel } from '@/components/dashboard/PublishPanel'

export default function DashboardPage() {
  return (
    <main className="h-[calc(100vh-80px)] p-6 lg:p-8">
      {/* 3-Column Grid Layout */}
      <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Inbox (Chat) */}
        <div className="h-full min-h-[500px] lg:min-h-0">
          <InboxPanel />
        </div>

        {/* Middle: Posts */}
        <div className="h-full min-h-[500px] lg:min-h-0">
          <PostsPanel />
        </div>

        {/* Right: Publish */}
        <div className="h-full min-h-[500px] lg:min-h-0">
          <PublishPanel />
        </div>
      </div>
    </main>
  )
}
