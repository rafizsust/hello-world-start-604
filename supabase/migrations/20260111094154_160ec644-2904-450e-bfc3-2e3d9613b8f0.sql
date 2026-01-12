-- Create user_api_keys table for test takers to manage their own API key pool
CREATE TABLE public.user_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gemini',
  key_value TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  tts_quota_exhausted BOOLEAN DEFAULT false,
  tts_quota_exhausted_date TEXT,
  flash_quota_exhausted BOOLEAN DEFAULT false,
  flash_quota_exhausted_date TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_user_api_keys_user_id ON public.user_api_keys(user_id);
CREATE INDEX idx_user_api_keys_provider_active ON public.user_api_keys(provider, is_active);

-- Enable Row Level Security
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can view their own API keys
CREATE POLICY "Users can view their own API keys"
ON public.user_api_keys
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own API keys
CREATE POLICY "Users can insert their own API keys"
ON public.user_api_keys
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own API keys
CREATE POLICY "Users can update their own API keys"
ON public.user_api_keys
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own API keys
CREATE POLICY "Users can delete their own API keys"
ON public.user_api_keys
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_api_keys_updated_at
BEFORE UPDATE ON public.user_api_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to reset user API key quotas (daily reset)
CREATE OR REPLACE FUNCTION public.reset_user_api_key_quotas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
BEGIN
  -- Reset quotas where the exhausted date is before today
  UPDATE public.user_api_keys
  SET 
    tts_quota_exhausted = false,
    tts_quota_exhausted_date = NULL,
    flash_quota_exhausted = false,
    flash_quota_exhausted_date = NULL,
    updated_at = now()
  WHERE 
    (tts_quota_exhausted = true AND tts_quota_exhausted_date < today)
    OR (flash_quota_exhausted = true AND flash_quota_exhausted_date < today);
END;
$$;

-- Drop the gemini_daily_usage table as it's no longer needed
DROP TABLE IF EXISTS public.gemini_daily_usage;