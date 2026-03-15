/*
  # Add Plan Pause State

  ## Summary
  Adds pause/resume capability to training plans, preserving structural integrity.

  ## New Columns on `training_plans`
  - `plan_status` (text) — 'active' | 'paused', defaults to 'active'
  - `pause_start_date` (date) — the calendar date the plan was paused
  - `pause_week_index` (integer) — week index in the plan at time of pause
  - `pause_structural_volume` (numeric) — structural weekly volume (km) at pause point
  - `pause_long_run_target` (numeric) — long run target (km) at pause point
  - `total_paused_days` (integer) — cumulative days paused across all pause/resume cycles
  - `original_race_date` (date) — race date before any pause extension; preserved for auditing

  ## Security
  - Existing RLS on training_plans already covers these columns — no new policies needed.

  ## Notes
  1. All new columns are nullable so existing rows are unaffected.
  2. plan_status defaults to 'active' for all new and existing rows.
  3. total_paused_days accumulates across multiple pause cycles — resume adds the current pause duration.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'plan_status'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN plan_status text NOT NULL DEFAULT 'active'
      CHECK (plan_status IN ('active', 'paused'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'pause_start_date'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN pause_start_date date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'pause_week_index'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN pause_week_index integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'pause_structural_volume'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN pause_structural_volume numeric(6,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'pause_long_run_target'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN pause_long_run_target numeric(6,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'total_paused_days'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN total_paused_days integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_plans' AND column_name = 'original_race_date'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN original_race_date date;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_training_plans_plan_status
  ON training_plans (user_id, plan_status)
  WHERE plan_status = 'paused';
