import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';
import { sanitizeText } from '../utils/sanitizer';
import { ErrorMessages } from '../utils/errorMessages';

interface FeedbackModalProps {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    most_useful: '',
    confusing_frustrating: '',
    comparison: '',
    improvements: '',
    other_remarks: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setSubmitError('Please sign in to submit feedback');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Sanitize all text inputs
      const sanitizedData = {
        most_useful: sanitizeText(formData.most_useful),
        confusing_frustrating: sanitizeText(formData.confusing_frustrating),
        comparison: sanitizeText(formData.comparison),
        improvements: sanitizeText(formData.improvements),
        other_remarks: sanitizeText(formData.other_remarks)
      };

      const { data: insertedData, error } = await supabase
        .from('beta_feedback')
        .insert({
          user_id: user.id,
          ...sanitizedData
        })
        .select()
        .single();

      if (error) throw error;

      // Send Discord notification
      if (insertedData) {
        try {
          const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-feedback-discord`;
          await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              type: 'INSERT',
              table: 'beta_feedback',
              record: insertedData
            })
          });
        } catch (notificationError) {
          logger.warn('Failed to send Discord notification', notificationError);
        }
      }

      setSubmitSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      logger.error('Error submitting feedback', err);
      setSubmitError(err instanceof Error ? err.message : ErrorMessages.DATA_SAVE_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (submitSuccess) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 max-w-md w-full text-center animate-scale-in">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Thank you!</h3>
          <p className="text-neutral-600 dark:text-neutral-400">Your feedback helps us improve The Run Project.</p>
        </div>
      </div>
    );
  }

  // Show sign-in prompt if user is not authenticated
  if (!user) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 max-w-md w-full text-center animate-scale-in">
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={onClose}
              className="p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            </button>
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">Sign In Required</h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            Please create an account or sign in to submit feedback. This helps us follow up with you and better understand our users.
          </p>
          <button
            onClick={onClose}
            className="btn-primary w-full py-3"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 sm:p-8 max-w-2xl w-full my-8 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 id="feedback-title" className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">Give Feedback</h2>
          <button
            onClick={onClose}
            className="p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close feedback form"
          >
            <X className="w-5 h-5 text-neutral-600 dark:text-neutral-400" aria-hidden="true" />
          </button>
        </div>

        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Your feedback is invaluable as we develop The Run Project. Please share your thoughts!
        </p>

        <form onSubmit={handleSubmit} className="space-y-6" aria-label="Feedback form">
          <div className="rounded-lg shadow-lg overflow-hidden border-2 border-blue-600 dark:border-blue-500">
            <label htmlFor="most-useful" className="block text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3">
              What part of the plan has felt most useful so far?
            </label>
            <textarea
              id="most-useful"
              value={formData.most_useful}
              onChange={(e) => handleChange('most_useful', e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-all resize-none border-0"
              rows={3}
              placeholder="Share what's been working well for you..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-900 dark:text-white mb-2">
              Was anything confusing, frustrating, or unclear?
            </label>
            <textarea
              value={formData.confusing_frustrating}
              onChange={(e) => handleChange('confusing_frustrating', e.target.value)}
              className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white focus:border-primary-500 dark:focus:border-primary-500 focus:ring-0 transition-colors resize-none"
              rows={3}
              placeholder="Let us know what could be clearer..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-900 dark:text-white mb-2">
              How does this compare to other running plans you've used (better, worse, or just different)?
            </label>
            <textarea
              value={formData.comparison}
              onChange={(e) => handleChange('comparison', e.target.value)}
              className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white focus:border-primary-500 dark:focus:border-primary-500 focus:ring-0 transition-colors resize-none"
              rows={3}
              placeholder="How does this stack up against other plans..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-900 dark:text-white mb-2">
              Is there anything you'd change or improve right now?
            </label>
            <textarea
              value={formData.improvements}
              onChange={(e) => handleChange('improvements', e.target.value)}
              className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white focus:border-primary-500 dark:focus:border-primary-500 focus:ring-0 transition-colors resize-none"
              rows={3}
              placeholder="Your suggestions for improvement..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-900 dark:text-white mb-2">
              Other remarks or comments
            </label>
            <textarea
              value={formData.other_remarks}
              onChange={(e) => handleChange('other_remarks', e.target.value)}
              className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white focus:border-primary-500 dark:focus:border-primary-500 focus:ring-0 transition-colors resize-none"
              rows={3}
              placeholder="Anything else you'd like to share..."
            />
          </div>

          {submitError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 px-4 py-3 rounded-lg">
              {submitError}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
