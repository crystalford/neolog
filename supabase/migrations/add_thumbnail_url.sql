-- Add thumbnail_url column to video_uploads table
ALTER TABLE video_uploads ADD COLUMN thumbnail_url TEXT;

-- Create indexes for efficient queries
CREATE INDEX idx_video_uploads_user_id_thumbnail ON video_uploads(user_id) WHERE thumbnail_url IS NOT NULL;
