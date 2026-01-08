-- Remove Pulse content type from posts
-- Migration to clean up pulse-related data

-- First, convert any existing pulse posts to 'rich' type
UPDATE posts
SET content_type = 'rich'
WHERE content_type = 'pulse';

-- Note: The content_type column constraint will be updated at the application level
-- TypeScript types have been updated to remove 'pulse' as a valid content_type
