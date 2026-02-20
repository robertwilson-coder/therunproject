import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { logger } from '../_shared/logger.ts';
import { DateResolver, DateResolutionContext } from '../_shared/dateResolver.ts';
import { ProposalValidator, ValidationContext } from '../_shared/proposalValidator.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  proposal_id: string;
  user_selection?: string;
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

    const { proposal_id, user_selection }: RequestBody = await req.json();

    logger.info('[ResolveProposal] Resolving proposal:', proposal_id);

    const { data: proposal, error: proposalError } = await supabase
      .from('plan_edit_proposals')
      .select('*')
      .eq('id', proposal_id)
      .eq('user_id', user.id)
      .single();

    if (proposalError || !proposal) {
      throw new Error('Proposal not found');
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

    const { data: completions } = await supabase
      .from('workout_completions')
      .select('week_number, day_name')
      .eq('training_plan_id', plan.id);

    const completedWorkouts = new Set<string>();
    if (completions) {
      completions.forEach(c => {
        completedWorkouts.add(`${c.week_number}-${c.day_name}`);
      });
    }

    const todaysDate = new Date().toISOString().split('T')[0];
    const planStartDate = plan.start_date;

    const context: DateResolutionContext = {
      todayISO: todaysDate,
      planStartDateISO: planStartDate,
      planData: plan.plan_data,
      completedWorkouts
    };

    const resolver = new DateResolver(context);

    const referencesPhrases = proposal.reference_phrases as string[];
    const allResolvedTargets = [];
    let ambiguityDetected = false;
    let ambiguityQuestion = null;
    let ambiguityOptions = null;

    for (const phrase of referencesPhrases) {
      logger.info(`[ResolveProposal] Resolving phrase: "${phrase}"`);

      try {
        const result = resolver.resolve(phrase);

        if (result.ambiguity) {
          logger.info('[ResolveProposal] Ambiguity detected:', result.ambiguity.question);
          ambiguityDetected = true;
          ambiguityQuestion = result.ambiguity.question;
          ambiguityOptions = result.ambiguity.options;

          if (user_selection) {
            const selectedOption = result.ambiguity.options.find(
              opt => opt.isoDate === user_selection
            );
            if (selectedOption) {
              allResolvedTargets.push(selectedOption);
              ambiguityDetected = false;
              ambiguityQuestion = null;
              ambiguityOptions = null;
            } else {
              throw new Error('Invalid user selection');
            }
          }
          break;
        } else {
          allResolvedTargets.push(...result.resolved);
        }
      } catch (error) {
        logger.error('[ResolveProposal] Failed to resolve phrase:', error);
        throw new Error(`Cannot resolve reference: "${phrase}". ${error.message}`);
      }
    }

    if (ambiguityDetected) {
      logger.info('[ResolveProposal] Returning ambiguity for user clarification');

      await supabase
        .from('plan_edit_proposals')
        .update({ status: 'ambiguous' })
        .eq('id', proposal.id);

      return new Response(JSON.stringify({
        ambiguity_detected: true,
        question: ambiguityQuestion,
        options: ambiguityOptions,
        proposal_id: proposal.id
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validationContext: ValidationContext = {
      planData: plan.plan_data,
      completedWorkouts,
      todayISO: todaysDate
    };

    const validator = new ProposalValidator(validationContext);
    const validationResult = validator.validateTargets(allResolvedTargets, proposal.intent);

    if (!validationResult.valid) {
      logger.error('[ResolveProposal] Validation failed:', validationResult.errors);

      return new Response(JSON.stringify({
        error: 'Validation failed',
        validation_errors: validationResult.errors,
        resolved_targets: allResolvedTargets
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (validationResult.requiresConfirmation) {
      logger.info('[ResolveProposal] Requires user confirmation');

      return new Response(JSON.stringify({
        requires_confirmation: true,
        confirmation_message: validationResult.confirmationMessage,
        resolved_targets: allResolvedTargets,
        proposal_id: proposal.id
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const operations = allResolvedTargets.map(target => ({
      iso_date: target.isoDate,
      weekday: target.weekday,
      week_number: target.weekNumber,
      action: proposal.intent === 'delete' ? 'cancel' : proposal.intent,
      relative: target.relative,
      human_label: target.humanLabel,
      is_completed: target.isCompleted
    }));

    const { data: resolution, error: resolutionError } = await supabase
      .from('plan_edit_resolutions')
      .insert({
        proposal_id: proposal.id,
        resolved_targets: allResolvedTargets,
        ambiguity_detected: false,
        operations: operations
      })
      .select()
      .single();

    if (resolutionError) {
      logger.error('[ResolveProposal] Failed to create resolution:', resolutionError);
      throw resolutionError;
    }

    await supabase
      .from('plan_edit_proposals')
      .update({ status: 'resolved' })
      .eq('id', proposal.id);

    logger.info('[ResolveProposal] Resolution created:', resolution.id);

    return new Response(JSON.stringify({
      resolution_id: resolution.id,
      resolved_targets: allResolvedTargets,
      operations: operations,
      coach_explanation: proposal.llm_explanation,
      ready_to_apply: true
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    logger.error("Error in resolve-proposal:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Resolution failed" }),
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
