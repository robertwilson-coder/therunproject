import { useState } from 'react';
import {
  X,
  Settings,
  Trophy,
  Heart,
  Bed,
  Activity,
  Droplets,
  Utensils,
  Flag,
  TrendingUp,
  FileDown,
  Moon,
  Sun,
  Link as LinkIcon,
  Layers
} from 'lucide-react';
import { StreaksAndBadges } from './StreaksAndBadges';
import { HeartRateZoneCalculator } from './HeartRateZoneCalculator';
import { PaceCalculator } from './PaceCalculator';
import { PerformanceAnalytics } from './PerformanceAnalytics';
import { Connectivity } from './Connectivity';
import { ProgressCharts } from './ProgressCharts';
import { BulkWorkoutOperations } from './BulkWorkoutOperations';
import { useTheme } from '../contexts/ThemeContext';
import jsPDF from 'jspdf';

interface TrainingPaces {
  easyPace: string;
  longRunPace: string;
  tempoPace: string;
  intervalPace: string;
  racePace: string;
}

interface PlanData {
  plan: any[];
  tips?: string[];
}

interface DashboardProps {
  onClose: () => void;
  onNavigateToRecovery?: () => void;
  onNavigateToNutrition?: () => void;
  onNavigateToRace?: () => void;
  planId?: string | null;
  planData?: PlanData | null;
  fullPlanData?: PlanData | null;
  planStartDate?: string | null;
  trainingPaces?: TrainingPaces | null;
}

