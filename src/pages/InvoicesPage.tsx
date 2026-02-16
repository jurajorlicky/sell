import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import AdminNavigation from '../components/AdminNavigation';
import Pagination from '../components/Pagination';
import { formatDate as formatDateFull, formatDateShort, formatCurrency } from '../lib/utils';
import {
  FaSearch,
  FaSignOutAlt,
  FaSync,
  FaFileInvoice,
  FaUserShield,
  FaFilePdf,
  FaFilter,
  FaTimes,
  FaDownload,
  FaExclamationTriangle,
  FaSortAmountDown,
  FaSortAmountUp
} from 'react-icons/fa';

interface Invoice {
  id: string;
  product_id: string;
  name: string;
  size: string;
  price: number;
  payout: number;
  invoice_date: string;
  created_at: string;
  status: string;
  image_url?: string;
  user_email: string;
  sku?: string;
  external_id?: string;
  contract_url?: string;
  profiles?: {
    email: string;
  };
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [userEmailFilter, setUserEmailFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [sortField, setSortField] = useState<'invoice_date' | 'price' | 'payout' | 'name'>('invoice_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const loadInvoices = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      const { data, error } = await supabase
        .from('user_sales')
        .select(`
          id, product_id, name, size, price, payout, invoice_date, created_at, status, image_url, external_id, sku,
          contract_url, profiles(email)
        `)
        .not('invoice_date', 'is', null)
        .order('invoice_date', { ascending: false });

      if (error) throw error;

      const enriched = (data || []).map((invoice: any) => ({
        ...invoice,
        user_email: invoice.profiles?.email || 'N/A',
      }));

      setInvoices(enriched);

    } catch (err: any) {
      console.error('Error loading invoices:', err.message);
      setError('Error loading invoices: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInvoices();
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
    loadInvoices();
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const filteredInvoices = invoices.filter((invoice) => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        invoice.name?.toLowerCase().includes(searchLower) ||
        invoice.external_id?.toLowerCase().includes(searchLower) ||
        invoice.sku?.toLowerCase().includes(searchLower) ||
        invoice.user_email?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Status filter
    if (statusFilter && invoice.status !== statusFilter) {
      return false;
    }

    // User email filter
    if (userEmailFilter) {
      const emailLower = userEmailFilter.toLowerCase();
      if (!invoice.user_email?.toLowerCase().includes(emailLower)) {
        return false;
      }
    }

    // Date filters
    if (dateFrom) {
      const invoiceDate = new Date(invoice.invoice_date);
      invoiceDate.setHours(0, 0, 0, 0);
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      if (invoiceDate < fromDate) return false;
    }

    if (dateTo) {
      const invoiceDate = new Date(invoice.invoice_date);
      invoiceDate.setHours(23, 59, 59, 999);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      if (invoiceDate > toDate) return false;
    }

    return true;
  });

  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'price': cmp = a.price - b.price; break;
        case 'payout': cmp = a.payout - b.payout; break;
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'invoice_date':
        default: cmp = new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime(); break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [filteredInvoices, sortField, sortDirection]);

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedInvoices.slice(start, start + itemsPerPage);
  }, [sortedInvoices, currentPage, itemsPerPage]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'desc' ? <FaSortAmountDown className="inline ml-1 text-[10px]" /> : <FaSortAmountUp className="inline ml-1 text-[10px]" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900">Loading invoices...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <FaExclamationTriangle className="text-red-500 text-4xl mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error loading invoices</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="relative">
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 rounded-2xl shadow-lg">
                  <FaFileInvoice className="text-white text-xl" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                  Invoices
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Invoice management and overview</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 sm:space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50"
              >
                <FaSync className={`text-sm sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-lg transform hover:scale-105"
              >
                <FaSignOutAlt className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-8">
        <AdminNavigation />

        {/* Search and Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-4 sm:mb-6 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="flex-1 relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
              <input
                type="text"
                placeholder="Search by name, ID, SKU, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all ${
                showFilters
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <FaFilter className="mr-2" />
              Filters
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-gray-200">
              <div>
                <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                >
                  <option value="">All Statuses</option>
                  <option value="accepted">Accepted</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="returned">Returned</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                  User Email
                </label>
                <input
                  type="text"
                  placeholder="Filter by email..."
                  value={userEmailFilter}
                  onChange={(e) => setUserEmailFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                  Date From
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                  Date To
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Invoices Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th
                    className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => toggleSort('invoice_date')}
                  >
                    Invoice Date <SortIcon field="invoice_date" />
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    ID
                  </th>
                  <th
                    className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => toggleSort('name')}
                  >
                    Product <SortIcon field="name" />
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    User
                  </th>
                  <th
                    className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => toggleSort('price')}
                  >
                    Price <SortIcon field="price" />
                  </th>
                  <th
                    className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => toggleSort('payout')}
                  >
                    Payout <SortIcon field="payout" />
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Contract
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <FaFileInvoice className="text-gray-300 text-3xl mx-auto mb-3" />
                      <p className="text-gray-900 font-semibold mb-1">No invoices found</p>
                      <p className="text-gray-500 text-sm">
                        {invoices.length === 0 ? 'No invoices have been created yet.' : 'Try adjusting your filters.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {formatDateShort(invoice.invoice_date)}
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-xs sm:text-sm text-gray-900 font-mono">
                        {invoice.external_id || invoice.id.slice(0, 8)}
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                          {invoice.image_url && (
                            <img
                              loading="lazy"
                              src={invoice.image_url}
                              alt={invoice.name}
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                              {invoice.name}
                            </div>
                            <div className="text-[10px] sm:text-xs text-gray-500">
                              {invoice.size} {invoice.sku && `• ${invoice.sku}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-xs sm:text-sm text-gray-600">
                        {invoice.user_email}
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-xs sm:text-sm font-semibold text-gray-900">
                        {formatCurrency(invoice.price)}
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-xs sm:text-sm font-semibold text-gray-600">
                        {formatCurrency(invoice.payout)}
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium ${
                          invoice.status === 'completed' ? 'bg-green-100 text-green-800' :
                          invoice.status === 'delivered' ? 'bg-indigo-100 text-indigo-800' :
                          invoice.status === 'shipped' ? 'bg-purple-100 text-purple-800' :
                          invoice.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                          invoice.status === 'accepted' ? 'bg-blue-100 text-blue-800' :
                          invoice.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          invoice.status === 'returned' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                        {invoice.contract_url ? (
                          <a
                            href={invoice.contract_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-blue-600 hover:text-blue-800 text-xs sm:text-sm"
                          >
                            <FaFilePdf className="mr-1" />
                            <span className="hidden sm:inline">View</span>
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs sm:text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination + Summary */}
          {sortedInvoices.length > 0 && (
            <div className="bg-gray-50 px-3 sm:px-4 py-3 border-t border-gray-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 text-xs sm:text-sm">
                <div className="flex items-center space-x-4 text-gray-600">
                  <div>
                    Total Revenue: <span className="font-semibold text-gray-900">
                      {formatCurrency(filteredInvoices.reduce((sum, inv) => sum + inv.price, 0))}
                    </span>
                  </div>
                  <div>
                    Total Payout: <span className="font-semibold text-gray-900">
                      {formatCurrency(filteredInvoices.reduce((sum, inv) => sum + inv.payout, 0))}
                    </span>
                  </div>
                </div>
              </div>
              <Pagination
                currentPage={currentPage}
                totalItems={sortedInvoices.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

