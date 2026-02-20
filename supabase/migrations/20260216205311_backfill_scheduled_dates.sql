/*
  # Backfill scheduled_date for existing workout completions

  1. Purpose
    - Calculate and populate scheduled_date for existing workout completions
    - Uses the training plan's start_date + (week_number - 1) * 7 + day_offset

  2. Logic
    - For each workout completion, look up the training plan's start_date
    - Calculate the scheduled date based on week_number and day_name
    - Update the record with the calculated scheduled_date
*/

-- Backfill scheduled dates for existing workout completions
UPDATE workout_completions wc
SET scheduled_date = (
  SELECT 
    (tp.start_date + ((wc.week_number - 1) * 7 + 
      CASE wc.day_name
        WHEN 'Mon' THEN 0
        WHEN 'Monday' THEN 0
        WHEN 'Tue' THEN 1
        WHEN 'Tuesday' THEN 1
        WHEN 'Wed' THEN 2
        WHEN 'Wednesday' THEN 2
        WHEN 'Thu' THEN 3
        WHEN 'Thursday' THEN 3
        WHEN 'Fri' THEN 4
        WHEN 'Friday' THEN 4
        WHEN 'Sat' THEN 5
        WHEN 'Saturday' THEN 5
        WHEN 'Sun' THEN 6
        WHEN 'Sunday' THEN 6
        ELSE 0
      END
    ))::date
  FROM training_plans tp
  WHERE tp.id = wc.training_plan_id
)
WHERE scheduled_date IS NULL;
