import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { processUpload } from '@/inngest/functions/process-upload'
import { synthesizeSession } from '@/inngest/functions/synthesize-session'
import { synthesizeUserGraph } from '@/inngest/functions/synthesize-user-graph'
import { triggerVoiceClone } from '@/inngest/functions/trigger-voice-clone'
import { triggerLoraTraining } from '@/inngest/functions/trigger-lora-training'
import { assembleClip } from '@/inngest/functions/assemble-clip'
import { reanalyzeAllUploads } from '@/inngest/functions/reanalyze-all-uploads'
import { synthesizeProject } from '@/inngest/functions/synthesize-project'
import { developIdea } from '@/inngest/functions/develop-idea'
import { scatterScheduler, postDispatcher } from '@/inngest/functions/scatter-scheduler'
import { produceStudioVideo } from '@/inngest/functions/produce-studio-video'
import { autoEdit } from '@/inngest/functions/auto-edit'
import { assembleStudioAudio } from '@/inngest/functions/assemble-studio-audio'

export const runtime = 'edge'

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
    reanalyzeAllUploads,
    developIdea,
    scatterScheduler,
    postDispatcher,
    produceStudioVideo,
    autoEdit,
    assembleStudioAudio,
  ],
})
