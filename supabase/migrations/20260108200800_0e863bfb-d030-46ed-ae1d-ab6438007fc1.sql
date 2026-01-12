-- Create table for shared speaking test audio settings
-- These are common audio files used across ALL Cambridge speaking tests
CREATE TABLE public.speaking_shared_audio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audio_key TEXT NOT NULL UNIQUE, -- e.g., 'part1_intro', 'part2_prep_start', 'part2_prep_end', 'part3_intro', 'test_ending'
  audio_url TEXT, -- URL to the audio file in storage
  fallback_text TEXT NOT NULL, -- Text for TTS fallback
  description TEXT, -- Human-readable description for admin UI
  display_order INTEGER NOT NULL DEFAULT 0, -- For ordering in admin UI
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.speaking_shared_audio ENABLE ROW LEVEL SECURITY;

-- Allow all users to read (needed for test-takers)
CREATE POLICY "Anyone can read speaking shared audio"
ON public.speaking_shared_audio
FOR SELECT
USING (true);

-- Only admins can modify
CREATE POLICY "Admins can insert speaking shared audio"
ON public.speaking_shared_audio
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update speaking shared audio"
ON public.speaking_shared_audio
FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete speaking shared audio"
ON public.speaking_shared_audio
FOR DELETE
USING (public.is_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_speaking_shared_audio_updated_at
BEFORE UPDATE ON public.speaking_shared_audio
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default audio keys with fallback text (same as AI Practice)
INSERT INTO public.speaking_shared_audio (audio_key, fallback_text, description, display_order) VALUES
('part1_intro', 'Welcome to the IELTS Speaking Test. This is Part 1. I''m going to ask you some questions about yourself and familiar topics. Let''s begin.', 'Part 1 Introduction', 1),
('part1_ending', 'Thank you. That is the end of Part 1.', 'Part 1 Ending', 2),
('part2_intro', 'Now, let''s move on to Part 2. I''m going to give you a topic and I''d like you to talk about it for one to two minutes. Before you talk, you''ll have one minute to think about what you''re going to say. You can make some notes if you wish.', 'Part 2 Introduction', 3),
('part2_prep_start', 'Here is your topic. You have one minute to prepare.', 'Part 2 Preparation Start', 4),
('part2_prep_end', 'Your one minute preparation time is over. Please start speaking now. You have up to two minutes.', 'Part 2 Preparation End / Start Speaking', 5),
('part2_ending', 'Thank you. That is the end of Part 2.', 'Part 2 Ending', 6),
('part3_intro', 'Now let''s move on to Part 3. In this part, I''d like to discuss some more abstract questions related to the topic in Part 2.', 'Part 3 Introduction', 7),
('part3_ending', 'Thank you. That is the end of Part 3.', 'Part 3 Ending', 8),
('test_ending', 'Thank you very much. That is the end of the speaking test.', 'Test Ending', 9);