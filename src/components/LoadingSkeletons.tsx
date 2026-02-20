export function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-neutral-200 dark:bg-neutral-800 h-32 rounded-lg"></div>
    </div>
  );
}

export function TrainingPlanSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-neutral-200 dark:bg-neutral-800 h-12 rounded-lg w-48"></div>

      {[1, 2, 3].map((week) => (
        <div key={week} className="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg p-6">
          <div className="bg-neutral-200 dark:bg-neutral-800 h-8 w-32 rounded mb-4"></div>

          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <div key={day} className="flex items-center gap-4">
                <div className="bg-neutral-200 dark:bg-neutral-800 h-6 w-20 rounded"></div>
                <div className="bg-neutral-200 dark:bg-neutral-800 h-6 flex-1 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SavedPlansSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((plan) => (
        <div key={plan} className="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-2 flex-1">
              <div className="bg-neutral-200 dark:bg-neutral-800 h-7 w-48 rounded"></div>
              <div className="bg-neutral-200 dark:bg-neutral-800 h-5 w-32 rounded"></div>
            </div>
            <div className="bg-neutral-200 dark:bg-neutral-800 h-10 w-24 rounded"></div>
          </div>
          <div className="flex gap-3">
            <div className="bg-neutral-200 dark:bg-neutral-800 h-5 w-24 rounded"></div>
            <div className="bg-neutral-200 dark:bg-neutral-800 h-5 w-32 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((stat) => (
          <div key={stat} className="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg p-6">
            <div className="bg-neutral-200 dark:bg-neutral-800 h-5 w-24 rounded mb-3"></div>
            <div className="bg-neutral-200 dark:bg-neutral-800 h-10 w-20 rounded"></div>
          </div>
        ))}
      </div>

      <div className="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg p-6">
        <div className="bg-neutral-200 dark:bg-neutral-800 h-7 w-48 rounded mb-6"></div>
        <div className="bg-neutral-200 dark:bg-neutral-800 h-64 rounded"></div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div key={item} className="border-2 border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="flex items-center gap-4">
            <div className="bg-neutral-200 dark:bg-neutral-800 h-12 w-12 rounded-md"></div>
            <div className="flex-1 space-y-2">
              <div className="bg-neutral-200 dark:bg-neutral-800 h-5 w-32 rounded"></div>
              <div className="bg-neutral-200 dark:bg-neutral-800 h-4 w-48 rounded"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="bg-neutral-200 dark:bg-neutral-800 h-8 w-48 rounded"></div>
        <div className="flex items-center gap-3">
          <div className="bg-neutral-200 dark:bg-neutral-800 h-10 w-10 rounded-full"></div>
          <div className="bg-neutral-200 dark:bg-neutral-800 h-6 w-40 rounded"></div>
          <div className="bg-neutral-200 dark:bg-neutral-800 h-10 w-10 rounded-full"></div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-2">
        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
          <div key={day} className="bg-neutral-200 dark:bg-neutral-800 h-10 rounded"></div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="bg-neutral-200 dark:bg-neutral-800 h-24 rounded"></div>
        ))}
      </div>
    </div>
  );
}
