import { useMemo, useState } from 'react';
import {
  FaCheckCircle,
  FaDownload,
  FaEnvelopeOpenText,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaFileInvoice,
  FaSearch,
  FaSync,
} from 'react-icons/fa';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { useToast } from './Toast';

type Filter = 'all' | 'matched' | 'unmatched' | 'error';

interface ImportResult {
  uid?: number;
  id?: string;
  from?: string;
  subject?: string;
  filename?: string;
  fileName?: string;
  type?: 'invoice' | 'contract';
  orderNumber?: string | null;
  newOrderNumber?: string | null;
  orderCandidates?: string[];
  matchedSaleId?: string | null;
  bucket?: string | null;
  path?: string | null;
  storagePath?: string | null;
  publicUrl?: string | null;
  status: string;
  message?: string;
  extractedTotal?: number | null;
  newTotal?: number | null;
  extractedProduct?: string | null;
}

interface ImportSummary {
  messagesChecked: number;
  attachmentsFound: number;
  imported: number;
  matched: number;
  unmatched: number;
  skipped: number;
  errors: number;
  totalsUpdated?: number;
  totalChecked?: number;
}

const emptySummary: ImportSummary = {
  messagesChecked: 0,
  attachmentsFound: 0,
  imported: 0,
  matched: 0,
  unmatched: 0,
  skipped: 0,
  errors: 0,
  totalsUpdated: 0,
  totalChecked: 0,
};

interface InvoiceEmailImportPanelProps {
  onImportComplete?: () => void;
}

