export const getWorkoutCelebration = (activity: string): { title: string; message: string } => {
  const activityLower = activity.toLowerCase();

  if (activityLower.includes('interval') || /\d+\s*x\s*[(\d]/.test(activityLower)) {
    const messages = [
      { title: 'Speed Unlocked!', message: 'This workout significantly boosted your VO2 max and running economy. Your body just learned to process oxygen more efficiently and run faster with less effort!' },
      { title: 'Power Session Complete!', message: 'Intervals are the secret sauce to speed! You just enhanced your cardiovascular capacity and trained your muscles to clear lactate more effectively.' },
      { title: 'Elite Training Done!', message: 'This high-intensity session improved your neuromuscular coordination and taught your body to sustain faster paces. Speed gains incoming!' }
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (activityLower.includes('hill')) {
    const messages = [
      { title: 'Mountain Conquered!', message: 'Hill repeats build incredible leg strength and power! You just strengthened your glutes, hamstrings, and calves while improving your running form and economy.' },
      { title: 'Strength Builder!', message: 'This session was better than gym work for runners! Hills develop the explosive power and muscular endurance that translates directly to faster, more efficient running.' },
      { title: 'Power Unleashed!', message: 'Every hill repeat made you stronger and more resilient. Your legs now have more force production capacity and improved running mechanics!' }
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (activityLower.includes('tempo')) {
    const messages = [
      { title: 'Threshold Mastered!', message: 'Tempo runs are pure race-day magic! You just improved your lactate threshold, which means you can sustain faster paces for longer. This is the workout that wins races!' },
      { title: 'Endurance Powerhouse!', message: 'This session trained your body to clear lactate efficiently and maintain strong paces. Your sustainable race pace just got faster!' },
      { title: 'Race Pace Refined!', message: 'Tempo work is the cornerstone of racing success. You just enhanced your aerobic capacity and taught your body exactly what race pace should feel like!' }
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (activityLower.includes('long run')) {
    const messages = [
      { title: 'Endurance Warrior!', message: 'Long runs are the foundation of distance running! You just increased your aerobic capacity, enhanced fat-burning efficiency, and built crucial mental toughness for race day.' },
      { title: 'Distance Dominated!', message: 'This session strengthened your heart, expanded your capillary networks, and increased mitochondria density. Your endurance engine just got a major upgrade!' },
      { title: 'Mental Fortress Built!', message: 'Long runs develop physical endurance AND mental resilience. You just proved you can push through fatigue and go the distance. Race day confidence: unlocked!' }
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (activityLower.includes('fartlek')) {
    const messages = [
      { title: 'Speed Play Mastered!', message: 'Fartlek sessions build speed endurance and mental adaptability! You just trained your body to handle pace changes and developed the fitness to surge when it matters.' },
      { title: 'Versatility Enhanced!', message: 'This session improved your ability to respond to race dynamics. Your body can now handle varying intensities with greater ease and efficiency!' },
      { title: 'Dynamic Runner Created!', message: 'Fartlek training bridges the gap between tempo and intervals perfectly. You just enhanced both your aerobic and anaerobic systems in one smart workout!' }
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (activityLower.includes('progressive')) {
    const messages = [
      { title: 'Negative Split Pro!', message: 'Progressive runs teach the art of smart pacing and finishing strong! You just developed crucial race discipline and the ability to accelerate on tired legs.' },
      { title: 'Pace Master!', message: 'This workout refined your pace judgment and built confidence in your ability to push when fatigued. That\'s exactly what wins races!' },
      { title: 'Strong Finisher!', message: 'Progressive runs are all about finishing power. You just trained your body and mind to speed up when others slow down. Race-day weapon: activated!' }
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (activityLower.includes('recovery')) {
    const messages = [
      { title: 'Recovery Champion!', message: 'Smart runners know recovery is training too! This easy effort promoted blood flow, cleared metabolic waste, and accelerated your adaptation from harder sessions.' },
      { title: 'Regeneration Complete!', message: 'Recovery runs are the secret to staying healthy and improving consistently. You just enhanced your aerobic base while giving your body time to rebuild stronger!' },
      { title: 'Wisdom in Motion!', message: 'The discipline to run easy when you should is what separates good runners from great ones. You just invested in long-term progress and injury prevention!' }
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (activityLower.includes('easy')) {
    const messages = [
      { title: 'Foundation Strengthened!', message: 'Easy runs build your aerobic base and mitochondrial density! These "easy" miles are actually creating the engine that powers all your faster running.' },
      { title: 'Aerobic System Enhanced!', message: 'This comfortable effort expanded your capillary network and improved fat-burning efficiency. Easy runs are the secret ingredient to sustainable improvement!' },
      { title: 'Base Building Success!', message: 'Every easy mile strengthens your cardiovascular system and builds durability. This is the foundation that supports all your speed work!' }
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (activityLower.includes('rest')) {
    return { title: 'Rest Day Champion!', message: 'Rest is when your body rebuilds stronger! You just showed the discipline to recover properly. This is when the magic of adaptation happens!' };
  }

  const messages = [
    { title: 'Workout Complete!', message: 'Every training session makes you stronger, faster, and more resilient. You just invested in your running future!' },
    { title: 'Training Success!', message: 'Consistency is the key to improvement, and you just added another quality session to your training. Keep building!' },
    { title: 'Progress Made!', message: 'Each workout is a brick in your foundation of fitness. You\'re getting stronger with every step!' }
  ];
  return messages[Math.floor(Math.random() * messages.length)];
};
