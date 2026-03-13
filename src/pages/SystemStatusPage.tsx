import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminNavigation from '../components/AdminNavigation';
import { 
  FaServer,
  FaDatabase,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSync
} from 'react-icons/fa';

interface CheckResult {
  name: string;
  ok: boolean;
  message?: string;
  latencyMs?: number;
}

export default function SystemStatusPage() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const runChecks = async () => {
      setLoading(true);
      const results: CheckResult[] = [];

      const runOne = async (name: string, fn: () => Promise<void>) => {
        const started = performance.now();
        try {
          await fn();
          const latencyMs = Math.round(performance.now() - started);
          results.push({ name, ok: true, latencyMs });
        } catch (e: any) {
          const latencyMs = Math.round(performance.now() - started);
          results.push({
            name,
            ok: false,
            latencyMs,
            message: e?.message || String(e),
          });
        }
      };

      await runOne('admin_settings', async () => {
        const { error } = await supabase.from('admin_settings').select('key').limit(1);
        if (error) throw error;
      });

      await runOne('products', async () => {
        const { error } = await supabase.from('products').select('id').limit(1);
        if (error && error.code !== 'PGRST116') throw error;
      });

      await runOne('user_products', async () => {
        const { error } = await supabase.from('user_products').select('id').limit(1);
        if (error && error.code !== 'PGRST116') throw error;
      });

      await runOne('user_sales', async () => {
        const { error } = await supabase.from('user_sales').select('id').limit(1);
        if (error && error.code !== 'PGRST116') throw error;
      });

      if (!cancelled) {
        setChecks(results);
        setLoading(false);
      }
    };

    runChecks();
    return () => { cancelled = true; };
  }, []);

  const allOk = checks.length > 0 && checks.every(c => c.ok);

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <FaServer className="text-white text-lg" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900">System Status</h1>
              <p className="text-xs sm:text-sm text-gray-500">Supabase connectivity and key tables</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-8">
        <AdminNavigation />

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <FaDatabase className="text-gray-600" />
              <span className="text-sm sm:text-base font-semibold text-gray-900">Supabase checks</span>
            </div>
            <div className="flex items-center space-x-2 text-xs sm:text-sm">
              {loading ? (
                <span className="inline-flex items-center text-gray-500">
                  <FaSync className="animate-spin mr-1" /> Checking...
                </span>
              ) : allOk ? (
                <span className="inline-flex items-center text-emerald-600">
                  <FaCheckCircle className="mr-1" /> All systems operational
                </span>
              ) : (
                <span className="inline-flex items-center text-amber-600">
                  <FaExclamationTriangle className="mr-1" /> Issues detected
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {checks.map(check => (
              <div
                key={check.name}
                className={`rounded-xl border p-3 sm:p-4 ${
                  check.ok ? 'border-emerald-100 bg-emerald-50' : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs sm:text-sm font-semibold text-gray-900 break-words">
                    {check.name}
                  </p>
                  {check.ok ? (
                    <FaCheckCircle className="text-emerald-600 text-sm" />
                  ) : (
                    <FaExclamationTriangle className="text-amber-500 text-sm" />
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-gray-600">
                  {check.ok ? 'OK' : (check.message || 'Error')}
                </p>
                {typeof check.latencyMs === 'number' && (
                  <p className="mt-1 text-[10px] text-gray-500">
                    Response time: {check.latencyMs} ms
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

