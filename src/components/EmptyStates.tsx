import { FileQuestion, PlusCircle, Calendar, TrendingUp } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-6 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-full">
        {icon || <FileQuestion className="w-12 h-12 text-neutral-400 dark:text-neutral-600" />}
      </div>
      <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-neutral-600 dark:text-neutral-400 max-w-md mb-6">
        {description}
      </p>
      {action && (
        <button onClick={action.onClick} className="btn-primary">
          {action.label}
        </button>
      )}
    </div>
  );
}

export function NoPlansEmptyState({ onCreatePlan }: { onCreatePlan: () => void }) {
  return (
    <EmptyState
      icon={<PlusCircle className="w-12 h-12 text-primary-500" />}
      title="No Training Plans Yet"
      description="Start your running journey by creating your first personalized training plan. Answer a few questions and we'll build a plan tailored to your goals and fitness level."
      action={{
        label: 'Create Your First Plan',
        onClick: onCreatePlan
      }}
    />
  );
}

export function NoWorkoutsEmptyState() {
  return (
    <EmptyState
      icon={<Calendar className="w-12 h-12 text-primary-500" />}
      title="No Workouts Completed Yet"
      description="Complete your first workout to start tracking your progress. Check off workouts as you complete them to build your training history and unlock badges."
    />
  );
}

export function NoAnalyticsEmptyState() {
  return (
    <EmptyState
      icon={<TrendingUp className="w-12 h-12 text-primary-500" />}
      title="Not Enough Data Yet"
      description="Complete more workouts to see your performance analytics. We'll show you insights about your pace, distance, and consistency once you have more training data."
    />
  );
}
