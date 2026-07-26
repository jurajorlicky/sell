import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaEnvelopeOpenText,
  FaFileInvoice,
  FaFileContract,
  FaExclamationTriangle,
  FaCheckCircle,
  FaSearch,
  FaSync,
  FaSignOutAlt,
  FaDownload,
  FaExternalLinkAlt,
} from 'react-icons/fa';
import { supabase } from '../lib/supabase';
import AdminNavigation from '../components/AdminNavigation';
import { useToast } from '../components/Toast';

type Filter = 'all' | 'invoice' | 'contract' | 'unmatched' | 'error';

interface ImportResult {
  uid: number;
  from: string;
  subject: string;
  filename: string;
  type: 'invoice' | 'contract';
  orderNumber: string | null;
  matchedSaleId: string | null;
  bucket: string | null;
  path: string | null;
  publicUrl: string | null;
  status: string;
  message: string;
}

interface ImportSummary {
  messagesChecked: number;
  attachmentsFound: number;
  imported: number;
  matched: number;
  unmatched: number;
  skipped: number;
  errors: number;
}

const emptySummary: ImportSummary = {
  messagesChecked: 0,
  attachmentsFound: 0,
  imported: 0,
  matched: 0,
  unmatched: 0,
  skipped: 0,
  errors: 0,
};

export default function InvoiceEmailPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [results, setResults] = useState<ImportResult[]>([]);
  const [summary, setSummary] = useState<ImportSummary>(emptySummary);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [limit, setLimit] = useState('30');
  const [dryRun, setDryRun] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredResults = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return results.filter((result) => {
      if (filter === 'invoice' && result.type !== 'invoice') return false;
      if (filter === 'contract' && result.type !== 'contract') return false;
      if (filter === 'unmatched' && !result.status.includes('unmatched')) return false;
      if (filter === 'error' && result.status !== 'error') return false;
      if (!q) return true;

      return [
        result.subject,
        result.filename,
        result.orderNumber,
        result.from,
        result.path,
        result.message,
      ].some((field) => field?.toLowerCase().includes(q));
    });
  }, [filter, results, searchTerm]);

  const runImport = async (nextDryRun = dryRun) => {
    try {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Missing auth session');

      const response = await fetch('/.netlify/functions/import-email-invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          limit: Number(limit) || 30,
          dryRun: nextDryRun,
          overwrite,
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Import failed');
      }

      setResults(payload.results || []);
      setSummary(payload.summary || emptySummary);
      setDryRun(nextDryRun);
      showToast(nextDryRun ? 'Mailbox scan completed' : 'Mailbox import completed', 'success');
    } catch (err: any) {
      setError(err.message || 'Import failed');
      showToast('Invoice email import failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const statCards = [
    { label: 'Emails', value: summary.messagesChecked, tone: 'gray' },
    { label: 'PDFs', value: summary.attachmentsFound, tone: 'blue' },
    { label: 'Matched', value: summary.matched, tone: 'emerald' },
    { label: 'Unmatched', value: summary.unmatched, tone: 'amber' },
    { label: 'Errors', value: summary.errors, tone: 'red' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 shadow-lg sm:h-12 sm:w-12">
                <FaEnvelopeOpenText className="text-xl text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white sm:text-2xl">Invoice Email</h1>
                <p className="hidden text-sm text-gray-400 sm:block">Import invoice PDFs from mailbox</p>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-white/20"
            >
              <FaSignOutAlt />
              <span className="ml-2 hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <AdminNavigation />

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-center">
              <FaExclamationTriangle className="mr-3 flex-shrink-0 text-red-400" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400">×</button>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Last emails</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="h-4 w-4 accent-pink-500"
                />
                Dry run
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="h-4 w-4 accent-pink-500"
                />
                Overwrite PDFs
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                onClick={() => runImport(true)}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
              >
                <FaSearch className="mr-2 text-xs" />
                Scan
              </button>
              <button
                onClick={() => runImport(false)}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-700 disabled:opacity-50"
              >
                <FaDownload className="mr-2 text-xs" />
                {loading ? 'Running...' : 'Import'}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Import Results</h2>
              <p className="text-sm text-gray-500">Invoices go to `invoices/matched` or `invoices/unmatched`.</p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search subject, file, order..."
                  className="w-full rounded-xl border border-gray-300 py-2 pl-8 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-400 sm:w-72"
                />
              </div>
              <button
                onClick={() => runImport(dryRun)}
                disabled={loading}
                title="Refresh"
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <FaSync className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
            <div className="flex flex-wrap gap-2">
              {[
                ['all', 'All'],
                ['invoice', 'Invoices'],
                ['contract', 'Zmluvy'],
                ['unmatched', 'Unmatched'],
                ['error', 'Errors'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id as Filter)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === id ? 'bg-pink-100 text-pink-700' : 'text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {filteredResults.length === 0 ? (
              <div className="py-16 text-center">
                <FaEnvelopeOpenText className="mx-auto mb-3 text-3xl text-gray-300" />
                <p className="text-sm font-semibold text-gray-900">No results yet</p>
                <p className="mt-1 text-sm text-gray-500">Run Scan or Import to read the mailbox.</p>
              </div>
            ) : (
              filteredResults.map((result, index) => {
                const isError = result.status === 'error';
                const isUnmatched = result.status.includes('unmatched');
                const TypeIcon = result.type === 'contract' ? FaFileContract : FaFileInvoice;
                return (
                  <div key={`${result.uid}-${result.filename}-${index}`} className="p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                          result.type === 'contract' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'
                        }`}>
                          <TypeIcon />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{result.filename}</p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">{result.subject || 'No subject'}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {result.orderNumber || 'No order number'} · {result.bucket || '-'}{result.path ? `/${result.path}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          isError
                            ? 'bg-red-100 text-red-700'
                            : isUnmatched
                              ? 'bg-amber-100 text-amber-700'
                              : result.status.includes('dry-run')
                                ? 'bg-gray-100 text-gray-700'
                                : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isError ? <FaExclamationTriangle className="mr-1" /> : <FaCheckCircle className="mr-1" />}
                          {result.status}
                        </span>
                        {result.publicUrl && (
                          <a
                            href={result.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Open <FaExternalLinkAlt className="ml-1" />
                          </a>
                        )}
                      </div>
                    </div>
                    {result.message && <p className="mt-2 text-xs text-gray-500">{result.message}</p>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
