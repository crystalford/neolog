import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { processUpload } from '@/inngest/functions/process-upload'
import { synthesizeSession } from '@/inngest/functions/synthesize-session'
import { assembleClip } from '@/inngest/functions/assemble-clip'
import { processChatSession } from '@/inngest/functions/process-chat'
import { processCapture } from '@/inngest/functions/process-capture'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processUpload, synthesizeSession, assembleClip, processChatSession, processCapture],
})
