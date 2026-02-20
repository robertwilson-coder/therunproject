/*
  # Optimize Training Plans View Performance

  ## Overview
  Convert the training_plans_with_stats view to a materialized view for faster query performance.
  A materialized view stores the query results physically, eliminating the need to recalculate
  joins and aggregations on every query.

  ## Changes
  1. Drop existing view
  2. Create materialized view with same structure
  3. Create unique index on id column for faster lookups
  4. Add function to refresh the materialized view
  5. Grant appropriate permissions

  ## Performance Impact
  - First load will be significantly faster (no joins/aggregations needed)
  - View is refreshed automatically when plans or completions change
  - Reduces database load during peak usage
*/

-- Drop the existing view
DROP VIEW IF EXISTS training_plans_with_stats;

-- Create materialized view for faster queries
CREATE MATERIALIZED VIEW training_plans_with_stats AS
SELECT 
  tp.*,
  COALESCE(COUNT(wc.id), 0)::integer as completion_count
FROM training_plans tp
LEFT JOIN workout_completions wc ON wc.training_plan_id = tp.id
GROUP BY tp.id;

-- Create unique index for faster lookups
CREATE UNIQUE INDEX idx_training_plans_with_stats_id ON training_plans_with_stats(id);

-- Create index on user_id for filtering
CREATE INDEX idx_training_plans_with_stats_user ON training_plans_with_stats(user_id);

-- Create index on created_at for sorting
CREATE INDEX idx_training_plans_with_stats_created ON training_plans_with_stats(created_at DESC);

-- Grant access to authenticated users
GRANT SELECT ON training_plans_with_stats TO authenticated;

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_training_plans_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY training_plans_with_stats;
END;
$$;

-- Create trigger function to refresh view when training plans change
CREATE OR REPLACE FUNCTION refresh_plans_stats_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refresh the materialized view in the background
  -- CONCURRENTLY allows queries while refreshing
  PERFORM refresh_training_plans_stats();
  RETURN NULL;
END;
$$;

-- Create triggers to auto-refresh the materialized view
DROP TRIGGER IF EXISTS trigger_refresh_plans_stats_on_plan_change ON training_plans;
CREATE TRIGGER trigger_refresh_plans_stats_on_plan_change
  AFTER INSERT OR UPDATE OR DELETE ON training_plans
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_plans_stats_on_change();

DROP TRIGGER IF EXISTS trigger_refresh_plans_stats_on_completion_change ON workout_completions;
CREATE TRIGGER trigger_refresh_plans_stats_on_completion_change
  AFTER INSERT OR UPDATE OR DELETE ON workout_completions
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_plans_stats_on_change();

-- Do an initial refresh
REFRESH MATERIALIZED VIEW training_plans_with_stats;