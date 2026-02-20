import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  resolution_id: string;
  user_confirmed?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Unauthorized");
    }

    const { resolution_id, user_confirmed }: RequestBody = await req.json();

    logger.info('[ApplyProposal] Applying resolution:', resolution_id);

    const { data: resolution, error: resolutionError } = await supabase
      .from('plan_edit_resolutions')
      .select('*, plan_edit_proposals(*)')
      .eq('id', resolution_id)
      .single();

    if (resolutionError || !resolution) {
      throw new Error('Resolution not found');
    }

    const proposal = resolution.plan_edit_proposals;
    if (proposal.user_id !== user.id) {
      throw new Error('Unauthorized');
    }

    const { data: plan, error: planError } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', proposal.training_plan_id)
      .eq('user_id', user.id)
      .single();

    if (planError || !plan) {
      throw new Error('Training plan not found');
    }

    const operations = resolution.operations as any[];
    const planData = plan.plan_data;

    if (!planData.days || !Array.isArray(planData.days)) {
      throw new Error('Invalid plan structure: missing days array');
    }

    const auditEntries = [];
    const modifiedDates = new Set<string>();

    for (const operation of operations) {
      logger.info(`[ApplyProposal] Processing operation:`, operation);

      const dayIndex = planData.days.findIndex((d: any) => d.date === operation.iso_date);
      if (dayIndex === -1) {
        logger.error(`[ApplyProposal] Date ${operation.iso_date} not found in plan`);
        throw new Error(`Date ${operation.iso_date} not found in plan`);
      }

      const dayData = planData.days[dayIndex];
      const beforeWorkout = dayData.workout;
      const beforeStatus = dayData.status || 'scheduled';

      if (beforeStatus === 'completed') {
        throw new Error(`Cannot modify completed workout on ${operation.iso_date}`);
      }

      let afterWorkout = beforeWorkout;
      let afterStatus = beforeStatus;

      switch (operation.action) {
        case 'cancel':
        case 'delete':
          afterWorkout = 'Rest';
          afterStatus = 'cancelled';
          dayData.workout = 'Rest';
          dayData.status = 'cancelled';
          dayData.tips = [];
          dayData.workout_type = 'REST';
          break;

        case 'reinstate':
          if (beforeStatus !== 'cancelled') {
            throw new Error(`Cannot reinstate workout on ${operation.iso_date} - not cancelled`);
          }
          afterStatus = 'scheduled';
          dayData.status = 'scheduled';
          break;

        case 'replace':
        case 'modify':
          if (operation.new_workout) {
            afterWorkout = operation.new_workout;
            dayData.workout = operation.new_workout;
            if (operation.tips) {
              dayData.tips = operation.tips;
            }
            if (operation.workout_type) {
              dayData.workout_type = operation.workout_type;
            }
          }
          break;

        case 'swap':
          break;

        default:
          throw new Error(`Unknown operation: ${operation.action}`);
      }

      auditEntries.push({
        training_plan_id: plan.id,
        user_id: user.id,
        proposal_id: proposal.id,
        resolution_id: resolution.id,
        iso_date: operation.iso_date,
        operation: operation.action,
        before_workout: beforeWorkout,
        after_workout: afterWorkout,
        before_status: beforeStatus,
        after_status: afterStatus
      });

      modifiedDates.add(operation.iso_date);
    }

    const { error: updateError } = await supabase
      .from('training_plans')
      .update({
        plan_data: planData,
        updated_at: new Date().toISOString()
      })
      .eq('id', plan.id);

    if (updateError) {
      logger.error('[ApplyProposal] Failed to update plan:', updateError);
      throw updateError;
    }

    const { error: auditError } = await supabase
      .from('plan_edit_audit_log')
      .insert(auditEntries);

    if (auditError) {
      logger.error('[ApplyProposal] Failed to create audit log:', auditError);
    }

    await supabase
      .from('plan_edit_proposals')
      .update({ status: 'applied' })
      .eq('id', proposal.id);

    logger.info('[ApplyProposal] Successfully applied changes');

    return new Response(JSON.stringify({
      success: true,
      modified_dates: Array.from(modifiedDates),
      operations_applied: operations.length,
      coach_explanation: proposal.llm_explanation
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    logger.error("Error in apply-proposal:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Apply failed" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
