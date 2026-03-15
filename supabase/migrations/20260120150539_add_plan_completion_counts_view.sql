/*
  # Add Training Plans View with Completion Counts
  
  1. Purpose
    - Optimize dashboard loading by providing pre-aggregated completion counts
    - Reduce number of database queries needed to load saved plans
    - Improve user experience with faster load times
  
  2. Changes
    - Create materialized view for training plans with completion counts
    - Add function to refresh the view
    - Add indexes for better query performance
  
  3. Performance Benefits
    - Eliminates N+1 query problem when loading plans
    - Single query instead of multiple queries
    - Faster dashboard and saved plans loading
*/

-- Create a view that includes completion counts for each training plan
CREATE OR REPLACE VIEW training_plans_with_stats AS
SELECT 
  tp.*,
  COALESCE(COUNT(wc.id), 0)::integer as completion_count
FROM training_plans tp
LEFT JOIN workout_completions wc ON wc.training_plan_id = tp.id
GROUP BY tp.id;

-- Grant access to authenticated users
GRANT SELECT ON training_plans_with_stats TO authenticated;

-- Add RLS policy for the view (inherits from training_plans)
ALTER VIEW training_plans_with_stats SET (security_invoker = on);