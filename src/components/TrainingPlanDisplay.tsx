import { Calendar, Clock, Zap, Activity, ChevronDown, BookOpen, Save, Target, Check, List, Printer, TrendingUp, Share2, X, ChevronLeft, ChevronRight, ArrowRight, TrendingDown, Repeat, Undo } from 'lucide-react';
import { PlanData } from '../lib/supabase';
import { parseWorkoutDescription } from '../utils/workoutParser';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CalendarView } from './CalendarView';
import { PerformanceAnalytics } from './PerformanceAnalytics';
import { SharePlan } from './SharePlan';
import { PaceCalculator } from './PaceCalculator';
import jsPDF from 'jspdf';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TrainingPaces {
  easyPace: string;
  longRunPace: string;
  tempoPace: string;
  intervalPace: string;
  racePace: string;
}

interface TrainingPlanDisplayProps {
  planData: PlanData;
  onNewPlan: () => void;
  planType: 'static' | 'responsive';
  chatHistory: ChatMessage[];
  onChatUpdate: (history: ChatMessage[]) => void;
  onUpdatePlan: (updatedPlan: any) => void;
  answers: any;
  fullPlanData?: PlanData | null;
  onSaveFullPlan?: () => void;
  savedPlanId?: string | null;
  planStartDate?: string;
  initialTrainingPaces?: TrainingPaces | null;
  onWeekChange?: (weekNumber: number) => void;
  onCompletedWorkoutsChange?: (completedWorkouts: Set<string>) => void;
  onUndo?: () => void;
  onTriggerChat?: (message: string) => void;
}

