export const runtime = 'edge'
import { NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export async function GET() {
  const envCheck = {
    INNGEST_EVENT_KEY: !!process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: !!process.env.INNGEST_SIGNING_KEY,
  }

  let sendResult: any = null
  try {
    const result = await inngest.send({
      name: 'debug/ping',
      data: { ts: Date.now() },
    })
    sendResult = { ok: true, ids: result?.ids }
  } catch (err: any) {
    sendResult = {
      ok: false,
      error: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 3).join('\n'),
    }
  }

  return NextResponse.json({
    env: envCheck,
    send: sendResult,
    note: 'If env vars are present and send returned ok:true, the function is reaching Inngest cloud. If processing still does not run, the Inngest app at https://app.inngest.com is not synced to https://neolog.ai/api/inngest — go to your Inngest dashboard, find the app, and re-sync.',
  })
}
