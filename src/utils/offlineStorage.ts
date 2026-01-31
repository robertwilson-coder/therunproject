import type { TrainingPlan } from '../types';
import { logger } from '../utils/logger';

const CACHE_PREFIX = 'trp_';
const CACHE_VERSION = 'v1';
const PLANS_CACHE_KEY = `${CACHE_PREFIX}${CACHE_VERSION}_plans`;
const PLAN_PREFIX = `${CACHE_PREFIX}${CACHE_VERSION}_plan_`;

export const offlineStorage = {
  savePlan: (plan: TrainingPlan): void => {
    try {
      localStorage.setItem(`${PLAN_PREFIX}${plan.id}`, JSON.stringify(plan));

      const cachedPlans = offlineStorage.getAllCachedPlanIds();
      if (!cachedPlans.includes(plan.id)) {
        cachedPlans.push(plan.id);
        localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify(cachedPlans));
      }
    } catch (error) {
      logger.error('Failed to cache plan:', error);
    }
  },

  getPlan: (planId: string): TrainingPlan | null => {
    try {
      const cached = localStorage.getItem(`${PLAN_PREFIX}${planId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('Failed to retrieve cached plan:', error);
      return null;
    }
  },

  getAllCachedPlans: (): TrainingPlan[] => {
    try {
      const planIds = offlineStorage.getAllCachedPlanIds();
      return planIds
        .map(id => offlineStorage.getPlan(id))
        .filter((plan): plan is TrainingPlan => plan !== null);
    } catch (error) {
      logger.error('Failed to retrieve all cached plans:', error);
      return [];
    }
  },

  getAllCachedPlanIds: (): string[] => {
    try {
      const cached = localStorage.getItem(PLANS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch (error) {
      logger.error('Failed to retrieve cached plan IDs:', error);
      return [];
    }
  },

  removePlan: (planId: string): void => {
    try {
      localStorage.removeItem(`${PLAN_PREFIX}${planId}`);

      const cachedPlans = offlineStorage.getAllCachedPlanIds();
      const updated = cachedPlans.filter(id => id !== planId);
      localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify(updated));
    } catch (error) {
      logger.error('Failed to remove cached plan:', error);
    }
  },

  clearAll: (): void => {
    try {
      const planIds = offlineStorage.getAllCachedPlanIds();
      planIds.forEach(id => {
        localStorage.removeItem(`${PLAN_PREFIX}${id}`);
      });
      localStorage.removeItem(PLANS_CACHE_KEY);
    } catch (error) {
      logger.error('Failed to clear cache:', error);
    }
  },

  isOnline: (): boolean => {
    return navigator.onLine;
  },
};
