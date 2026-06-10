import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

export default function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string>('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const navigate = useNavigate();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        throw new Error(resetError.message);
      }

      setResetEmailSent(true);
    } catch (err: any) {
      logger.error('Password reset error', err);
      setError(err.message || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
  
    try {
      if (isSignUp) {
        const { error: signUpError, data } = await supabase.auth.signUp({
          email,
          password,
        });
  
        if (signUpError) {
          throw new Error(`Signup: ${signUpError.message} - ${JSON.stringify(signUpError)}`);
        }
        
        // Show email verification message if user was created
        // Most common case: no session means email confirmation is required
        if (data.user) {
          if (!data.session) {
            // No session = email confirmation required
            setRegisteredEmail(email);
            setShowEmailVerification(true);
            setEmail('');
            setPassword('');
          } else {
            // Has session - might be auto-confirmed, but check email_confirmed_at
            const emailConfirmed = data.user.email_confirmed_at !== null;
            if (!emailConfirmed) {
              setRegisteredEmail(email);
              setShowEmailVerification(true);
              setEmail('');
              setPassword('');
            } else {
              // Email confirmed and has session - navigate to dashboard
              navigate('/dashboard');
            }
          }
        } else {
          // Fallback - shouldn't happen
          navigate('/dashboard');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          throw new Error(`SignIn: ${signInError.message} - ${JSON.stringify(signInError)}`);
        }
        navigate('/dashboard');
      }
    } catch (err: any) {
      logger.error('Auth error', err);
      setError(err.message || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  // Show email verification message
  if (showEmailVerification) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
            {/* Logo */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-black rounded-2xl mb-4">
                <img 
                  src="https://cdn.myshoptet.com/usr/www.airkicks.eu/user/logos/logo_final-1.png" 
                  alt="Seller Hub Logo" 
                  className="h-6 w-6 sm:h-10 sm:w-10 object-contain filter brightness-0 invert"
                />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">AirKicks Consign</h1>
            </div>

            {/* Email Verification Message */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full mb-6">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Check your email</h2>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-6 mb-6">
                <p className="text-sm sm:text-base text-gray-700 mb-4 leading-relaxed">
                  You have successfully registered! We have sent a verification email to your email address.
                </p>
                {registeredEmail && (
                  <p className="text-sm sm:text-base text-gray-900 mb-4 leading-relaxed font-semibold text-center">
                    📧 {registeredEmail}
                  </p>
                )}
                <p className="text-sm sm:text-base text-gray-700 mb-4 leading-relaxed">
                  <strong>Please check your email inbox</strong> and click on the link in the email to verify your account.
                </p>
                <p className="text-xs sm:text-sm text-gray-600">
                  If you don't see the email, please also check your spam folder.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowEmailVerification(false);
                  setIsSignUp(false);
                  setRegisteredEmail('');
                }}
                className="w-full bg-black text-white font-semibold py-2 sm:py-3 px-4 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
              >
                Got it, sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show forgot password form
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
            {/* Logo */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-black rounded-2xl mb-4">
                <img
                  src="https://cdn.myshoptet.com/usr/www.airkicks.eu/user/logos/logo_final-1.png"
                  alt="Seller Hub Logo"
                  className="h-6 w-6 sm:h-10 sm:w-10 object-contain filter brightness-0 invert"
                />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">AirKicks Consign</h1>
              <p className="text-gray-600 text-xs sm:text-sm">Reset your password</p>
            </div>

            {resetEmailSent ? (
              <div className="text-center">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 sm:p-6 mb-6">
                  <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    If an account exists for <span className="font-semibold text-gray-900">{email}</span>, we've sent a password reset link to that address.
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-3">
                    Check your inbox (and spam folder) and follow the link to set a new password.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetEmailSent(false);
                  }}
                  className="w-full bg-black text-white font-semibold py-2 sm:py-3 px-4 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-6">
                <div>
                  <label htmlFor="reset-email" className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                    Email address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                    placeholder="your@email.com"
                    required
                  />
                  <p className="mt-2 text-xs sm:text-sm text-gray-500">
                    We'll send a link to this email so you can choose a new password.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-800">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-black text-white font-semibold py-2 sm:py-3 px-4 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setError(null);
                    }}
                    className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors duration-200"
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-black rounded-2xl mb-4">
              <img
                src="https://cdn.myshoptet.com/usr/www.airkicks.eu/user/logos/logo_final-1.png"
                alt="Seller Hub Logo"
                className="h-6 w-6 sm:h-10 sm:w-10 object-contain filter brightness-0 invert"
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">AirKicks Consign</h1>
            <p className="text-gray-600 text-xs sm:text-sm">Welcome back! Sign in to your account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  placeholder="your@email.com"
                  required
                />
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="block text-xs sm:text-sm font-semibold text-gray-700">
                    Password
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setError(null);
                      }}
                      className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors duration-200"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white font-semibold py-2 sm:py-3 px-4 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading...
                </div>
              ) : (
                isSignUp ? 'Create account' : 'Sign in'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors duration-200"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}