-- Drop the existing check constraint
ALTER TABLE public.speaking_evaluation_jobs 
DROP CONSTRAINT speaking_evaluation_jobs_status_check;

-- Add new check constraint with stale and retrying statuses
ALTER TABLE public.speaking_evaluation_jobs 
ADD CONSTRAINT speaking_evaluation_jobs_status_check 
CHECK (status = ANY (ARRAY['pending', 'processing', 'completed', 'failed', 'stale', 'retrying']));