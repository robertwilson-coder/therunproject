import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, CheckCircle } from 'lucide-react';

interface UpdatePasswordProps {
  onComplete: () => void;
}

export function UpdatePassword({ onComplete }: UpdatePasswordProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-neon-black flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-dark-gray border-2 border-border-gray rounded-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 bg-opacity-10 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Password Updated!
          </h1>
          <p className="text-gray-400">
            Your password has been successfully updated. Redirecting...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neon-black flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-dark-gray border-2 border-border-gray rounded-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-blue bg-opacity-10 rounded-full mb-4">
            <Lock className="w-8 h-8 text-brand-blue" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Update Password
          </h1>
          <p className="text-gray-400">
            Enter your new password below
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-brand-pink bg-opacity-10 border-2 border-brand-pink text-brand-pink px-4 py-3 rounded-lg">
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-blue text-white font-bold rounded-lg hover:bg-blue-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
