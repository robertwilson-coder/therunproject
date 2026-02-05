export function validateTips(planData: any) {
  if (!planData.plan || !Array.isArray(planData.plan)) {
    console.log('No plan data to validate');
    return;
  }

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const easyKeywords = ['easy', 'conversational', 'chat', 'comfortable', 'relaxed'];
  const hardKeywords = ['hard', 'push', 'quick', 'fast', 'intense'];

  planData.plan.forEach((week: any, weekIdx: number) => {
    if (!week.days) return;

    daysOfWeek.forEach(day => {
      const dayData = week.days[day];
      if (!dayData || !dayData.workout) return;

      const workout = dayData.workout.toLowerCase();
      const tips = dayData.tips || [];
      const tipsText = tips.join(' ').toLowerCase();

      if (workout.includes('rest') || workout.includes('active recovery')) {
        return;
      }

      const hasHighRPE = /rpe\s*[78]/i.test(workout) || /effort:\s*[78]/i.test(workout);
      const hasLowRPE = /rpe\s*[23]/i.test(workout) || /effort:\s*[23]/i.test(workout);

      if (hasHighRPE && easyKeywords.some(kw => tipsText.includes(kw))) {
        console.log(`❌ ERROR Week ${week.week} ${day}: Hard workout (RPE 7-8) has easy tips`);
        console.log(`   Workout: ${dayData.workout}`);
        console.log(`   Tips: ${tips.join(', ')}`);
        dayData.tips = [
          '**Goal:** Strengthen aerobic capacity and increase sustained speed.',
          'Focus on quick turnover during the hard efforts',
          'Keep recovery jogs light between intervals',
          'Don\'t skip the warm-up for hard sessions'
        ];
        console.log(`   ✓ Fixed with appropriate hard workout tips`);
      }

      if (hasLowRPE && hardKeywords.some(kw => tipsText.includes(kw) && !tipsText.includes('hard sessions'))) {
        console.log(`❌ ERROR Week ${week.week} ${day}: Easy workout (RPE 2-3) has hard tips`);
        console.log(`   Workout: ${dayData.workout}`);
        console.log(`   Tips: ${tips.join(', ')}`);
        dayData.tips = [
          '**Goal:** Build aerobic endurance and support recovery from harder sessions.',
          'Keep it conversational - you should chat easily',
          'Focus on relaxed form',
          'This should feel comfortable throughout'
        ];
        console.log(`   ✓ Fixed with appropriate easy workout tips`);
      }
    });
  });
}
