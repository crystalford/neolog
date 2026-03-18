import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { processUpload } from '@/inngest/functions/process-upload'
import { generateThumbnail } from '@/inngest/functions/generate-thumbnail'
import { synthesizeSession } from '@/inngest/functions/synthesize-session'
import { synthesizeUserGraph } from '@/inngest/functions/synthesize-user-graph'
import { triggerVoiceClone } from '@/inngest/functions/trigger-voice-clone'
import { triggerLoraTraining } from '@/inngest/functions/trigger-lora-training'
import { assembleClip } from '@/inngest/functions/assemble-clip'
import { processChatSession } from '@/inngest/functions/process-chat'
import { processCapture } from '@/inngest/functions/process-capture'
import { processText } from '@/inngest/functions/process-text'
import { refineSignal } from '@/inngest/functions/refine-signals'
import { reanalyzeAllUploads } from '@/inngest/functions/reanalyze-all-uploads'
import { synthesizeProject } from '@/inngest/functions/synthesize-project'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processUpload,
    generateThumbnail,
    synthesizeSession,
    synthesizeUserGraph,
    synthesizeProject,
    triggerVoiceClone,
    triggerLoraTraining,
    assembleClip,
    processChatSession,
    processCapture,
    processText,
    refineSignal,
    reanalyzeAllUploads,
  ],
})
