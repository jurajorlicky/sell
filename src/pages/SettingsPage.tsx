import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { clearFeesCache } from '../lib/fees';
import AdminNavigation from '../components/AdminNavigation';
import {
  FaSignOutAlt,
  FaSync,
  FaSave,
  FaPercent,
  FaEuroSign,
  FaExclamationTriangle,
  FaSignature,
  FaUpload,
  FaTrash,
  FaCog,
  FaExchangeAlt,
  FaClock,
  FaCheckCircle
} from 'react-icons/fa';

interface AdminSettings {
  id: string;
  fee_percent: number;
  fee_fixed: number;
  offer_expiration_days?: number;
  buyer_signature_url?: string;
  eur_to_czk_rate?: number | null;
}

interface InvoiceImportRun {
  id: string;
  source: string;
  status: 'success' | 'error' | 'skipped';
  started_at: string;
  finished_at: string;
  duration_ms: number;
  summary: {
    messagesChecked?: number;
    attachmentsFound?: number;
    imported?: number;
    matched?: number;
    unmatched?: number;
    skipped?: number;
    errors?: number;
    limit?: number;
    maxImports?: number;
    timezone?: string;
  };
  error?: string | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [feePercent, setFeePercent] = useState<string>('');
  const [feeFixed, setFeeFixed] = useState<string>('');
  const [eurToCzkRate, setEurToCzkRate] = useState<string>('');
  const [offerExpirationDays, setOfferExpirationDays] = useState<number>(30);
  const [refreshing, setRefreshing] = useState(false);
  const [buyerSignatureUrl, setBuyerSignatureUrl] = useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [cronRuns, setCronRuns] = useState<InvoiceImportRun[]>([]);
  const [cronStatsAvailable, setCronStatsAvailable] = useState(true);
  const settingCardClass = 'flex h-full min-h-[156px] flex-col rounded-xl border border-gray-200 bg-gray-50 p-4';
  const settingLabelClass = 'mb-3 flex min-h-[24px] items-center text-xs sm:text-sm font-semibold text-gray-700';
  const settingControlClass = 'h-12 w-full px-3 sm:px-4 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-gray-500/50 focus:border-transparent transition-all duration-200 text-base';
  const settingHelpClass = 'mt-2 min-h-[32px] text-xs leading-5 text-gray-600';

  const loadSettings = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      const { data, error } = await supabase
        .from('admin_settings')
        .select('id, fee_percent, fee_fixed, offer_expiration_days, buyer_signature_url, eur_to_czk_rate')
        .single();

      if (error) throw error;

      setSettings(data);
      setFeePercent((data.fee_percent * 100).toString());
      setFeeFixed(data.fee_fixed.toString());
      setEurToCzkRate(data.eur_to_czk_rate == null ? '' : data.eur_to_czk_rate.toString());
      setOfferExpirationDays(data.offer_expiration_days || 30);
      setBuyerSignatureUrl(data.buyer_signature_url || null);

      const { data: runs, error: runsError } = await supabase
        .from('invoice_import_runs')
        .select('id, source, status, started_at, finished_at, duration_ms, summary, error')
        .eq('source', 'netlify_cron')
        .order('created_at', { ascending: false })
        .limit(25);

