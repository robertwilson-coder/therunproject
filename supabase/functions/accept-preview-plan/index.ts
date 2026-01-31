import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@^2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { planId } = await req.json();

    if (!planId) {
      return new Response(JSON.stringify({ error: 'planId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: plan, error: planError } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (plan.plan_type !== 'date_based_preview') {
      return new Response(JSON.stringify({ error: 'Only preview plans can be accepted' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!plan.user_id) {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({ user_id: user.id })
        .eq('id', planId);

      if (updateError) {
        throw updateError;
      }
    } else if (plan.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized to accept this plan' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const requestData = {
      raceDistance: plan.answers?.raceDistance || 'Unknown',
      raceDate: plan.race_date,
      startDate: plan.start_date,
      answers: plan.final_preferences || plan.answers,
      trainingPaces: plan.training_paces
    };

    console.log('Creating plan generation job for plan:', planId);

    const { data: job, error: jobError } = await supabase
      .from('plan_generation_jobs')
      .insert({
        user_id: user.id,
        plan_id: planId,
        status: 'pending',
        progress: 0,
        request_data: requestData
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating job:', jobError);
      throw jobError;
    }

    console.log('Job created successfully:', job.id);

    const functionUrl = `${supabaseUrl}/functions/v1/process-plan-job`;
    console.log('Triggering job processor at:', functionUrl);

    fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ jobId: job.id })
    }).then(response => {
      console.log('Job processor triggered, status:', response.status);
    }).catch(fetchError => {
      console.error('Failed to trigger job processor (async):', fetchError);
    });

    return new Response(JSON.stringify({
      job_id: job.id,
      status: 'pending',
      message: 'Full plan generation started'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error accepting preview:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
