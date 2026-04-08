'use client'export const runtime = 'edge'


import { useEffect, useState } from 'react'

export default function DebugPostsPage() {
  const [posts, setPosts] = useState<any[]>([])
  const [counts, setCounts] = useState<any>({})
  const [publications, setPublications] = useState<any[]>([])
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPosts()
  }, [])

  const loadPosts = async () => {
    const response = await fetch('/api/debug/posts')
    const data = await response.json()
    setPosts(data.posts || [])
    setCounts(data.counts || {})
    setPublications(data.publications || [])
    setUserId(data.userId || '')
    setLoading(false)
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Post Status Debug</h1>

      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h2 className="font-semibold mb-2">Summary</h2>
        <div className="text-xs text-gray-500 mb-2">User ID: {userId}</div>
        <div className="text-xs text-gray-500 mb-3">Publications: {publications.map(p => p.name).join(', ') || 'None'}</div>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <div className="text-2xl font-bold">{counts.total || 0}</div>
            <div className="text-sm text-gray-600">Total Posts</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{counts.published || 0}</div>
            <div className="text-sm text-gray-600">Published</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-600">{counts.draft || 0}</div>
            <div className="text-sm text-gray-600">Drafts</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600">{counts.scheduled || 0}</div>
            <div className="text-sm text-gray-600">Scheduled</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-blue-200">
          <div>
            <div className="text-xl font-bold text-blue-600">{counts.with_publication_id || 0}</div>
            <div className="text-sm text-gray-600">With publication_id</div>
          </div>
          <div>
            <div className="text-xl font-bold text-red-600">{counts.without_publication_id || 0}</div>
            <div className="text-sm text-gray-600">WITHOUT publication_id</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {posts.map((post) => (
          <div
            key={post.id}
            className={`p-4 rounded-lg border-2 ${
              post.status === 'published' ? 'bg-green-50 border-green-300' :
              post.status === 'scheduled' ? 'bg-purple-50 border-purple-300' :
              'bg-gray-50 border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold">{post.title || 'Untitled'}</h3>
                <div className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Status:</span> <span className={`font-bold ${
                    post.status === 'published' ? 'text-green-600' :
                    post.status === 'scheduled' ? 'text-purple-600' :
                    'text-gray-600'
                  }`}>{post.status}</span>
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Published At:</span> {post.published_at || 'null'}
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Created At:</span> {post.created_at}
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">ID:</span> {post.id}
                </div>
                <div className={`text-sm ${post.publication_id ? 'text-green-600' : 'text-red-600'} font-semibold`}>
                  <span className="font-medium">Publication ID:</span> {post.publication_id || 'NULL - THIS IS THE PROBLEM'}
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Content Type:</span> {post.content_type || 'null'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {posts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No posts found
        </div>
      )}
    </div>
  )
}
