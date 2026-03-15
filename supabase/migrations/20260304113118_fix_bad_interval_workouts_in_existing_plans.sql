
/*
  # Fix bad interval workouts in existing training plans

  Scans every day in every training plan and rewrites any rep-based interval
  where the rep distance exceeds 3 km (e.g. "5 × 18 km", "6 x 12.5 km") to
  an equivalent total-distance tempo run. This mirrors the sanitizeIntervalWorkout
  guard that is now enforced at write-time in all edge functions.

  Pattern matched: N × D km  (or N x D km)  where D > 3 and N >= 2
  Replacement: (N * D rounded) km tempo run

  Only the workout field of each day object is touched; all other fields are preserved.
  updated_at is bumped so clients can detect the change.
*/

CREATE OR REPLACE FUNCTION fix_interval_workouts()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  plan_row RECORD;
  new_days  jsonb;
  day_obj   jsonb;
  day_idx   int;
  workout   text;
  fixed     text;
  rep_count int;
  rep_km    numeric;
  total_km  int;
  changed   boolean;
BEGIN
  FOR plan_row IN
    SELECT id, plan_data
    FROM training_plans
    WHERE plan_data->'days' IS NOT NULL
  LOOP
    new_days := plan_row.plan_data->'days';
    changed  := false;

    FOR day_idx IN 0 .. jsonb_array_length(new_days) - 1 LOOP
      day_obj := new_days -> day_idx;
      workout := day_obj ->> 'workout';

      IF workout IS NULL OR lower(trim(workout)) = 'rest' THEN
        CONTINUE;
      END IF;

      fixed := workout;

      -- Replace all occurrences of "N × D km" or "N x D km" where D > 3 and N >= 2
      -- We loop because there could theoretically be multiple matches per workout string.
      LOOP
        -- Find first match: capture group 1 = rep count, group 2 = rep distance
        IF fixed !~ '\m(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*km' THEN
          EXIT;
        END IF;

        rep_count := (regexp_match(fixed, '\m(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*km'))[1]::int;
        rep_km    := (regexp_match(fixed, '\m(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*km'))[2]::numeric;

        IF rep_km > 3 AND rep_count >= 2 THEN
          total_km := round(rep_count * rep_km);
          fixed := regexp_replace(
            fixed,
            '\m' || rep_count || '\s*[×x]\s*' || rep_km || '\s*km',
            total_km || ' km tempo run',
            'i'
          );
          changed := true;
        ELSE
          -- No bad match remaining, stop
          EXIT;
        END IF;
      END LOOP;

      IF fixed <> workout THEN
        new_days := jsonb_set(new_days, ARRAY[day_idx::text, 'workout'], to_jsonb(fixed));
        changed  := true;
      END IF;
    END LOOP;

    IF changed THEN
      UPDATE training_plans
      SET
        plan_data  = jsonb_set(plan_row.plan_data, '{days}', new_days),
        updated_at = now()
      WHERE id = plan_row.id;
    END IF;
  END LOOP;
END;
$$;

SELECT fix_interval_workouts();

DROP FUNCTION fix_interval_workouts();
