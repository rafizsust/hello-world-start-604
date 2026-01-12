-- Add daily quota tracking columns for TTS and Flash models
ALTER TABLE public.api_keys
ADD COLUMN IF NOT EXISTS tts_quota_exhausted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tts_quota_exhausted_date date,
ADD COLUMN IF NOT EXISTS flash_quota_exhausted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS flash_quota_exhausted_date date;

-- Create a function to reset quota flags daily
CREATE OR REPLACE FUNCTION public.reset_api_key_quotas()
RETURNS void AS $$
BEGIN
  UPDATE public.api_keys
  SET 
    tts_quota_exhausted = false,
    tts_quota_exhausted_date = NULL
  WHERE tts_quota_exhausted = true 
    AND tts_quota_exhausted_date < CURRENT_DATE;
    
  UPDATE public.api_keys
  SET 
    flash_quota_exhausted = false,
    flash_quota_exhausted_date = NULL
  WHERE flash_quota_exhausted = true 
    AND flash_quota_exhausted_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;