      if (runsError) {
        setCronStatsAvailable(false);
        setCronRuns([]);
      } else {
        setCronStatsAvailable(true);
        setCronRuns((runs || []) as InvoiceImportRun[]);
      }
    } catch (err: any) {
      console.error('Error loading settings:', err.message);
      setError('Error loading settings: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const feePercentValue = parseFloat(feePercent) / 100;
      const feeFixedValue = parseFloat(feeFixed);
      const eurToCzkRateValue = eurToCzkRate.trim() ? parseFloat(eurToCzkRate) : null;

      if (isNaN(feePercentValue) || isNaN(feeFixedValue) || (eurToCzkRateValue !== null && isNaN(eurToCzkRateValue))) {
        throw new Error('Invalid fee values');
      }

      if (feePercentValue < 0 || feePercentValue > 1) {
        throw new Error('Percentage fee must be between 0% and 100%');
      }

      if (feeFixedValue < 0) {
        throw new Error('Fixed fee cannot be negative');
      }

      if (eurToCzkRateValue !== null && eurToCzkRateValue <= 0) {
        throw new Error('EUR to CZK rate must be greater than 0');
      }

      if (![7, 14, 30, 60, 90].includes(offerExpirationDays)) {
        throw new Error('Offer expiration period must be 7, 14, 30, 60, or 90 days');
      }

      const { error } = await supabase
        .from('admin_settings')
        .update({
          fee_percent: feePercentValue,
          fee_fixed: feeFixedValue,
          offer_expiration_days: offerExpirationDays,
          eur_to_czk_rate: eurToCzkRateValue,
          buyer_signature_url: buyerSignatureUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings?.id);

      if (error) throw error;

      clearFeesCache();
      setSuccess('Settings have been saved successfully!');
      loadSettings();
    } catch (err: any) {
      console.error('Error saving settings:', err.message);
      setError('Error saving settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSettings();
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error signing out:', err.message);
    }
  };

  const handleRetry = () => {
    setError(null);
    loadSettings();
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    return new Intl.DateTimeFormat('sk-SK', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Bratislava',
    }).format(new Date(value));
  };

  const lastCronRun = cronRuns[0] || null;
  const lastImportRun = cronRuns.find((run) => run.status !== 'skipped') || null;
  const recentImportRuns = cronRuns.filter((run) => run.status !== 'skipped');
  const recentImported = recentImportRuns.reduce((sum, run) => sum + Number(run.summary?.imported || 0), 0);
  const recentMatched = recentImportRuns.reduce((sum, run) => sum + Number(run.summary?.matched || 0), 0);
  const recentErrors = recentImportRuns.reduce((sum, run) => sum + Number(run.summary?.errors || (run.status === 'error' ? 1 : 0)), 0);
  const cronHealthy = lastCronRun && lastCronRun.status !== 'error';

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading settings</h3>
          <p className="text-sm text-gray-500">Please wait...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-gray-400 to-slate-500 rounded-2xl shadow-lg">
                <FaCog className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  Settings
                </h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">System settings management</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm disabled:opacity-50"
              >
                <FaSync className={`sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm"
              >
                <FaSignOutAlt className="sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FaExclamationTriangle className="h-5 w-5 text-red-600" />
                <p className="ml-3 text-sm text-red-800">{error}</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleRetry}
                  className="text-red-800 hover:text-red-100 text-sm font-medium"
                >
                  Try again
                </button>
                <button
                  onClick={() => setError(null)}
                  className="text-red-600 hover:text-red-800"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="ml-3 text-sm text-green-800">{success}</p>
              </div>
              <button
                onClick={() => setSuccess(null)}
                className="text-green-600 hover:text-green-800"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <AdminNavigation />

        {/* Settings Form */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">System Settings</h3>
            <p className="text-gray-600 text-xs sm:text-sm mt-1">Configure fees and system parameters</p>
          </div>

          <div className="p-3 sm:p-4 lg:p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:gap-6">
              <div className={settingCardClass}>
                <label className={settingLabelClass}>
                  <FaPercent className="mr-2 flex-shrink-0" />
                  Percentage Fee (%)
                </label>
                <input
                  type="number"
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value)}
                  className={settingControlClass}
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="20"
                />
                <p className={settingHelpClass}>Percentage fee from sale price</p>
              </div>

              <div className={settingCardClass}>
                <label className={settingLabelClass}>
                  <FaEuroSign className="mr-2 flex-shrink-0" />
                  Fixed Fee (€)
                </label>
                <input
                  type="number"
                  value={feeFixed}
                  onChange={(e) => setFeeFixed(e.target.value)}
                  className={settingControlClass}
                  step="0.01"
                  min="0"
                  placeholder="5.00"
                />
                <p className={settingHelpClass}>Fixed fee per sale</p>
              </div>

              <div className={settingCardClass}>
                <label className={settingLabelClass}>
                  <FaExclamationTriangle className="mr-2 flex-shrink-0" />
                  Offer Expiration Period (days)
                </label>
                <select
                  value={offerExpirationDays}
                  onChange={(e) => setOfferExpirationDays(parseInt(e.target.value))}
                  className={settingControlClass}
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
                <p className={settingHelpClass}>After this number of days, the offer will be automatically deleted</p>
              </div>

              <div className={settingCardClass}>
                <label className={settingLabelClass}>
                  <FaExchangeAlt className="mr-2 flex-shrink-0" />
                  EUR to CZK Rate
                </label>
                <input
                  type="number"
                  value={eurToCzkRate}
                  onChange={(e) => setEurToCzkRate(e.target.value)}
                  className={settingControlClass}
                  step="0.01"
                  min="0.01"
                  placeholder="No rate set"
                />
                <p className={settingHelpClass}>CZK input is available only when this rate is set.</p>
              </div>
            </div>

            <div className="mt-4 sm:mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${cronHealthy ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {cronHealthy ? <FaCheckCircle /> : <FaClock />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Netlify FA cron</h4>
                    <p className="mt-1 text-xs leading-5 text-gray-600">
                      Automatický import FA beží o 00:00 a 12:00 podľa Europe/Bratislava.
                    </p>
                  </div>
                </div>
                <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${cronHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {!cronStatsAvailable ? 'Stats unavailable' : lastCronRun ? lastCronRun.status : 'No runs yet'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-white p-3">
                  <p className="text-xs text-gray-500">Last heartbeat</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{formatDateTime(lastCronRun?.started_at)}</p>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <p className="text-xs text-gray-500">Last import</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{formatDateTime(lastImportRun?.started_at)}</p>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <p className="text-xs text-gray-500">Imported / matched</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{recentImported} / {recentMatched}</p>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <p className="text-xs text-gray-500">Errors</p>
                  <p className={`mt-1 text-sm font-semibold ${recentErrors > 0 ? 'text-red-700' : 'text-gray-900'}`}>{recentErrors}</p>
                </div>
              </div>

              {lastImportRun && (
                <p className="mt-3 text-xs leading-5 text-gray-600">
                  Last import checked {lastImportRun.summary?.messagesChecked || 0} emails,
                  found {lastImportRun.summary?.attachmentsFound || 0} PDFs,
                  imported {lastImportRun.summary?.imported || 0}.
                  {lastImportRun.error ? ` Error: ${lastImportRun.error}` : ''}
                </p>
              )}

              {!cronStatsAvailable && (
                <p className="mt-3 text-xs leading-5 text-amber-700">
                  Cron stats table is not available yet. Run the Supabase migration and deploy production to start collecting stats.
                </p>
              )}
            </div>

            {/* Buyer Signature Upload */}
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                <FaSignature className="inline mr-2" />
                Buyer Signature
              </label>
              {buyerSignatureUrl ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 gap-3">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <img src={buyerSignatureUrl} alt="Buyer Signature" className="h-14 sm:h-16 w-auto object-contain flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Signature uploaded</p>
                        <p className="text-xs text-gray-500">This signature will be used in all PDF contracts</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setBuyerSignatureUrl(null);
                      }}
                      className="p-2 sm:p-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    >
                      <FaTrash className="text-sm" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="flex flex-col items-center justify-center w-full h-20 sm:h-24 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-2 sm:pt-3 pb-3 sm:pb-4">
                      <FaUpload className="text-gray-400 text-lg sm:text-xl mb-1.5 sm:mb-2" />
                      <p className="text-xs text-gray-600 font-medium text-center px-2">Click to upload signature image</p>
                      <p className="text-xs text-gray-500 mt-1">PNG, JPG (max 2MB)</p>
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        if (file.size > 2 * 1024 * 1024) {
                          setError('File is too large. Maximum size is 2MB');
                          return;
                        }
                        
                        try {
                          setUploadingSignature(true);
                          setError(null);
                          
                          // Convert to base64
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const base64 = reader.result as string;
                            setBuyerSignatureUrl(base64);
                            setUploadingSignature(false);
                          };
                          reader.onerror = () => {
                            setError('Error loading file');
                            setUploadingSignature(false);
                          };
                          reader.readAsDataURL(file);
                        } catch (err: any) {
                          console.error('Error uploading buyer signature', err);
                          setError('Error uploading signature: ' + (err.message || 'Unknown error'));
                          setUploadingSignature(false);
                        }
                        
                        e.target.value = '';
                      }}
                      disabled={uploadingSignature}
                      className="hidden"
                      id="buyer-signature-upload"
                    />
                  </label>
                  {uploadingSignature && (
                    <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Uploading...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Preview */}
            {feePercent && feeFixed && (
              <div className="mt-6 bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-3">Calculation Preview</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
                  {[100, 200, 500].map(price => {
                    const feePercentValue = parseFloat(feePercent) / 100;
                    const feeFixedValue = parseFloat(feeFixed);
                    const payout = price * (1 - feePercentValue) - feeFixedValue;
                    return (
                      <div key={price} className="bg-white rounded-lg p-2 sm:p-3">
                        <div className="text-xs sm:text-sm text-gray-600">Sale Price: <span className="text-gray-900 font-semibold">{price} €</span></div>
                        <div className="text-xs sm:text-sm text-gray-600">Payout: <span className="text-green-600 font-semibold">{formatCurrency(Math.max(0, payout))}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveSettings}
                disabled={saving || !feePercent || !feeFixed}
                className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transform hover:scale-105 text-sm sm:text-base"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <FaSave className="mr-2" />
                    <span className="hidden sm:inline">Save Settings</span>
                    <span className="sm:hidden">Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
