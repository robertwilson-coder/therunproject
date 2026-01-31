import { useState } from 'react';

interface UsePlanModificationsProps {
  planData: any;
  onUpdatePlan: (updatedPlan: any) => void;
}

export const usePlanModifications = ({ planData, onUpdatePlan }: UsePlanModificationsProps) => {
  const [pendingAction, setPendingAction] = useState<{type: string; data: any} | null>(null);

  const handleMoveWorkout = (weekNumber: number, fromDay: string, toDay: string, activity: string) => {
    const updatedPlan = JSON.parse(JSON.stringify(planData));
    const weekIndex = updatedPlan.plan.findIndex((w: any) => w.week === weekNumber);

    if (weekIndex === -1) return;

    const week = updatedPlan.plan[weekIndex];
    const fromDayData = week.days[fromDay];
    const toDayData = week.days[toDay];

    week.days[toDay] = fromDayData;
    week.days[fromDay] = toDayData;

    onUpdatePlan(updatedPlan);
    setPendingAction(null);
  };

  const handleMakeEasier = (weekNumber: number, dayName: string, activity: string, easeType: 'distance' | 'intensity' | 'rest') => {
    const updatedPlan = JSON.parse(JSON.stringify(planData));
    const weekIndex = updatedPlan.plan.findIndex((w: any) => w.week === weekNumber);

    if (weekIndex === -1) return;

    const week = updatedPlan.plan[weekIndex];
    const dayData = week.days[dayName];

    if (easeType === 'rest') {
      if (typeof dayData === 'string') {
        week.days[dayName] = 'Rest';
      } else {
        week.days[dayName] = { workout: 'Rest', tips: [] };
      }
    } else if (easeType === 'distance') {
      const currentWorkout = typeof dayData === 'string' ? dayData : dayData.workout;
      const distanceMatch = currentWorkout.match(/(\d+(?:\.\d+)?)\s*(km|mi|miles?)/i);

      if (distanceMatch) {
        const currentDistance = parseFloat(distanceMatch[1]);
        const newDistance = (currentDistance * 0.8).toFixed(1);
        const unit = distanceMatch[2];
        const newWorkout = currentWorkout.replace(distanceMatch[0], `${newDistance} ${unit}`);

        if (typeof dayData === 'string') {
          week.days[dayName] = newWorkout;
        } else {
          week.days[dayName] = { ...dayData, workout: newWorkout };
        }
      }
    } else if (easeType === 'intensity') {
      const currentWorkout = typeof dayData === 'string' ? dayData : dayData.workout;
      const distanceMatch = currentWorkout.match(/(\d+(?:\.\d+)?)\s*(km|mi|miles?)/i);

      if (distanceMatch) {
        const distance = distanceMatch[1];
        const unit = distanceMatch[2];
        const newWorkout = `Easy ${distance} ${unit}`;

        if (typeof dayData === 'string') {
          week.days[dayName] = newWorkout;
        } else {
          week.days[dayName] = { ...dayData, workout: newWorkout };
        }
      } else {
        const newWorkout = 'Easy 5 km';
        if (typeof dayData === 'string') {
          week.days[dayName] = newWorkout;
        } else {
          week.days[dayName] = { ...dayData, workout: newWorkout };
        }
      }
    }

    onUpdatePlan(updatedPlan);
    setPendingAction(null);
  };

  return {
    pendingAction,
    setPendingAction,
    handleMoveWorkout,
    handleMakeEasier
  };
};
