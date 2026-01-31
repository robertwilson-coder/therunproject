import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildEliteCoachSystemPrompt } from '../_shared/promptBuilder.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CalibrationResult {
  testType: string;
  completedAtISO: string;
  workSegmentDurationMinutes: number;
  workSegmentDistanceMeters: number;
  averagePaceSecPerKm: number;
  paceVariabilityPct?: number;
  firstHalfVsSecondHalfSplitPct?: number;
  pausedTimeSeconds: number;
  elevationGainMeters: number;
  avgHeartRate?: number;
  hrDriftPct?: number;
  validity: 'high' | 'medium' | 'low';
  pacingQuality: 'good' | 'mixed' | 'poor';
  confidence: 'high' | 'medium' | 'low';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { planId } = await req.json();

    if (!planId) {
      throw new Error('Plan ID is required');
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: plan, error: planError } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      throw new Error('Training plan not found');
    }

    const calibrationResult: CalibrationResult | null = plan.calibration_result;

    if (!calibrationResult) {
      throw new Error('No calibration result found for this plan');
    }

    const planData = plan.plan_data;
    const answers = plan.answers || {};
    const startDate = plan.start_date;
    const raceDate = plan.race_date;

    if (!planData || !planData.days) {
      throw new Error('Invalid plan data structure');
    }

    const startDateObj = new Date(startDate);
    const week3StartDate = new Date(startDateObj);
    week3StartDate.setDate(week3StartDate.getDate() + 14);

    const preservedDays = planData.days.filter((day: any) => {
      const dayDate = new Date(day.date);
      return dayDate < week3StartDate;
    });

    const daysToRegenerate = planData.days.filter((day: any) => {
      const dayDate = new Date(day.date);
      return dayDate >= week3StartDate;
    });

    if (daysToRegenerate.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No days to regenerate (plan ends before Week 3)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const testPaceSecPerKm = calibrationResult.averagePaceSecPerKm;
    const confidenceLevel = calibrationResult.confidence;
    const testPaceFormatted = `${Math.floor(testPaceSecPerKm / 60)}:${String(Math.round(testPaceSecPerKm % 60)).padStart(2, '0')}`;

    const totalWeeks = Math.ceil(planData.days.length / 7);
    const daysPerWeek = answers.availableDays?.length || answers.daysPerWeek || 3;
    const availableDays = answers.availableDays || ['Monday', 'Wednesday', 'Saturday'];

    const confidenceGuidance = confidenceLevel === 'high'
      ? `IF confidence = HIGH:
- You may include pace guidance where appropriate.
- Pace ranges must be conservative and realistic.
- Easy runs must remain genuinely easy (RPE 2–3), regardless of pace.
- Marathon pace work (if applicable) may appear later in the plan only.`
      : confidenceLevel === 'medium'
      ? `IF confidence = MEDIUM:
- Use RPE-first prescriptions.
- Pace may be shown as a broad reference range only.
- Avoid tightly defined paces.`
      : `IF confidence = LOW:
- Use RPE-only prescriptions.
- Do NOT prescribe specific pace targets.
- Emphasise restraint and controlled effort in tips.`;

    const prompt = `You are regenerating a training plan from Week 3 onward based on a completed calibration run.

IMPORTANT CONTEXT:
- Weeks 1–2 are already completed and must NOT be changed.
- You are generating training only for the dates listed below.
- This is an adjustment of pacing and execution, NOT a change to overall structure or durability assumptions.

========================
NON-NEGOTIABLE CONSTRAINTS
========================
- Preserve EXACT training frequency and selected training days.
- Preserve rest days exactly (non-training days must be "Rest").
- Preserve the existing weekly structure (easy runs, one quality session, one long run as appropriate).
- Do NOT introduce additional quality sessions.
- Do NOT increase training frequency.
- All workouts must use: Warm up | Work | Cool down format.

Training Context:
- Training days: ${availableDays.join(', ')}
- Days per week: ${daysPerWeek}
- Race distance: ${answers.raceDistance || 'Marathon'}
- Race date: ${raceDate}

========================
CALIBRATION CONTEXT
========================
Calibration test summary:
- Test type: ${calibrationResult.testType || 'Effort test'}
- Average pace (work segment): ${testPaceFormatted} min/km
- Pacing quality: ${calibrationResult.pacingQuality || 'mixed'}
- Confidence level: ${confidenceLevel}
- Heart rate data: ${calibrationResult.avgHeartRate ? 'present' : 'not present'}

Interpretation rules:
- The calibration test is a pacing and effort reference, NOT proof of durability.
- Weekly volume and long-run progression must still respect conservative limits.
- Use calibration results primarily to guide effort and pacing clarity, not workload escalation.

========================
PACING & EFFORT GUIDANCE
========================

${confidenceGuidance}

Do NOT calculate paces mechanically using fixed percentage rules.
Apply coaching judgement appropriate to race distance.

========================
PROGRESSION RULES (RESTATED)
========================
- Weekly volume increase: typical 0–8%, absolute max 10%.
- Long run increases must be gradual and conservative.
- Include cutback weeks where appropriate.
- Do NOT introduce new workout types late in the plan.
- Maintain appropriate taper before race day.

========================
OUTPUT REQUIREMENTS
========================
Generate training for the following dates only:
${daysToRegenerate.map((d: any, i: number) => `Day ${i + 1}: ${d.date}`).join('\n')}

Return a JSON object with a "days" array.
Each day must include:
- date (string)
- workout (string)
- tips (array of strings)

Plans must feel conservative, credible, and coach-led.`;

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: buildEliteCoachSystemPrompt({
              totalWeeks,
              raceDistance: answers.raceDistance || 'Marathon',
              longestRun: answers.longestRun || 10,
              currentWeeklyKm: answers.currentWeeklyKm || '20-30',
              experience: answers.experience || 'intermediate',
              availableDays,
              daysPerWeek,
              isBeginnerPlan: false,
              hasPaceData: confidenceLevel === 'high',
              includeCalibrationRun: false
            })
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const aiData = await openAIResponse.json();
    const content = aiData.choices[0].message.content;
    const regeneratedData = JSON.parse(content);

    if (!regeneratedData.days || !Array.isArray(regeneratedData.days)) {
      throw new Error('Invalid regenerated plan structure');
    }

    const updatedDays = [...preservedDays, ...regeneratedData.days];

    const updatedPlanData = {
      ...planData,
      days: updatedDays
    };

    const { error: updateError } = await supabase
      .from('training_plans')
      .update({
        plan_data: updatedPlanData,
        updated_at: new Date().toISOString()
      })
      .eq('id', planId);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Plan regenerated from Week 3 onward based on calibration results`,
      daysRegenerated: regeneratedData.days.length,
      daysPreserved: preservedDays.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error regenerating plan:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to regenerate plan'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
