import { Calendar, Clock, Zap, Activity, ChevronDown, BookOpen, Save, Target, Check, List, Printer, TrendingUp, Share2, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
import html2canvas from 'html2canvas';

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

    const diffTime = today.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    weekNumber = diffDays < 0 ? 0 : Math.floor(diffDays / 7);
  }

  return {
    dayName: days[dayIndex],
    date: now.toISOString().split('T')[0],
    weekNumber: weekNumber
  };
};

const getCoachingNotes = (activity: string): string[] => {
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
      'RPE: Not applicable - This is non-running cross-training activity.',
      'Choose light activities that promote blood flow without cardiovascular stress: 20-30 minute walk, gentle yoga, or run-specific strength exercises (single-leg squats, calf raises, planks).',
      'This is NOT a running day. The goal is active movement that aids recovery without adding training stress. Keep intensity very low.',
      'Yoga focused on hip mobility, hamstring flexibility, and core strength is excellent. Avoid intense power or hot yoga - keep it gentle and restorative.',
      'Run-focused strength: bodyweight exercises like lunges, glute bridges, side planks, and leg swings. Keep reps moderate (2-3 sets of 10-15) without going to failure.',
      'A 20-30 minute walk promotes circulation and mental refreshment. This is recovery, not exercise - enjoy the movement without pressure or targets.'
    ];
  }

  if (activityLower.includes('interval')) {
    return [
      'RPE 7-9: Hard to very hard effort where you can only speak a few words at most. This is high-intensity work that challenges your limits.',
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
      'RPE 8-9: Very hard effort where speaking is nearly impossible. You should feel like you are working close to your maximum capacity.',
      'Excellent strength and power workout with lower impact than flat speed work. Hills build leg strength, improve running economy, and develop the power needed for faster running.',
      'Focus on driving knees up and maintaining good posture. Lean slightly forward from the ankles (not the waist), keep chest up, and pump arms vigorously in rhythm with legs.',
      'Jog or walk down slowly - recovery is crucial. Never run hard downhill during hill repeats; the eccentric muscle damage increases injury risk and compromises subsequent intervals.',
      'Don\'t lean forward excessively from the waist - stay tall with core engaged. Think "run up the hill" not "push into the hill."',
      'These build leg strength (particularly glutes, hamstrings, calves) and improve running form. The strength gains translate to power and speed on flat terrain.',
      'Effort, not pace, is the key metric. Hills naturally slow pace; focus on maintaining strong, controlled effort at your target RPE.',
      'Hill grade matters: 4-6% gradient is ideal for most hill repeats. Steeper hills (8-10%) develop more power but require more recovery. Find a consistent grade for best training effect.',
      'Duration guide: 60-90 second hills for strength-endurance, 30-45 second hills for power, 10-20 second explosive hill sprints for pure power. Match duration to your training phase and goals.'
    ];
  }

  if (activityLower.includes('fartlek')) {
    return [
      'RPE 7-8 (during hard efforts): Hard effort where you can speak only a few words. The variable nature means you alternate between this and easy recovery.',
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
      'RPE 6-7: Comfortably hard effort where you can only speak 3-4 word phrases with effort. This feels challenging but controlled.',
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
      'RPE 3-6: Starts at easy conversational pace (RPE 3) and gradually builds to comfortably hard (RPE 6) by the end. Progressive difficulty.',
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
      'RPE 4-5: Comfortable pace where you can speak in short phrases. Slightly harder than easy runs but still sustainable for extended periods.',
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
      'RPE 2-3: Very easy effort where you can hold a full conversation without any breathlessness. This should feel almost effortless.',
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
      'RPE 2-3: Maintain a conversational pace where you can speak in full sentences comfortably. This should feel relaxed and sustainable.',
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
  onCompletedWorkoutsChange
}: TrainingPlanDisplayProps) {
  const { user } = useAuth();
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

  const handlePrintPlan = async () => {
    console.log('PDF download clicked');

    try {
      const dataToExport = fullPlanData || planData;

      if (!dataToExport || !dataToExport.plan || dataToExport.plan.length === 0) {
        alert('No training plan data available to export.');
        return;
      }

      console.log('Starting PDF generation...');

      const startDate = planStartDate ? new Date(planStartDate) : new Date();
      const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      const container = document.createElement('div');
      container.style.cssText = 'position: absolute; left: -9999px; width: 1200px; background: white; padding: 20px; font-family: Arial, sans-serif;';

      let html = '<h1 style="text-align: center; font-size: 24px; margin-bottom: 20px; color: #1e40af;">Training Plan</h1>';

      dataToExport.plan.forEach((week: any) => {
        html += `<div style="margin-bottom: 30px;">
          <div style="background: #1e40af; color: white; padding: 10px; font-weight: bold; font-size: 16px; margin-bottom: 10px;">Week ${week.week}</div>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>`;

        dayOrder.forEach(day => {
          html += `<th style="background: #6b21a8; color: white; padding: 10px; text-align: center; font-weight: bold; border: 1px solid #ddd;">${day}</th>`;
        });

        html += `</tr><tr>`;

        dayOrder.forEach((day, idx) => {
          const dayData = week.days[day];
          const workout = typeof dayData === 'string' ? dayData : (dayData?.workout || 'Rest');

          const weekStart = new Date(startDate);
          weekStart.setDate(startDate.getDate() + (week.week - 1) * 7);
          const currentDayDate = new Date(weekStart);
          currentDayDate.setDate(weekStart.getDate() + idx);
          const dateStr = `${currentDayDate.getDate()}/${currentDayDate.getMonth() + 1}`;

          let bgColor = '#f9fafb';
          const workoutLower = workout.toLowerCase();
          if (workoutLower.includes('interval') || workoutLower.includes('tempo') || workoutLower.includes('hill')) {
            bgColor = '#fecaca';
          } else if (workoutLower.includes('long')) {
            bgColor = '#fed7aa';
          } else if (!workoutLower.includes('rest')) {
            bgColor = '#dbeafe';
          }

          const pace = getPaceForWorkout(workout);
          const paceHtml = pace ? `<div style="color: #1e40af; font-weight: bold; margin-top: 8px; font-size: 11px;">Target: ${pace}</div>` : '';

          html += `<td style="border: 1px solid #ddd; padding: 10px; vertical-align: top; background: ${bgColor}; min-height: 100px;">
            <div style="font-weight: bold; font-size: 13px; color: #1e40af; margin-bottom: 6px;">${dateStr}</div>
            <div style="font-size: 12px; line-height: 1.5;">${workout}</div>
            ${paceHtml}
          </td>`;
        });

        html += `</tr></table></div>`;
      });

      container.innerHTML = html;
      document.body.appendChild(container);

      console.log('Rendering canvas...');
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });

      console.log('Creating PDF...');
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 210;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 210;
      }

      console.log('Saving PDF...');
      pdf.save(`training-plan-${new Date().toISOString().split('T')[0]}.pdf`);
      console.log('PDF saved successfully');

      document.body.removeChild(container);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(`Error generating PDF: ${error.message}`);
    }
  };

  const isPreviewMode = fullPlanData && planData.plan.length === 1;

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

  const getRPE = (activity: string): string => {
    const activityLower = activity.toLowerCase();
    if (activityLower.includes('rest')) return '';
    if (activityLower.includes('race day')) return 'RPE 9-10';
    if (activityLower.includes('interval') || activityLower.includes('hill')) return 'RPE 7-9';
    if (activityLower.includes('fartlek')) return 'RPE 7-9';
    if (activityLower.includes('tempo')) return 'RPE 6-7';
    if (activityLower.includes('progressive')) return 'RPE 6-7';
    if (activityLower.includes('long run')) return 'RPE 4-5';
    if (activityLower.includes('recovery')) return 'RPE 2-3';
    if (activityLower.includes('easy')) return 'RPE 2-3';
    return 'RPE 4-5';
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

  useEffect(() => {
    if (onWeekChange && currentWeek) {
      onWeekChange(currentWeek.week);
    }
  }, [currentWeekIndex, currentWeek, onWeekChange]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {isPreviewMode && (
        <div className="bg-white border-2 border-blue-500 rounded-lg p-4 md:p-6 mb-6 mx-4 shadow-lg">
          <div className="flex flex-col md:flex-row items-start gap-3 md:gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-blue bg-opacity-20 rounded-full flex items-center justify-center">
                <span className="text-brand-blue text-lg md:text-xl font-bold">👀</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base md:text-lg font-bold text-gray-900 mb-2">Preview Mode - Week 1 of {fullPlanData?.plan.length}</h3>
              <p className="text-sm md:text-base text-gray-700 mb-3 md:mb-4">
                {user
                  ? `You're viewing the first week of your training plan. Test the coach chat to make adjustments, then save your full ${fullPlanData?.plan.length}-week plan.`
                  : `You're viewing the first week of your training plan. Test the coach chat to make adjustments, then create an account to unlock and save your full ${fullPlanData?.plan.length}-week plan.`
                }
              </p>
              {onSaveFullPlan && (
                <button
                  onClick={onSaveFullPlan}
                  className="flex items-center justify-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-brand-pink text-white text-sm md:text-base font-bold rounded-lg hover:opacity-90 hover:scale-105 transition-all shadow-md w-full md:w-auto"

                >
                  <Save className="w-4 h-4 md:w-5 md:h-5" />
                  {user ? 'Save Full Plan' : 'Save Full Plan & Create Account'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 md:px-0">
        <div className="mb-6 p-6 bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            Your {planType === 'static' ? 'Static' : 'Responsive'} Training Plan
          </h2>
          <p className="text-gray-300 mt-2">
            {isPreviewMode ? `Preview: Week 1 of ${fullPlanData?.plan.length}` : `${planData.plan.length} weeks of ${planType === 'static' ? 'structured' : 'adaptive'} training`}
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
                  Week {currentWeekIndex + 1} of {planData.plan.length}
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
              const activity = isBeforeStart ? 'Rest' : originalActivity;
              const aiTips = typeof dayData === 'object' ? dayData.tips : null;
              const weekNum = currentWeek.week || (currentWeekIndex + 1);
              const isCurrentDay = day === today.dayName && currentWeekIndex === today.weekNumber;
              const rpe = isBeforeStart ? '' : getRPE(activity);
              const dayKey = `${currentWeekIndex}-${day}`;
              const completionKey = `${weekNum}-${day}`;
              const isExpanded = expandedDay === dayKey;
              const isCompleted = completedWorkouts.has(completionKey);

              const defaultNotes = getCoachingNotes(activity);
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
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all print:hidden"
              >
                <Printer className="w-4 h-4" />
                Export PDF
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
                Rate of Perceived Effort (RPE)
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
                    {rating === 0 && 'Select your RPE'}
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
