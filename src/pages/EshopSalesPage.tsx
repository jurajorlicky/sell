import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AdminNavigation from '../components/AdminNavigation';
import SalesStatusBadge from '../components/SalesStatusBadge';
import Pagination from '../components/Pagination';
import { useToast } from '../components/Toast';
import { formatDate, formatCurrency } from '../lib/utils';
import { downloadXlsx, excelDate, exportDateStamp } from '../lib/xlsxExport';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  FaSearch, FaPlus, FaTimes, FaFilter, FaSync, FaSignOutAlt,
  FaUserShield, FaShoppingCart, FaSave, FaLink, FaTruck,
  FaExclamationTriangle, FaEdit, FaTrash, FaExternalLinkAlt,
  FaSortAmountDown, FaSortAmountUp, FaCloudDownloadAlt, FaCheckCircle, FaDownload
} from 'react-icons/fa';

interface EshopSale {
  id: string;
  order_number: string;
  product_name: string;
  size: string | null;
  sku: string | null;
  price: number;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  notes: string | null;
  image_url: string | null;
  quantity?: number | null;
  shoptet_status?: string | null;
  order_created_at?: string | null;
  product_id?: string | null;
  shop_remark?: string | null;
  original_order_number?: string | null;
  order_total?: number | null;
  order_product_total?: number | null;
  order_extra_total?: number | null;
  order_item_count?: number | null;
  created_at: string;
  updated_at: string;
}

interface LinkedSale {
  id: string;
  name: string;
  size: string;
  sku?: string | null;
  price: number;
  payout: number;
  status: string;
  external_id: string;
  user_email: string;
}

interface EshopOrderGroup {
  key: string;
  orderNumber: string;
  items: EshopSale[];
  primary: EshopSale;
  totalPrice: number;
  orderTotal: number | null;
  orderExtraTotal: number;
  createdAt: string;
}

const ESHOP_STATUSES = [
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned' },
];

const ITEMS_PER_PAGE = 25;

