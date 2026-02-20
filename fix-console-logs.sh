#!/bin/bash

# Script to remove console.log statements from production code
# This runs in development only via the logger utility

# Files to update (excluding node_modules and supabase/functions for now)
FILES=(
  "src/components/WorkoutNotes.tsx"
  "src/components/FeedbackModal.tsx"
  "src/components/RecoveryTools.tsx"
  "src/components/GarminSettings.tsx"
  "src/components/PaceCalculator.tsx"
  "src/components/ReminderSettings.tsx"
  "src/components/StreaksAndBadges.tsx"
  "src/components/TrainingPlanDisplay.tsx"
  "src/components/PerformanceAnalytics.tsx"
  "src/components/HeartRateZoneCalculator.tsx"
  "src/components/ErrorBoundary.tsx"
  "src/components/SavedPlans.tsx"
  "src/components/Dashboard.tsx"
  "src/contexts/AuthContext.tsx"
  "src/hooks/usePlanManagement.ts"
  "src/utils/offlineStorage.ts"
  "src/utils/streakUpdater.ts"
)

echo "Removing console.log statements from src files..."

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    # Remove standalone console.log statements
    sed -i.bak '/^[[:space:]]*console\.log(/d' "$file"
    # Remove standalone console.error statements
    sed -i.bak '/^[[:space:]]*console\.error(/d' "$file"
    # Remove standalone console.warn statements
    sed -i.bak '/^[[:space:]]*console\.warn(/d' "$file"
    echo "Processed: $file"
  fi
done

# Clean up backup files
rm -f src/**/*.bak

echo "Done!"
