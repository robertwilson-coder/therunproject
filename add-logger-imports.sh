#!/bin/bash

# Add logger import to files that need it

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

echo "Adding logger imports..."

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    # Check if logger is already imported
    if ! grep -q "import.*logger.*from.*utils/logger" "$file"; then
      # Find the first import line and add logger import after it
      sed -i "1a import { logger } from '../utils/logger';" "$file"
      echo "✓ Added import to: $file"
    else
      echo "○ Already has import: $file"
    fi
  fi
done

echo "Done!"