export default function EshopSalesPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [sales, setSales] = useState<EshopSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<'created_at' | 'price'>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSale, setEditingSale] = useState<EshopSale | null>(null);
  const [matchDetailSale, setMatchDetailSale] = useState<EshopSale | null>(null);
  const [linkedSales, setLinkedSales] = useState<Record<string, LinkedSale | null>>({});
  const [importingOrders, setImportingOrders] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEscapeKey(() => {
    setShowCreateModal(false);
    setEditingSale(null);
  });

  const fetchSales = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('eshop_sales')
        .select('*')
        .order(sortField, { ascending: sortAsc });

      if (fetchError) throw fetchError;
      setSales(data || []);
    } catch (err: any) {
      setError('Error loading eshop sales: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortAsc]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Load linked consignment sale for each eshop sale row.
  const loadLinkedSale = async (sale: EshopSale) => {
    if (!sale.order_number || linkedSales[sale.id] !== undefined) return;
    const orderNumbers = [sale.order_number, sale.original_order_number].filter(Boolean) as string[];
    const { data } = await supabase
      .from('user_sales')
      .select('id, name, size, sku, price, payout, status, external_id, profiles(email)')
      .in('external_id', orderNumbers)
      .limit(20);

    const candidates = data || [];
    const saleSkuBase = sale.sku?.split('/')[0]?.toLowerCase();
    const linkedRow = candidates.find((row: any) =>
      row.external_id === sale.original_order_number &&
      row.size?.trim() === sale.size?.trim() &&
      saleSkuBase &&
      row.sku?.split('/')[0]?.toLowerCase() === saleSkuBase
    ) || candidates.find((row: any) =>
      row.external_id === sale.original_order_number &&
      row.size?.trim() === sale.size?.trim()
    ) || candidates.find((row: any) =>
      row.size?.trim() === sale.size?.trim() &&
      saleSkuBase &&
      row.sku?.split('/')[0]?.toLowerCase() === saleSkuBase
    ) || candidates.find((row: any) =>
      row.size?.trim() === sale.size?.trim() &&
      row.name?.toLowerCase() === sale.product_name?.toLowerCase()
    ) || candidates.find((row: any) =>
      row.size?.trim() === sale.size?.trim()
    ) || candidates[0];

    if (linkedRow) {
      setLinkedSales(prev => ({
        ...prev,
        [sale.id]: {
          id: linkedRow.id,
          name: linkedRow.name,
          size: linkedRow.size,
          sku: linkedRow.sku,
          price: linkedRow.price,
          payout: linkedRow.payout,
          status: linkedRow.status,
          external_id: linkedRow.external_id,
          user_email: (linkedRow.profiles as any)?.email || '',
        }
      }));
    } else {
      setLinkedSales(prev => ({ ...prev, [sale.id]: null }));
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  // Derived: filtered + paginated
  const filtered = sales.filter(s => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (dateFrom && s.created_at.split('T')[0] < dateFrom) return false;
    if (dateTo && s.created_at.split('T')[0] > dateTo) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (
        !s.order_number?.toLowerCase().includes(q) &&
        !s.product_name?.toLowerCase().includes(q) &&
        !s.customer_email?.toLowerCase().includes(q) &&
        !s.customer_name?.toLowerCase().includes(q) &&
        !s.sku?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const orderGroups = Array.from(
    filtered.reduce((groups, sale) => {
      const key = sale.order_number || sale.id;
      const next = groups.get(key) || [];
      next.push(sale);
      groups.set(key, next);
      return groups;
    }, new Map<string, EshopSale[]>())
  ).map(([key, items]): EshopOrderGroup => {
    const primary = items[0];
    const totalPrice = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
    const orderTotalValue = items.find(item => item.order_total !== null && item.order_total !== undefined)?.order_total;
    const orderExtraTotal = Number(items.find(item => item.order_extra_total !== null && item.order_extra_total !== undefined)?.order_extra_total || 0);
    const createdAt = items.reduce((latest, item) => (
      new Date(item.created_at).getTime() > new Date(latest).getTime() ? item.created_at : latest
    ), primary.created_at);

    return {
      key,
      orderNumber: primary.order_number,
      items,
      primary,
      totalPrice,
      orderTotal: orderTotalValue !== null && orderTotalValue !== undefined ? Number(orderTotalValue) : null,
      orderExtraTotal,
      createdAt,
    };
  }).sort((a, b) => {
    if (sortField === 'price') {
      return sortAsc ? a.totalPrice - b.totalPrice : b.totalPrice - a.totalPrice;
    }
    return sortAsc
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const paginatedGroups = orderGroups.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    paginatedGroups.forEach(group => {
      group.items.forEach(sale => {
        if (linkedSales[sale.id] === undefined) {
          loadLinkedSale(sale);
        }
      });
    });
  }, [paginatedGroups, linkedSales]);

  const hasFilters = !!(searchTerm || statusFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const toggleSort = (field: 'created_at' | 'price') => {
    if (sortField === field) setSortAsc(a => !a);
    else { setSortField(field); setSortAsc(false); }
  };

  const exportToXlsx = async () => {
    try {
      await downloadXlsx({
        fileName: `eshop_sales_export_${exportDateStamp()}.xlsx`,
        sheetName: 'Eshop Sales',
        rows: orderGroups.flatMap(group => group.items),
        columns: [
          { header: 'Order Number', value: sale => sale.order_number, width: 18 },
          { header: 'Original Order', value: sale => sale.original_order_number || '', width: 18 },
          { header: 'Product', value: sale => sale.product_name, width: 38 },
          { header: 'Size', value: sale => sale.size || '', width: 12 },
          { header: 'SKU', value: sale => sale.sku || '', width: 20 },
          { header: 'Quantity', value: sale => Number(sale.quantity || 1), width: 10, numberFormat: '0' },
          { header: 'Item Price', value: sale => Number(sale.price || 0), width: 14, numberFormat: '#,##0.00 [$€-1]' },
          { header: 'Order Total', value: sale => sale.order_total ?? null, width: 14, numberFormat: '#,##0.00 [$€-1]' },
          { header: 'Extra Total', value: sale => sale.order_extra_total ?? null, width: 14, numberFormat: '#,##0.00 [$€-1]' },
          { header: 'Status', value: sale => sale.status, width: 16 },
          { header: 'Shoptet Status', value: sale => sale.shoptet_status || '', width: 20 },
          { header: 'Customer', value: sale => sale.customer_name || '', width: 26 },
          { header: 'Customer Email', value: sale => sale.customer_email || '', width: 30 },
          { header: 'Tracking Number', value: sale => sale.tracking_number || '', width: 22 },
          { header: 'Order Created', value: sale => excelDate(sale.order_created_at), width: 19, numberFormat: 'yyyy-mm-dd hh:mm' },
          { header: 'Imported', value: sale => excelDate(sale.created_at), width: 19, numberFormat: 'yyyy-mm-dd hh:mm' },
          { header: 'Notes', value: sale => sale.notes || '', width: 36 },
        ],
      });
    } catch (err: any) {
      console.error('Error exporting eshop sales to XLSX:', err);
      setError('Error exporting eshop sales to XLSX: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleImportOrders = async () => {
    try {
      setImportingOrders(true);
      setError(null);
      setImportResult(null);

      const { data, error: invokeError } = await supabase.functions.invoke('import-shoptet-orders', {
        body: {
          dateFrom: dateFrom || undefined,
          dateUntil: dateTo || undefined,
        },
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      const message = `Imported Shoptet orders: ${data?.inserted ?? 0} new, ${data?.updated ?? 0} updated, ${data?.matched ?? 0} matched, ${data?.unmatched ?? 0} unmatched.`;
      setImportResult(message);
      showToast(message, data?.unmatched ? 'info' : 'success');
      setLinkedSales({});
      await fetchSales();
    } catch (err: any) {
      const message = err?.message || 'Unknown Shoptet import error';
      setError('Error importing Shoptet orders: ' + message);
      showToast('Shoptet import failed', 'error');
    } finally {
      setImportingOrders(false);
    }
  };

  // Stats
  const totalRevenue = sales.reduce((s, e) => s + e.price, 0);
  const activeCount = sales.filter(s => !['completed', 'cancelled', 'returned'].includes(s.status)).length;
  const completedCount = sales.filter(s => s.status === 'completed').length;
  const loadedProfit = sales.reduce((sum, sale) => {
    const linked = linkedSales[sale.id];
    return linked ? sum + (sale.price - linked.payout) : sum;
  }, 0);
  const matchedLoadedCount = sales.filter(sale => linkedSales[sale.id]).length;
  const checkedMatchCount = sales.filter(sale => linkedSales[sale.id] !== undefined).length;
  const unmatchedLoadedCount = sales.filter(sale => linkedSales[sale.id] === null).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl shadow-lg">
                <FaUserShield className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">Eshop Sales</h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Orders from the eshop</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={fetchSales}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm"
                title="Refresh"
              >
                <FaSync className="sm:mr-2" />
                <span className="hidden sm:inline">Refresh</span>
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

      <main className="mx-auto max-w-[1680px] px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <AdminNavigation />

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center">
              <FaExclamationTriangle className="text-red-400 mr-3" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button onClick={() => setError(null)}><FaTimes className="text-red-400" /></button>
          </div>
        )}

        {importResult && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
            <p className="text-sm text-green-800">{importResult}</p>
            <button onClick={() => setImportResult(null)}><FaTimes className="text-green-700" /></button>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
          <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Orders</p>
            <p className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">{sales.length}</p>
            <p className="mt-0.5 text-xs text-gray-500">{activeCount} active · {completedCount} completed</p>
          </div>
          <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Revenue</p>
            <p className="mt-1 truncate text-lg font-bold text-gray-900 sm:text-2xl">{formatCurrency(totalRevenue)}</p>
            <p className="mt-0.5 text-xs text-gray-500">Imported item revenue</p>
          </div>
          <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Matched</p>
            <p className="mt-1 text-xl font-bold text-blue-700 sm:text-2xl">{matchedLoadedCount}</p>
            <p className="mt-0.5 text-xs text-gray-500">{unmatchedLoadedCount} unmatched · {checkedMatchCount} checked</p>
          </div>
          <div className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Matched Profit</p>
            <p className="mt-1 truncate text-lg font-bold text-emerald-800 sm:text-2xl">{formatCurrency(loadedProfit)}</p>
            <p className="mt-0.5 text-xs text-emerald-700">Revenue minus payout</p>
          </div>
        </div>

        {/* Table Card */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">Eshop Sales ({orderGroups.length})</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Shoptet orders matched with consigner payouts · {filtered.length} item{filtered.length === 1 ? '' : 's'}.
              </p>
            </div>
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
              <div className="relative min-w-0 sm:w-72">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input
                  type="text"
                  placeholder="Search order, product, customer..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`inline-flex items-center px-3 py-2 border rounded-xl text-sm transition-all ${showFilters || hasFilters ? 'bg-gray-100 border-gray-400' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
              >
                <FaFilter className="text-gray-600 text-sm" />
                {hasFilters && <span className="ml-1 w-2 h-2 bg-gray-600 rounded-full" />}
              </button>
              {hasFilters && (
                <button onClick={clearFilters} className="px-3 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 text-sm">
                  <FaTimes className="text-gray-600" />
                </button>
              )}
              <button
                onClick={exportToXlsx}
                disabled={orderGroups.length === 0}
                className="inline-flex items-center justify-center px-3 py-2 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-50 transition-all text-sm border border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                title="Download filtered eshop sales as XLSX"
              >
                <FaDownload className="sm:mr-2" />
                <span className="hidden sm:inline">XLSX</span>
              </button>
              <button
                onClick={handleImportOrders}
                disabled={importingOrders}
                className="col-span-3 inline-flex items-center justify-center px-4 py-2 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-50 transition-all text-sm border border-gray-300 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-1"
                title="Import Shoptet orders XML"
              >
                <FaCloudDownloadAlt className={`mr-2 ${importingOrders ? 'animate-pulse' : ''}`} />
                {importingOrders ? 'Importing...' : 'Import XML'}
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="col-span-3 inline-flex items-center justify-center px-4 py-2 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all text-sm sm:col-span-1"
              >
                <FaPlus className="mr-2" />
                New Order
              </button>
            </div>
            </div>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value="">All statuses</option>
                    {ESHOP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Date From</label>
                  <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Date To</label>
                  <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400" />
                </div>
              </div>
            </div>
          )}

          {/* Sort bar */}
          <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600 sm:px-6">
            <span>Sort by:</span>
            <button onClick={() => toggleSort('created_at')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${sortField === 'created_at' ? 'bg-white border border-gray-300 text-gray-900 font-semibold' : 'hover:bg-white'}`}>
              Date {sortField === 'created_at' ? (sortAsc ? <FaSortAmountUp /> : <FaSortAmountDown />) : null}
            </button>
            <button onClick={() => toggleSort('price')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${sortField === 'price' ? 'bg-white border border-gray-300 text-gray-900 font-semibold' : 'hover:bg-white'}`}>
              Price {sortField === 'price' ? (sortAsc ? <FaSortAmountUp /> : <FaSortAmountDown />) : null}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
            </div>
          ) : paginatedGroups.length === 0 ? (
            <div className="text-center py-16">
              <FaShoppingCart className="text-gray-300 text-5xl mx-auto mb-4" />
              <p className="text-gray-500 font-medium">{hasFilters ? 'No results found' : 'No eshop sales yet'}</p>
              {!hasFilters && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 inline-flex items-center px-4 py-2 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all text-sm"
                >
                  <FaPlus className="mr-2" /> Add first order
                </button>
              )}
            </div>
          ) : (
            <>
            <div className="md:hidden divide-y divide-gray-100">
              {paginatedGroups.map(group => {
                const primary = group.primary;
                const linkedCount = group.items.filter(sale => linkedSales[sale.id]).length;
                const profit = group.items.reduce((sum, sale) => {
                  const linked = linkedSales[sale.id];
                  return linked ? sum + (sale.price - linked.payout) : sum;
                }, 0);

                return (
                  <div key={group.key} className="p-3">
                    <div className="flex gap-3">
                      {primary.image_url ? (
                        <img
                          src={primary.image_url}
                          alt={primary.product_name}
                          className="h-16 w-16 flex-shrink-0 rounded-xl border border-gray-200 bg-white object-contain p-1"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="h-16 w-16 flex-shrink-0 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
                          <FaShoppingCart className="text-gray-300" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-semibold text-gray-500">#{group.orderNumber}</p>
                            <h3 className="mt-0.5 text-sm font-semibold text-gray-900">
                              {group.items.length} item{group.items.length === 1 ? '' : 's'} in order
                            </h3>
                          </div>
                          <button
                            onClick={() => setEditingSale(primary)}
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700"
                            title="Edit first item"
                          >
                            <FaEdit />
                          </button>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                          <span className="rounded-full bg-gray-100 px-2 py-1">{formatDate(group.createdAt)}</span>
                          {primary.shoptet_status && <span className="rounded-full bg-gray-100 px-2 py-1">{primary.shoptet_status}</span>}
                        </div>

                        <div className="mt-3 space-y-2">
                          {group.items.map(sale => (
                            <div key={sale.id} className="rounded-xl border border-gray-100 bg-white p-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="line-clamp-2 text-sm font-semibold text-gray-900">{sale.product_name}</p>
                                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-gray-600">
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5">{sale.size || 'No size'}</span>
                                    {sale.sku && <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono">SKU {sale.sku}</span>}
                                    {(sale.quantity || 1) > 1 && <span className="rounded-full bg-gray-100 px-2 py-0.5">Qty {sale.quantity}</span>}
                                  </div>
                                </div>
                                <button
                                  onClick={() => setEditingSale(sale)}
                                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                                  title="Edit item"
                                >
                                  <FaEdit />
                                </button>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-gray-900">{formatCurrency(sale.price)}</p>
                                <MatchSummary
                                  linked={linkedSales[sale.id]}
                                  originalOrderNumber={sale.original_order_number}
                                  onOpen={linkedSales[sale.id] ? () => setMatchDetailSale(sale) : undefined}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-gray-50 p-2">
                            <p className="text-[11px] font-semibold uppercase text-gray-500">Items</p>
                            <p className="text-sm font-bold text-gray-900">{formatCurrency(group.totalPrice)}</p>
                            {group.orderTotal !== null && Math.abs(group.orderTotal - group.totalPrice) > 0.009 && (
                              <p className="text-[11px] text-gray-500">Order {formatCurrency(group.orderTotal)}</p>
                            )}
                            {linkedCount > 0 && <p className="text-[11px] text-emerald-700">Profit {formatCurrency(profit)}</p>}
                          </div>
                          <div className="rounded-xl bg-gray-50 p-2">
                            <p className="text-[11px] font-semibold uppercase text-gray-500">Status</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Array.from(new Set(group.items.map(item => item.status))).map(status => (
                                <EshopStatusBadge key={status} status={status} />
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-gray-100 bg-white p-2">
                          <p className="text-[11px] font-semibold uppercase text-gray-500">Customer</p>
                          <p className="text-sm font-medium text-gray-900 truncate">{primary.customer_name || '—'}</p>
                          <p className="text-xs text-gray-500 truncate">{primary.customer_email || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Order #</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Financials</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Match</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedGroups.map(group => {
                    const primary = group.primary;
                    const linkedCount = group.items.filter(sale => linkedSales[sale.id]).length;
                    const checkedCount = group.items.filter(sale => linkedSales[sale.id] !== undefined).length;
                    const profit = group.items.reduce((sum, sale) => {
                      const linked = linkedSales[sale.id];
                      return linked ? sum + (sale.price - linked.payout) : sum;
                    }, 0);

                    return (
                      <tr key={group.key} className="group hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <span className="font-mono text-sm font-bold text-gray-900">{group.orderNumber}</span>
                            <p className="text-xs font-semibold text-gray-500">
                              {group.items.length} item{group.items.length === 1 ? '' : 's'}
                            </p>
                          {primary.shoptet_status && (
                              <p className="max-w-[110px] truncate text-xs text-gray-500">{primary.shoptet_status}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex max-w-[520px] flex-wrap gap-2">
                            {group.items.map(sale => (
                              <div key={sale.id} className="flex min-w-[230px] max-w-[260px] flex-1 items-center gap-2 rounded-xl border border-gray-100 bg-white p-2">
                                {sale.image_url ? (
                                  <img
                                    src={sale.image_url}
                                    alt={sale.product_name}
                                    className="h-10 w-10 flex-shrink-0 rounded-lg border border-gray-200 bg-white object-contain p-1"
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                                    <FaShoppingCart className="text-gray-300" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold text-gray-900">{sale.product_name}</p>
                                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-gray-600">
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5">{sale.size || 'No size'}</span>
                                    {sale.sku && <span className="max-w-[120px] truncate rounded-full bg-gray-100 px-2 py-0.5 font-mono">SKU {sale.sku}</span>}
                                    {(sale.quantity || 1) > 1 && <span className="rounded-full bg-gray-100 px-2 py-0.5">Qty {sale.quantity}</span>}
                                  </div>
                                </div>
                                <button
                                  onClick={() => setEditingSale(sale)}
                                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                                  title="Edit item"
                                >
                                  <FaEdit />
                                </button>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900">{primary.customer_name || '—'}</p>
                          <p className="text-xs text-gray-500">{primary.customer_email || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-gray-900">Items {formatCurrency(group.totalPrice)}</p>
                            {group.orderTotal !== null && Math.abs(group.orderTotal - group.totalPrice) > 0.009 && (
                              <p className="text-xs text-gray-500">
                                Order {formatCurrency(group.orderTotal)}
                                {group.items.length > 1 ? ` · ${group.items.length} items` : ''}
                              </p>
                            )}
                            {Math.abs(group.orderExtraTotal) > 0.009 && (
                              <p className="text-xs text-gray-400">Extras {formatCurrency(group.orderExtraTotal)}</p>
                            )}
                            {linkedCount > 0 ? (
                              <>
                                <p className="text-xs text-gray-500">{linkedCount}/{group.items.length} matched</p>
                                <p className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                  Profit {formatCurrency(profit)}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-gray-400">Profit after match</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.from(new Set(group.items.map(item => item.status))).map(status => (
                              <EshopStatusBadge key={status} status={status} />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-500">
                              {checkedCount < group.items.length ? 'Checking...' : `${linkedCount}/${group.items.length} matched`}
                            </p>
                            {group.items.map(sale => (
                              <div key={sale.id} className="flex items-center gap-2">
                                <span className="max-w-[120px] truncate text-xs text-gray-500">{sale.size || sale.product_name}</span>
                                <MatchSummary
                                  linked={linkedSales[sale.id]}
                                  originalOrderNumber={sale.original_order_number}
                                  onOpen={linkedSales[sale.id] ? () => setMatchDetailSale(sale) : undefined}
                                />
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{formatDate(group.createdAt)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setEditingSale(primary)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit first item"
                          >
                            <FaEdit />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}

          {orderGroups.length > ITEMS_PER_PAGE && (
            <div className="px-4 py-3 border-t border-gray-200">
              <Pagination
                currentPage={currentPage}
                totalItems={orderGroups.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <EshopSaleModal
          onClose={() => setShowCreateModal(false)}
          onSaved={() => { setShowCreateModal(false); fetchSales(); showToast('Order created', 'success'); }}
        />
      )}

      {/* Edit Modal */}
      {editingSale && (
        <EshopSaleModal
          sale={editingSale}
          onClose={() => setEditingSale(null)}
          onSaved={() => {
            setEditingSale(null);
            fetchSales();
            showToast('Order updated', 'success');
          }}
          onDeleted={() => {
            setEditingSale(null);
            fetchSales();
            showToast('Order deleted', 'success');
          }}
        />
      )}

      {matchDetailSale && (
        <MatchDetailModal
          sale={matchDetailSale}
          linked={linkedSales[matchDetailSale.id]}
          onClose={() => setMatchDetailSale(null)}
        />
      )}
    </div>
  );
}

// ─── Eshop Status Badge ──────────────────────────────────────────────────────

function MatchSummary({
  linked,
  originalOrderNumber,
  onOpen,
}: {
  linked: LinkedSale | null | undefined;
  originalOrderNumber?: string | null;
  onOpen?: () => void;
}) {
  if (linked === undefined) {
    return (
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
          checking
        </div>
        {originalOrderNumber && (
          <p className="text-xs font-semibold text-amber-700">orig {originalOrderNumber}</p>
        )}
      </div>
    );
  }

  if (linked === null) {
    return (
      <div className="space-y-1">
        <div className="inline-flex whitespace-nowrap items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500">
          No match
        </div>
        {originalOrderNumber && (
          <p className="text-xs font-semibold text-amber-700">orig {originalOrderNumber}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex whitespace-nowrap items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"
      >
        <FaCheckCircle />
        Match
      </button>
      {originalOrderNumber && (
        <p className="text-xs font-semibold text-amber-700">orig {originalOrderNumber}</p>
      )}
    </div>
  );
}

function MatchDetailModal({
  sale,
  linked,
  onClose,
}: {
  sale: EshopSale;
  linked: LinkedSale | null | undefined;
  onClose: () => void;
}) {
  const profit = linked ? sale.price - linked.payout : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:rounded-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Consignment match</p>
            <h2 className="mt-1 text-lg font-bold text-gray-900">Order {sale.order_number}</h2>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200">
            <FaTimes />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          {!linked ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
              No consignment match is loaded for this order item.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Product price</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(sale.price)}</p>
                  {sale.order_total !== null && sale.order_total !== undefined && (
                    <p className="mt-1 text-xs text-gray-500">Order total {formatCurrency(Number(sale.order_total))}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order split</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{sale.order_item_count || 1} item{(sale.order_item_count || 1) === 1 ? '' : 's'}</p>
                  <p className="mt-1 text-xs text-gray-500">Extras {formatCurrency(Number(sale.order_extra_total || 0))}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Profit</p>
                  <p className={`mt-1 text-xl font-bold ${profit !== null && profit >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
                    {formatCurrency(profit ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">Payout {formatCurrency(linked.payout)}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Eshop item</p>
                  <p className="mt-2 font-semibold text-gray-900">{sale.product_name}</p>
                  <p className="mt-1 text-sm text-gray-600">Size {sale.size || '-'} · SKU {sale.sku || '-'}</p>
                  <p className="mt-1 text-sm text-gray-600">{sale.customer_name || '-'} · {sale.customer_email || '-'}</p>
                  {sale.original_order_number && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                      Original buyout order: {sale.original_order_number}
                    </p>
                  )}
                  <div className="mt-3"><EshopStatusBadge status={sale.status} /></div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Consigner sale</p>
                  <p className="mt-2 font-semibold text-gray-900">{linked.name}</p>
                  <p className="mt-1 text-sm text-gray-700">Size {linked.size || '-'} · SKU {linked.sku || '-'}</p>
                  <p className="mt-1 text-sm text-gray-700">{linked.user_email || '-'}</p>
                  <div className="mt-3"><SalesStatusBadge status={linked.status} /></div>
                </div>
              </div>

              {(sale.shop_remark || sale.notes) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Shoptet note</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900">{sale.shop_remark || sale.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EshopStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    processing: 'bg-yellow-100 text-yellow-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    returned: 'bg-orange-100 text-orange-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-800'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Create / Edit Modal ─────────────────────────────────────────────────────

interface EshopSaleModalProps {
  sale?: EshopSale;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

function EshopSaleModal({ sale, onClose, onSaved, onDeleted }: EshopSaleModalProps) {
  const [orderNumber, setOrderNumber] = useState(sale?.order_number || '');
  const [productName, setProductName] = useState(sale?.product_name || '');
  const [size, setSize] = useState(sale?.size || '');
  const [sku, setSku] = useState(sale?.sku || '');
  const [price, setPrice] = useState(sale?.price?.toString() || '');
  const [customerName, setCustomerName] = useState(sale?.customer_name || '');
  const [customerEmail, setCustomerEmail] = useState(sale?.customer_email || '');
  const [status, setStatus] = useState(sale?.status || 'processing');
  const [trackingNumber, setTrackingNumber] = useState(sale?.tracking_number || '');
  const [trackingUrl, setTrackingUrl] = useState(sale?.tracking_url || '');
  const [notes, setNotes] = useState(sale?.notes || '');
  const [imageUrl, setImageUrl] = useState(sale?.image_url || '');
  const [saleDate, setSaleDate] = useState(
    sale?.created_at ? sale.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-preview linked consignment sale
  const [linkedSale, setLinkedSale] = useState<LinkedSale | null | undefined>(undefined);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (!orderNumber.trim()) { setLinkedSale(undefined); return; }
    const timer = setTimeout(async () => {
      setLookingUp(true);
      const { data } = await supabase
        .from('user_sales')
        .select('id, name, size, price, payout, status, external_id, profiles(email)')
        .eq('external_id', orderNumber.trim())
        .maybeSingle();
      setLinkedSale(data ? {
        id: data.id,
        name: data.name,
        size: data.size,
        price: data.price,
        payout: data.payout,
        status: data.status,
        external_id: data.external_id,
        user_email: (data.profiles as any)?.email || '',
      } : null);
      setLookingUp(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [orderNumber]);

  const handleSave = async () => {
    if (!orderNumber.trim()) { setError('Order number is required'); return; }
    if (!productName.trim()) { setError('Product name is required'); return; }
    if (!price || isNaN(Number(price))) { setError('Valid price is required'); return; }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        order_number: orderNumber.trim(),
        product_name: productName.trim(),
        size: size.trim() || null,
        sku: sku.trim() || null,
        price: Number(price),
        customer_name: customerName.trim() || null,
        customer_email: customerEmail.trim() || null,
        status,
        tracking_number: trackingNumber.trim() || null,
        tracking_url: trackingUrl.trim() || null,
        notes: notes.trim() || null,
        image_url: imageUrl.trim() || null,
        created_at: saleDate ? new Date(saleDate + 'T12:00:00').toISOString() : undefined,
        updated_at: new Date().toISOString(),
      };

      if (sale) {
        const { error: updateError } = await supabase
          .from('eshop_sales')
          .update(payload)
          .eq('id', sale.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('eshop_sales')
          .insert(payload);
        if (insertError) throw insertError;
      }

      onSaved();
    } catch (err: any) {
      setError('Error saving: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!sale || !onDeleted) return;
    if (!confirm('Delete this eshop order? This action cannot be undone.')) return;
    try {
      setDeleting(true);
      const { error: deleteError } = await supabase.from('eshop_sales').delete().eq('id', sale.id);
      if (deleteError) throw deleteError;
      onDeleted();
    } catch (err: any) {
      setError('Error deleting: ' + err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{sale ? 'Edit Eshop Order' : 'New Eshop Order'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <FaTimes className="text-gray-600" />
          </button>
        </div>

        {/* Modal body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <FaExclamationTriangle className="text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Order number + live-link preview */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">
              Order Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              placeholder="e.g. AIR-001, #12345..."
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            {/* Linked consignment sale preview */}
            <div className="mt-2">
              {lookingUp && <p className="text-xs text-gray-400">Looking up consignment sale...</p>}
              {!lookingUp && linkedSale === null && orderNumber.trim() && (
                <p className="text-xs text-orange-600">No matching consignment sale found for this order number.</p>
              )}
              {!lookingUp && linkedSale && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-900">Linked consignment sale found:</p>
                    <p className="text-sm font-medium text-blue-800">{linkedSale.name} · {linkedSale.size}</p>
                    <p className="text-xs text-blue-600">{linkedSale.user_email} · payout {formatCurrency(linkedSale.payout)}</p>
                  </div>
                  <SalesStatusBadge status={linkedSale.status} />
                </div>
              )}
            </div>
          </div>

          {/* Product */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="e.g. Nike Air Jordan 1 Retro High OG"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Size</label>
              <input
                type="text"
                value={size}
                onChange={e => setSize(e.target.value)}
                placeholder="e.g. EU 42"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">SKU</label>
              <input
                type="text"
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="e.g. DZ5485-612"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Price (€) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Sale Date</label>
              <input
                type="date"
                value={saleDate}
                onChange={e => setSaleDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>

          {/* Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Customer Email</label>
              <input
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              {ESHOP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Tracking */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                <FaTruck className="inline mr-1 text-gray-600" /> Tracking Number
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={e => setTrackingNumber(e.target.value)}
                placeholder="1Z999AA10123456784"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                <FaLink className="inline mr-1 text-gray-600" /> Tracking URL
              </label>
              <input
                type="url"
                value={trackingUrl}
                onChange={e => setTrackingUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>

          {/* Image URL */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Image URL</label>
            <input
              type="url"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes about this order..."
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-t border-gray-200 flex-shrink-0 gap-3">
          {sale && onDeleted ? (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="inline-flex items-center px-4 py-2.5 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors border border-red-200 disabled:opacity-50 text-sm"
            >
              {deleting ? <span className="animate-spin w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full mr-2" /> : <FaTrash className="mr-2" />}
              Delete
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving || deleting}
              className="px-4 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors border border-gray-300 disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="inline-flex items-center px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 text-sm"
            >
              {saving ? (
                <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />Saving...</>
              ) : (
                <><FaSave className="mr-2" />{sale ? 'Save Changes' : 'Create Order'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
