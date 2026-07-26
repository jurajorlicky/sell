import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

const AUTH_LOGO_URL = 'https://cdn.myshoptet.com/usr/www.airkicks.eu/user/logos/nove_logo3_png_shoptet.png';

const getResetPasswordError = (error: unknown): string => {
  const message = ((error as { message?: string })?.message || String(error || '')).toLowerCase();

  if (message.includes('same password')) return 'Please choose a password you have not used before.';
  if (message.includes('weak password')) return 'Use a stronger password with at least 6 characters.';
  if (message.includes('session') || message.includes('expired') || message.includes('invalid')) {
    return 'This reset link is invalid or expired. Please request a new one.';
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Connection problem. Please check your internet and try again.';
  }

  return 'Could not update your password. Please try again.';
};

function ResetPasswordErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm2.28-10.28a.75.75 0 00-1.06-1.06L10 7.88 8.78 6.66a.75.75 0 10-1.06 1.06L8.94 8.94 7.72 10.16a.75.75 0 101.06 1.06L10 10l1.22 1.22a.75.75 0 101.06-1.06l-1.22-1.22 1.22-1.22z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-800">Password could not be updated</p>
          <p className="mt-0.5 text-xs sm:text-sm text-red-700">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && isMounted) {
        setReady(true);
      }
    });

    // If the recovery session was already established before this listener was attached
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && isMounted) {
        setReady(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setSuccess(true);
    } catch (err: any) {
      logger.error('Password update error', err);
      setError(getResetPasswordError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl mb-4 border border-gray-200 shadow-sm p-2">
              <img
                src={AUTH_LOGO_URL}
                alt="Seller Hub Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">AirKicks Consign</h1>
            <p className="text-gray-600 text-xs sm:text-sm">Set a new password</p>
          </div>

          {success ? (
            <div className="text-center">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 sm:p-6 mb-6">
                <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  Your password has been updated successfully.
                </p>
              </div>
              <button
                onClick={() => navigate('/')}
                className="w-full bg-black text-white font-semibold py-2 sm:py-3 px-4 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
              >
                Continue
              </button>
            </div>
          ) : !ready ? (
            <div className="text-center">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 sm:p-6 mb-6">
                <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  This password reset link is invalid or has expired. Please request a new one from the sign in page.
                </p>
              </div>
              <button
                onClick={() => navigate('/')}
                className="w-full bg-black text-white font-semibold py-2 sm:py-3 px-4 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                    Confirm new password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              {error && (
                <ResetPasswordErrorBox message={error} />
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white font-semibold py-2 sm:py-3 px-4 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
              >
                {loading ? 'Saving...' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
