# Neolog — API Routes & Background Jobs

## Key API Routes

### Upload
- POST /api/upload/initiate — Start multipart R2 upload, return presigned part URLs
- POST /api/upload/complete — Finish multipart, assemble parts in R2
- POST /api/upload/abort — Abort multipart
- POST /api/video-upload — Register uploaded file, trigger Inngest processing
- DELETE /api/video-upload/[id] — Delete upload + R2 files
- POST /api/video-upload/[id]/reanalyze — Re-run analysis on existing upload
- POST /api/video-upload/save-thumbnail — Save browser-captured thumbnail (base64 JPEG)

### System / Admin
- GET /api/system/pipeline-status — Counts by status, null dates, missing thumbnails, estimated minutes
- POST /api/system/reprocess-stuck — Reprocess jobs stuck >20 min
- POST /api/system/run-date-backfill — Direct date backfill (bypasses Inngest). Returns {updated, skipped, total, summary, results}
- POST /api/system/list-missing-thumbnails — Returns signed playback URLs for browser thumbnail capture

### Entities & Knowledge
- GET /api/entities — List all entities for user
- POST /api/entities — Create entity
- PUT /api/entities/[id] — Update entity
- DELETE /api/entities/[id] — Delete entity
- GET /api/entities/graph — Full knowledge graph JSON
- POST /api/synthesize-graph — Trigger cross-corpus synthesis Inngest job

### Projects
- GET /api/project-documents/[slug] — Get project document
- POST /api/project-documents/[slug]/synthesize — Trigger project synthesis
- POST /api/project-documents/[slug]/export — Export as markdown

### Studio
- POST /api/studio/produce — Create script + production, fire Inngest
- GET /api/studio/production-status — Poll status + return script segments

### Content
- POST /api/debrief — Streaming Claude debrief on text
- POST /api/posts/publish — Publish post_candidate to X

### Social
- POST /api/social/x/connect — OAuth to X
- GET /api/social/x/callback — OAuth callback
- POST /api/social/x/publish — Publish to X

### Inngest webhook
- POST /api/inngest — Inngest function handler (registered automatically)

---

## Inngest Background Jobs

### process-upload (MAIN PIPELINE)
File: src/inngest/functions/process-upload.ts
Trigger: video-upload/process event
Steps:
1. Validate upload exists + fetch user API keys (anthropicKey, openaiKey, groqKey, replicateKey)
2. Extract audio via Replicate fofr/toolkit → MP3 to R2
3. Transcode HEVC → H.264 if needed (Replicate) — runs BEFORE thumbnail
4. Transcribe via Groq whisper-large-v3-turbo (or Replicate fallback)
   - Files >24MB: chunk + merge
   - Save transcript + segments + word timestamps
5. Analyze with Claude Haiku 4.5 → VideoAnalysis JSON → save to video_uploads.analysis
6. Extract voice profile for content generation context
7. Extract entities → upsert to entities + entity_mentions tables
8. Generate post suggestions → save to social_queue
9. Auto-create log entry from analysis
10. Update status → processed

### synthesize-user-graph
File: src/inngest/functions/synthesize-user-graph.ts
Trigger: synthesize-graph event (manual, from Brain page)
- Gathers all processed uploads (analysis JSONB)
- Gets full entity graph (top 100 by mention count)
- Calls Claude Sonnet with full corpus
- Output: spine (through-line), narratives[], themes[], contradictions[], commitments_open[], momentum
- Requires: >=3 uploads, AI API key
- Stores in user_synthesis table

### synthesize-project
File: src/inngest/functions/synthesize-project.ts
Trigger: synthesize-project event (manual, from project page)
- Gathers all entity_mentions for a project entity
- Builds decisions_log, action_items, roadmap from raw session data
- Tracks synthesis_history (rolling last-10 snapshots)
- Detects lifecycle changes (reversed decisions, superseded items)
- Stores in project_documents table

### synthesize-session
File: src/inngest/functions/synthesize-session.ts
Trigger: synthesize-session event (from edit page)
- Analyzes all clips in a clip_session
- Finds themes, narrative arcs, connections across clips
- Generates best_moments (high-signal segments with timestamps)
- Stores in clip_sessions.synthesis

### auto-edit
File: src/inngest/functions/auto-edit.ts
Trigger: auto-edit event
- Takes clip_session with synthesis output
- Generates edit_plans (ordered EDLs: [{source_upload_id, start_sec, end_sec, label}])
- Plans hard-cut sequences that tell a coherent story

### assemble-clip
File: src/inngest/functions/assemble-clip.ts
Trigger: assemble-clip event (from edit page after user reviews plan)
- Executes EDL (pulls segments from source videos via R2 signed URLs)
- Replicate fofr/toolkit concat/trim operations
- Outputs playable MP4 to R2
- Stores download URL in clip_sessions

### produce-studio-video
File: src/inngest/functions/produce-studio-video.ts
Trigger: studio/produce event
- Generates script (segments: narration + visual_direction + duration) via Claude Sonnet
- Stores in scripts table

### assemble-studio-audio
File: src/inngest/functions/assemble-studio-audio.ts
- Splits script into paragraphs
- TTS via ElevenLabs using user's voice clone
- Merges with silences/pauses via Replicate FFmpeg

### generate-segment-visuals
File: src/inngest/functions/generate-segment-visuals.ts
- Flux Schnell image per script segment
- Stores image URLs in production record

### compose-studio-video
File: src/inngest/functions/compose-studio-video.ts
- Composites images + audio → final MP4
- Replicate FFmpeg assembly
- Stores in R2, updates production status → done

### reanalyze-all-uploads
- Batch re-runs analysis on all processed uploads for user
- Used when ANALYSIS_SYSTEM_PROMPT is updated

### backfill-recorded-at (Inngest version — has known bug)
- References video_uploads.meta column that does not exist → always fails silently
- Superseded by direct API route /api/system/run-date-backfill

### trigger-voice-clone
- Sends audio samples to ElevenLabs
- Polls for completion
- Stores voice_id in profiles.voice_profile

### develop-idea
- Expands idea from analysis into full article/newsletter
- Uses extended context from all sessions

### process-capture
- Runs AI analysis on manual text capture (same schema as video analysis)
- Creates log entry

### scatter-scheduler
- Schedules recurring daily synthesis
- Batches reprocessing of stuck jobs
- Cleanup tasks

---

## Studio Production Status Flow
queued → running → scripted → assembling → generating-visuals → composing → done (or error at any step)

## Pipeline Status Values (video_uploads.status)
- uploaded (queued)
- starting, extracting-audio, extracting-metadata, metadata-extracted (in progress)
- generating-thumbnail, transcoding-video, transcribed-media (in progress)
- transcribing, analyzing, saving-results (in progress)
- processed (done)
- error (failed)
