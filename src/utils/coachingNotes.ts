export const getRPEDescription = (rpe: string, isBeginnerPlan: boolean): string => {
  const rpeNum = parseInt(rpe.split('-')[0]);
  const prefix = isBeginnerPlan ? 'Effort' : 'RPE';

  if (rpeNum >= 8) {
    return `${prefix} ${rpe}: Very hard effort where speaking is nearly impossible. You should feel like you are working close to your maximum capacity.`;
  } else if (rpeNum >= 7) {
    return `${prefix} ${rpe}: Hard to very hard effort where you can only speak a few words at most. This is high-intensity work that challenges your limits.`;
  } else if (rpeNum >= 6) {
    return `${prefix} ${rpe}: Comfortably hard effort where you can only speak 3-4 word phrases with effort. This feels challenging but controlled.`;
  } else if (rpeNum >= 4) {
    return `${prefix} ${rpe}: Comfortable pace where you can speak in short phrases. Slightly harder than easy runs but still sustainable for extended periods.`;
  } else {
    return `${prefix} ${rpe}: Very easy effort where you can hold a full conversation without any breathlessness. This should feel almost effortless.`;
  }
};

export const getCoachingNotes = (activity: string, isBeginnerPlan: boolean): string[] => {
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
