import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, User, ArrowLeft } from 'lucide-react';

interface AuthFormProps {
  onSuccess: () => void;
  loginOnly?: boolean;
}

export function AuthForm({ onSuccess, loginOnly = false }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isForgotPassword) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ email }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send reset email');
        }

        setResetEmailSent(true);
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onSuccess();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (resetEmailSent) {
    return (
      <div className="min-h-dvh bg-neutral-950 flex items-center justify-center px-4 animate-fade-in">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-primary-500/5 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-secondary-500/5 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-md w-full card-premium p-10 animate-slide-up text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-2xl mb-6 ring-1 ring-green-500/30">
            <Mail className="w-10 h-10 text-green-400" />
          </div>
          <h1 className="text-3xl font-display font-bold text-neutral-900 dark:text-white mb-3">
            Check Your Email
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-lg mb-8">
            We've sent a password reset link to <span className="text-primary-500 dark:text-primary-400 font-medium">{email}</span>
          </p>
          <p className="text-neutral-500 dark:text-neutral-500 text-sm mb-8">
            Click the link in the email to reset your password. The link will expire in 1 hour.
          </p>
          <button
            onClick={() => {
              setResetEmailSent(false);
              setIsForgotPassword(false);
              setEmail('');
              setError(null);
            }}
            className="btn-ghost w-full"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4 animate-fade-in">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-primary-500/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-secondary-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-md w-full card-premium p-10 animate-slide-up">
        {isForgotPassword && (
          <button
            onClick={() => {
              setIsForgotPassword(false);
              setError(null);
            }}
            className="mb-6 flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            aria-label="Back to sign in"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span className="text-sm font-medium">Back to Sign In</span>
          </button>
        )}

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary-500/20 to-primary-600/20 rounded-2xl mb-6 ring-1 ring-primary-500/30">
            <User className="w-10 h-10 text-primary-400" />
          </div>
          <h1 className="text-4xl font-display font-bold text-neutral-900 dark:text-white mb-3">
            {isForgotPassword ? 'Reset Password' : isLogin ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-lg">
            {isForgotPassword
              ? 'Enter your email to receive a reset link'
              : isLogin
              ? 'Sign in to continue your training journey'
              : 'Start your personalized training journey'}
          </p>
        </div>

        {error && (
          <div
            className="mb-6 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3.5 rounded-xl animate-slide-down"
            role="alert"
            aria-live="assertive"
          >
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" aria-label={isForgotPassword ? 'Password reset form' : isLogin ? 'Sign in form' : 'Sign up form'}>
          <div className="space-y-2">
            <label htmlFor="email-input" className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Email Address
            </label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-neutral-500 group-focus-within:text-primary-400 transition-colors" aria-hidden="true" />
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-12"
                placeholder="you@example.com"
                required
                aria-required="true"
                autoComplete="email"
              />
            </div>
          </div>

          {!isForgotPassword && (
            <div className="space-y-2">
              <label htmlFor="password-input" className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-neutral-500 group-focus-within:text-primary-400 transition-colors" aria-hidden="true" />
                <input
                  id="password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-12"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  aria-required="true"
                  aria-describedby="password-requirements"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
              </div>
              <p id="password-requirements" className="sr-only">Password must be at least 6 characters</p>
            </div>
          )}

          {isLogin && !isForgotPassword && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setError(null);
                }}
                className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 font-medium transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary text-lg font-semibold py-3.5 mt-8"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Please wait...
              </span>
            ) : isForgotPassword ? (
              'Send Reset Link'
            ) : (
              isLogin ? 'Sign In' : 'Sign Up'
            )}
          </button>
        </form>

        {!isForgotPassword && !loginOnly && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
              className="text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 font-medium transition-colors text-sm"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        )}
        {!isForgotPassword && loginOnly && (
          <div className="mt-8 text-center">
            <p className="text-neutral-600 dark:text-neutral-400 text-sm">
              New user? Create your first training plan to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
