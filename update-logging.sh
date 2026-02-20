#!/bin/bash

# Batch update console.log/error/warn to use logger utility

FILES=(
  "src/utils/streakUpdater.ts"
  "src/utils/offlineStorage.ts"
  "src/components/Dashboard.tsx"
  "src/components/SavedPlans.tsx"
  "src/components/RecoveryTools.tsx"
  "src/components/GarminSettings.tsx"
  "src/components/PaceCalculator.tsx"
  "src/components/ReminderSettings.tsx"
  "src/components/StreaksAndBadges.tsx"
  "src/components/TrainingPlanDisplay.tsx"
  "src/components/PerformanceAnalytics.tsx"
  "src/components/HeartRateZoneCalculator.tsx"
  "src/components/ErrorBoundary.tsx"
  "src/contexts/AuthContext.tsx"
  "src/hooks/usePlanManagement.ts"
)

echo "Updating console statements to use logger..."

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    # Replace console.error with logger.error
    sed -i.bak "s/console\.error(/logger.error(/g" "$file"

    # Replace console.log with logger.info (commented out for now)
    sed -i.bak "s/console\.log(/logger.info(/g" "$file"

    # Replace console.warn with logger.warn
    sed -i.bak "s/console\.warn(/logger.warn(/g" "$file"

    echo "✓ Updated: $file"
  fi
done

# Clean up backup files
find src -name "*.bak" -delete

echo "Done!"