const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const getTodayInfo = (planStartDate?: string) => {
  const now = new Date();
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let weekNumber = 0;
  let dayIndex = now.getDay() - 1;
  if (dayIndex < 0) dayIndex = 6;

  if (planStartDate) {
    const startDate = new Date(planStartDate);
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find which day of the week the plan started (0 = Mon, 6 = Sun)
    const startDayOfWeek = startDate.getDay();
    const startDayIndex = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Convert to Mon=0, Sun=6

    // Find the Monday of the week the plan started
    const daysToMonday = startDayIndex; // Days since Monday
    const planWeekStart = new Date(startDate);
    planWeekStart.setDate(startDate.getDate() - daysToMonday);
    planWeekStart.setHours(0, 0, 0, 0);

    // Find the Monday of the current week
    const todayDayOfWeek = today.getDay();
    const todayDayIndex = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - todayDayIndex);
    currentWeekStart.setHours(0, 0, 0, 0);

    // Calculate week number based on Monday-to-Monday weeks
    const weeksDiff = Math.floor((currentWeekStart.getTime() - planWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    weekNumber = weeksDiff >= 0 ? weeksDiff : 0;
  }

  return {
    dayName: days[dayIndex],
    date: now.toISOString().split('T')[0],
    weekNumber: weekNumber
  };
};

const getCoachingNotes = (activity: string, isBeginnerPlan: boolean): string[] => {
  const activityLower = activity.toLowerCase();

  if (activityLower.includes('rest')) {
    return [
      'Complete rest is essential for adaptation - this is when your body actually gets stronger. Training breaks down muscle fibers; rest rebuilds them stronger.',
      'Light stretching, foam rolling, or walking (under 20 minutes) is fine if you feel restless, but avoid any cardiovascular stress.',
      'Prioritize 8+ hours of quality sleep. Consider going to bed 30-60 minutes earlier than usual. Sleep is when growth hormone peaks and muscle repair happens.',
      'Focus on anti-inflammatory nutrition: lean proteins for muscle repair, colorful vegetables for antioxidants, and omega-3 rich foods like salmon or walnuts.',
      'Mental recovery is just as important as physical. Use this day to visualize your goals, review your progress, and reconnect with why you\'re training.',
      'If you feel overly fatigued or notice persistent soreness, this may indicate you need additional rest. Don\'t hesitate to convert an easy run day to rest.'
    ];
  }

  if (activityLower.includes('active recovery')) {
    return [
      isBeginnerPlan ? 'Effort: Not applicable - This is non-running cross-training activity.' : 'RPE: Not applicable - This is non-running cross-training activity.',
      'Choose light activities that promote blood flow without cardiovascular stress: 20-30 minute walk, gentle yoga, or run-specific strength exercises (single-leg squats, calf raises, planks).',
      'This is NOT a running day. The goal is active movement that aids recovery without adding training stress. Keep intensity very low.',
      'Yoga focused on hip mobility, hamstring flexibility, and core strength is excellent. Avoid intense power or hot yoga - keep it gentle and restorative.',
      'Run-focused strength: bodyweight exercises like lunges, glute bridges, side planks, and leg swings. Keep reps moderate (2-3 sets of 10-15) without going to failure.',
      'A 20-30 minute walk promotes circulation and mental refreshment. This is recovery, not exercise - enjoy the movement without pressure or targets.'
    ];
  }

  if (activityLower.includes('interval')) {
    return [
      isBeginnerPlan ? 'Effort: 7-9/10 - Hard to very hard effort where you can only speak a few words at most. This is high-intensity work that challenges your limits.' : 'RPE 7-9: Hard to very hard effort where you can only speak a few words at most. This is high-intensity work that challenges your limits.',
      'Key speed session - warm up thoroughly for 15-20 minutes easy running. Your muscles need to be fully warm for high-intensity efforts to prevent injury and perform optimally.',
      'Include 4-6 strides (20-30 second accelerations to near-top speed) or dynamic drills before starting intervals. This primes your neuromuscular system for speed work.',
      'Recovery jogs between intervals should be truly easy - don\'t rush them. Walk if needed. The work interval is where you gain fitness; recovery allows you to complete the workout properly.',
      'Form breaks down when tired - stay focused on technique. Maintain upright posture, relaxed shoulders, quick cadence (170-180 steps/min), and avoid overstriding.',
      'Cool down with 10-15 minutes easy running. Never end a hard workout abruptly - gradual cool-down aids recovery and reduces injury risk.',
      'These sessions build VO2 max (maximal oxygen uptake) and running economy (efficiency). They teach your body to process oxygen better and run faster with less effort.',
      'Hit target pace/effort for work intervals, but don\'t exceed it significantly. Running too hard compromises later intervals and extends recovery time needed.',
      'If you can\'t maintain target pace for the prescribed intervals, shorten the intervals or extend recovery time. Quality over quantity - better to nail fewer intervals than barely complete too many.'
    ];
  }

  if (activityLower.includes('hill')) {
    return [
      isBeginnerPlan ? 'Effort: 8-9/10 - Very hard effort where speaking is nearly impossible. You should feel like you are working close to your maximum capacity.' : 'RPE 8-9: Very hard effort where speaking is nearly impossible. You should feel like you are working close to your maximum capacity.',
      'Excellent strength and power workout with lower impact than flat speed work. Hills build leg strength, improve running economy, and develop the power needed for faster running.',
      'Focus on driving knees up and maintaining good posture. Lean slightly forward from the ankles (not the waist), keep chest up, and pump arms vigorously in rhythm with legs.',
      'Jog or walk down slowly - recovery is crucial. Never run hard downhill during hill repeats; the eccentric muscle damage increases injury risk and compromises subsequent intervals.',
      'Don\'t lean forward excessively from the waist - stay tall with core engaged. Think "run up the hill" not "push into the hill."',
      'These build leg strength (particularly glutes, hamstrings, calves) and improve running form. The strength gains translate to power and speed on flat terrain.',
      isBeginnerPlan ? 'Effort, not pace, is the key metric. Hills naturally slow pace; focus on maintaining strong, controlled effort at your target effort level.' : 'Effort, not pace, is the key metric. Hills naturally slow pace; focus on maintaining strong, controlled effort at your target RPE.',
      'Hill grade matters: 4-6% gradient is ideal for most hill repeats. Steeper hills (8-10%) develop more power but require more recovery. Find a consistent grade for best training effect.',
      'Duration guide: 60-90 second hills for strength-endurance, 30-45 second hills for power, 10-20 second explosive hill sprints for pure power. Match duration to your training phase and goals.'
    ];
  }

  if (activityLower.includes('fartlek')) {
    return [
      isBeginnerPlan ? 'Effort: 7-8/10 (during hard efforts) - Hard effort where you can speak only a few words. The variable nature means you alternate between this and easy recovery.' : 'RPE 7-8 (during hard efforts): Hard effort where you can speak only a few words. The variable nature means you alternate between this and easy recovery.',
      'Swedish for "speed play" - structured variability that bridges the gap between tempo runs and traditional intervals. Excellent for developing speed endurance in a less rigid format.',
      'Hard efforts should feel challenging but controlled - typically between tempo and 5K race effort. The beauty of fartlek is flexibility; adjust effort based on how you feel.',
      'Easy portions are true recovery - slow down fully between hard efforts. This isn\'t a tempo run; the contrasts between hard and easy are what create the training stimulus.',
      'Great for building speed endurance and mental toughness in a less structured format than track intervals. The variable pace teaches your body to respond to surges, mimicking race dynamics.',
      'Stay relaxed during hard efforts - avoid tension in shoulders, hands, and jaw. Tension wastes energy and impairs running efficiency.',
      'Terrain variation adds extra benefit: use hills, trails, or roads to make efforts more dynamic and engaging than repetitive track work.',
      'Example structure: 10min easy warm-up, then alternate 3min hard/2min easy for 6-8 cycles, 10min easy cool-down. Adjust durations based on fitness and goals.',
      'Fartlek sessions are excellent midweek when you want quality work without the intensity of a full interval session. They\'re also ideal for building confidence in pace changes during races.'
    ];
  }

  if (activityLower.includes('tempo')) {
    return [
      isBeginnerPlan ? 'Effort: 6-7/10 - Comfortably hard effort where you can only speak 3-4 word phrases with effort. This feels challenging but controlled.' : 'RPE 6-7: Comfortably hard effort where you can only speak 3-4 word phrases with effort. This feels challenging but controlled.',
      'This corresponds to your lactate threshold pace - the fastest pace you can sustain aerobically for an extended period.',
      'Warm up well: 10-15 minutes easy running, followed by 4-6 dynamic stretches and 2-3 strides before starting the tempo portion. A proper warm-up makes the workout feel significantly easier.',
      'This teaches your body to clear lactate efficiently and improves your ability to sustain faster paces. It\'s one of the most effective workouts for race performance improvement.',
      'Focus on maintaining steady effort, not chasing pace. Tempo pace will vary with weather, terrain, and fatigue. Use perceived effort and breathing as your primary guides.',
      'Cool down with 10 minutes of easy jogging. This helps clear lactate and reduces post-workout soreness.',
      'Typical tempo durations: 20 minutes for beginners, 30-40 minutes for intermediate, 45-60 minutes for advanced. Break longer tempos into segments (e.g., 2x20min) if needed.',
      'Breathing should be rhythmic and controlled, typically in a 2-2 pattern (two steps inhale, two steps exhale). If breathing becomes ragged, you\'re going too hard.'
    ];
  }

  if (activityLower.includes('progressive')) {
    return [
      isBeginnerPlan ? 'Effort: 3-6/10 - Starts at easy conversational pace (Effort 3/10) and gradually builds to comfortably hard (Effort 6/10) by the end. Progressive difficulty.' : 'RPE 3-6: Starts at easy conversational pace (RPE 3) and gradually builds to comfortably hard (RPE 6) by the end. Progressive difficulty.',
      'Start easy and gradually increase pace throughout the run. This teaches pace discipline, mental control, and the ability to finish strong when fatigued - critical race skills.',
      'First third should feel very comfortable and conversational (Zone 2, easy effort). Resist the urge to speed up early. Starting controlled is the key to successful progression.',
      'Middle third at moderate effort (Zone 3, steady/tempo pace). You should still feel controlled but working. Breathing becomes more noticeable but remains rhythmic.',
      'Final third approaching tempo effort (Zone 4) - finish strong but controlled. This simulates finishing a race on tired legs and develops the mental toughness to push when fatigued.',
      'Teaches pace judgment and builds mental toughness. You learn what sustainable pace feels like and develop confidence in your ability to accelerate when tired.',
      'Progressive runs develop negative-split racing ability (running the second half faster than the first) - the hallmark of smart, efficient racing strategy.',
      'Example pace progression: if easy pace is 6:00/km, start at 6:15/km, progress to 5:45/km in middle, finish at 5:15-5:30/km. Exact paces depend on fitness and distance.',
      'These sessions provide moderate training stress while building both aerobic fitness and pace control. They\'re excellent when you want quality work without the recovery cost of intervals.'
    ];
  }

  if (activityLower.includes('long run')) {
    return [
      isBeginnerPlan ? 'Effort: 4-5/10 - Comfortable pace where you can speak in short phrases. Slightly harder than easy runs but still sustainable for extended periods.' : 'RPE 4-5: Comfortable pace where you can speak in short phrases. Slightly harder than easy runs but still sustainable for extended periods.',
      'Your key endurance building session of the week. Long runs develop aerobic capacity, fat-burning efficiency, mental resilience, and musculoskeletal durability for race day.',
      'Start conservatively - the first 2-3km should feel very easy, even boringly slow. Your pace should gradually settle into a comfortable rhythm. Most people start too fast and struggle later.',
      'Practice your race day nutrition and hydration strategy. For runs over 90 minutes, consume 30-60g carbohydrates per hour. Test different products now so you know what works before race day.',
      'Mental toughness matters here. Break the run into segments, use positive self-talk, and stay present. The final kilometers when fatigue sets in teach you to push through race-day discomfort.',
      'Take extra rest the day before (easy run or rest) and after this session (rest or recovery run). Long runs create significant fatigue and require proper recovery.',
      'For advanced runners: consider finishing some long runs at goal marathon pace for the final 3-5km to practice running on tired legs. But keep most long runs at comfortable pace.',
      'Pay attention to nutrition timing: eat a carbohydrate-rich meal 2-3 hours before, and refuel with protein and carbs within 30-60 minutes after finishing to optimize recovery.'
    ];
  }

  if (activityLower.includes('recovery')) {
    return [
      isBeginnerPlan ? 'Effort: 2-3/10 - Very easy effort where you can hold a full conversation without any breathlessness. This should feel almost effortless.' : 'RPE 2-3: Very easy effort where you can hold a full conversation without any breathlessness. This should feel almost effortless.',
      'Run very easy - if in doubt, slow down further. Heart rate should stay in Zone 1-2 (typically 60-70% max HR)',
      'Focus on form and relaxation, not pace or distance. Think "light feet, relaxed shoulders, smooth breathing." This is active recovery, not training stress.',
      'These runs promote blood flow to fatigued muscles, helping flush out metabolic waste products and deliver nutrients for repair. They\'re proven to speed recovery more than complete rest.',
      'Keep duration moderate: 20-40 minutes is typically sufficient. Going too long defeats the recovery purpose.',
      'If you feel fatigued, have elevated resting heart rate, or poor sleep, it\'s perfectly fine to walk instead or skip this session entirely. Smart training means knowing when to back off.',
      'Recovery runs are excellent for practicing efficient form habits and mental relaxation techniques without the pressure of pace goals.'
    ];
  }

  if (activityLower.includes('easy')) {
    return [
      isBeginnerPlan ? 'Effort: 2-3/10 - Maintain a conversational pace where you can speak in full sentences comfortably. This should feel relaxed and sustainable.' : 'RPE 2-3: Maintain a conversational pace where you can speak in full sentences comfortably. This should feel relaxed and sustainable.',
      'This typically corresponds to Zone 2 heart rate (70-80% max HR). Most runners run these too fast - if in doubt, slow down.',
      'Build aerobic base without accumulating fatigue. These runs develop your aerobic engine (mitochondria density, capillary networks) which forms the foundation for all endurance performance.',
      'Don\'t worry about pace - weather, terrain, fatigue, and daily variables all affect pace. Focus on consistent effort and time on feet. Pace will naturally improve as fitness builds.',
      'Warm up gradually: start the first 5-10 minutes even easier than your target easy pace. Finish feeling like you could comfortably do more - that\'s the sweet spot.',
      'Easy runs should comprise 70-80% of your total weekly mileage. They\'re not "junk miles" - they\'re the foundation that allows you to absorb and benefit from harder training.',
      'If you ran hard yesterday or have a hard session tomorrow, err on the side of running even easier today. Recovery between hard sessions is where fitness improvements actually occur.'
    ];
  }

  return [
    'Focus on proper warm-up (10-15 minutes easy) and cool-down (10 minutes easy). Never skip these - they prepare your body for work and facilitate recovery.',
    'Listen to your body - adjust if needed. Training plans are guides, not rigid mandates. If you\'re overly fatigued, dealing with illness, or feeling unusual pain, be smart and modify the session.',
    'Stay hydrated: drink to thirst before, during (for sessions over 60 minutes), and after. Urine should be pale yellow. Dark urine indicates dehydration.',
    'Proper recovery includes nutrition (protein and carbs within 60 minutes post-workout), quality sleep (7-9 hours), and active recovery strategies (stretching, foam rolling, massage).',
    'Pay attention to warning signs: persistent soreness, elevated resting heart rate, poor sleep quality, or decreased motivation may indicate overtraining. Back off before minor issues become major problems.'
  ];
};

const convertRPEtoEffort = (text: string, isBeginnerPlan: boolean, weekNumber?: number): string => {
  if (isBeginnerPlan) {
    // For beginner plans, convert RPE to Effort format
    return text
      .replace(/\bat RPE (\d+(?:-\d+)?)\b/gi, 'at Effort: $1/10')
      .replace(/\bRPE (\d+(?:-\d+)?)\b/gi, 'Effort: $1/10');
  }

  // For intermediate/advanced plans, show full explanation in first 2 weeks
  if (weekNumber && weekNumber <= 2) {
    return text
      .replace(/\bat RPE (\d+(?:-\d+)?)\b/gi, 'at Rate of Perceived Exertion (RPE) $1')
      .replace(/\bRPE (\d+(?:-\d+)?)\b/gi, 'Rate of Perceived Exertion (RPE) $1');
  }

  // After week 2, keep it as is
  return text;
};

export function TrainingPlanDisplay({
  planData,
  onNewPlan,
  planType,
  chatHistory,
  onChatUpdate,
  onUpdatePlan,
  answers,
  fullPlanData,
  onSaveFullPlan,
  savedPlanId: initialSavedPlanId,
  planStartDate: initialPlanStartDate,
  initialTrainingPaces,
  onWeekChange,
  onCompletedWorkoutsChange,
  onUndo,
  onTriggerChat
}: TrainingPlanDisplayProps) {
  const { user } = useAuth();
  const isBeginnerPlan = answers?.experience?.toLowerCase() === 'beginner';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [planStartDate] = useState<string>(initialPlanStartDate || tomorrow.toISOString().split('T')[0]);
  const today = getTodayInfo(planStartDate);
  const initialWeekIndex = today.weekNumber >= 0 && today.weekNumber < planData.plan.length ? today.weekNumber : 0;
  const [currentWeekIndex, setCurrentWeekIndex] = useState(initialWeekIndex);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [completedWorkouts, setCompletedWorkouts] = useState<Set<string>>(new Set());
  const [savedPlanId, setSavedPlanId] = useState<string | null>(initialSavedPlanId || null);
  const [viewMode, setViewMode] = useState<'week' | 'calendar'>('week');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [workoutToRate, setWorkoutToRate] = useState<{week: number, day: string, activity: string} | null>(null);
  const [rating, setRating] = useState(0);
  const [showPaceCalculator, setShowPaceCalculator] = useState(false);
  const [trainingPaces, setTrainingPaces] = useState<TrainingPaces | null>(initialTrainingPaces || null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingAction, setPendingAction] = useState<{type: string; data: any} | null>(null);
  const [previousPlanState, setPreviousPlanState] = useState<any>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const handleMoveWorkout = (weekNumber: number, fromDay: string, toDay: string, activity: string) => {
    const updatedPlan = JSON.parse(JSON.stringify(planData));
    const weekIndex = updatedPlan.plan.findIndex((w: any) => w.week === weekNumber);

    if (weekIndex === -1) return;

    const week = updatedPlan.plan[weekIndex];
    const fromDayData = week.days[fromDay];
    const toDayData = week.days[toDay];

    // Swap the workouts
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
        // If no distance found, just make it a generic easy run
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

  const getPaceForWorkout = (activity: string): string | null => {
    if (!trainingPaces) return null;

    const activityLower = activity.toLowerCase();
    if (activityLower.includes('easy') || activityLower.includes('recovery')) {
      return trainingPaces.easyPace;
    }
    if (activityLower.includes('long')) {
      return trainingPaces.longRunPace;
    }
    if (activityLower.includes('tempo')) {
      return trainingPaces.tempoPace;
    }
    if (activityLower.includes('interval') || activityLower.includes('fartlek') || activityLower.includes('hill')) {
      return trainingPaces.intervalPace;
    }
    if (activityLower.includes('race')) {
      return trainingPaces.racePace;
    }
    return null;
  };

  const handlePrintPlan = () => {
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

      // Title
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Training Plan', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      dataToExport.plan.forEach((week: any) => {
        // Check if we need a new page
        if (yPos > pageHeight - 80) {
          pdf.addPage();
          yPos = margin;
        }

        // Week header
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

          // Check if we need a new page
          if (yPos > pageHeight - 25) {
            pdf.addPage();
            yPos = margin;
          }

          // Day header
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${day} (${dateStr})`, margin, yPos);
          yPos += 5;

          // Workout
          pdf.setFont('helvetica', 'normal');
          const workoutLines = pdf.splitTextToSize(workout, contentWidth - 10);
          pdf.text(workoutLines, margin + 5, yPos);
          yPos += workoutLines.length * 5;

          // Pace if available
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

  const isPreviewMode = fullPlanData && fullPlanData.plan.length > planData.plan.length;

  useEffect(() => {
    if (initialSavedPlanId !== savedPlanId) {
      setSavedPlanId(initialSavedPlanId || null);
    }
  }, [initialSavedPlanId]);

  useEffect(() => {
    if (user && savedPlanId) {
      loadWorkoutCompletions();
    }
  }, [user, savedPlanId]);

  useEffect(() => {
    if (savedPlanId && (chatHistory.length > 0 || trainingPaces)) {
      setHasUnsavedChanges(true);
    }
  }, [planData, chatHistory, trainingPaces]);

  const loadWorkoutCompletions = async () => {
    if (!user || !savedPlanId) return;

    try {
      const { data, error } = await supabase
        .from('workout_completions')
        .select('week_number, day_name')
        .eq('training_plan_id', savedPlanId);

      if (error) throw error;

      const completed = new Set(data.map(w => `${w.week_number}-${w.day_name}`));
      setCompletedWorkouts(completed);
      if (onCompletedWorkoutsChange) {
        onCompletedWorkoutsChange(completed);
      }
    } catch (error) {
      console.error('Error loading completions:', error);
    }
  };

  const toggleWorkoutCompletion = async (weekNumber: number, dayName: string, activity: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !savedPlanId) return;

    const key = `${weekNumber}-${dayName}`;
    const isCompleted = completedWorkouts.has(key);

    try {
      if (isCompleted) {
        const { error } = await supabase
          .from('workout_completions')
          .delete()
          .eq('training_plan_id', savedPlanId)
          .eq('week_number', weekNumber)
          .eq('day_name', dayName);

        if (error) throw error;

        const newCompleted = new Set(completedWorkouts);
        newCompleted.delete(key);
        setCompletedWorkouts(newCompleted);
        if (onCompletedWorkoutsChange) {
          onCompletedWorkoutsChange(newCompleted);
        }
      } else {
        console.log('Setting workout to rate:', { weekNumber, dayName, activity });
        setWorkoutToRate({ week: weekNumber, day: dayName, activity });
        setRating(0);
      }
    } catch (error) {
      console.error('Error toggling completion:', error);
    }
  };

  const submitWorkoutCompletion = async (workoutRating: number) => {
    if (!user || !savedPlanId || !workoutToRate || workoutRating === 0) return;

    try {
      const parsed = parseWorkoutDescription(workoutToRate.activity);

      const { error } = await supabase
        .from('workout_completions')
        .insert({
          user_id: user.id,
          training_plan_id: savedPlanId,
          week_number: workoutToRate.week,
          day_name: workoutToRate.day,
          rating: workoutRating,
          distance_miles: parsed.distanceMiles > 0 ? parsed.distanceMiles : null,
          duration_minutes: parsed.durationMinutes > 0 ? parsed.durationMinutes : null,
        });

      if (error) throw error;

      const key = `${workoutToRate.week}-${workoutToRate.day}`;
      const newCompleted = new Set(completedWorkouts);
      newCompleted.add(key);
      setCompletedWorkouts(newCompleted);
      if (onCompletedWorkoutsChange) {
        onCompletedWorkoutsChange(newCompleted);
      }
      setWorkoutToRate(null);
      setRating(0);
    } catch (error) {
      console.error('Error submitting completion:', error);
    }
  };

  const handleSavePlan = async () => {
    if (!user) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const { data, error } = await supabase.from('training_plans').insert({
        user_id: user.id,
        answers,
        plan_data: fullPlanData || planData,
        plan_type: planType,
        chat_history: chatHistory,
      }).select();

      if (error) throw error;

      if (data && data[0]?.id) {
        setSavedPlanId(data[0].id);
      }

      setSaveMessage('Plan saved successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage('Failed to save plan');
      console.error('Error saving plan:', error);
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!user || !savedPlanId) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const { error } = await supabase
        .from('training_plans')
        .update({
          plan_data: planData,
          chat_history: chatHistory,
          training_paces: trainingPaces,
        })
        .eq('id', savedPlanId);

      if (error) throw error;

      setHasUnsavedChanges(false);
      setSaveMessage('Changes saved successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage('Failed to save changes');
      console.error('Error saving changes:', error);
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const getDayColor = (activity: string, isCurrentDay: boolean) => {
    const activityLower = activity.toLowerCase();
    let baseColor = 'bg-white border-gray-200 text-gray-900';

    if (activityLower.includes('interval') || activityLower.includes('tempo') || activityLower.includes('hill')) {
      baseColor = 'bg-red-50 border-red-200 text-gray-900';
    } else if (activityLower.includes('long')) {
      baseColor = 'bg-orange-50 border-orange-200 text-gray-900';
    } else if (!activityLower.includes('rest')) {
      baseColor = 'bg-blue-50 border-blue-200 text-gray-900';
    }

    if (isCurrentDay) {
      return baseColor + ' ring-2 ring-blue-500';
    }
    return baseColor;
  };

  const getEffortLevel = (activity: string, isBeginnerPlan: boolean, weekNumber: number): string => {
    const activityLower = activity.toLowerCase();
    if (activityLower.includes('rest')) return '';

    // For intermediate/advanced plans, show full explanation in first 2 weeks
    const showFullRPE = !isBeginnerPlan && weekNumber <= 2;

    if (isBeginnerPlan) {
      if (activityLower.includes('race day')) return 'Effort: 9-10/10';
      if (activityLower.includes('interval') || activityLower.includes('hill')) return 'Effort: 7-9/10';
      if (activityLower.includes('fartlek')) return 'Effort: 7-9/10';
      if (activityLower.includes('tempo')) return 'Effort: 6-7/10';
      if (activityLower.includes('progressive')) return 'Effort: 6-7/10';
      if (activityLower.includes('long run')) return 'Effort: 4-5/10';
      if (activityLower.includes('recovery')) return 'Effort: 2-3/10';
      if (activityLower.includes('easy')) return 'Effort: 2-3/10';
      return 'Effort: 4-5/10';
    } else {
      const prefix = showFullRPE ? 'Rate of Perceived Exertion (RPE) ' : 'RPE ';
      if (activityLower.includes('race day')) return `${prefix}9-10`;
      if (activityLower.includes('interval') || activityLower.includes('hill')) return `${prefix}7-9`;
      if (activityLower.includes('fartlek')) return `${prefix}7-9`;
      if (activityLower.includes('tempo')) return `${prefix}6-7`;
      if (activityLower.includes('progressive')) return `${prefix}6-7`;
      if (activityLower.includes('long run')) return `${prefix}4-5`;
      if (activityLower.includes('recovery')) return `${prefix}2-3`;
      if (activityLower.includes('easy')) return `${prefix}2-3`;
      return `${prefix}4-5`;
    }
  };

  const isDayBeforeStart = (weekIndex: number, dayName: string): boolean => {
    const dayIndex = dayOrder.indexOf(dayName as typeof dayOrder[number]);
    const startDate = new Date(planStartDate);
    const startDayOfWeek = startDate.getDay();
    const startDayIndex = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    if (weekIndex === 0) {
      return dayIndex < startDayIndex;
    }
    return false;
  };

  const currentWeek = planData.plan[currentWeekIndex];
  const canGoBack = currentWeekIndex > 0;
  const canGoForward = currentWeekIndex < planData.plan.length - 1;

  // Debug logging for week data
  useEffect(() => {
    if (currentWeek) {
      console.log('TrainingPlanDisplay - currentWeek:', currentWeek);
      console.log('TrainingPlanDisplay - currentWeek.week:', currentWeek.week);
      const monData = currentWeek.days?.Mon;
      const monWorkout = typeof monData === 'string' ? monData : monData?.workout;
      console.log('TrainingPlanDisplay - Mon workout:', monWorkout);
      console.log('TrainingPlanDisplay - isPreviewMode:', isPreviewMode);
    }
  }, [currentWeek, isPreviewMode]);

  useEffect(() => {
    if (onWeekChange && currentWeek) {
      onWeekChange(currentWeek.week);
    }
  }, [currentWeekIndex, currentWeek, onWeekChange]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      <div className="px-4 md:px-0">
        <div className="mb-6 p-6 bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            Your {planType === 'static' ? 'Static' : 'Responsive'} Training Plan
          </h2>
          <p className="text-gray-300 mt-2">
            {isPreviewMode ? 'Plan preview' : `${planData.plan.length} weeks of ${planType === 'static' ? 'structured' : 'adaptive'} training`}
          </p>
        </div>

        {!isPreviewMode && (
          <>
            {saveMessage && (
              <div className={`px-4 py-3 rounded-lg text-sm font-medium mb-4 border ${
                saveMessage.includes('success')
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-red-50 border-red-300 text-red-700'
              }`}>
                {saveMessage}
              </div>
            )}
          </>
        )}

        {trainingPaces && (
          <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                Training Paces
              </h3>
              <button
                onClick={() => setTrainingPaces(null)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Easy</p>
                <p className="text-blue-600 font-bold">{trainingPaces.easyPace}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Long Run</p>
                <p className="text-blue-600 font-bold">{trainingPaces.longRunPace}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Tempo</p>
                <p className="text-blue-600 font-bold">{trainingPaces.tempoPace}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Interval</p>
                <p className="text-blue-600 font-bold">{trainingPaces.intervalPace}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Race</p>
                <p className="text-blue-600 font-bold">{trainingPaces.racePace}</p>
              </div>
            </div>
          </div>
        )}

        {!isPreviewMode && (
          <div className="flex items-center gap-2 mb-6 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                viewMode === 'week'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <List className="w-4 h-4" />
              Week View
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                viewMode === 'calendar'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Calendar View
            </button>
          </div>
        )}

        {viewMode === 'calendar' && !isPreviewMode && (
          <CalendarView
            planData={planData}
            completedWorkouts={completedWorkouts}
            planStartDate={planStartDate}
            onWorkoutClick={(weekNumber, dayName) => {}}
          />
        )}

        {(viewMode === 'week' || isPreviewMode) && (
          <div className={`border border-gray-200 rounded-lg p-3 md:p-5 bg-white shadow-sm ${viewMode === 'calendar' ? 'mt-6' : ''}`}>
            <div className="flex flex-col md:flex-row items-center md:justify-between gap-4 mb-6">
                <div className="text-center w-full md:w-auto order-1 md:order-2">
                <div className="flex items-center gap-2 justify-center">
                  <Calendar className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  <h3 className="text-xl md:text-2xl font-bold text-gray-900">Week {currentWeek.week}</h3>
                </div>
                <p className="text-xs md:text-sm text-gray-600 mt-1">
                  {isPreviewMode ? `Week ${currentWeek.week} of ${fullPlanData?.plan.length}` : `Week ${currentWeekIndex + 1} of ${planData.plan.length}`}
                </p>
                {currentWeekIndex !== today.weekNumber && today.weekNumber < planData.plan.length && today.weekNumber >= 0 && (
                  <button
                    onClick={() => setCurrentWeekIndex(today.weekNumber)}
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-white mx-auto bg-blue-600 px-3 py-1 rounded-full hover:bg-blue-700 transition-all"
                   
                  >
                    <Target className="w-3 h-3" />
                    Jump to Today
                  </button>
                )}
              </div>

            <div className="flex items-center justify-between w-full md:w-auto gap-2 order-2 md:order-1">
              <button
                onClick={() => setCurrentWeekIndex(prev => prev - 1)}
                disabled={!canGoBack}
                className={`flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-lg font-medium transition-all text-sm md:text-base ${
                  canGoBack
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden sm:inline">Previous Week</span>
                <span className="sm:hidden">Prev</span>
              </button>

              <button
                onClick={() => setCurrentWeekIndex(prev => prev + 1)}
                disabled={!canGoForward}
                className={`flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-lg font-medium transition-all text-sm md:text-base ${
                  canGoForward
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <span className="hidden sm:inline">Next Week</span>
                <span className="sm:hidden">Next</span>
                <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {dayOrder.map((day) => {
              const isBeforeStart = isDayBeforeStart(currentWeekIndex, day);
              const dayData = currentWeek.days[day];
              const originalActivity = typeof dayData === 'string' ? dayData : dayData.workout;
              const weekNum = currentWeek.week || (currentWeekIndex + 1);
              const activityWithEffort = convertRPEtoEffort(originalActivity, isBeginnerPlan, weekNum);
              const activity = isBeforeStart ? 'Rest' : activityWithEffort;
              const aiTips = typeof dayData === 'object' ? dayData.tips : null;
              const isCurrentDay = day === today.dayName && currentWeekIndex === today.weekNumber;
              const rpe = isBeforeStart ? '' : getEffortLevel(activity, isBeginnerPlan, weekNum);
              const dayKey = `${currentWeekIndex}-${day}`;
              const completionKey = `${weekNum}-${day}`;
              const isExpanded = expandedDay === dayKey;
              const isCompleted = completedWorkouts.has(completionKey);
              const isRestDay = activity.toLowerCase().includes('rest');

              const defaultNotes = getCoachingNotes(activity, isBeginnerPlan);
              const rpeDescription = defaultNotes[0];
              const coachingNotes = isBeforeStart
                ? []
                : (aiTips && aiTips.length > 0
                    ? [rpeDescription, ...aiTips]
                    : defaultNotes);

              return (
                <div key={day} className="flex gap-2 md:gap-3" data-day-key={dayKey}>
                  {user && savedPlanId && !isPreviewMode && !isBeforeStart && (
                    <button
                      onClick={(e) => {
                        console.log('Clicked week:', weekNum, 'day:', day);
                        toggleWorkoutCompletion(weekNum, day, activity, e);
                      }}
                      className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center transition-all self-start mt-3 md:mt-4 hover:scale-110 ${
                        isCompleted
                          ? 'bg-green-500 hover:bg-green-600'
                          : 'bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <Check className={`w-4 h-4 md:w-5 md:h-5 ${
                        isCompleted ? 'text-white stroke-[3]' : 'text-gray-500'
                      }`} />
                    </button>
                  )}
                  {user && savedPlanId && !isPreviewMode && isBeforeStart && (
                    <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10" />
                  )}
                  <div className="flex-1 flex flex-col">
                    <button
                      onClick={() => !isBeforeStart && setExpandedDay(isExpanded ? null : dayKey)}
                      disabled={isBeforeStart}
                      className={`border-2 rounded-lg p-3 md:p-4 transition-all text-left w-full shadow-sm ${getDayColor(activity, isCurrentDay)} ${isCompleted || isBeforeStart ? 'opacity-60' : ''} ${!isBeforeStart ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-shrink-0">
                          <div className="font-bold text-sm md:text-base">
                            {day}
                          </div>
                        </div>
                        <div className="flex-1 text-center mx-4">
                          <div className={`text-sm md:text-base leading-relaxed font-medium ${isCompleted ? 'line-through' : ''} ${isBeforeStart ? 'text-gray-500 italic' : ''}`}>
                            {activity}
                          </div>
                          {!isBeforeStart && getPaceForWorkout(activity) && (
                            <div className="text-xs mt-1 text-blue-600 font-bold">
                              Target Pace: {getPaceForWorkout(activity)}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!isBeforeStart && !isCompleted && !isRestDay && savedPlanId && planType === 'responsive' && (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingAction({
                                    type: 'move',
                                    data: { weekNumber: weekNum, dayName: day, activity }
                                  });
                                }}
                                className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded transition-all"
                                title="Move this workout"
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingAction({
                                    type: 'easier',
                                    data: { weekNumber: weekNum, dayName: day, activity }
                                  });
                                }}
                                className="p-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded transition-all"
                                title="Make easier"
                              >
                                <TrendingDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {isCompleted && (
                            <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full font-semibold">Completed</span>
                          )}
                          <ChevronDown className={`w-4 h-4 md:w-5 md:h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                    </button>

                  {isExpanded && !isBeforeStart && (
                    <div className="mt-2 p-5 bg-gray-50 border-2 border-blue-200 rounded-lg shadow-md">
                      <div className="mb-4">
                        <h4 className="font-bold text-base flex items-center gap-2 text-blue-600">
                          <BookOpen className="w-5 h-5" />
                          Coaching Notes
                        </h4>
                      </div>
                      <ul className="space-y-3">
                        {coachingNotes.map((note, index) => (
                          <li key={index} className="text-sm text-gray-700 flex gap-3">
                            <span className="text-blue-600 font-bold text-lg leading-none">•</span>
                            <span className="leading-relaxed">{note}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {!isPreviewMode && user && (
          <div className="mt-8 border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Plan Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {onUndo && (
                <button
                  onClick={onUndo}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all shadow-sm"
                >
                  <Undo className="w-4 h-4" />
                  Undo Last Change
                </button>
              )}
              {hasUnsavedChanges && savedPlanId && (
                <button
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
              <button
                onClick={() => setShowPaceCalculator(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all"
              >
                <Target className="w-4 h-4" />
                Pace Calculator
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handlePrintPlan();
                }}
                disabled={isExportingPDF}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4" />
                {isExportingPDF ? 'Generating PDF...' : 'Export PDF'}
              </button>
              {savedPlanId && (
                <>
                  <button
                    onClick={() => setShowAnalytics(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all print:hidden"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Analytics
                  </button>
                  <button
                    onClick={() => setShowShare(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all print:hidden"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showAnalytics && savedPlanId && (
        <PerformanceAnalytics
          planId={savedPlanId}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {showShare && savedPlanId && (
        <SharePlan
          planId={savedPlanId}
          onClose={() => setShowShare(false)}
        />
      )}

      {showPaceCalculator && (
        <PaceCalculator
          onClose={() => setShowPaceCalculator(false)}
          onAddToPlan={(paces) => setTrainingPaces(paces)}
        />
      )}

      {pendingAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                {pendingAction.type === 'move' ? 'Move Workout' : 'Make Workout Easier'}
              </h3>
              <button
                onClick={() => setPendingAction(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-800 mb-2 font-medium">
                Week {pendingAction.data.weekNumber} - {pendingAction.data.dayName}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                {pendingAction.data.activity}
              </p>

              {pendingAction.type === 'move' && (
                <div>
                  <p className="text-sm mb-3">Move this workout to which day?</p>
                  <div className="grid grid-cols-7 gap-1">
                    {dayOrder.map(targetDay => (
                      <button
                        key={targetDay}
                        onClick={() => {
                          handleMoveWorkout(
                            pendingAction.data.weekNumber,
                            pendingAction.data.dayName,
                            targetDay,
                            pendingAction.data.activity
                          );
                        }}
                        className={`p-2 text-xs font-medium rounded ${targetDay === pendingAction.data.dayName ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'}`}
                        disabled={targetDay === pendingAction.data.dayName}
                      >
                        {targetDay}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pendingAction.type === 'easier' && (
                <div>
                  <p className="text-sm mb-3">How would you like to adjust this workout?</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        handleMakeEasier(
                          pendingAction.data.weekNumber,
                          pendingAction.data.dayName,
                          pendingAction.data.activity,
                          'distance'
                        );
                      }}
                      className="w-full p-3 text-left bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-all"
                    >
                      <p className="font-medium text-orange-900">Reduce Distance</p>
                      <p className="text-xs text-orange-700">Shorten run by 20%</p>
                    </button>
                    <button
                      onClick={() => {
                        handleMakeEasier(
                          pendingAction.data.weekNumber,
                          pendingAction.data.dayName,
                          pendingAction.data.activity,
                          'intensity'
                        );
                      }}
                      className="w-full p-3 text-left bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-all"
                    >
                      <p className="font-medium text-orange-900">Lower Intensity</p>
                      <p className="text-xs text-orange-700">Convert to easy/recovery pace</p>
                    </button>
                    <button
                      onClick={() => {
                        handleMakeEasier(
                          pendingAction.data.weekNumber,
                          pendingAction.data.dayName,
                          pendingAction.data.activity,
                          'rest'
                        );
                      }}
                      className="w-full p-3 text-left bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-all"
                    >
                      <p className="font-medium text-orange-900">Make Rest Day</p>
                      <p className="text-xs text-orange-700">Convert to full rest</p>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setPendingAction(null)}
              className="w-full px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {workoutToRate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-blue-500 rounded-xl max-w-md w-full p-6 shadow-2xl relative z-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Rate Your Workout</h3>
              <button
                onClick={() => {
                  setWorkoutToRate(null);
                  setRating(0);
                }}
                className="text-gray-500 hover:text-gray-700 transition-colors hover:scale-110"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-800 mb-2 font-medium">
                Week {workoutToRate.week} - {workoutToRate.day}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                {workoutToRate.activity}
              </p>

              <p className="text-sm font-semibold text-blue-600 mb-3">
                {isBeginnerPlan ? 'Rate Your Effort Level (1-10)' : 'Rate of Perceived Effort (RPE)'}
              </p>

              <div className="space-y-4">
                <div className="relative pt-2 pb-2">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={rating}
                    onChange={(e) => setRating(parseInt(e.target.value))}
                    className="w-full h-2 bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #4ade80 0%, #facc15 50%, #ef4444 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                    <span>6</span>
                    <span>7</span>
                    <span>8</span>
                    <span>9</span>
                    <span>10</span>
                  </div>
                </div>

                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600">
                    <span className="text-3xl font-bold text-white">{rating || '-'}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    {rating === 0 && (isBeginnerPlan ? 'Select your effort level' : 'Select your RPE')}
                    {rating >= 1 && rating <= 2 && 'Very Easy - Recovery'}
                    {rating >= 3 && rating <= 4 && 'Easy - Comfortable'}
                    {rating >= 5 && rating <= 6 && 'Moderate - Steady'}
                    {rating >= 7 && rating <= 8 && 'Hard - Challenging'}
                    {rating >= 9 && rating <= 10 && 'Maximum Effort'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setWorkoutToRate(null);
                  setRating(0);
                }}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => submitWorkoutCompletion(rating)}
                disabled={rating === 0}
                className={`flex-1 px-4 py-2.5 rounded-lg font-semibold transition-all ${
                  rating > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