export function Dashboard({
  onClose,
  onNavigateToRecovery,
  onNavigateToNutrition,
  onNavigateToRace,
  planId,
  planData,
  fullPlanData,
  planStartDate,
  trainingPaces
}: DashboardProps) {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [showStreaks, setShowStreaks] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showHRZones, setShowHRZones] = useState(false);
  const [showPaceCalc, setShowPaceCalc] = useState(false);
  const [showConnectivity, setShowConnectivity] = useState(false);
  const [showProgressCharts, setShowProgressCharts] = useState(false);
  const [showBulkOps, setShowBulkOps] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const getPaceForWorkout = (workout: string): string | null => {
    if (!trainingPaces) return null;

    const workoutLower = workout.toLowerCase();

    if (workoutLower.includes('easy')) return trainingPaces.easyPace;
    if (workoutLower.includes('long run')) return trainingPaces.longRunPace;
    if (workoutLower.includes('tempo')) return trainingPaces.tempoPace;
    if (workoutLower.includes('interval') || workoutLower.includes('repeat')) return trainingPaces.intervalPace;
    if (workoutLower.includes('race pace')) return trainingPaces.racePace;

    return null;
  };

  const handleExportPDF = () => {
    setIsExportingPDF(true);

    try {
      const dataToExport = fullPlanData || planData;

      if (!dataToExport || !dataToExport.plan || dataToExport.plan.length === 0) {
        alert('No training plan data available to export.');
        setIsExportingPDF(false);
        return;
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const startDate = planStartDate ? new Date(planStartDate) : new Date();
      const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const contentWidth = pageWidth - (2 * margin);
      let yPos = margin;

      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Training Plan', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      dataToExport.plan.forEach((week: any) => {
        if (yPos > pageHeight - 80) {
          pdf.addPage();
          yPos = margin;
        }

        pdf.setFillColor(59, 130, 246);
        pdf.rect(margin, yPos, contentWidth, 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Week ${week.week}`, margin + 5, yPos + 7);
        yPos += 15;

        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');

        dayOrder.forEach((day, idx) => {
          const dayData = week.days[day];
          const workout = typeof dayData === 'string' ? dayData : (dayData?.workout || 'Rest');

          const weekStart = new Date(startDate);
          weekStart.setDate(startDate.getDate() + (week.week - 1) * 7);
          const currentDayDate = new Date(weekStart);
          currentDayDate.setDate(weekStart.getDate() + idx);
          const dateStr = `${currentDayDate.getDate()}/${currentDayDate.getMonth() + 1}`;

          if (yPos > pageHeight - 25) {
            pdf.addPage();
            yPos = margin;
          }

          pdf.setFont('helvetica', 'bold');
          pdf.text(`${day} (${dateStr})`, margin, yPos);
          yPos += 5;

          pdf.setFont('helvetica', 'normal');
          const workoutLines = pdf.splitTextToSize(workout, contentWidth - 10);
          pdf.text(workoutLines, margin + 5, yPos);
          yPos += workoutLines.length * 5;

          const pace = getPaceForWorkout(workout);
          if (pace) {
            pdf.setFont('helvetica', 'italic');
            pdf.setTextColor(59, 130, 246);
            pdf.text(`Target Pace: ${pace}`, margin + 5, yPos);
            pdf.setTextColor(0, 0, 0);
            yPos += 5;
          }

          yPos += 3;
        });

        yPos += 5;
      });

      const fileName = `training-plan-${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      setIsExportingPDF(false);

    } catch (error: any) {
      console.error('Error generating PDF:', error);
      alert(`Failed to generate PDF: ${error?.message || 'Unknown error'}`);
      setIsExportingPDF(false);
    }
  };

  const menuItems = [
    {
      icon: Trophy,
      label: 'Streaks & Badges',
      description: 'View your achievements',
      onClick: () => setShowStreaks(true),
    },
    {
      icon: TrendingUp,
      label: 'Performance Analytics',
      description: 'Track your progress',
      onClick: planId ? () => setShowAnalytics(true) : undefined,
    },
    {
      icon: TrendingUp,
      label: 'Progress Charts',
      description: 'Visual progress tracking',
      onClick: planId ? () => setShowProgressCharts(true) : undefined,
    },
    {
      icon: Layers,
      label: 'Bulk Workout Operations',
      description: 'Manage multiple workouts',
      onClick: (planId && planData) ? () => setShowBulkOps(true) : undefined,
    },
    {
      icon: Heart,
      label: 'Heart Rate Zones',
      description: 'Calculate training zones',
      onClick: () => setShowHRZones(true),
    },
    {
      icon: Activity,
      label: 'Pace Calculator',
      description: 'Calculate race paces',
      onClick: () => setShowPaceCalc(true),
    },
    {
      icon: LinkIcon,
      label: 'Connectivity',
      description: 'Connect to Garmin',
      onClick: () => setShowConnectivity(true),
    },
    {
      icon: Bed,
      label: 'Recovery Tools',
      description: 'Track sleep, HR, injuries',
      onClick: onNavigateToRecovery,
    },
    {
      icon: Utensils,
      label: 'Nutrition Strategy Lab',
      description: 'Experiment with fueling strategies',
      onClick: onNavigateToNutrition,
    },
    {
      icon: Flag,
      label: 'Race Day Planning',
      description: 'Set goals and pacing strategy',
      onClick: onNavigateToRace,
    },
    {
      icon: FileDown,
      label: 'Export Plan to PDF',
      description: 'Download your training plan',
      onClick: (planData || fullPlanData) ? handleExportPDF : undefined,
      disabled: isExportingPDF,
      buttonText: isExportingPDF ? 'Generating PDF...' : 'Export Plan to PDF'
    },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/70 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
        <div className="bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden animate-scale-in">
          <div className="p-6 border-b-2 border-blue-600 dark:border-blue-500 sticky top-0 bg-gradient-to-r from-blue-600 to-blue-500 backdrop-blur-sm z-10">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-white flex items-center gap-3">
                <div className="p-2 bg-white rounded-md">
                  <Settings className="w-5 h-5 text-blue-600" />
                </div>
                Dashboard
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleDarkMode}
                  className="text-white hover:text-blue-100 transition-colors p-2 hover:bg-white/10 rounded-md group"
                  title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDarkMode ? (
                    <Sun className="w-6 h-6" />
                  ) : (
                    <Moon className="w-6 h-6" />
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="text-white hover:text-blue-100 transition-colors p-2 hover:bg-white/10 rounded-md"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-8 overflow-y-auto max-h-[calc(90vh-88px)]">
            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold text-neutral-900 dark:text-white">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {menuItems.map((item: any, index) => {
                  const Icon = item.icon;
                  const isDisabled = !item.onClick || item.disabled;
                  return (
                    <button
                      key={index}
                      onClick={item.onClick}
                      disabled={isDisabled}
                      className={`flex items-center gap-4 p-4 card text-left group ${
                        isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-500 active:scale-[0.98]'
                      } transition-all`}
                    >
                      <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-md flex-shrink-0 group-hover:bg-primary-500 transition-colors">
                        <Icon className="w-5 h-5 text-neutral-600 dark:text-neutral-400 group-hover:text-white transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-neutral-900 dark:text-white">{item.buttonText || item.label}</p>
                          {item.inDevelopment && (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full font-medium">
                              In Development
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 dark:text-neutral-500">{item.description}</p>
                        {!item.onClick && !item.disabled && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-600 mt-1">Coming soon</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </div>

      {showStreaks && <StreaksAndBadges onClose={() => setShowStreaks(false)} planId={planId} />}
      {showAnalytics && planId && <PerformanceAnalytics planId={planId} onClose={() => setShowAnalytics(false)} />}
      {showProgressCharts && planId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShowProgressCharts(false)}>
          <div className="bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-neutral-200 dark:border-neutral-800 sticky top-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Progress Charts</h2>
                <button onClick={() => setShowProgressCharts(false)} className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md" aria-label="Close">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-88px)]">
              <ProgressCharts planId={planId} />
            </div>
          </div>
        </div>
      )}
      {showBulkOps && planId && planData && (
        <BulkWorkoutOperations
          planId={planId}
          planData={planData}
          onSuccess={() => {
            setShowBulkOps(false);
          }}
          onClose={() => setShowBulkOps(false)}
        />
      )}
      {showHRZones && <HeartRateZoneCalculator onClose={() => setShowHRZones(false)} />}
      {showPaceCalc && <PaceCalculator onClose={() => setShowPaceCalc(false)} />}
      {showConnectivity && <Connectivity onClose={() => setShowConnectivity(false)} />}
    </>
  );
}
