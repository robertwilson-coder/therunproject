/**
 * Timezone Utilities
 *
 * Captures and manages user timezone for accurate date resolution.
 */

export function getUserTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone || 'Europe/Paris';
  } catch (error) {
    console.warn('[Timezone] Failed to detect user timezone, using default:', error);
    return 'Europe/Paris';
  }
}

export async function fetchPlanTimezone(supabase: any, planId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('training_plans')
      .select('timezone')
      .eq('id', planId)
      .maybeSingle();

    if (error) {
      console.error('[Timezone] Failed to fetch plan timezone:', error);
      return null;
    }

    return data?.timezone || null;
  } catch (error) {
    console.error('[Timezone] Error fetching plan timezone:', error);
    return null;
  }
}

export function getTodayISO(timezone?: string): string {
  const tz = timezone || getUserTimezone();
  try {
    const now = new Date();
    const tzTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const year = tzTime.getFullYear();
    const month = String(tzTime.getMonth() + 1).padStart(2, '0');
    const day = String(tzTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.warn('[Timezone] Failed to get today in timezone, using UTC:', error);
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
}

export function saveUserTimezone(timezone: string): void {
  try {
    localStorage.setItem('user_timezone', timezone);
  } catch (error) {
    console.warn('[Timezone] Failed to save timezone to localStorage:', error);
  }
}

export function loadUserTimezone(): string | null {
  try {
    return localStorage.getItem('user_timezone');
  } catch (error) {
    console.warn('[Timezone] Failed to load timezone from localStorage:', error);
    return null;
  }
}

export async function updatePlanTimezone(supabase: any, planId: string, timezone: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('training_plans')
      .update({ timezone })
      .eq('id', planId);

    if (error) {
      console.error('[Timezone] Failed to update plan timezone:', error);
    }
  } catch (error) {
    console.error('[Timezone] Error updating plan timezone:', error);
  }
}
