import React, { useState } from 'react';
import { Trash2, AlertTriangle, Lock, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchAllUserData, exportToJSON } from '../utils/dataExport';

export function AccountDeletion() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async () => {
    if (!user) return;

    try {
      setIsExporting(true);
      const data = await fetchAllUserData(user.id);
      exportToJSON(data);
      showToast('Your data has been exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast('Failed to export data. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !password || confirmText !== 'DELETE') {
      showToast('Please complete all required fields', 'error');
      return;
    }

    setIsDeleting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: password,
      });

      if (signInError) {
        showToast('Invalid password. Please try again.', 'error');
        setIsDeleting(false);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('delete_user_account', {
        password_input: password,
      });

      if (rpcError) {
        throw rpcError;
      }

      if (data && !data.success) {
        throw new Error(data.error || 'Failed to delete account');
      }

      showToast('Your account has been permanently deleted', 'success');

      await supabase.auth.signOut();

      window.location.href = '/';
    } catch (error: any) {
      console.error('Delete account error:', error);
      showToast(
        error.message || 'Failed to delete account. Please try again or contact support.',
        'error'
      );
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Delete Account
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
        </div>
      </div>

      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
        <h4 className="font-medium text-red-900 dark:text-red-200 mb-2">
          What will be deleted:
        </h4>
        <ul className="text-sm text-red-800 dark:text-red-300 space-y-1 list-disc list-inside">
          <li>All training plans and workout history</li>
          <li>Completion records, streaks, and achievements</li>
          <li>Garmin and Strava connections</li>
          <li>Chat messages and feedback</li>
          <li>Profile and social connections</li>
          <li>All personal data and settings</li>
        </ul>
      </div>

      <div className="mb-4">
        <button
          onClick={handleExportData}
          disabled={isExporting}
          className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? 'Exporting...' : 'Export My Data First'}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          We recommend exporting your data before deleting your account
        </p>
      </div>

      <button
        onClick={() => setShowConfirmDialog(true)}
        className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <Trash2 className="w-4 h-4" />
        Delete My Account
      </button>

      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Confirm Account Deletion
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    This action is permanent and cannot be undone
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setPassword('');
                  setConfirmText('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Enter your password to confirm
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Enter your password"
                    disabled={isDeleting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Type <span className="font-bold text-red-600">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Type DELETE"
                  disabled={isDeleting}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowConfirmDialog(false);
                    setPassword('');
                    setConfirmText('');
                  }}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || !password || confirmText !== 'DELETE'}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Forever
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
