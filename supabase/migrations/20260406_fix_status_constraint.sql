-- Fix video_uploads status check constraint to include all pipeline statuses
-- The original constraint was too restrictive and blocked the processing pipeline

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
    'transcribing',
    'processed',
    'error',
    'deleting',
    'deleted'
  ));
