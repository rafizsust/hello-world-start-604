import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("Missing env:", {
        hasUrl: Boolean(supabaseUrl),
        hasAnon: Boolean(supabaseAnonKey),
        hasService: Boolean(supabaseServiceKey),
      });
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Validate the JWT using the anon client (apikey = anon, auth = user's token)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // 2) Use service role for DB reads (admin-only endpoints)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is admin
    const { data: adminCheck } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!adminCheck) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    let jobId = url.searchParams.get("jobId");

    // Support POST body too (supabase.functions.invoke uses POST)
    if (!jobId && req.method !== "GET") {
      try {
        const body = await req.json();
        if (body && typeof body.jobId === "string" && body.jobId.trim()) {
          jobId = body.jobId.trim();
        }
      } catch {
        // ignore missing/invalid JSON body
      }
    }

    if (jobId) {
      // Get single job status
      const { data: job, error } = await supabase
        .from("bulk_generation_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error || !job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get generated tests for this job
      const { data: tests } = await supabase
        .from("generated_test_audio")
        .select("id, status, voice_id, accent, question_type, is_published, created_at, content_payload, module")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });

      return new Response(
        JSON.stringify({ job, tests: tests || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Get all jobs for this admin (last 50)
      const { data: jobs, error } = await supabase
        .from("bulk_generation_jobs")
        .select("*")
        .eq("admin_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to fetch jobs" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ jobs: jobs || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("get-job-status error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
