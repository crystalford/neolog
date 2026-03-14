import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { runAnalysis, upsertEntities, extractTags, generatePostSuggestions } from '@/lib/video-analysis'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'

/**
 * POST /api/video-upload/[id]/reanalyze
 *
 * Re-runs AI analysis + entity upsert on an already-transcribed upload.
 * Does NOT re-upload, re-transcode, or re-transcribe — only re-runs
 * the analysis and entity extraction steps against the stored transcript.
 *
 * Safe to call on any processed upload. New entity types introduced after
 * the original processing run will be created retroactively.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const userId = session.user.id

    // Fetch the upload — must belong to this user and have a transcript
    const { data: upload, error: fetchError } = await supabase
      .from('video_uploads')
      .select('id, transcript, status, file_name, recorded_at')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single()

    if (fetchError || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    if (!upload.transcript) {
      return NextResponse.json(
        { error: 'No transcript available — upload must be processed first' },
        { status: 422 },
      )
    }

    // Resolve AI keys
    const [anthropicResult, openaiResult, profileResult] = await Promise.all([
      resolveProviderKeyWithClient(supabase, userId, 'anthropic'),
      resolveProviderKeyWithClient(supabase, userId, 'openai'),
      supabase.from('profiles').select('display_name, username').eq('id', userId).single(),
    ])

    if (!anthropicResult && !openaiResult) {
      return NextResponse.json(
        { error: 'No AI API keys configured — add an Anthropic or OpenAI key in Settings' },
        { status: 422 },
      )
    }

    const userName = profileResult.data?.display_name || profileResult.data?.username || 'the user'

    // Re-run analysis
    const result = await runAnalysis(
      upload.transcript,
      openaiResult?.key || null,
      anthropicResult?.key || null,
      userName,
    )

    const tags = extractTags(result.analysis)
    const posts = generatePostSuggestions(result.analysis, upload.recorded_at)

    // Update the stored analysis (tags + posts too)
    await supabase
      .from('video_uploads')
      .update({
        analysis: result.analysis,
        analysis_model: result.modelUsed,
        tags,
        generated_posts: posts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', upload.id)

    // Count entities before upsert so we can return a delta
    const { count: beforeCount } = await admin
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    // Upsert entities (includes new types: decision, value, reference, story, opinion, lesson, tool, principle)
    await upsertEntities(admin, userId, { videoUploadId: upload.id }, result.analysis)

    const { count: afterCount } = await admin
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    const newEntities = (afterCount || 0) - (beforeCount || 0)

    return NextResponse.json({
      ok: true,
      model: result.modelUsed,
      new_entities: newEntities,
      message: newEntities > 0
        ? `Analysis updated · ${newEntities} new entities added`
        : 'Analysis updated · no new entities (all already tracked)',
    })
  } catch (err: any) {
    console.error('Reanalyze error:', err)
    return NextResponse.json({ error: err.message || 'Reanalysis failed' }, { status: 500 })
  }
}
