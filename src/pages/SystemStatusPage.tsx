import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { calculatePayout } from '../lib/fees';
import AdminNavigation from '../components/AdminNavigation';
import { 
  FaServer,
  FaDatabase,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSync,
  FaSignOutAlt
} from 'react-icons/fa';

interface CheckResult {
  name: string;
  ok: boolean;
  message?: string;
  latencyMs?: number;
  count?: number;
  samples?: string[];
  severity?: 'ok' | 'warning' | 'critical';
}

export default function SystemStatusPage() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [loading, setLoading] = useState(true);

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

    const runDataCheck = async (name: string, fn: () => Promise<{ count: number; samples?: string[]; message?: string; severity?: CheckResult['severity'] }>) => {
      const started = performance.now();
      try {
        const result = await fn();
        const latencyMs = Math.round(performance.now() - started);
        results.push({
          name,
          ok: result.count === 0,
          count: result.count,
          samples: result.samples || [],
          message: result.message,
          severity: result.severity || (result.count === 0 ? 'ok' : 'warning'),
          latencyMs,
        });
      } catch (e: any) {
        const latencyMs = Math.round(performance.now() - started);
        results.push({
          name,
          ok: false,
          count: 0,
          severity: 'critical',
          latencyMs,
          message: e?.message || String(e),
        });
      }
    };

    await runOne('admin_settings', async () => {
      const { error } = await supabase.from('admin_settings').select('*').limit(1);
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

    await runDataCheck('Payout mismatches', async () => {
      const { data: settings, error: settingsError } = await supabase
        .from('admin_settings')
        .select('fee_percent, fee_fixed')
        .single();
      if (settingsError) throw settingsError;

      const { data, error } = await supabase
        .from('user_products')
        .select('id, name, size, price, payout, vat_scheme, is_vat0')
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .limit(500);
      if (error) throw error;

      const mismatches = (data || []).filter((offer: any) => {
        const scheme = offer.vat_scheme === 'VAT0' || offer.is_vat0 ? 'VAT0' : offer.vat_scheme === 'MARGIN' ? 'MARGIN' : null;
        const expected = calculatePayout(Number(offer.price) || 0, settings.fee_percent, settings.fee_fixed, scheme);
        return Math.abs(expected - (Number(offer.payout) || 0)) >= 1;
      });

      return {
        count: mismatches.length,
        message: 'Active offers where stored payout differs from current formula.',
        samples: mismatches.slice(0, 4).map((offer: any) => {
          const scheme = offer.vat_scheme === 'VAT0' || offer.is_vat0 ? 'VAT0' : offer.vat_scheme === 'MARGIN' ? 'MARGIN' : null;
          const expected = calculatePayout(Number(offer.price) || 0, settings.fee_percent, settings.fee_fixed, scheme);
          return `${offer.name || 'Offer'} EU ${offer.size || '-'}: ${offer.payout} -> ${expected}`;
        }),
      };
    });

    await runDataCheck('Expired offers still stored', async () => {
      const { data, error } = await supabase
        .from('user_products')
        .select('id, name, size, expires_at')
        .lt('expires_at', new Date().toISOString())
        .limit(100);
      if (error) throw error;
      return {
        count: data?.length || 0,
        message: 'Expired offers that still exist in user_products.',
        samples: (data || []).slice(0, 4).map((offer: any) => `${offer.name || 'Offer'} EU ${offer.size || '-'} expired ${new Date(offer.expires_at).toLocaleDateString('sk-SK')}`),
      };
    });

    await runDataCheck('Sales missing external ID', async () => {
      const { data, error } = await supabase
        .from('user_sales')
        .select('id, name, status, external_id')
        .neq('status', 'cancelled')
        .limit(500);
      if (error) throw error;
      const missing = (data || []).filter((sale: any) => !String(sale.external_id || '').trim());
      return {
        count: missing.length,
        message: 'Non-cancelled sales without external ID.',
        samples: missing.slice(0, 4).map((sale: any) => `${sale.name || 'Sale'} (${sale.status || 'unknown'})`),
      };
    });

    await runDataCheck('Delivered payout dates', async () => {
      const { data, error } = await supabase
        .from('user_sales')
        .select('id, name, status, payout_date')
        .in('status', ['delivered', 'completed'])
        .limit(500);
      if (error) throw error;
      const missing = (data || []).filter((sale: any) => !sale.payout_date);
      return {
        count: missing.length,
        message: 'Delivered/completed sales without payout date.',
        samples: missing.slice(0, 4).map((sale: any) => `${sale.name || 'Sale'} (${sale.status})`),
      };
    });

    await runDataCheck('Profiles missing payout data', async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('email, iban, signature_url')
        .limit(500);
      if (error) throw error;
      const missing = (data || []).filter((profile: any) => !String(profile.iban || '').trim() || !String(profile.signature_url || '').trim());
      return {
        count: missing.length,
        message: 'Profiles missing IBAN or signature.',
        samples: missing.slice(0, 4).map((profile: any) => `${profile.email || 'User'}${!profile.iban ? ' missing IBAN' : ''}${!profile.signature_url ? ' missing signature' : ''}`),
      };
    });

    await runDataCheck('Sales missing documents', async () => {
      const { data, error } = await supabase
        .from('user_sales')
        .select('id, name, status, contract_url, fa_url, sale_type')
        .not('status', 'in', '("cancelled","returned")')
        .limit(500);
      if (error) throw error;
      const missing = (data || []).filter((sale: any) => {
        if (sale.sale_type === 'invoice') return !sale.fa_url;
        return !sale.contract_url && !sale.fa_url;
      });
      return {
        count: missing.length,
        message: 'Active sales missing contract or invoice document.',
        samples: missing.slice(0, 4).map((sale: any) => `${sale.name || 'Sale'} (${sale.sale_type || 'contract'})`),
      };
    });

    await runDataCheck('Offers missing product data', async () => {
      const { data, error } = await supabase
        .from('user_products')
        .select('id, name, size, sku, image_url')
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .limit(500);
      if (error) throw error;
      const missing = (data || []).filter((offer: any) => !String(offer.sku || '').trim() || !String(offer.image_url || '').trim());
      return {
        count: missing.length,
        message: 'Active offers missing SKU or image.',
        samples: missing.slice(0, 4).map((offer: any) => `${offer.name || 'Offer'} EU ${offer.size || '-'}${!offer.sku ? ' missing SKU' : ''}${!offer.image_url ? ' missing image' : ''}`),
      };
    });

    setChecks(results);
    setLoading(false);
  };

  useEffect(() => {
    runChecks();
  }, []);

  const allOk = checks.length > 0 && checks.every(c => c.ok);
  const connectivityChecks = checks.filter(check => typeof check.count !== 'number');
  const dataChecks = checks.filter(check => typeof check.count === 'number');
  const dataIssueCount = dataChecks.reduce((sum, check) => sum + (check.count || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-slate-400 to-gray-600 flex items-center justify-center shadow-lg">
              <FaServer className="text-white text-xl" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">System Status</h1>
              <p className="text-xs sm:text-sm text-gray-400">Supabase connectivity and key tables</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => runChecks()}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm disabled:opacity-50"
              title="Re-run checks"
            >
              <FaSync className={`sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{loading ? 'Checking...' : 'Refresh'}</span>
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/';
              }}
              className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm"
            >
              <FaSignOutAlt className="sm:mr-2" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-8">
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
            {connectivityChecks.map(check => (
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

        <div className="mt-4 sm:mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-gray-900">Data consistency</h2>
              <p className="text-xs sm:text-sm text-gray-600">Operational checks for payouts, documents, and missing profile data.</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              dataIssueCount === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
            }`}>
              {dataIssueCount === 0 ? 'No issues' : `${dataIssueCount} issues`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {dataChecks.map(check => (
              <div
                key={check.name}
                className={`rounded-xl border p-3 sm:p-4 ${
                  check.ok ? 'border-emerald-100 bg-emerald-50' : check.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{check.name}</p>
                    <p className="mt-1 text-xs text-gray-600">{check.message || (check.ok ? 'OK' : 'Needs attention')}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    check.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-amber-800'
                  }`}>
                    {check.count}
                  </span>
                </div>
                {check.samples && check.samples.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-black/5 pt-2">
                    {check.samples.map(sample => (
                      <p key={sample} className="truncate text-xs text-gray-700" title={sample}>
                        {sample}
                      </p>
                    ))}
                  </div>
                )}
                {typeof check.latencyMs === 'number' && (
                  <p className="mt-2 text-[10px] text-gray-500">Checked in {check.latencyMs} ms</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
