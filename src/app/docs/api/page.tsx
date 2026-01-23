import { Share2, Lock, Zap, FileText, Image as ImageIcon } from 'lucide-react'

export const metadata = {
    title: 'Neolog API Reference',
    description: 'Complete documentation for the Neolog Publishing API.',
}

export default function ApiDocsPage() {
    return (
        <div className="space-y-12">
            {/* Header */}
            <div className="border-b border-[var(--border-light)] pb-8">
                <h1 className="font-display text-4xl font-bold text-[var(--text-primary)] mb-4">
                    API Reference
                </h1>
                <p className="text-lg text-[var(--text-secondary)] max-w-2xl">
                    The Neolog Publishing API allows you to programmatically create posts, upload images, and manage your content from external applications.
                </p>
            </div>

            {/* Authentication */}
            <section id="authentication" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                        <Lock size={20} />
                    </div>
                    <h2 className="font-display text-2xl font-bold">Authentication</h2>
                </div>
                <p className="text-[var(--text-secondary)] mb-6">
                    All API requests must be authenticated using a Bearer token. You can generate API keys in the <a href="/dashboard/api" className="text-[var(--accent)] hover:underline">Dashboard API Settings</a>.
                </p>

                <div className="bg-[#1e1e1e] rounded-xl overflow-hidden shadow-lg border border-[var(--border-light)]">
                    <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-[#3e3e42]">
                        <span className="text-xs text-gray-400 font-mono">Terminal</span>
                    </div>
                    <div className="p-4 overflow-x-auto">
                        <pre className="text-sm font-mono text-gray-300">
                            <code>{`curl -X GET https://neolog.ai/api/v1/posts \\
  -H "Authorization: Bearer neolog_sk_..."`}</code>
                        </pre>
                    </div>
                </div>
            </section>

            {/* POSTS */}
            <section id="posts" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                        <FileText size={20} />
                    </div>
                    <h2 className="font-display text-2xl font-bold">Posts</h2>
                    <span className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] px-2 py-1 rounded text-xs font-mono border border-[var(--border-light)]">
                        /api/v1/posts
                    </span>
                </div>

                {/* Create Post */}
                <div id="create-post" className="mb-12 scroll-mt-24">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="bg-green-600 text-white px-3 py-1 rounded-md text-sm font-bold">POST</span>
                        <h3 className="font-display text-xl font-semibold">Create Post</h3>
                    </div>
                    <p className="text-[var(--text-secondary)] mb-6">
                        Creates a new post in your publication. Content can be Markdown or HTML.
                    </p>

                    <div className="grid lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <h4 className="font-semibold text-[var(--text-primary)]">Parameters</h4>
                            <div className="space-y-4">
                                <Parameter name="title" type="string" required description="The title of the post." />
                                <Parameter name="content" type="string" required description="The body content in Markdown or HTML." />
                                <Parameter name="subtitle" type="string" description="A short subtitle or excerpt." />
                                <Parameter name="slug" type="string" description="Custom URL slug. Generated from title if omitted." />
                                <Parameter name="status" type="string" description="'draft' (default) or 'published'." />
                                <Parameter name="tags" type="string[]" description="Array of tag strings." />
                                <Parameter name="cover_image_url" type="string" description="URL for the cover image." />
                                <Parameter name="published_at" type="ISO 8601" description="Future date for scheduled publishing." />
                            </div>
                        </div>

                        <div className="bg-[#1e1e1e] rounded-xl overflow-hidden shadow-lg border border-[var(--border-light)] h-fit">
                            <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-[#3e3e42]">
                                <span className="text-xs text-gray-400 font-mono">request.json</span>
                                <span className="text-xs text-green-400 font-mono">POST /api/v1/posts</span>
                            </div>
                            <div className="p-4 overflow-x-auto">
                                <pre className="text-sm font-mono text-gray-300">
                                    <code>{`{
  "title": "The Future of AI",
  "content": "## Introduction\\n\\nAI is changing everything...",
  "status": "published",
  "tags": ["AI", "Tech"],
  "cover_image_url": "https://..."
}`}</code>
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>

                {/* List Posts */}
                <div id="get-posts" className="mb-12 scroll-mt-24">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="bg-blue-600 text-white px-3 py-1 rounded-md text-sm font-bold">GET</span>
                        <h3 className="font-display text-xl font-semibold">List Posts</h3>
                    </div>
                    <p className="text-[var(--text-secondary)] mb-6">
                        Retrieves a paginated list of posts for your publication.
                    </p>

                    <div className="grid lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <h4 className="font-semibold text-[var(--text-primary)]">Query Parameters</h4>
                            <div className="space-y-4">
                                <Parameter name="limit" type="number" description="Number of posts to return (default: 20, max: 100)." />
                                <Parameter name="cursor" type="string" description="Cursor for pagination." />
                                <Parameter name="status" type="string" description="Filter by 'draft' or 'published'." />
                            </div>
                        </div>

                        <div className="bg-[#1e1e1e] rounded-xl overflow-hidden shadow-lg border border-[var(--border-light)] h-fit">
                            <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-[#3e3e42]">
                                <span className="text-xs text-gray-400 font-mono">response.json</span>
                                <span className="text-xs text-blue-400 font-mono">200 OK</span>
                            </div>
                            <div className="p-4 overflow-x-auto">
                                <pre className="text-sm font-mono text-gray-300">
                                    <code>{`{
  "data": [
    {
      "id": "post_123...",
      "title": "The Future of AI",
      "slug": "the-future-of-ai",
      "status": "published",
      "published_at": "2024-03-20T10:00:00Z"
    }
  ],
  "meta": {
    "has_more": true,
    "next_cursor": "post_123..."
  }
}`}</code>
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* IMAGES */}
            <section id="upload-image" className="scroll-mt-24 pb-20">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                        <ImageIcon size={20} />
                    </div>
                    <h2 className="font-display text-2xl font-bold">Images</h2>
                    <span className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] px-2 py-1 rounded text-xs font-mono border border-[var(--border-light)]">
                        /api/v1/images
                    </span>
                </div>

                <div className="mb-12">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="bg-green-600 text-white px-3 py-1 rounded-md text-sm font-bold">POST</span>
                        <h3 className="font-display text-xl font-semibold">Upload Image</h3>
                    </div>
                    <p className="text-[var(--text-secondary)] mb-6">
                        Upload an image to storage. Supports JPG, PNG, GIF, WEBP (max 5MB).
                    </p>

                    <div className="grid lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <h4 className="font-semibold text-[var(--text-primary)]">Parameters</h4>
                            <div className="space-y-4">
                                <Parameter name="file" type="file" required description="The image file to upload (multipart/form-data)." />
                            </div>
                        </div>

                        <div className="bg-[#1e1e1e] rounded-xl overflow-hidden shadow-lg border border-[var(--border-light)] h-fit">
                            <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-[#3e3e42]">
                                <span className="text-xs text-gray-400 font-mono">response.json</span>
                                <span className="text-xs text-green-400 font-mono">200 OK</span>
                            </div>
                            <div className="p-4 overflow-x-auto">
                                <pre className="text-sm font-mono text-gray-300">
                                    <code>{`{
  "url": "https://cdn.neolog.ai/uploads/...",
  "width": 1200,
  "height": 630,
  "size": 102400
}`}</code>
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}

function Parameter({ name, type, required, description }: { name: string; type: string; required?: boolean; description: string }) {
    return (
        <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <div className="flex items-baseline gap-2 mb-1">
                <code className="text-sm font-bold text-[var(--accent)]">{name}</code>
                <span className="text-xs text-[var(--text-tertiary)] font-mono">{type}</span>
                {required && <span className="text-[10px] uppercase tracking-wider text-red-500 font-bold">Required</span>}
            </div>
            <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        </div>
    )
}
