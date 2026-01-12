-- ============================================================================
-- 1. Set up pg_cron for daily quota reset at midnight UTC
-- ============================================================================

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage on cron schema to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule daily quota reset for user and admin API keys at midnight UTC
-- This calls the reset_user_api_key_quotas and reset_api_key_quotas functions
SELECT cron.schedule(
  'reset-user-api-quotas-daily',
  '0 0 * * *', -- Every day at midnight UTC
  $$
  BEGIN;
    -- Reset user API key quotas
    SELECT public.reset_user_api_key_quotas();
    -- Reset admin API key quotas
    SELECT public.reset_api_key_quotas();
    -- Reset user daily credits (set to 0 for new day)
    UPDATE public.profiles 
    SET daily_credits_used = 0, last_reset_date = CURRENT_DATE 
    WHERE last_reset_date < CURRENT_DATE;
  COMMIT;
  $$
);

-- ============================================================================
-- 2. Optimize preset test storage - clear duplicate payloads
-- ============================================================================

-- For preset tests (is_preset = true), we don't need to store the full payload
-- since it can be fetched from generated_test_audio via preset_id
-- Set payload to minimal JSON to save storage

UPDATE public.ai_practice_tests
SET payload = '{}'::jsonb
WHERE is_preset = true 
  AND preset_id IS NOT NULL
  AND jsonb_typeof(payload) = 'object'
  AND payload != '{}'::jsonb;

-- Add an index to speed up preset_id lookups
CREATE INDEX IF NOT EXISTS idx_ai_practice_tests_preset_id 
ON public.ai_practice_tests (preset_id) 
WHERE preset_id IS NOT NULL;