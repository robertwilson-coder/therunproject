import { useState } from 'react';
import type { AppState } from '../types';

export function useNavigationState() {
  const [appState, setAppState] = useState<AppState>('landing');
  const [showPaceCalculator, setShowPaceCalculator] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showRecoveryTools, setShowRecoveryTools] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [showRacePlanning, setShowRacePlanning] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const closeAllModals = () => {
    setShowPaceCalculator(false);
    setShowDashboard(false);
    setShowRecoveryTools(false);
    setShowNutrition(false);
    setShowRacePlanning(false);
    setIsMobileMenuOpen(false);
    setShowFeedback(false);
  };

  const openDashboard = () => {
    closeAllModals();
    setShowDashboard(true);
  };

  const openRecoveryTools = () => {
    closeAllModals();
    setShowRecoveryTools(true);
  };

  const openNutrition = () => {
    closeAllModals();
    setShowNutrition(true);
  };

  const openRacePlanning = () => {
    closeAllModals();
    setShowRacePlanning(true);
  };

  return {
    appState,
    showPaceCalculator,
    showDashboard,
    showRecoveryTools,
    showNutrition,
    showRacePlanning,
    isMobileMenuOpen,
    showFeedback,
    setAppState,
    setShowPaceCalculator,
    setShowDashboard,
    setShowRecoveryTools,
    setShowNutrition,
    setShowRacePlanning,
    setIsMobileMenuOpen,
    setShowFeedback,
    closeAllModals,
    openDashboard,
    openRecoveryTools,
    openNutrition,
    openRacePlanning,
  };
}
