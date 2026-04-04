import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { processUpload } from '@/inngest/functions/process-upload'
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
import { developIdea } from '@/inngest/functions/develop-idea'

export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processUpload,
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
    developIdea,
  ],
})
