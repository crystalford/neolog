import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const contentType = request.headers.get('content-type') || ''
    
    let source: string
    let target: string

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      source = formData.get('source') as string
      target = formData.get('target') as string
    } else {
      const json = await request.json()
      source = json.source
      target = json.target
    }

    if (!source || !target) {
      return NextResponse.json(
        { error: 'source and target are required' },
        { status: 400 }
      )
    }

    // Validate target is on our domain
    if (!target.startsWith(BASE_URL)) {
      return NextResponse.json(
        { error: 'target must be on this domain' },
        { status: 400 }
      )
    }

    // Extract post from target URL (format: /username/slug)
    const targetPath = target.replace(BASE_URL, '')
    const pathParts = targetPath.split('/').filter(Boolean)
    
    if (pathParts.length < 2) {
      return NextResponse.json(
        { error: 'invalid target URL' },
        { status: 400 }
      )
    }

    const [username, slug] = pathParts

    // Find the post
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'target not found' }, { status: 404 })
    }

    const { data: post } = await supabase
      .from('posts')
      .select('id')
      .eq('author_id', profile.id)
      .eq('slug', slug)
      .single()

    if (!post) {
      return NextResponse.json({ error: 'target not found' }, { status: 404 })
    }

    // Queue for verification (in production, you'd verify the source actually links to target)
    // For now, we'll store as unverified
    const { data: webmention, error } = await supabase
      .from('webmentions')
      .upsert({
        post_id: post.id,
        source_url: source,
        target_url: target,
        verified: false,
      }, {
        onConflict: 'post_id,source_url',
      })
      .select()
      .single()

    if (error) {
      console.error('Webmention save error:', error)
      return NextResponse.json({ error: 'failed to save webmention' }, { status: 500 })
    }

    // In production, you'd queue a background job to:
    // 1. Fetch the source URL
    // 2. Verify it contains a link to target
    // 3. Parse author info and content
    // 4. Update the webmention as verified

    return NextResponse.json({ 
      status: 'accepted',
      message: 'Webmention received and queued for verification',
    }, { status: 202 })
  } catch (error) {
    console.error('Webmention error:', error)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

// GET endpoint to return webmention endpoint info
export async function GET() {
  return NextResponse.json({
    name: 'Neolog Webmention Endpoint',
    documentation: 'https://www.w3.org/TR/webmention/',
    endpoint: `${BASE_URL}/api/webmention`,
  })
}
