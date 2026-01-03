import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const source = formData.get('source') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const results = { success: 0, failed: 0, errors: [] as string[] }

    if (source === 'substack') {
      const zip = await JSZip.loadAsync(arrayBuffer)
      const htmlFiles = Object.keys(zip.files).filter(f => f.endsWith('.html'))

      for (const fileName of htmlFiles) {
        try {
          const content = await zip.files[fileName].async('string')
          const parsed = parseSubstackHtml(content)
          
          if (parsed.title) {
            await supabase.from('posts').insert({
              author_id: session.user.id,
              title: parsed.title,
              slug: generateSlug(parsed.title),
              content: parsed.content,
              content_html: parsed.content,
              content_type: 'html',
              excerpt: parsed.excerpt,
              status: 'draft',
              created_at: parsed.date || new Date().toISOString(),
            })
            results.success++
          }
        } catch (err) {
          results.failed++
          results.errors.push(`Failed to import ${fileName}`)
        }
      }
    } else if (source === 'medium') {
      const zip = await JSZip.loadAsync(arrayBuffer)
      const postFiles = Object.keys(zip.files).filter(f => 
        f.includes('posts/') && f.endsWith('.html')
      )

      for (const fileName of postFiles) {
        try {
          const content = await zip.files[fileName].async('string')
          const parsed = parseMediumHtml(content)
          
          if (parsed.title) {
            await supabase.from('posts').insert({
              author_id: session.user.id,
              title: parsed.title,
              slug: generateSlug(parsed.title),
              content: parsed.content,
              content_html: parsed.content,
              content_type: 'html',
              excerpt: parsed.excerpt,
              status: 'draft',
            })
            results.success++
          }
        } catch (err) {
          results.failed++
          results.errors.push(`Failed to import ${fileName}`)
        }
      }
    } else if (source === 'wordpress') {
      const decoder = new TextDecoder()
      const xml = decoder.decode(arrayBuffer)
      const posts = parseWordPressXml(xml)

      for (const post of posts) {
        try {
          await supabase.from('posts').insert({
            author_id: session.user.id,
            title: post.title,
            slug: post.slug || generateSlug(post.title),
            content: post.content,
            content_html: post.content,
            content_type: 'html',
            excerpt: post.excerpt,
            status: 'draft',
            created_at: post.date,
          })
          results.success++
        } catch (err) {
          results.failed++
          results.errors.push(`Failed to import: ${post.title}`)
        }
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}

function parseSubstackHtml(html: string) {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || 
                     html.match(/<title>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? stripHtml(titleMatch[1]) : ''

  const dateMatch = html.match(/<time[^>]*datetime="([^"]+)"/i)
  const date = dateMatch ? dateMatch[1] : null

  const bodyMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                    html.match(/<div class="body[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  const content = bodyMatch ? bodyMatch[1].trim() : html

  const excerpt = stripHtml(content).substring(0, 160) + '...'

  return { title, content, excerpt, date }
}

function parseMediumHtml(html: string) {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const title = titleMatch ? stripHtml(titleMatch[1]) : ''

  const contentMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                       html.match(/<section[^>]*>([\s\S]*?)<\/section>/i)
  let content = contentMatch ? contentMatch[1] : html

  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
  content = content.replace(/class="[^"]*"/gi, '')

  const excerpt = stripHtml(content).substring(0, 160) + '...'

  return { title, content, excerpt }
}

function parseWordPressXml(xml: string) {
  const posts: Array<{title: string; slug: string; content: string; excerpt: string; date: string}> = []
  
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1]
    
    const postType = item.match(/<wp:post_type><!\[CDATA\[(.*?)\]\]><\/wp:post_type>/i)
    if (postType && postType[1] !== 'post') continue

    const title = item.match(/<title>(.*?)<\/title>/i)?.[1] || ''
    const slug = item.match(/<wp:post_name><!\[CDATA\[(.*?)\]\]><\/wp:post_name>/i)?.[1] || ''
    const content = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/i)?.[1] || ''
    const excerpt = item.match(/<excerpt:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/excerpt:encoded>/i)?.[1] || ''
    const date = item.match(/<wp:post_date><!\[CDATA\[(.*?)\]\]><\/wp:post_date>/i)?.[1] || ''

    if (title && content) {
      posts.push({
        title: stripHtml(title),
        slug,
        content,
        excerpt: excerpt || stripHtml(content).substring(0, 160) + '...',
        date,
      })
    }
  }

  return posts
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60)
}
