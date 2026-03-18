import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: uploads, error } = await supabase
    .from('video_uploads')
    .select('id, file_name, recorded_at, created_at, generated_posts')
    .eq('user_id', session.user.id)
    .not('generated_posts', 'is', null)
    .order('recorded_at', { ascending: false, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type FlatPost = {
    content: string
    type: string
    source_upload_id: string
    source_file_name: string
    source_date: string
  }

  const posts: FlatPost[] = []
  for (const upload of uploads ?? []) {
    if (!Array.isArray(upload.generated_posts)) continue
    for (const post of upload.generated_posts as Array<{ content: string; type: string }>) {
      if (!post?.content) continue
      posts.push({
        content: post.content,
        type: post.type ?? 'post',
        source_upload_id: upload.id,
        source_file_name: upload.file_name,
        source_date: upload.recorded_at ?? upload.created_at,
      })
    }
  }

  // Rank: opinions first (takes/essays), quotes second — within each, preserve upload order (newest first)
  const typeRank: Record<string, number> = { opinion: 0, quote: 1 }
  posts.sort((a, b) => (typeRank[a.type] ?? 2) - (typeRank[b.type] ?? 2))

  return NextResponse.json({ posts })
}
