import { createAdminClient } from '@/lib/supabase/admin'

export type JobRunStatus = 'running' | 'success' | 'error'

async function getOrCreateJobId(jobName: string): Promise<string> {
  const admin = createAdminClient()
  if (!admin) throw new Error('Missing Supabase admin configuration')

  const { data: existing, error: existingError } = await admin
    .from('jobs')
    .select('id')
    .eq('name', jobName)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  if (existing?.id) return existing.id as string

  const { data: created, error: createError } = await admin
    .from('jobs')
    .insert({ name: jobName })
    .select('id')
    .single()

  if (createError || !created?.id) {
    const { data: retry } = await admin
      .from('jobs')
      .select('id')
      .eq('name', jobName)
      .maybeSingle()

    if (retry?.id) return retry.id as string

    throw new Error(createError?.message || 'Failed to create job')
  }

  return created.id as string
}

export async function startJobRun(jobName: string, meta: Record<string, any> = {}) {
  const admin = createAdminClient()
  if (!admin) throw new Error('Missing Supabase admin configuration')

  const jobId = await getOrCreateJobId(jobName)

  const { data, error } = await admin
    .from('job_runs')
    .insert({
      job_id: jobId,
      status: 'running',
      meta,
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message || 'Failed to start job run')
  }

  return { id: data.id as string, jobId }
}

export async function finishJobRun(
  runId: string,
  status: Exclude<JobRunStatus, 'running'>,
  meta: Record<string, any> = {},
  errorMessage?: string,
) {
  const admin = createAdminClient()
  if (!admin) throw new Error('Missing Supabase admin configuration')

  const patch: any = {
    status,
    finished_at: new Date().toISOString(),
    meta,
  }

  if (errorMessage) patch.error_message = errorMessage

  const { error } = await admin
    .from('job_runs')
    .update(patch)
    .eq('id', runId)

  if (error) {
    throw new Error(error.message)
  }
}
