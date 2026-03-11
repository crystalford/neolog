-- Add granular pipeline_log column to video_uploads
-- Each entry: { step, status, ts, detail? }
-- Written by the Inngest function at the start and end of every step
-- so you can see exactly where in the chain a failure occurred.

ALTER TABLE video_uploads
  ADD COLUMN IF NOT EXISTS pipeline_log jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Atomic append function — safe to call from concurrent workers,
-- though Inngest steps are sequential so this is mainly for correctness.
CREATE OR REPLACE FUNCTION append_pipeline_log(upload_id uuid, log_entry jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE video_uploads
  SET
    pipeline_log = COALESCE(pipeline_log, '[]'::jsonb) || jsonb_build_array(log_entry),
    updated_at   = now()
  WHERE id = upload_id;
$$;

-- Allow service role (Inngest) to call it
GRANT EXECUTE ON FUNCTION append_pipeline_log(uuid, jsonb) TO service_role;
