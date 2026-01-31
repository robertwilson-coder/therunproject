import { useState } from 'react';
import { logger } from '../utils/logger';
import {
  X,
  Settings,
  Trophy,
  Heart,
  Bed,
  Activity,
  Utensils,
  Flag,
  TrendingUp,
  FileDown,
  Moon,
  Sun,
  Link as LinkIcon,
  UserCog
} from 'lucide-react';
import { StreaksAndBadges } from './StreaksAndBadges';
import { HeartRateZoneCalculator } from './HeartRateZoneCalculator';
import { PaceCalculator } from './PaceCalculator';
import { PerformanceAnalytics } from './PerformanceAnalytics';
import { Connectivity } from './Connectivity';
import { ProgressCharts } from './ProgressCharts';
import { NotificationCenter } from './NotificationCenter';
import { AccountDeletion } from './AccountDeletion';
import { useTheme } from '../contexts/ThemeContext';
import { parseLocalDate } from '../utils/dateUtils';
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
  raceDate?: string | null;
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
  trainingPaces,
  raceDate
}: DashboardProps) {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [showStreaks, setShowStreaks] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showHRZones, setShowHRZones] = useState(false);
  const [showPaceCalc, setShowPaceCalc] = useState(false);
  const [showConnectivity, setShowConnectivity] = useState(false);
  const [showProgressCharts, setShowProgressCharts] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
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

      if (!dataToExport) {
        alert('No training plan data available to export.');
        setIsExportingPDF(false);
        return;
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

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

      if (dataToExport.days && dataToExport.days.length > 0) {
        dataToExport.days.forEach((day: any) => {
          if (yPos > pageHeight - 25) {
            pdf.addPage();
            yPos = margin;
          }

          const dateObj = parseLocalDate(day.date);
          const dateStr = dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'numeric' });
          const workout = day.workout || 'Rest';

          pdf.setFont('helvetica', 'bold');
          pdf.text(dateStr, margin, yPos);
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
      } else if (dataToExport.plan && dataToExport.plan.length > 0) {
        let startDate = planStartDate ? parseLocalDate(planStartDate) : new Date();

        if (raceDate && dataToExport.plan.length > 0) {
          const raceDateObj = parseLocalDate(raceDate);
          const totalWeeks = dataToExport.plan.length;
          const daysInPlan = (totalWeeks * 7) - 1;
          const calculatedStartDate = new Date(raceDateObj);
          calculatedStartDate.setDate(raceDateObj.getDate() - daysInPlan);
          startDate = calculatedStartDate;
        }

        const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
      } else {
        alert('No training plan data available to export.');
        setIsExportingPDF(false);
        return;
      }

      const fileName = `training-plan-${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      setIsExportingPDF(false);

    } catch (error: any) {
      logger.error('Error generating PDF:', error);
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
      requiresPlan: true,
    },
    {
      icon: TrendingUp,
      label: 'Progress Charts',
      description: 'Visual progress tracking',
      onClick: planId ? () => setShowProgressCharts(true) : undefined,
      requiresPlan: true,
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
      description: 'Sync your wearable devices',
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
      buttonText: isExportingPDF ? 'Generating PDF...' : 'Export Plan to PDF',
      requiresPlan: true,
    },
    {
      icon: UserCog,
      label: 'Account Settings',
      description: 'Manage your account and preferences',
      onClick: () => setShowAccountSettings(true),
    },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="dashboard-title">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-scale-in shadow-xl">
          <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 sticky top-0 bg-gradient-to-r from-primary-600 to-primary-500 z-10">
            <div className="flex items-center justify-between">
              <h2 id="dashboard-title" className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl" aria-hidden="true">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                Dashboard
              </h2>
              <div className="flex items-center gap-2">
                <div className="text-white/90 hover:text-white transition-all duration-200 hover:bg-white/20 rounded-lg">
                  <NotificationCenter />
                </div>
                <button
                  onClick={toggleDarkMode}
                  className="text-white/90 hover:text-white transition-all duration-200 p-2 hover:bg-white/20 rounded-lg hover:scale-105 active:scale-95"
                  aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDarkMode ? (
                    <Sun className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <Moon className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="text-white/90 hover:text-white transition-all duration-200 p-2 hover:bg-white/20 rounded-lg hover:scale-105 active:scale-95"
                  aria-label="Close dashboard"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-100px)]">
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {menuItems.map((item: any, index) => {
                  const Icon = item.icon;
                  const isDisabled = !item.onClick || item.disabled;
                  return (
                    <button
                      key={index}
                      onClick={item.onClick}
                      disabled={isDisabled}
                      className={`group w-full flex items-center gap-4 p-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-left ${
                        isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 active:scale-[0.98]'
                      } transition-all duration-200`}
                      aria-label={item.buttonText || item.label}
                      aria-describedby={`dashboard-item-desc-${index}`}
                    >
                      <div className={`p-3 rounded-lg flex-shrink-0 ${
                        isDisabled ? 'bg-neutral-200 dark:bg-neutral-700' : 'bg-primary-100 dark:bg-primary-900/30 group-hover:bg-primary-500'
                      } transition-all duration-200`} aria-hidden="true">
                        <Icon className={`w-5 h-5 ${
                          isDisabled ? 'text-neutral-400 dark:text-neutral-600' : 'text-primary-600 dark:text-primary-400 group-hover:text-white'
                        } transition-colors duration-200`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-neutral-900 dark:text-white text-sm">{item.buttonText || item.label}</p>
                          {item.inDevelopment && (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full font-semibold" aria-label="In development">
                              In Dev
                            </span>
                          )}
                        </div>
                        <p id={`dashboard-item-desc-${index}`} className="text-xs text-neutral-600 dark:text-neutral-400">{item.description}</p>
                        {isDisabled && item.requiresPlan && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-600 mt-1 font-medium">Load a plan to use this feature</p>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShowProgressCharts(false)}>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-900 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Progress Charts</h2>
                <button onClick={() => setShowProgressCharts(false)} className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
              <ProgressCharts planId={planId} />
            </div>
          </div>
        </div>
      )}
      {showHRZones && <HeartRateZoneCalculator onClose={() => setShowHRZones(false)} />}
      {showPaceCalc && <PaceCalculator onClose={() => setShowPaceCalc(false)} />}
      {showConnectivity && <Connectivity onClose={() => setShowConnectivity(false)} />}
      {showAccountSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShowAccountSettings(false)}>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-900 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Account Settings</h2>
                <button onClick={() => setShowAccountSettings(false)} className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <AccountDeletion />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
