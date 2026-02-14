import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { processUpload } from '@/inngest/functions/process-upload'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processUpload],
})
