import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import AdminNavigation from '../components/AdminNavigation';
import AdminDetailSheet from '../components/AdminDetailSheet';
import { 
  FaSearch, 
  FaSignOutAlt, 
  FaSync,
  FaShoppingBag,
  FaExclamationTriangle,
  FaCloudDownloadAlt,
  FaTimes,
  FaSave,
  FaEuroSign,
  FaEye,
  FaTags
} from 'react-icons/fa';

const PRODUCT_IMPORT_FUNCTION_URL = 'https://ddzmuxcavpgbzhirzlqt.supabase.co/functions/v1/dynamic-endpoint?commit=1';
const PRICE_IMPORT_FUNCTION_URL = 'https://ddzmuxcavpgbzhirzlqt.supabase.co/functions/v1/dynamic-endpoint?commit=1&importPrices=1';

interface Product {
  id: string;
  name: string;
  image_url?: string;
  sku: string;
  consignor_blocked: boolean;
}

interface ImportStatus {
  state: 'idle' | 'running' | 'success' | 'error';
  startedAt?: string;
  finishedAt?: string;
  httpStatus?: string;
  message: string;
  details?: string;
  changes?: ImportChanges;
}

interface ImportChanges {
  newProducts: Product[];
  removedProducts: Product[];
}

interface ProductSizeRow {
  product_id: string;
  size: string;
  original_price: number | null;
  price: number | null;
  status: string | null;
  sku: string | null;
  final_price?: number | null;
  final_status?: string | null;
  owner?: string | null;
  priceInput: string;
  statusInput: string;
}

