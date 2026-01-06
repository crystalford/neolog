import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name : null
    const url = typeof body.url === 'string' ? body.url.trim() : ''

    finalMeta = { user_id: session.user.id, has_name: Boolean(name), url_len: url.length }
    try {
      const run = await startJobRun('sources.rss.add', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!url) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'RSS URL is required.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('feed_sources')
      .insert({
        user_id: session.user.id,
        source_type: 'rss',
        name,
        url,
      })
      .select('*')
      .single()

    if (error) {
      finalErrorMessage = 'Failed to add source.'
      return NextResponse.json({ error: 'Failed to add source.' }, { status: 500 })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', source_id: data?.id || null }
    return NextResponse.json({ source: data })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to add source.'
    return NextResponse.json({ error: 'Failed to add source.' }, { status: 500 })
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

export async function DELETE(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const id = typeof body.id === 'string' ? body.id : ''

    finalMeta = { user_id: session.user.id, source_id: id || null }
    try {
      const run = await startJobRun('sources.rss.delete', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!id) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'Source id is required.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('feed_sources')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (error) {
      finalErrorMessage = 'Failed to remove source.'
      return NextResponse.json({ error: 'Failed to remove source.' }, { status: 500 })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success' }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to remove source.'
    return NextResponse.json({ error: 'Failed to remove source.' }, { status: 500 })
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

export async function PATCH(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { id?: string; publicationId?: string | null; autoConvertToDrafts?: boolean }
      | null

    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) {
      return NextResponse.json({ error: 'Source id is required.' }, { status: 400 })
    }

    const autoConvertToDrafts = typeof body?.autoConvertToDrafts === 'boolean' ? body.autoConvertToDrafts : null
    const publicationId =
      body?.publicationId === null ? null : typeof body?.publicationId === 'string' ? body.publicationId : undefined

    finalMeta = {
      user_id: session.user.id,
      source_id: id,
      publication_id: typeof publicationId === 'string' ? publicationId : publicationId === null ? null : undefined,
      auto_convert_to_drafts: autoConvertToDrafts,
    }
    try {
      const run = await startJobRun('sources.rss.update', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (publicationId !== undefined && publicationId) {
      const { data: pub } = await supabase
        .from('publications')
        .select('id')
        .eq('id', publicationId)
        .eq('owner_id', session.user.id)
        .maybeSingle()

      if (!pub) {
        finalStatus = 'success'
        finalMeta = { ...finalMeta, result: 'invalid_publication' }
        return NextResponse.json({ error: 'Invalid publication.' }, { status: 400 })
      }
    }

  const update: any = {}
  if (publicationId !== undefined) update.publication_id = publicationId
  if (autoConvertToDrafts !== null) update.auto_convert_to_drafts = autoConvertToDrafts

    if (Object.keys(update).length === 0) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'no_changes' }
      return NextResponse.json({ error: 'No changes provided.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('feed_sources')
      .update(update)
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select('*')
      .single()

    if (error || !data) {
      const msg = String(error?.message || '')
      if (msg.includes('publication_id') || msg.includes('auto_convert_to_drafts')) {
        finalErrorMessage = 'Feed source settings not available. Apply the latest Supabase migrations.'
        return NextResponse.json(
          { error: 'Feed source settings not available. Apply the latest Supabase migrations.' },
          { status: 500 },
        )
      }
      finalErrorMessage = 'Failed to update source.'
      return NextResponse.json({ error: 'Failed to update source.' }, { status: 500 })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success' }
    return NextResponse.json({ source: data })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to update source.'
    return NextResponse.json({ error: 'Failed to update source.' }, { status: 500 })
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
