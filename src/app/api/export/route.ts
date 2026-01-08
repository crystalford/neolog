import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

// Export all of a user's content as a portable package
// Supports: json (full data), markdown, html
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const format = request.nextUrl.searchParams.get('format') || 'json'

  // Get current user
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    try {
      const run = await startJobRun('export.user', { user_id: session.user.id, format })
      runId = run.id
    } catch {
      // best-effort
    }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  if (!profile) {
    finalErrorMessage = 'Profile not found'
    return new Response('Profile not found', { status: 404 })
  }

  // Get all posts (including drafts)
  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', session.user.id)
    .order('created_at', { ascending: false })

  // Get all drafts
  const { data: drafts } = await supabase
    .from('drafts')
    .select('*')
    .eq('author_id', session.user.id)

  // Get upvotes given
  const { data: upvotes } = await supabase
    .from('post_upvotes')
    .select('post_id, created_at')
    .eq('user_id', session.user.id)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://neolog.ai'
  const exportDate = new Date().toISOString()

  finalMeta = {
    user_id: session.user.id,
    format,
    posts_count: posts?.length || 0,
    drafts_count: drafts?.length || 0,
    upvotes_count: upvotes?.length || 0,
  }

  if (format === 'markdown') {
    finalStatus = 'success'
    return generateMarkdownExport(profile, posts || [], exportDate)
  } else if (format === 'html') {
    finalStatus = 'success'
    return generateHTMLExport(profile, posts || [], baseUrl, exportDate)
  } else {
    finalStatus = 'success'
    return generateJSONExport(profile, posts || [], drafts || [], upvotes || [], baseUrl, exportDate)
  }
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Export failed'
    return new Response('Export failed', { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}

function generateJSONExport(
  profile: any,
  posts: any[],
  drafts: any[],
  upvotes: any[],
  baseUrl: string,
  exportDate: string
) {
  const exportData = {
    _meta: {
      version: '1.0',
      exported_at: exportDate,
      platform: 'neolog',
      format: 'neolog-export-v1',
    },
    profile: {
      username: profile.username,
      display_name: profile.display_name,
      bio: profile.bio,
      avatar_url: profile.avatar_url,
      website_url: profile.website_url,
      created_at: profile.created_at,
    },
    posts: posts.map(post => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      subtitle: post.subtitle,
      content: post.content,
      content_html: post.content_html,
      content_type: post.content_type,
      excerpt: post.excerpt,
      cover_image_url: post.cover_image_url,
      status: post.status,
      created_at: post.created_at,
      updated_at: post.updated_at,
      published_at: post.published_at,
      url: post.status === 'published' 
        ? `${baseUrl}/${profile.username}/${post.slug}` 
        : null,
      // Fork metadata
      forked_from_id: post.forked_from_id,
      fork_count: post.fork_count,
      allow_forks: post.allow_forks,
    })),
    drafts: drafts.map(draft => ({
      id: draft.id,
      post_id: draft.post_id,
      title: draft.title,
      content: draft.content,
      content_type: draft.content_type,
      saved_at: draft.saved_at,
    })),
    activity: {
      upvoted_posts: upvotes.map(u => ({
        post_id: u.post_id,
        upvoted_at: u.created_at,
      })),
    },
    // Migration manifest for importing elsewhere
    _migration: {
      posts_count: posts.length,
      published_count: posts.filter(p => p.status === 'published').length,
      drafts_count: drafts.length,
      import_instructions: 'This export can be imported into any platform that supports the neolog-export-v1 format. Posts with content_type="html" contain raw HTML. Posts with content_type="markdown" contain markdown source.',
    },
  }

  const filename = `neolog-export-${profile.username}-${exportDate.split('T')[0]}.json`

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function generateMarkdownExport(
  profile: any,
  posts: any[],
  exportDate: string
) {
  const publishedPosts = posts.filter(p => p.status === 'published')
  
  let markdown = `# ${profile.display_name || profile.username}\n\n`
  markdown += `Exported from Neolog on ${exportDate}\n\n`
  markdown += `---\n\n`

  for (const post of publishedPosts) {
    markdown += `# ${post.title}\n\n`
    if (post.subtitle) {
      markdown += `*${post.subtitle}*\n\n`
    }
    markdown += `Published: ${new Date(post.published_at).toLocaleDateString()}\n\n`
    markdown += `---\n\n`
    
    // For HTML posts, include raw HTML with a note
    if (post.content_type === 'html') {
      markdown += `> Note: This post was authored in HTML.\n\n`
      markdown += '```html\n'
      markdown += post.content || ''
      markdown += '\n```\n\n'
    } else {
      markdown += post.content || ''
      markdown += '\n\n'
    }
    
    markdown += `---\n\n`
  }

  const filename = `neolog-export-${profile.username}-${exportDate.split('T')[0]}.md`

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function generateHTMLExport(
  profile: any,
  posts: any[],
  baseUrl: string,
  exportDate: string
) {
  const publishedPosts = posts.filter(p => p.status === 'published')
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${profile.display_name || profile.username} - Neolog Export</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.75rem; margin-top: 3rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
    article { margin-bottom: 4rem; }
    .subtitle { font-style: italic; color: #555; margin-bottom: 1rem; }
    hr { border: none; border-top: 1px solid #eee; margin: 2rem 0; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; border-radius: 4px; }
    code { font-family: 'SF Mono', Monaco, monospace; }
    img { max-width: 100%; height: auto; }
    a { color: #c45d3a; }
  </style>
</head>
<body>
  <header>
    <h1>${profile.display_name || profile.username}</h1>
    <p class="meta">Exported from <a href="${baseUrl}">Neolog</a> on ${new Date(exportDate).toLocaleDateString()}</p>
    ${profile.bio ? `<p>${profile.bio}</p>` : ''}
  </header>
  
  <hr>
  
  <main>
`

  for (const post of publishedPosts) {
    const contentBlock = post.content_html || post.content || ''

    html += `
    <article>
      <h2>${escapeHtml(post.title)}</h2>
      ${post.subtitle ? `<p class="subtitle">${escapeHtml(post.subtitle)}</p>` : ''}
      <p class="meta">Published: ${new Date(post.published_at).toLocaleDateString()}</p>
      <div class="content">
        ${contentBlock}
      </div>
    </article>
    <hr>
`
  }

  html += `
  </main>
  
  <footer>
    <p class="meta">
      This archive contains ${publishedPosts.length} posts.
      <br>Original profile: <a href="${baseUrl}/${profile.username}">${baseUrl}/${profile.username}</a>
    </p>
  </footer>
</body>
</html>`

  const filename = `neolog-export-${profile.username}-${exportDate.split('T')[0]}.html`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function escapeHtml(str: string) {
  return str
    ?.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;') || ''
}
