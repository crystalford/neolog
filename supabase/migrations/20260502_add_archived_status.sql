-- Add 'archived' status for vlogs uploaded without auto-processing.
-- Archive-mode uploads run only the locked pipeline (transcode + thumbnail +
-- recorded_at extraction) and then stop. Operator triggers transcription +
-- analysis later per-vlog via the "Process now" action.

ALTER TABLE public.video_uploads
  DROP CONSTRAINT IF EXISTS video_uploads_status_check;

ALTER TABLE public.video_uploads
  ADD CONSTRAINT video_uploads_status_check
  CHECK (status IN (
    'uploaded',
    'starting',
    'extracting-audio',
    'extracting-metadata',
    'metadata-extracted',
    'generating-thumbnail',
    'transcoding-video',
    'transcribed-media',
    'transcribing',
    'analyzing-media',
    'saving-results',
    'analyzing',
    'processed',
    'archived',
    'error',
    'deleting',
    'deleted'
  ));