const decodeHtmlEntities = (value: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const normalizeProduct = (product: Product): Product => ({
  ...product,
  name: decodeHtmlEntities(product.name || ''),
  sku: decodeHtmlEntities(product.sku || ''),
});

const formatPrice = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(2)} EUR`;
};

const parsePriceInput = (value: string): number | null => {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingPrices, setImportingPrices] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    state: 'idle',
    message: 'No import has been run in this session.',
  });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productSizes, setProductSizes] = useState<ProductSizeRow[]>([]);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [savingSizes, setSavingSizes] = useState(false);

  const loadProducts = useCallback(async (): Promise<Product[]> => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      const { data, error } = await supabase
        .from('products')
        .select('id, name, image_url, sku, consignor_blocked')
        .order('name', { ascending: true });

      if (error) throw error;
      const loadedProducts = (data || []).map(normalizeProduct);
      setProducts(loadedProducts);
      return loadedProducts;
    } catch (err: any) {
      console.error('Error loading products:', err.message);
      setError('Error loading products: ' + err.message);
      return [];
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  const compareProducts = (beforeProducts: Product[], afterProducts: Product[]): ImportChanges => {
    const beforeById = new Map(beforeProducts.map(product => [String(product.id), product]));
    const afterById = new Map(afterProducts.map(product => [String(product.id), product]));

    return {
      newProducts: afterProducts.filter(product => !beforeById.has(String(product.id))),
      removedProducts: beforeProducts.filter(product => !afterById.has(String(product.id))),
    };
  };

  const handleRefresh = async () => {
    setSuccessMessage(null);
    setRefreshing(true);
    await loadProducts();
  };

  const runImport = async (options: {
    url: string;
    title: string;
    setRunning: (value: boolean) => void;
    expectPriceImport?: boolean;
  }) => {
    const startedAt = new Date().toLocaleString();
    const productsBeforeImport = products;

    try {
      setError(null);
      setSuccessMessage(null);
      options.setRunning(true);
      setImportStatus({
        state: 'running',
        startedAt,
        message: `${options.title} is running...`,
        details: options.url,
      });

      const response = await fetch(options.url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        },
      });

      const contentType = response.headers.get('content-type') || '';
      const result = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
      const responseDetails = typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2);
      const httpStatus = `${response.status} ${response.statusText || ''}`.trim();

      if (!response.ok) {
        const message = typeof result === 'string'
          ? result
          : result?.error || result?.message || 'Import failed';
        setImportStatus({
          state: 'error',
          startedAt,
          finishedAt: new Date().toLocaleString(),
          httpStatus,
          message,
          details: responseDetails,
        });
        throw new Error(message);
      }

      const message = typeof result === 'string'
        ? result
        : result?.message || `Import completed. Products: ${result?.products ?? 'unknown'}, variants: ${result?.variants ?? 'unknown'}`;
      const isMissingPriceImportMode = options.expectPriceImport && typeof result !== 'string' && result?.importPricesFromFeed !== true;

      setRefreshing(true);
      const productsAfterImport = await loadProducts();
      const changes = compareProducts(productsBeforeImport, productsAfterImport);
      const priceSummary = typeof result === 'string' || !options.expectPriceImport
        ? ''
        : ` Prices imported: ${result?.priceImported ?? 'unknown'}, skipped express: ${result?.priceSkippedExpress ?? 'unknown'}, preserved: ${result?.pricePreserved ?? 'unknown'}.`;
      const modeWarning = isMissingPriceImportMode
        ? ' Price import mode was not confirmed by the Edge Function. Update the Supabase function code from the draft.'
        : '';
      const summary = `${message} New: ${changes.newProducts.length}, removed: ${changes.removedProducts.length}.${priceSummary}${modeWarning}`;

      setImportStatus({
        state: 'success',
        startedAt,
        finishedAt: new Date().toLocaleString(),
        httpStatus,
        message: summary,
        details: responseDetails,
        changes,
      });
      setSuccessMessage(summary);
    } catch (err: any) {
      const message = err?.message || 'Unknown import error';
      const details = message === 'Failed to fetch'
        ? 'The browser could not read the Edge Function response. This is often caused by missing CORS headers, a blocked network request, or the function not being reachable from the deployed site.'
        : err?.stack || String(err);

      console.error('Error importing products:', err);
      setImportStatus(prev => ({
        state: 'error',
        startedAt: prev.startedAt || startedAt,
        finishedAt: new Date().toLocaleString(),
        httpStatus: prev.httpStatus,
        message,
        details: prev.details && prev.details !== options.url ? prev.details : details,
      }));
      setError(`Error running ${options.title.toLowerCase()}: ` + message);
    } finally {
      options.setRunning(false);
      setRefreshing(false);
    }
  };

  const handleImportProducts = async () => {
    await runImport({
      url: PRODUCT_IMPORT_FUNCTION_URL,
      title: 'Product import',
      setRunning: setImporting,
    });
  };

  const handleImportPrices = async () => {
    await runImport({
      url: PRICE_IMPORT_FUNCTION_URL,
      title: 'Price import',
      setRunning: setImportingPrices,
      expectPriceImport: true,
    });
  };

  const handleRetry = () => {
    setError(null);
    loadProducts();
  };

  const loadProductSizes = async (product: Product) => {
    try {
      setLoadingSizes(true);
      setError(null);

      const [sizesRes, finalPricesRes] = await Promise.all([
        supabase
          .from('product_sizes')
          .select('product_id, size, original_price, price, status, sku')
          .eq('product_id', product.id)
          .order('size', { ascending: true }),
        supabase
          .from('product_price_view')
          .select('product_id, size, final_price, final_status, owner')
          .eq('product_id', product.id),
      ]);

      if (sizesRes.error) throw sizesRes.error;
      if (finalPricesRes.error) throw finalPricesRes.error;

      const finalBySize = new Map(
        (finalPricesRes.data || []).map((row: any) => [
          String(row.size || ''),
          row,
        ])
      );

      const rows = (sizesRes.data || []).map((row: any) => {
        const finalRow = finalBySize.get(String(row.size || ''));
        const price = row.price === null || row.price === undefined ? null : Number(row.price);

        return {
          product_id: String(row.product_id),
          size: String(row.size || ''),
          original_price: row.original_price === null || row.original_price === undefined ? null : Number(row.original_price),
          price,
          status: row.status || '',
          sku: row.sku || product.sku || '',
          final_price: finalRow?.final_price === null || finalRow?.final_price === undefined ? null : Number(finalRow?.final_price),
          final_status: finalRow?.final_status || '',
          owner: finalRow?.owner || null,
          priceInput: price === null ? '' : String(price),
          statusInput: row.status || '',
        };
      });

      setProductSizes(rows);
    } catch (err: any) {
      console.error('Error loading product sizes:', err.message);
      setError('Error loading product sizes: ' + err.message);
    } finally {
      setLoadingSizes(false);
    }
  };

  const openProductDetail = async (product: Product) => {
    setSelectedProduct(product);
    setProductSizes([]);
    await loadProductSizes(product);
  };

  const closeProductDetail = () => {
    setSelectedProduct(null);
    setProductSizes([]);
  };

  const updateSizeDraft = (size: string, field: 'priceInput' | 'statusInput', value: string) => {
    setProductSizes(prev =>
      prev.map(row => row.size === size ? { ...row, [field]: value } : row)
    );
  };

  const saveProductSizes = async () => {
    if (!selectedProduct) return;

    try {
      setSavingSizes(true);
      setError(null);
      setSuccessMessage(null);

      for (const row of productSizes) {
        const parsedPrice = parsePriceInput(row.priceInput);
        const nextStatus = row.statusInput.trim();

        const { data: updatedRows, error: updateError } = await supabase
          .from('product_sizes')
          .update({
            price: parsedPrice,
            status: nextStatus || null,
          })
          .eq('product_id', selectedProduct.id)
          .eq('size', row.size)
          .select('product_id, size');

        if (updateError) throw updateError;
        if (!updatedRows || updatedRows.length === 0) {
          throw new Error(`No row was updated for size ${row.size}. Check product_sizes update policy/RLS.`);
        }
      }

      await loadProductSizes(selectedProduct);
      setSuccessMessage(`Saved prices and statuses for ${selectedProduct.name}.`);
    } catch (err: any) {
      console.error('Error saving product sizes:', err.message);
      setError('Error saving product sizes: ' + err.message);
    } finally {
      setSavingSizes(false);
    }
  };

  const toggleConsignorBlocked = async (productId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ consignor_blocked: !currentValue })
        .eq('id', productId);

      if (error) throw error;

      setProducts(prev =>
        prev.map(p => p.id === productId ? { ...p, consignor_blocked: !currentValue } : p)
      );
    } catch (err: any) {
      console.error('Error toggling consignor block:', err.message);
      setError('Failed to update product: ' + err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error signing out:', err.message);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const filteredProducts = products.filter(product =>
    [product.name, product.sku].some(field =>
      field?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading products</h3>
          <p className="text-sm text-gray-500">Please wait...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-400 to-violet-500 rounded-2xl shadow-lg">
                <FaShoppingBag className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  Product Management
                </h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Catalog and product management</p>
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

      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-8">
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

        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-800">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage(null)}
                className="text-green-700 hover:text-green-900"
                aria-label="Dismiss success message"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {importStatus.state !== 'idle' && (
          <div className={`mb-6 rounded-xl border p-4 ${
            importStatus.state === 'success'
              ? 'bg-green-50 border-green-200'
              : importStatus.state === 'error'
                ? 'bg-red-50 border-red-200'
                : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    importStatus.state === 'success'
                      ? 'bg-green-500'
                      : importStatus.state === 'error'
                        ? 'bg-red-500'
                        : 'bg-blue-500 animate-pulse'
                  }`} />
                  <h4 className="text-sm font-semibold text-gray-900">Product import status</h4>
                </div>
                <p className="text-sm text-gray-800">{importStatus.message}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  {importStatus.startedAt && <span>Started: {importStatus.startedAt}</span>}
                  {importStatus.finishedAt && <span>Finished: {importStatus.finishedAt}</span>}
                  {importStatus.httpStatus && <span>HTTP: {importStatus.httpStatus}</span>}
                </div>
                {importStatus.changes && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-green-200 bg-white/80 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase text-green-700">
                        New products ({importStatus.changes.newProducts.length})
                      </div>
                      {importStatus.changes.newProducts.length > 0 ? (
                        <ul className="max-h-36 space-y-1 overflow-auto text-xs text-gray-700">
                          {importStatus.changes.newProducts.slice(0, 25).map(product => (
                            <li key={`new-${product.id}`} className="flex justify-between gap-3">
                              <span className="min-w-0 truncate">{product.name}</span>
                              <span className="shrink-0 font-mono text-gray-500">{product.sku || product.id}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-500">No new products detected in the database.</p>
                      )}
                      {importStatus.changes.newProducts.length > 25 && (
                        <p className="mt-2 text-xs text-gray-500">Showing first 25 only.</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-red-200 bg-white/80 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase text-red-700">
                        Removed products ({importStatus.changes.removedProducts.length})
                      </div>
                      {importStatus.changes.removedProducts.length > 0 ? (
                        <ul className="max-h-36 space-y-1 overflow-auto text-xs text-gray-700">
                          {importStatus.changes.removedProducts.slice(0, 25).map(product => (
                            <li key={`removed-${product.id}`} className="flex justify-between gap-3">
                              <span className="min-w-0 truncate">{product.name}</span>
                              <span className="shrink-0 font-mono text-gray-500">{product.sku || product.id}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-500">No products disappeared from the database.</p>
                      )}
                      {importStatus.changes.removedProducts.length > 25 && (
                        <p className="mt-2 text-xs text-gray-500">Showing first 25 only.</p>
                      )}
                    </div>
                  </div>
                )}
                {importStatus.details && (
                  <pre className="max-h-40 max-w-full overflow-auto rounded-lg bg-white/80 p-3 text-xs text-gray-700 border border-gray-200 whitespace-pre-wrap">
                    {importStatus.details}
                  </pre>
                )}
              </div>
              <button
                onClick={() => setImportStatus({ state: 'idle', message: 'No import has been run in this session.' })}
                className="self-start text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <AdminNavigation />

        {/* Products Table */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-sm sm:shadow-2xl overflow-hidden">
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Products ({filteredProducts.length})</h3>
                <p className="text-gray-600 text-xs sm:text-sm mt-1">Manage and overview of products</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
                <div className="relative col-span-2 sm:col-span-1">
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  />
                </div>
                <button
                  onClick={handleImportProducts}
                  disabled={importing || importingPrices || refreshing}
                  className="inline-flex items-center justify-center px-3 sm:px-4 py-2 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Import products from Supabase Edge Function"
                >
                  <FaCloudDownloadAlt className={`mr-2 ${importing ? 'animate-pulse' : ''}`} />
                  {importing ? 'Importing...' : 'Products'}
                </button>
                <button
                  onClick={handleImportPrices}
                  disabled={importing || importingPrices || refreshing}
                  className="inline-flex items-center justify-center px-3 sm:px-4 py-2 bg-white text-gray-900 font-medium rounded-xl hover:bg-gray-100 transition-all text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
                  title="Import feed prices except Skladom Expres variants"
                >
                  <FaTags className={`mr-2 ${importingPrices ? 'animate-pulse' : ''}`} />
                  {importingPrices ? 'Importing...' : 'Prices'}
                </button>
              </div>
            </div>
          </div>

          <div className="p-2 sm:p-4 lg:p-6">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FaShoppingBag className="text-gray-600 text-2xl" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No products</h3>
                <p className="text-sm sm:text-base text-gray-600">
                  {searchTerm ? 'No products found for your search' : 'No products have been added yet'}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Cards View */}
                <div className="md:hidden space-y-2">
                  {filteredProducts.map((product) => {
                    const productId = String(product.id || '');
                    return (
                      <div
                        key={productId}
                        className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => openProductDetail(product)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
                            <img
                              loading="lazy"
                              className="h-full w-full object-contain"
                              src={product.image_url || '/default-image.png'}
                              alt={product.name}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = '/default-image.png';
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold leading-snug text-gray-900 mb-1 break-words">{product.name}</h4>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-mono text-gray-600">SKU {product.sku || '-'}</span>
                              <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-mono text-gray-500">ID {productId.slice(0, 8)}</span>
                            </div>
                          </div>
                          <div className="flex-shrink-0 flex flex-col items-center gap-1">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleConsignorBlocked(product.id, product.consignor_blocked);
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${product.consignor_blocked ? 'bg-red-500' : 'bg-green-500'}`}
                              title={product.consignor_blocked ? 'Blocked for consignors' : 'Open for consignors'}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${product.consignor_blocked ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                            <span className={`text-[9px] font-medium ${product.consignor_blocked ? 'text-red-600' : 'text-green-600'}`}>
                              {product.consignor_blocked ? 'Blocked' : 'Open'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200/50">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">ID</th>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">IMAGE</th>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Name</th>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">SKU</th>
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Consignors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200/30">
                      {filteredProducts.map((product) => {
                        const productId = String(product.id || '');
                        return (
                          <tr
                            key={productId}
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => openProductDetail(product)}
                          >
                            <td className="px-3 sm:px-6 py-4 text-sm text-gray-700 font-mono hidden lg:table-cell">{productId}</td>
                            <td className="px-3 sm:px-6 py-4">
                              <div className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
                                <img
                                  loading="lazy"
                                  className="h-full w-full object-contain"
                                  src={product.image_url || '/default-image.png'}
                                  alt={product.name}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = '/default-image.png';
                                  }}
                                />
                              </div>
                            </td>
                            <td className="px-3 sm:px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-gray-900">{product.name}</div>
                                <FaEye className="text-gray-400 text-xs" />
                              </div>
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-sm text-gray-700 font-mono">{product.sku}</td>
                            <td className="px-3 sm:px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleConsignorBlocked(product.id, product.consignor_blocked);
                                  }}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${product.consignor_blocked ? 'bg-red-500' : 'bg-green-500'}`}
                                  title={product.consignor_blocked ? 'Blocked for consignors' : 'Open for consignors'}
                                >
                                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${product.consignor_blocked ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                <span className={`text-xs font-medium ${product.consignor_blocked ? 'text-red-600' : 'text-green-600'}`}>
                                  {product.consignor_blocked ? 'Blocked' : 'Open'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {selectedProduct && (
        <AdminDetailSheet
          zIndex="z-50"
          maxWidth="6xl"
          onBackdropClick={closeProductDetail}
          contentClassName="px-3 py-3 sm:px-6 sm:py-4"
          header={(
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3 sm:gap-4">
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm sm:h-20 sm:w-20 sm:p-2">
                    <img
                      className="h-full w-full object-contain"
                      src={selectedProduct.image_url || '/default-image.png'}
                      alt={selectedProduct.name}
                      onError={(event) => {
                        const target = event.target as HTMLImageElement;
                        target.src = '/default-image.png';
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold leading-snug text-gray-900 break-words sm:text-lg">{selectedProduct.name}</h3>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600 sm:text-sm">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 font-mono">ID <span className="sm:hidden">{String(selectedProduct.id).slice(0, 8)}</span><span className="hidden sm:inline">{selectedProduct.id}</span></span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 font-mono">SKU {selectedProduct.sku || '-'}</span>
                      <span className={`rounded-full px-2.5 py-1 font-medium ${
                        selectedProduct.consignor_blocked
                          ? 'bg-red-50 text-red-700'
                          : 'bg-green-50 text-green-700'
                      }`}>
                        {selectedProduct.consignor_blocked ? 'Consignors blocked' : 'Consignors open'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={closeProductDetail}
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 sm:bg-transparent"
                  aria-label="Close product detail"
                >
                  <FaTimes />
                </button>
              </div>

              {!loadingSizes && productSizes.length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase text-gray-500 sm:text-[11px]">Sizes</div>
                    <div className="text-base font-bold text-gray-900 sm:text-lg">{productSizes.length}</div>
                  </div>
                  <div className="rounded-xl bg-purple-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase text-purple-700 sm:text-[11px]">Consigner</div>
                    <div className="text-base font-bold text-purple-900 sm:text-lg">{productSizes.filter(row => row.owner).length}</div>
                  </div>
                  <div className="rounded-xl bg-green-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase text-green-700 sm:text-[11px]">Stock</div>
                    <div className="text-base font-bold text-green-900 sm:text-lg">
                      {productSizes.filter(row => row.final_status === 'Skladom' || row.final_status === 'Skladom Expres').length}
                    </div>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase text-gray-500 sm:text-[11px]">Default</div>
                    <div className="text-base font-bold text-gray-900 sm:text-lg">{productSizes.filter(row => row.priceInput.trim()).length}</div>
                  </div>
                </div>
              )}
            </>
          )}
          footer={(
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="hidden text-xs text-gray-600 sm:block">
                  Final price uses the lowest active consigner offer first, then this default price.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button
                    onClick={closeProductDetail}
                    className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    <FaTimes className="mr-2" />
                    Close
                  </button>
                  <button
                    onClick={saveProductSizes}
                    disabled={savingSizes || loadingSizes || productSizes.length === 0}
                    className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FaSave className={`mr-2 ${savingSizes ? 'animate-pulse' : ''}`} />
                    {savingSizes ? 'Saving...' : 'Save sizes'}
                  </button>
                </div>
              </div>
          )}
        >
              {loadingSizes ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-purple-500" />
                </div>
              ) : productSizes.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
                  <p className="text-sm text-gray-600">No sizes found for this product.</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:hidden">
                    {productSizes.map((row) => {
                      const hasConsignerPrice = Boolean(row.owner);
                      return (
                        <div key={row.size} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[11px] font-semibold uppercase text-gray-500">Size</div>
                              <div className="text-lg font-bold text-gray-900">{row.size}</div>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              hasConsignerPrice ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {hasConsignerPrice ? 'Consigner' : 'Default'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-lg bg-gray-50 p-2">
                              <div className="text-[11px] font-semibold uppercase text-gray-500">Original</div>
                              <div className="font-semibold text-gray-900">{formatPrice(row.original_price)}</div>
                            </div>
                            <div className="rounded-lg bg-gray-50 p-2">
                              <div className="text-[11px] font-semibold uppercase text-gray-500">Final</div>
                              <div className="font-semibold text-gray-900">{formatPrice(row.final_price)}</div>
                              {hasConsignerPrice && <div className="text-[11px] text-purple-700">Consigner wins</div>}
                            </div>
                          </div>

                          <div className="mt-3 grid gap-3">
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold text-gray-600">Default shop price</span>
                              <div className="relative">
                                <FaEuroSign className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  value={row.priceInput}
                                  onChange={(event) => updateSizeDraft(row.size, 'priceInput', event.target.value)}
                                  className="w-full rounded-xl border border-gray-300 py-2.5 pl-8 pr-3 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                  placeholder="Fallback price"
                                />
                              </div>
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold text-gray-600">Default status</span>
                              <select
                                value={row.statusInput}
                                onChange={(event) => updateSizeDraft(row.size, 'statusInput', event.target.value)}
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                              >
                                <option value="">No status</option>
                                <option value="Skladom">Skladom</option>
                                <option value="Skladom Expres">Skladom Expres</option>
                                <option value="Vypredané">Vypredané</option>
                                <option value="Nedostupné">Nedostupné</option>
                              </select>
                            </label>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                            <span className="rounded-full bg-gray-100 px-2 py-1">Final status: {row.final_status || '-'}</span>
                            <span className="rounded-full bg-gray-100 px-2 py-1 font-mono">SKU: {row.sku || '-'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-600">Size</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-600">Original</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-600">Default price</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-600">Final price</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-600">Status</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-600">Final status</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-600">Source</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-600">SKU</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {productSizes.map((row) => {
                          const hasConsignerPrice = Boolean(row.owner);
                          return (
                            <tr key={row.size} className="align-top hover:bg-gray-50/70">
                              <td className="px-3 py-3 text-sm font-semibold text-gray-900">{row.size}</td>
                              <td className="px-3 py-3 text-sm text-gray-700">{formatPrice(row.original_price)}</td>
                              <td className="px-3 py-3">
                                <div className="relative w-32">
                                  <FaEuroSign className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    value={row.priceInput}
                                    onChange={(event) => updateSizeDraft(row.size, 'priceInput', event.target.value)}
                                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                    placeholder="Fallback"
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-3 text-sm">
                                <div className="font-semibold text-gray-900">{formatPrice(row.final_price)}</div>
                                {hasConsignerPrice && (
                                  <div className="mt-1 text-xs text-purple-700">Consigner price wins</div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <select
                                  value={row.statusInput}
                                  onChange={(event) => updateSizeDraft(row.size, 'statusInput', event.target.value)}
                                  className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                >
                                  <option value="">No status</option>
                                  <option value="Skladom">Skladom</option>
                                  <option value="Skladom Expres">Skladom Expres</option>
                                  <option value="Vypredané">Vypredané</option>
                                  <option value="Nedostupné">Nedostupné</option>
                                </select>
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-700">{row.final_status || '-'}</td>
                              <td className="px-3 py-3 text-sm">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  hasConsignerPrice ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {hasConsignerPrice ? 'Consigner' : 'Default'}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-sm font-mono text-gray-600">{row.sku || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
        </AdminDetailSheet>
      )}
    </div>
  );
}
