-- Add audio_url column to speaking_questions for storing generated examiner audio
ALTER TABLE public.speaking_questions 
ADD COLUMN audio_url TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.speaking_questions.audio_url IS 'URL to the pre-generated examiner audio for this question';