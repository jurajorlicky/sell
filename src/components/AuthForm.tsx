import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const navigate = useNavigate();

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
        
        // Check if email confirmation is required
        if (data.user && !data.session) {
          // Email confirmation required
          setShowEmailVerification(true);
          setEmail('');
          setPassword('');
        } else {
          // Auto-confirmed, navigate to dashboard
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
      console.error('Auth error:', err);
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
              
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Skontrolujte svoj email</h2>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-6 mb-6">
                <p className="text-sm sm:text-base text-gray-700 mb-4 leading-relaxed">
                  Úspešne ste sa zaregistrovali! Poslali sme vám overovací email na vašu emailovú adresu.
                </p>
                <p className="text-sm sm:text-base text-gray-700 mb-4 leading-relaxed">
                  <strong>Prosím skontrolujte svoju emailovú schránku</strong> a kliknite na odkaz v emaili, aby ste overili svoj účet.
                </p>
                <p className="text-xs sm:text-sm text-gray-600">
                  Ak email nevidíte, skontrolujte aj priečinok so spam správami.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowEmailVerification(false);
                  setIsSignUp(false);
                }}
                className="w-full bg-black text-white font-semibold py-2 sm:py-3 px-4 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
              >
                Rozumiem, prihlásiť sa
              </button>
            </div>
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
            <p className="text-gray-600 text-xs sm:text-sm">Vitajte späť! Prihláste sa do svojho účtu.</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                  E-mail adresa
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  placeholder="vas@email.com"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                  Heslo
                </label>
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
                  Načítava sa...
                </div>
              ) : (
                isSignUp ? 'Vytvoriť účet' : 'Prihlásiť sa'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors duration-200"
              >
                {isSignUp ? 'Už máte účet? Prihláste sa' : 'Nemáte účet? Zaregistrujte sa'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}