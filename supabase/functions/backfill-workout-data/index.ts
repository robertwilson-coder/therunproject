import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ParsedWorkout {
  distanceKm: number;
  durationMinutes: number;
}

function parseWorkoutDescription(description: string): ParsedWorkout {
  const result: ParsedWorkout = {
    distanceKm: 0,
    durationMinutes: 0,
  };

  // Parse time first - must have explicit unit
  const hoursMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (hoursMatch) {
    result.durationMinutes += parseFloat(hoursMatch[1]) * 60;
  }

  const minutesMatch = description.match(/(\d+)\s*(?:minutes?|mins?|min)\b/i);
  if (minutesMatch) {
    result.durationMinutes += parseFloat(minutesMatch[1]);
  }

  const timeMatch = description.match(/(\d+):(\d+)(?::(\d+))?/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    result.durationMinutes = hours * 60 + minutes + seconds / 60;
  }

  // Only parse distance if no time was found
  if (result.durationMinutes === 0) {
    const milesMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:miles?)\b/i);
    if (milesMatch) {
      result.distanceKm = parseFloat(milesMatch[1]) * 1.609;
    }

    const kmMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:kilometers?|km)\b/i);
    if (kmMatch) {
      result.distanceKm = parseFloat(kmMatch[1]);
    }

    const miMatch = description.match(/(\d+(?:\.\d+)?)\s*mi\b/i);
    if (miMatch && !description.match(/\bmin\b/i)) {
      result.distanceKm = parseFloat(miMatch[1]) * 1.609;
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all workout completions with missing distance or duration
    const { data: completions, error: fetchError } = await supabase
      .from('workout_completions')
      .select('id, training_plan_id, week_number, day_name, distance_km, duration_minutes')
      .or('distance_km.is.null,duration_minutes.is.null');

    if (fetchError) throw fetchError;

    console.log(`Found ${completions?.length || 0} completions with missing data`);

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const completion of completions || []) {
      try {
        // Get the training plan to access the workout description
        const { data: plan, error: planError } = await supabase
          .from('training_plans')
          .select('plan_data')
          .eq('id', completion.training_plan_id)
          .single();

        if (planError || !plan) {
          errors.push(`Plan not found for completion ${completion.id}`);
          skipped++;
          continue;
        }

        // Find the workout in the plan data
        const planData = plan.plan_data as any;
        const week = planData?.plan?.[completion.week_number - 1];

        if (!week) {
          errors.push(`Week ${completion.week_number} not found in plan ${completion.training_plan_id}`);
          skipped++;
          continue;
        }

        const workout = week.days?.find((d: any) => d.day === completion.day_name);

        if (!workout || !workout.activity) {
          errors.push(`Workout not found for ${completion.week_number}-${completion.day_name}`);
          skipped++;
          continue;
        }

        // Parse the workout description
        const parsed = parseWorkoutDescription(workout.activity);

        // Apply the same logic as the frontend
        let distance = parsed.distanceKm;
        let duration = parsed.durationMinutes;

        // If we found duration but not distance, estimate distance
        if (duration > 0 && distance === 0) {
          distance = duration * 0.15; // ~6:40/km pace
        }
        // If we found distance but not duration, estimate duration
        else if (distance > 0 && duration === 0) {
          duration = distance * 6.5; // ~6:30/km pace
        }
        // If we found neither, use defaults
        else if (distance === 0 && duration === 0) {
          distance = 5;
          duration = 30;
        }

        // Only update fields that are currently null
        const updates: any = {};
        if (completion.distance_km === null && distance > 0) {
          updates.distance_km = distance;
        }
        if (completion.duration_minutes === null && duration > 0) {
          updates.duration_minutes = duration;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('workout_completions')
            .update(updates)
            .eq('id', completion.id);

          if (updateError) {
            errors.push(`Failed to update completion ${completion.id}: ${updateError.message}`);
            skipped++;
          } else {
            updated++;
            console.log(`Updated completion ${completion.id}: ${JSON.stringify(updates)}`);
          }
        } else {
          skipped++;
        }
      } catch (error) {
        errors.push(`Error processing completion ${completion.id}: ${error.message}`);
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Backfill completed',
        stats: {
          total: completions?.length || 0,
          updated,
          skipped,
          errors: errors.length
        },
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Return first 10 errors
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