export default function InvoiceEmailImportPanel({ onImportComplete }: InvoiceEmailImportPanelProps) {
  const { showToast } = useToast();
  const [results, setResults] = useState<ImportResult[]>([]);
  const [summary, setSummary] = useState<ImportSummary>(emptySummary);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [limit, setLimit] = useState('5');
  const [loading, setLoading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredResults = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return results.filter((result) => {
      const isUnmatched = result.status.includes('unmatched');
      const isMatched = result.status.includes('matched') && !isUnmatched;
      if (filter === 'matched' && !isMatched) return false;
      if (filter === 'unmatched' && !isUnmatched) return false;
      if (filter === 'error' && result.status !== 'error') return false;
      if (!q) return true;

      const orderCandidateStr = (result.orderCandidates || []).join(' ');
      return [
        result.subject,
        result.filename,
        result.fileName,
        result.orderNumber,
        result.newOrderNumber,
        result.from,
        result.path,
        result.storagePath,
        result.message,
        result.extractedProduct,
        orderCandidateStr,
      ].some((field) => field?.toLowerCase().includes(q));
    });
  }, [filter, results, searchTerm]);

  const runImport = async (nextDryRun: boolean) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);

    try {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Missing auth session');

      const response = await fetch('/.netlify/functions/import-email-invoices', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          limit: Number(limit) || 5,
          maxImports: 5,
          documentType: 'invoice',
          dryRun: nextDryRun,
          forceReparse: true,
        }),
      });

      const responseText = await response.text();
      let payload: any = null;
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(`Import endpoint returned ${response.status || 'non-JSON'} response. Function may not be deployed on this URL.`);
      }

      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Import failed');
      }

      setResults(payload.results || []);
      setSummary(payload.summary || emptySummary);
      showToast(nextDryRun ? 'Mailbox scan completed' : 'Mailbox import completed', 'success');
      if (!nextDryRun) onImportComplete?.();
    } catch (err: any) {
      const message = err.name === 'AbortError'
        ? `${nextDryRun ? 'Scan' : 'Import'} timed out after 120 seconds. Try fewer emails or check IMAP connection.`
        : err.message || `${nextDryRun ? 'Scan' : 'Import'} failed`;
      setError(message);
      showToast(nextDryRun ? 'Invoice email scan failed' : 'Invoice email import failed', 'error');
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  const runReprocess = async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);

    try {
      setReprocessing(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Missing auth session');

      const response = await fetch('/.netlify/functions/import-email-invoices', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'reprocess',
          limit: 200,
        }),
      });

      const responseText = await response.text();
      let payload: any = null;
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(`Reprocess endpoint returned ${response.status || 'non-JSON'} response.`);
      }

      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Pre-parsovanie faktúr zlyhalo');
      }

      setResults(payload.results || []);
      setSummary({
        ...emptySummary,
        ...(payload.summary || {}),
        messagesChecked: 0,
        attachmentsFound: payload.summary?.totalChecked || 0,
      });
      showToast(
        `Pre-parsované ${payload.summary?.totalChecked || 0} faktúr (${payload.summary?.matched || 0} spárovaných, ${payload.summary?.totalsUpdated || 0} súm opravených)`,
        'success'
      );
      onImportComplete?.();
    } catch (err: any) {
      const message = err.message || 'Pre-parsovanie zlyhalo';
      setError(message);
      showToast(message, 'error');
    } finally {
      window.clearTimeout(timeout);
      setReprocessing(false);
    }
  };

  return (
    <section className="mb-4 sm:mb-6 space-y-4">
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center">
            <FaExclamationTriangle className="mr-3 flex-shrink-0 text-red-400" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400">x</button>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr] sm:items-end">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Počet emailov</label>
              <input
                type="number"
                min="1"
                max="30"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
            {(summary.messagesChecked > 0 || summary.attachmentsFound > 0 || summary.totalChecked || summary.errors > 0) && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs sm:text-sm text-gray-700">
                {summary.totalChecked
                  ? `${summary.totalChecked} faktúr skontrolovaných · ${summary.matched} spárovaných · ${summary.totalsUpdated || 0} súm opravených`
                  : `${summary.messagesChecked} emailov · ${summary.attachmentsFound} PDF · ${summary.matched} spárovaných · ${summary.unmatched} nespárovaných`}
                {summary.errors > 0 ? ` · ${summary.errors} chýb` : ''}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runImport(true)}
              disabled={loading || reprocessing}
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              <FaSearch className="mr-2 text-xs" />
              {loading ? 'Hľadám...' : 'Scan'}
            </button>
            <button
              onClick={() => runImport(false)}
              disabled={loading || reprocessing}
              className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 disabled:opacity-50"
            >
              <FaDownload className="mr-2 text-xs" />
              {loading ? 'Importujem...' : 'Importovať z emailov'}
            </button>
            <button
              onClick={runReprocess}
              disabled={loading || reprocessing}
              title="Znova spustí inteligentný parser na všetkých existujúcich faktúrach v databáze a spáruje ich"
              className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs sm:text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:bg-indigo-100 disabled:opacity-50"
            >
              <FaSync className={`mr-2 text-xs ${reprocessing ? 'animate-spin' : ''}`} />
              {reprocessing ? 'Pre-parsovávam...' : 'Pre-parsovať existujúce'}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Výsledky importu a parsovania</h2>
            <p className="text-xs text-gray-500">
              Inteligentné rozpoznávanie objednávok, cien, DPH a párovanie so Shoptet a Consign predajmi.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Hľadať súbor, predmet, číslo..."
                className="w-full rounded-xl border border-gray-300 py-2 pl-8 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-400 sm:w-72"
              />
            </div>
          </div>
        </div>

        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
          <div className="flex flex-wrap gap-2">
            {[
              ['all', 'Všetky'],
              ['matched', 'Spárované'],
              ['unmatched', 'Nespárované'],
              ['error', 'Chyby'],
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
              <p className="text-sm font-semibold text-gray-900">Žiadne výsledky</p>
              <p className="mt-1 text-xs text-gray-500">Spusťte Scan, Import z emailov alebo Pre-parsovanie existujúcich faktúr.</p>
            </div>
          ) : (
            filteredResults.map((result, index) => {
              const isError = result.status === 'error';
              const isUnmatched = result.status.includes('unmatched');
              const isMatched = result.status.includes('matched') && !isUnmatched;
              const total = result.extractedTotal ?? result.newTotal;
              const orderNum = result.newOrderNumber || result.orderNumber;
              const fileName = result.filename || result.fileName || 'Faktúra';

              return (
                <div key={`${result.uid || result.id || index}-${fileName}-${index}`} className="p-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
                        <FaFileInvoice />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-bold text-gray-900">{fileName}</p>
                          {total !== null && total !== undefined && (
                            <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800">
                              {formatCurrency(total)}
                            </span>
                          )}
                        </div>
                        {result.extractedProduct && (
                          <p className="mt-0.5 truncate text-xs font-semibold text-gray-700">
                            Položka: {result.extractedProduct}
                          </p>
                        )}
                        <p className="mt-0.5 truncate text-xs text-gray-500">{result.subject || 'Bez predmetu'}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                          <span className="font-mono font-semibold bg-gray-100 rounded px-1.5 py-0.5">
                            #{orderNum || 'Bez čísla'}
                          </span>
                          {result.orderCandidates && result.orderCandidates.length > 1 && (
                            <span className="text-[11px] text-gray-400">
                              (Kandidáti: {result.orderCandidates.slice(0, 3).join(', ')})
                            </span>
                          )}
                          <span>· {result.bucket || 'invoices'}{result.path || result.storagePath ? `/${result.path || result.storagePath}` : ''}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isError
                          ? 'bg-red-100 text-red-700'
                          : isUnmatched
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isError ? <FaExclamationTriangle className="mr-1" /> : <FaCheckCircle className="mr-1" />}
                        {isMatched ? 'Spárované' : isUnmatched ? 'Nespárované' : result.status}
                      </span>
                      {result.publicUrl && (
                        <a
                          href={result.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Otvoriť PDF <FaExternalLinkAlt className="ml-1" />
                        </a>
                      )}
                    </div>
                  </div>
                  {result.message && <p className="mt-2 text-xs text-gray-600 font-medium">{result.message}</p>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
