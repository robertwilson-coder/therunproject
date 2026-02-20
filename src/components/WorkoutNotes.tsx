import { useState, useEffect } from 'react';
import { X, BookOpen, Smile, Meh, Frown, Save, Activity, Clock, Heart, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { sanitizeWorkoutNote } from '../utils/sanitizer';
import { ErrorMessages } from '../utils/errorMessages';

interface WorkoutNotesProps {
  planId: string;
  weekNumber: number;
  dayName: string;
  activity: string;
  onClose: () => void;
}

interface WorkoutNote {
  id: string;
  notes: string;
  mood: string;
}

interface StravaActivity {
  id: string;
  strava_activity_id: number;
  distance: number;
  moving_time: number;
  average_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain: number;
  start_date: string;
}

const moodOptions = [
  { value: 'great', label: 'Great', icon: Smile, color: 'text-green-600', bgColor: 'bg-green-50', hoverColor: 'hover:bg-green-100' },
  { value: 'good', label: 'Good', icon: Smile, color: 'text-blue-600', bgColor: 'bg-blue-50', hoverColor: 'hover:bg-blue-100' },
  { value: 'okay', label: 'Okay', icon: Meh, color: 'text-yellow-600', bgColor: 'bg-yellow-50', hoverColor: 'hover:bg-yellow-100' },
  { value: 'tired', label: 'Tired', icon: Frown, color: 'text-orange-600', bgColor: 'bg-orange-50', hoverColor: 'hover:bg-orange-100' },
  { value: 'struggling', label: 'Struggling', icon: Frown, color: 'text-red-600', bgColor: 'bg-red-50', hoverColor: 'hover:bg-red-100' },
];

export function WorkoutNotes({ planId, weekNumber, dayName, activity, onClose }: WorkoutNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState('');
  const [mood, setMood] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [stravaActivity, setStravaActivity] = useState<StravaActivity | null>(null);
  const [loadingStrava, setLoadingStrava] = useState(true);

  useEffect(() => {
    loadNote();
    loadStravaActivity();
  }, [planId, weekNumber, dayName]);

  const loadNote = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('workout_notes')
        .select('*')
        .eq('user_id', user.id)
        .eq('training_plan_id', planId)
        .eq('week_number', weekNumber)
        .eq('day_name', dayName)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setNotes(data.notes || '');
        setMood(data.mood || '');
        setNoteId(data.id);
      }
    } catch (error) {
      logger.error('Error loading note', error);
    }
  };

  const loadStravaActivity = async () => {
    if (!user) return;

    try {
      setLoadingStrava(true);

      const { data: completion, error: completionError } = await supabase
        .from('workout_completions')
        .select('strava_activity_id')
        .eq('training_plan_id', planId)
        .eq('week_number', weekNumber)
        .eq('day_name', dayName)
        .maybeSingle();

      if (completionError) throw completionError;

      if (completion?.strava_activity_id) {
        const { data: stravaData, error: stravaError } = await supabase
          .from('strava_activities')
          .select('*')
          .eq('strava_activity_id', completion.strava_activity_id)
          .maybeSingle();

        if (stravaError) throw stravaError;

        if (stravaData) {
          setStravaActivity(stravaData);
        }
      }
    } catch (error) {
      logger.error('Error loading Strava activity', error);
    } finally {
      setLoadingStrava(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const sanitizedNotes = sanitizeWorkoutNote(notes);

      if (noteId) {
        const { error } = await supabase
          .from('workout_notes')
          .update({
            notes: sanitizedNotes,
            mood,
            updated_at: new Date().toISOString(),
          })
          .eq('id', noteId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('workout_notes')
          .insert({
            user_id: user.id,
            training_plan_id: planId,
            week_number: weekNumber,
            day_name: dayName,
            notes: sanitizedNotes,
            mood,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setNoteId(data.id);
      }

      setSaveMessage('Note saved successfully!');
      setTimeout(() => {
        setSaveMessage(null);
        onClose();
      }, 1500);
    } catch (error) {
      logger.error('Error saving note', error);
      setSaveMessage(ErrorMessages.WORKOUT_NOTE_SAVE_ERROR);
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="workout-notes-title">
      <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 id="workout-notes-title" className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-blue-600" aria-hidden="true" />
                Workout Journal
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Week {weekNumber} - {dayName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Close workout journal"
            >
              <X className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900">{activity}</p>
          </div>

          {!loadingStrava && stravaActivity && (
            <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-5 h-5 text-orange-600" />
                <h4 className="font-semibold text-gray-900">Strava Activity Data</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                    <TrendingUp className="w-3 h-3" />
                    Distance
                  </div>
                  <span className="text-lg font-bold text-gray-900">
                    {(stravaActivity.distance / 1000).toFixed(2)} km
                  </span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                    <Clock className="w-3 h-3" />
                    Time
                  </div>
                  <span className="text-lg font-bold text-gray-900">
                    {Math.floor(stravaActivity.moving_time / 60)}:{(stravaActivity.moving_time % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                    <Activity className="w-3 h-3" />
                    Avg Pace
                  </div>
                  <span className="text-lg font-bold text-gray-900">
                    {stravaActivity.average_speed > 0
                      ? `${Math.floor(1000 / (stravaActivity.average_speed * 60))}:${Math.floor((1000 / stravaActivity.average_speed) % 60).toString().padStart(2, '0')}/km`
                      : 'N/A'}
                  </span>
                </div>
                {stravaActivity.average_heartrate && (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                      <Heart className="w-3 h-3" />
                      Avg HR
                    </div>
                    <span className="text-lg font-bold text-gray-900">
                      {Math.round(stravaActivity.average_heartrate)} bpm
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              How did you feel?
            </label>
            <div className="grid grid-cols-5 gap-2">
              {moodOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = mood === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setMood(option.value)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      isSelected
                        ? `${option.bgColor} border-current ${option.color}`
                        : `bg-white border-gray-200 text-gray-600 ${option.hoverColor}`
                    }`}
                    aria-label={`Mood: ${option.label}`}
                    aria-pressed={isSelected}
                    role="button"
                  >
                    <Icon className={`w-6 h-6 ${isSelected ? option.color : 'text-gray-400'}`} aria-hidden="true" />
                    <span className="text-xs font-medium">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-semibold text-gray-900 mb-2">
              Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How was the workout? Any observations, challenges, or achievements?"
              rows={6}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all resize-none"
            />
          </div>

          {saveMessage && (
            <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
              saveMessage.includes('success')
                ? 'bg-green-50 border-2 border-green-300 text-green-700'
                : 'bg-red-50 border-2 border-red-300 text-red-700'
            }`}>
              {saveMessage}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            {isSaving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
