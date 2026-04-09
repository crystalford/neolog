-- Add editorial_board column to user_synthesis
ALTER TABLE public.user_synthesis 
ADD COLUMN IF NOT EXISTS editorial_board JSONB;

-- Comment for documentation
COMMENT ON COLUMN public.user_synthesis.editorial_board IS 'AI-generated video essay topics and production-grade script suggestions.';
