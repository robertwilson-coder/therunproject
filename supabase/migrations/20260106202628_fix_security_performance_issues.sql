/*
  # Fix Security and Performance Issues

  ## 1. Add Missing Foreign Key Indexes
  Adding indexes to foreign key columns that were missing them:
    - `plan_shares.shared_by` - improves join performance with auth.users
    - `plan_shares.training_plan_id` - improves join performance with training_plans
    - `workout_completions.training_plan_id` - improves join performance with training_plans  
    - `workout_reminders.training_plan_id` - improves join performance with training_plans

  ## 2. Optimize RLS Policies for Better Performance
  Replacing `auth.uid()` with `(select auth.uid())` in all RLS policies to prevent
  re-evaluation for each row, significantly improving query performance at scale.
  
  This affects all policies on:
    - training_plans (4 policies)
    - workout_completions (4 policies)
    - pace_calculations (4 policies)
    - plan_shares (4 policies)
    - workout_reminders (4 policies)

  ## 3. Notes
    - Unused index warnings are expected for new/low-traffic apps and do not need action
    - Auth DB Connection Strategy and Leaked Password Protection must be configured in Supabase Dashboard
*/

-- Add missing indexes on foreign keys
CREATE INDEX IF NOT EXISTS idx_plan_shares_shared_by 
  ON plan_shares(shared_by);

CREATE INDEX IF NOT EXISTS idx_plan_shares_training_plan_id 
  ON plan_shares(training_plan_id);

CREATE INDEX IF NOT EXISTS idx_workout_completions_training_plan_id 
  ON workout_completions(training_plan_id);

CREATE INDEX IF NOT EXISTS idx_workout_reminders_training_plan_id 
  ON workout_reminders(training_plan_id);

-- Optimize training_plans RLS policies
DROP POLICY IF EXISTS "Users can view own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can create own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can update own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can delete own training plans" ON training_plans;

CREATE POLICY "Users can view own training plans"
  ON training_plans FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create own training plans"
  ON training_plans FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own training plans"
  ON training_plans FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own training plans"
  ON training_plans FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Optimize workout_completions RLS policies
DROP POLICY IF EXISTS "Users can view own workout completions" ON workout_completions;
DROP POLICY IF EXISTS "Users can insert own workout completions" ON workout_completions;
DROP POLICY IF EXISTS "Users can update own workout completions" ON workout_completions;
DROP POLICY IF EXISTS "Users can delete own workout completions" ON workout_completions;

CREATE POLICY "Users can view own workout completions"
  ON workout_completions FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own workout completions"
  ON workout_completions FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own workout completions"
  ON workout_completions FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own workout completions"
  ON workout_completions FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Optimize pace_calculations RLS policies
DROP POLICY IF EXISTS "Users can view own pace calculations" ON pace_calculations;
DROP POLICY IF EXISTS "Users can insert own pace calculations" ON pace_calculations;
DROP POLICY IF EXISTS "Users can update own pace calculations" ON pace_calculations;
DROP POLICY IF EXISTS "Users can delete own pace calculations" ON pace_calculations;

CREATE POLICY "Users can view own pace calculations"
  ON pace_calculations FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own pace calculations"
  ON pace_calculations FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own pace calculations"
  ON pace_calculations FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own pace calculations"
  ON pace_calculations FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Optimize plan_shares RLS policies
DROP POLICY IF EXISTS "Users can view own plan shares" ON plan_shares;
DROP POLICY IF EXISTS "Users can create plan shares" ON plan_shares;
DROP POLICY IF EXISTS "Users can update own plan shares" ON plan_shares;
DROP POLICY IF EXISTS "Users can delete own plan shares" ON plan_shares;

CREATE POLICY "Users can view own plan shares"
  ON plan_shares FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = shared_by);

CREATE POLICY "Users can create plan shares"
  ON plan_shares FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = shared_by);

CREATE POLICY "Users can update own plan shares"
  ON plan_shares FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = shared_by)
  WITH CHECK ((select auth.uid()) = shared_by);

CREATE POLICY "Users can delete own plan shares"
  ON plan_shares FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = shared_by);

-- Optimize workout_reminders RLS policies
DROP POLICY IF EXISTS "Users can view own workout reminders" ON workout_reminders;
DROP POLICY IF EXISTS "Users can insert own workout reminders" ON workout_reminders;
DROP POLICY IF EXISTS "Users can update own workout reminders" ON workout_reminders;
DROP POLICY IF EXISTS "Users can delete own workout reminders" ON workout_reminders;

CREATE POLICY "Users can view own workout reminders"
  ON workout_reminders FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own workout reminders"
  ON workout_reminders FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own workout reminders"
  ON workout_reminders FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own workout reminders"
  ON workout_reminders FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);