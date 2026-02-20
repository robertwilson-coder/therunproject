export function isDateBasedPlan(planData: any): boolean {
  if (!planData || !planData.plan_type) return false;

  const planType = planData.plan_type;
  return planType === 'date_based' ||
         planType === 'date_based_preview' ||
         planType === 'date_based_full';
}
