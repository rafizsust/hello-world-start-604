import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { uploadToR2 } from "../_shared/r2Client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UploadRequest {
  testId: string;
  partNumber: 1 | 2 | 3;
  audioData: Record<string, string>; // key -> dataURL (e.g., "part1-q<id>" -> "data:audio/mp3;base64,...")
}

serve(async (req) => {
  console.log('[upload-speaking-audio] Request received');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create client with user's auth
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    });

    // Get user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('[upload-speaking-audio] Auth error:', authError?.message);
      return new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: UploadRequest = await req.json();
    const { testId, partNumber, audioData } = body;

    if (!testId || !partNumber || !audioData) {
      return new Response(JSON.stringify({ error: 'Missing required fields', code: 'BAD_REQUEST' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const audioKeys = Object.keys(audioData);
    console.log(`[upload-speaking-audio] Uploading ${audioKeys.length} audio segments for Part ${partNumber}`);

    const uploadedUrls: Record<string, string> = {};

    for (const key of audioKeys) {
      try {
        const value = audioData[key];
        const { mimeType, base64 } = parseDataUrl(value);
        
        if (!base64 || base64.length < 1000) {
          console.log(`[upload-speaking-audio] Skipping ${key} - too small`);
          continue;
        }

        const audioBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const ext = mimeType === 'audio/mpeg' ? 'mp3' : 'webm';
        const r2Key = `speaking-audios/ai-speaking/${user.id}/${testId}/${key}.${ext}`;

        const result = await uploadToR2(r2Key, audioBytes, mimeType);
        if (result.success && result.url) {
          uploadedUrls[key] = result.url;
          console.log(`[upload-speaking-audio] Uploaded: ${key}`);
        } else {
          console.warn(`[upload-speaking-audio] Upload failed for ${key}:`, result.error);
        }
      } catch (err) {
        console.error(`[upload-speaking-audio] Error uploading ${key}:`, err);
      }
    }

    console.log(`[upload-speaking-audio] Successfully uploaded ${Object.keys(uploadedUrls).length} files`);

    return new Response(JSON.stringify({
      success: true,
      uploadedUrls,
      partNumber,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[upload-speaking-audio] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    return new Response(JSON.stringify({ error: errorMessage, code: 'UPLOAD_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function parseDataUrl(value: string): { mimeType: string; base64: string } {
  if (!value) return { mimeType: 'audio/webm', base64: '' };

  if (value.startsWith('data:')) {
    const commaIdx = value.indexOf(',');
    const header = commaIdx >= 0 ? value.slice(5, commaIdx) : value.slice(5);
    const base64 = commaIdx >= 0 ? value.slice(commaIdx + 1) : '';

    const semiIdx = header.indexOf(';');
    const mimeType = (semiIdx >= 0 ? header.slice(0, semiIdx) : header).trim() || 'audio/webm';

    return { mimeType, base64 };
  }

  return { mimeType: 'audio/webm', base64: value };
}
