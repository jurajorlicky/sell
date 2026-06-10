import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import { User } from '@supabase/supabase-js';
import { supabase } from "./lib/supabase";
import { logger } from "./lib/logger";

// Error fallback component
const ErrorFallback = ({ error, resetError }: { error: Error; resetError: () => void }) => (
  <div className="min-h-screen flex justify-center items-center bg-gray-50">
    <div className="text-center max-w-md mx-auto p-6">
      <div className="text-red-600 mb-4">
        <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Application error</h1>
      <p className="text-gray-600 mb-4">An unexpected error occurred while loading the application.</p>
      <button
        onClick={resetError}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Try again
      </button>
    </div>
  </div>
);

// Page loading spinner shown while lazy chunks load
const PageLoader = () => (
  <div className="min-h-screen flex justify-center items-center bg-white">
    <div className="text-center">
      <div className="inline-block w-10 h-10 border-4 border-gray-200 border-t-black rounded-full animate-spin mb-3"></div>
      <p className="text-gray-500 text-sm">Loading...</p>
    </div>
  </div>
);

// Lazy-loaded route components — each gets its own JS chunk
const AuthForm = lazy(() => import("./components/AuthForm"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const Profile = lazy(() => import("./components/Profile"));
const UserSales = lazy(() => import("./components/UserSales"));
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const ListedProductsPage = lazy(() => import("./pages/ListedProductsPage"));
const SalesPage = lazy(() => import("./pages/SalesPage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SystemStatusPage = lazy(() => import("./pages/SystemStatusPage"));
const EshopSalesPage = lazy(() => import("./pages/EshopSalesPage"));
const WarehousePage = lazy(() => import("./pages/WarehousePage"));
const WtbListPage = lazy(() => import("./pages/WtbListPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));

export default function App() {
  const currentAppVersion = __APP_VERSION__;
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appError, setAppError] = useState<Error | null>(null);
  const [pendingAppVersion, setPendingAppVersion] = useState<string | null>(null);
  const [reloadCountdown, setReloadCountdown] = useState(15);
  
  const adminCacheRef = useRef<{[key: string]: { value: boolean; timestamp: number } }>({});
  const initializingRef = useRef(false);
  const lastKnownAdminStateRef = useRef<boolean | null>(null);
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const checkAdminStatus = useCallback(async (userId: string, forceRefresh = false): Promise<boolean> => {
    try {
      // Check memory cache first
      const cached = adminCacheRef.current[userId];
      if (cached && !forceRefresh) {
        const age = Date.now() - cached.timestamp;
        if (age < CACHE_DURATION) {
          logger.debug('Returning cached admin status', { userId, isAdmin: cached.value, age });
          lastKnownAdminStateRef.current = cached.value;
          return cached.value;
        }
      }

      // Check sessionStorage for persistence across page reloads
      if (!forceRefresh) {
        try {
          const stored = sessionStorage.getItem(`admin_${userId}`);
          if (stored) {
            const { value, timestamp } = JSON.parse(stored);
            const age = Date.now() - timestamp;
            if (age < CACHE_DURATION) {
              logger.debug('Returning sessionStorage admin status', { userId, isAdmin: value });
              adminCacheRef.current[userId] = { value, timestamp };
              lastKnownAdminStateRef.current = value;
              return value;
            }
          }
        } catch (e) {
          logger.debug('Failed to read from sessionStorage', e);
        }
      }
      
      logger.debug('Checking admin status from DB', { userId });
      const { data: adminData, error: adminError } = await Promise.race([
        supabase.from('admin_users').select('id').eq('id', userId).single(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin check timeout')), 1500))
      ]) as any;
      
      if (adminError && adminError.code !== 'PGRST116') {
        logger.warn('Admin check error', { userId, error: adminError.message });
        // Return last known state if available, otherwise false
        const fallback = lastKnownAdminStateRef.current ?? false;
        logger.debug('Using fallback admin status', { userId, fallback });
        return fallback;
      }
      
      const isAdminUser = !!adminData;
      const timestamp = Date.now();
      
      // Update caches
      adminCacheRef.current[userId] = { value: isAdminUser, timestamp };
      lastKnownAdminStateRef.current = isAdminUser;
      
      // Persist to sessionStorage
      try {
        sessionStorage.setItem(`admin_${userId}`, JSON.stringify({ value: isAdminUser, timestamp }));
      } catch (e) {
        logger.debug('Failed to write to sessionStorage', e);
      }
      
      logger.info('Admin status checked and cached', { userId, isAdmin: isAdminUser });
      return isAdminUser;
    } catch (err: any) {
      logger.warn('Error checking admin status', { userId, error: err.message });
      // Return last known state if available, otherwise false
      const fallback = lastKnownAdminStateRef.current ?? false;
      logger.debug('Using fallback admin status after error', { userId, fallback });
      return fallback;
    }
  }, []);

  const initializeAuth = useCallback(async () => {
    if (initializingRef.current) {
      logger.debug('Auth initialization already in progress, skipping');
      return;
    }
    
    try {
      initializingRef.current = true;
      setError(null);
      setAppError(null);
      
      logger.debug('Starting auth initialization');
      
      // Quick auth check with shorter timeout
      const { data: { user }, error: authError } = await Promise.race([
        supabase.auth.getUser(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 2000))
      ]) as any;

      if (authError && authError.message !== 'Auth session missing!') {
        logger.debug('No auth session', { error: authError.message });
        setUser(null);
        setIsAdmin(false);
        return;
      }

      if (!user) {
        logger.debug('No user found');
        setUser(null);
        setIsAdmin(false);
        return;
      }

      setUser(user);
      logger.debug('User set, checking admin status', { userId: user.id });
      
      // Check admin status with caching
      const adminStatus = await checkAdminStatus(user.id);
      setIsAdmin(adminStatus);
      logger.info('Auth initialization completed', { userId: user.id, isAdmin: adminStatus });
      
    } catch (err: any) {
      logger.warn('Auth initialization error', { error: err.message });
      
      // On timeout, try to get user again with a short timeout so we never hang
      if (err.message.includes('timeout')) {
        try {
          const result = await Promise.race([
            supabase.auth.getUser(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Retry timeout')), 2500))
          ]) as { data: { user: User | null } };
          if (result?.data?.user) {
            setUser(result.data.user);
            const cachedStatus = lastKnownAdminStateRef.current ?? false;
            setIsAdmin(cachedStatus);
            logger.debug('Using cached admin status after timeout', { userId: result.data.user.id, cachedStatus });
          } else {
            setUser(null);
            setIsAdmin(false);
          }
        } catch {
          setUser(null);
          setIsAdmin(false);
          setError('Connection slow or unavailable. Check your network and try again.');
        }
      } else {
        setUser(null);
        setIsAdmin(false);
        setError("Error loading: " + err.message);
      }
    } finally {
      setLoading(false);
      initializingRef.current = false;
    }
  }, [checkAdminStatus]);

  // Global error handler
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logger.error('Global error', event.error);
      setAppError(event.error);
    };
    
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logger.error('Unhandled rejection', event.reason);
      setAppError(new Error(event.reason?.message || 'Unhandled promise rejection'));
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
      
      return () => {
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      };
    }
    return () => {};
  }, []);

  // Safety: force loading false after 12s so user never stays stuck on spinner
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          logger.warn('Auth init safety timeout - forcing loading false');
          setError('Loading took too long. Try refreshing.');
          return false;
        }
        return prev;
      });
    }, 12000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      if (isMounted) {
        await initializeAuth();
      }
    };
    
    // Quick initialization
    initialize();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      
      logger.debug('Auth state changed', { event, hasSession: !!session });
      
      try {
        const currentUser = session?.user ?? null;
        
        if (currentUser) {
          // Only refresh admin status on SIGNED_IN, not on every state change
          if (event === 'SIGNED_IN') {
            logger.debug('User signed in, clearing cache and checking admin status', { userId: currentUser.id });
            // Clear cache for this user only
            delete adminCacheRef.current[currentUser.id];
            try {
              sessionStorage.removeItem(`admin_${currentUser.id}`);
            } catch (e) {
              logger.debug('Failed to clear sessionStorage', e);
            }
            
            setUser(currentUser);
            const adminStatus = await checkAdminStatus(currentUser.id, true); // Force refresh
            setIsAdmin(adminStatus);
          } else if (event === 'SIGNED_OUT') {
            logger.debug('User signed out');
            setUser(null);
            setIsAdmin(false);
            adminCacheRef.current = {};
            lastKnownAdminStateRef.current = null;
            try {
              // Clear all admin cache from sessionStorage
              Object.keys(sessionStorage).forEach(key => {
                if (key.startsWith('admin_')) {
                  sessionStorage.removeItem(key);
                }
              });
            } catch (e) {
              logger.debug('Failed to clear sessionStorage', e);
            }
          } else {
            // For other events (TOKEN_REFRESHED, etc.), use cached status
            logger.debug('Auth event, using cached admin status', { event });
            setUser(currentUser);
            // Don't re-check admin status on token refresh - use cached value
            if (lastKnownAdminStateRef.current !== null) {
              setIsAdmin(lastKnownAdminStateRef.current);
            } else {
              // Only check if we don't have a cached value
              const adminStatus = await checkAdminStatus(currentUser.id);
              setIsAdmin(adminStatus);
            }
          }
        } else {
          setUser(null);
          setIsAdmin(false);
        }
        setError(null);
      } catch (err: any) {
        logger.warn('Error in auth state change handler', { error: err.message });
        // On error, preserve current state if user exists
        if (session?.user) {
          const fallback = lastKnownAdminStateRef.current ?? false;
          setIsAdmin(fallback);
        } else {
          setIsAdmin(false);
        }
      }
    });
    
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [initializeAuth, checkAdminStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isCancelled = false;

    const checkForNewVersion = async () => {
      try {
        const response = await fetch(`/version.json?ts=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'cache-control': 'no-cache'
          }
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const latestVersion = data?.version;

        if (!latestVersion || latestVersion === currentAppVersion || isCancelled) {
          return;
        }

        if (document.visibilityState === 'hidden') {
          window.location.reload();
          return;
        }

        setPendingAppVersion((prev) => prev || latestVersion);
      } catch (versionError) {
        logger.debug('Version check failed', versionError);
      }
    };

    checkForNewVersion();

    const intervalId = window.setInterval(checkForNewVersion, 60000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForNewVersion();
      } else if (pendingAppVersion) {
        window.location.reload();
      }
    };

    window.addEventListener('focus', checkForNewVersion);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkForNewVersion);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentAppVersion, pendingAppVersion]);

  useEffect(() => {
    if (!pendingAppVersion) {
      setReloadCountdown(15);
      return;
    }

    if (document.visibilityState === 'hidden') {
      window.location.reload();
      return;
    }

    setReloadCountdown(15);

    const timeoutId = window.setTimeout(() => {
      window.location.reload();
    }, 15000);

    const intervalId = window.setInterval(() => {
      setReloadCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [pendingAppVersion]);

  // Show error fallback if there's an app error
  if (appError) {
    return <ErrorFallback error={appError} resetError={() => setAppError(null)} />;
  }

  // Quick loading screen with timeout
  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-white">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-gray-200 border-t-black rounded-full animate-spin mb-4"></div>
          <p className="text-gray-900 font-medium">Loading...</p>
          <p className="text-gray-600 text-sm mt-2">Please wait</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
    {pendingAppVersion && (
      <div className="fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-3">
        <div className="w-full max-w-xl rounded-2xl border border-blue-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">A new version is ready</p>
              <p className="text-xs text-gray-600">The app will refresh automatically in {reloadCountdown}s.</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              Refresh now
            </button>
          </div>
        </div>
      </div>
    )}
    <Routes>
      <Route
        path="/reset-password"
        element={<ResetPasswordPage />}
      />
      <Route
        path="/"
        element={
          !user ? (
            <div className="min-h-screen flex justify-center items-center bg-gray-50">
              <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-lg">
                <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                  Sign In
                </h1>
                <AuthForm />
                {error && (
                  <div className="mt-4 p-2 bg-red-100 text-red-800 rounded text-center text-sm">
                    {error}
                  </div>
                )}
              </div>
            </div>
          ) : isAdmin ? (
            <Navigate to="/admin" replace />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard"
        element={user && !isAdmin ? <Dashboard isAdmin={isAdmin} /> : <Navigate to={isAdmin ? "/admin" : "/"} replace />}
      />
      <Route
        path="/profile"
        element={user ? <Profile /> : <Navigate to="/" replace />}
      />
      <Route
        path="/sales"
        element={user ? <UserSales /> : <Navigate to="/" replace />}
      />
      <Route
        path="/admin"
        element={user && isAdmin ? <AdminDashboard /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/products"
        element={user && isAdmin ? <ProductsPage /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/users"
        element={user && isAdmin ? <UsersPage /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/invoices"
        element={user && isAdmin ? <InvoicesPage /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/listed-products"
        element={user && isAdmin ? <ListedProductsPage /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/sales"
        element={user && isAdmin ? <SalesPage /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/settings"
        element={user && isAdmin ? <SettingsPage /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/system-status"
        element={user && isAdmin ? <SystemStatusPage /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/eshop-sales"
        element={user && isAdmin ? <EshopSalesPage /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/warehouse"
        element={user && isAdmin ? <WarehousePage /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/wtb-list"
        element={user && isAdmin ? <WtbListPage /> : <Navigate to="/dashboard" replace />}
      />
    </Routes>
    </Suspense>
  );
}
