import { CheckCircle, XCircle, MessageCircle, AlertCircle, Send } from 'lucide-react';
import { useState } from 'react';

interface PlanChange {
  week: number;
  day: string;
  date: string;
  before: string;
  after: string;
}

interface ChangeConfirmationModalProps {
  changes: PlanChange[];
  aiExplanation: string;
  onApprove: () => void;
  onReject: () => void;
  onRefine: (refinementMessage: string) => void;
}

function parseMarkdown(text: string) {
  return text
    .replace(/\*\*\*\*/g, '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
}

export function ChangeConfirmationModal({
  changes,
  aiExplanation,
  onApprove,
  onReject,
  onRefine
}: ChangeConfirmationModalProps) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinementMessage, setRefinementMessage] = useState('');

  // Sort changes by date ascending for chronological display
  const sortedChanges = [...changes].sort((a, b) => a.date.localeCompare(b.date));

  const handleSendRefinement = () => {
    if (refinementMessage.trim()) {
      onRefine(refinementMessage.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendRefinement();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-brand-pink to-pink-500 text-white p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Review Plan Changes</h2>
          </div>
          <p className="mt-2 text-pink-100">
            {isRefining
              ? 'Tell your coach how you\'d like to refine these changes'
              : 'Your coach suggests the following changes. Review and choose to approve, reject, or refine them.'
            }
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isRefining ? (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-2">Original Suggestion:</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiExplanation}</p>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-gray-900">
                  How would you like to refine this?
                </label>
                <p className="text-sm text-gray-600 mb-2">
                  For example: "Could you move the long run to Saturday instead?" or "Keep the changes but make the Tuesday run 5k instead"
                </p>
                <textarea
                  value={refinementMessage}
                  onChange={(e) => setRefinementMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your refinement request here..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue min-h-[120px] text-gray-900"
                  autoFocus
                />
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-2">Coach Explanation:</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{aiExplanation}</p>
              </div>

              <h3 className="font-semibold text-gray-900 mb-4">
                {sortedChanges.length} {sortedChanges.length === 1 ? 'Change' : 'Changes'} Proposed:
              </h3>

              <div className="space-y-4">
                {sortedChanges.map((change, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-brand-blue transition-colors">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-semibold text-brand-blue">
                        {change.day}, {change.date} (Week {change.week})
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-semibold text-red-600 mt-1">BEFORE:</span>
                        <div
                          className="flex-1 text-sm text-gray-700 bg-red-50 p-2 rounded"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(change.before) }}
                        />
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="text-xs font-semibold text-green-600 mt-1">AFTER:</span>
                        <div
                          className="flex-1 text-sm text-gray-700 bg-green-50 p-2 rounded"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(change.after) }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-gray-200 p-6 bg-gray-50">
          {!isRefining ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onReject}
                className="flex-1 px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                Reject Changes
              </button>
              <button
                onClick={() => setIsRefining(true)}
                className="flex-1 px-6 py-3 bg-white border-2 border-brand-blue text-brand-blue font-semibold rounded-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Refine Request
              </button>
              <button
                onClick={onApprove}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-brand-pink to-pink-500 text-white font-semibold rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Approve Changes
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setRefinementMessage('');
                  setIsRefining(false);
                }}
                className="flex-1 px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSendRefinement}
                disabled={!refinementMessage.trim()}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-brand-pink to-pink-500 text-white font-semibold rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
                Send to Coach
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
