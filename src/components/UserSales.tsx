import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import SalesStatusBadge from './SalesStatusBadge';
import SalesStatusTimeline from './SalesStatusTimeline';
import { FaArrowLeft, FaSignOutAlt, FaShoppingCart, FaUser, FaExclamationTriangle, FaEye, FaFilePdf, FaLink, FaTruck, FaBox, FaStickyNote, FaSearch, FaFilter, FaTimes, FaClock } from 'react-icons/fa';

interface UserSale {
  id: string;
  external_id?: string;
  product_id: string;
  name: string;
  size: string;
  price: number;
  image_url: string | null;
  payout: number;
  created_at: string;
  status: string;
  status_notes?: string;
  tracking_number?: string;
  carrier?: string;
  tracking_url?: string;
  label_url?: string;
  sku?: string;
  delivered_at?: string;
  payout_date?: string;
  is_manual?: boolean;
}

export default function UserSales() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<UserSale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [selectedSaleForTimeline, setSelectedSaleForTimeline] = useState<UserSale | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [quickFilter, setQuickFilter] = useState<string>('');

  useEffect(() => {
    const fetchUserAndSales = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/');
          return;
        }
        setUser(user);
        await fetchSales(user.id);
      } catch (err) {
        setError('Error loading user data.');
      } finally {
        setLoading(false);
      }
    };
    fetchUserAndSales();
  }, [navigate]);

  const fetchSales = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_sales')
        .select('id, external_id, product_id, name, size, price, image_url, payout, created_at, status, status_notes, tracking_number, carrier, tracking_url, label_url, sku, delivered_at, payout_date, is_manual')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSales(data || []);
    } catch (err) {
      setError('Error loading your sales.');
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch {}
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('sk-SK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleRetry = () => {
    setError(null);
    if (user) {
      fetchSales(user.id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-xl shadow-lg mb-3">
            <svg className="animate-spin h-6 w-6 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="text-lg text-gray-600">Loading sales...</p>
        </div>
      </div>
    );
  }

  // Calculate statistics
  const totalPayout = sales.reduce((sum, sale) => sum + sale.payout, 0);
  const completedSales = sales.filter(sale => sale.status === 'completed').length;
  // Doručené = Čakajúce na payout (status 'delivered')
  const deliveredSales = sales.filter(sale => sale.status === 'delivered').length;
  const waitingForPayout = deliveredSales; // Rovnaké ako delivered
  
  // Dokončené = completed (automaticky sa zmení z delivered keď prijde payout_date)
  const readyForPayout = completedSales;
  
  const pendingPayoutAmount = sales
    .filter(sale => sale.status === 'completed')
    .reduce((sum, sale) => sum + sale.payout, 0);
  const waitingPayoutAmount = sales
    .filter(sale => sale.status === 'delivered' && sale.payout_date && new Date(sale.payout_date) > new Date())
    .reduce((sum, sale) => sum + sale.payout, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySales = sales.filter(sale => {
    const saleDate = new Date(sale.created_at);
    saleDate.setHours(0, 0, 0, 0);
    return saleDate.getTime() === today.getTime();
  }).length;

  // Filter logic
  const filteredSales = sales.filter((sale) => {
    // Quick filters
    if (quickFilter === 'today') {
      const saleDate = new Date(sale.created_at);
      saleDate.setHours(0, 0, 0, 0);
      if (saleDate.getTime() !== today.getTime()) return false;
    } else if (quickFilter === 'waiting_payout' || quickFilter === 'delivered') {
      // Doručené = Čakajúce na payout (status 'delivered')
      if (sale.status !== 'delivered') {
        return false;
      }
    } else if (quickFilter === 'completed') {
      if (sale.status !== 'completed') return false;
    }

    // Text search
    const matchesSearch = !searchTerm || [sale.name, sale.sku, sale.external_id].some((field) =>
      field?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Status filter
    const matchesStatus = !statusFilter || sale.status === statusFilter;

    // Date filter
    let matchesDate = true;
    if (dateFrom || dateTo) {
      const saleDate = new Date(sale.created_at).toISOString().split('T')[0];
      if (dateFrom && saleDate < dateFrom) matchesDate = false;
      if (dateTo && saleDate > dateTo) matchesDate = false;
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  const hasActiveFilters = !!(statusFilter || dateFrom || dateTo || searchTerm || quickFilter);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setQuickFilter('');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-xl border border-gray-200">
                <FaShoppingCart className="text-gray-900 text-lg" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">My Sales</h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Your sales history</p>
              </div>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-white text-gray-800 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 border border-gray-300 shadow-sm"
              >
                <FaArrowLeft className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <Link
                to="/profile"
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-white text-gray-800 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 border border-gray-300 shadow-sm"
              >
                <FaUser className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Profile</span>
              </Link>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-white text-gray-800 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 border border-gray-300 shadow-sm"
              >
                <FaSignOutAlt className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FaExclamationTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleRetry}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Try Again
                </button>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-600"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-2xl p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                <FaShoppingCart className="text-gray-900 text-xl" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Total Sales</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{sales.length}</p>
                {todaySales > 0 && (
                  <p className="text-xs text-green-600 mt-1">+{todaySales} today</p>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Total Payout</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{totalPayout.toFixed(2)} €</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Waiting for Payout</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{waitingForPayout}</p>
                <p className="text-xs text-blue-600 mt-1">{waitingPayoutAmount.toFixed(2)} €</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Completed</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{readyForPayout}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sales Cards */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">My Sales ({filteredSales.length})</h3>
              <p className="text-gray-600 text-xs sm:text-sm mt-1">Overview of all your sales</p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm sm:text-base"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 ${
                  hasActiveFilters ? 'bg-gray-100 border-gray-400' : ''
                }`}
                title="Filters"
              >
                <FaFilter className="text-gray-600 text-sm" />
                {hasActiveFilters && (
                  <span className="ml-1 w-2 h-2 bg-gray-600 rounded-full"></span>
                )}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 text-sm text-gray-600"
                  title="Clear Filters"
                >
                  <FaTimes className="text-sm" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Filters */}
          <div className="px-4 sm:px-6 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-600 mr-2">Quick Filters:</span>
              <button
                onClick={() => setQuickFilter(quickFilter === 'today' ? '' : 'today')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  quickFilter === 'today'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setQuickFilter(quickFilter === 'waiting_payout' ? '' : 'waiting_payout')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  quickFilter === 'waiting_payout'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Waiting for Payout ({waitingForPayout})
              </button>
              <button
                onClick={() => setQuickFilter(quickFilter === 'completed' ? '' : 'completed')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  quickFilter === 'completed'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Completed ({readyForPayout})
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Status Filter */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    <option value="">All statuses</option>
                    <option value="accepted">Accepted</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="returned">Returned</option>
                  </select>
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Date From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Date To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                              />
                            </div>
                            </div>
                          </div>
          )}

          <div className="p-4 sm:p-6">
            {filteredSales.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FaShoppingCart className="text-gray-600 text-2xl" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                  {sales.length === 0 ? 'No Sales' : 'No Sales Found'}
                </h3>
                <p className="text-sm sm:text-base text-gray-600 mb-6">
                  {sales.length === 0 
                    ? "You don't have any sales yet" 
                    : "Try changing filters or search term"}
                </p>
                {sales.length === 0 ? (
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 transform hover:scale-105"
                  >
                    <FaArrowLeft className="mr-2" />
                    Back to Dashboard
                  </Link>
                ) : (
                          <button
                    onClick={clearFilters}
                    className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 transform hover:scale-105"
                          >
                    <FaTimes className="mr-2" />
                    Clear Filters
                          </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                {filteredSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:shadow-lg transition-all duration-200 cursor-pointer"
                    onClick={() => setSelectedSaleForTimeline(sale)}
                  >
                    {/* Product Image & Basic Info */}
                    <div className="flex items-start space-x-4 mb-4">
                      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
                        <img
                          className="h-full w-full object-contain p-2"
                          src={sale.image_url || '/default-image.png'}
                          alt={sale.name}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = '/default-image.png';
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-gray-900 truncate mb-1">{sale.name}</h4>
                        <div className="flex items-center space-x-2 mb-2 flex-wrap gap-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {sale.size}
                          </span>
                          <div className="flex items-center space-x-1">
                            <SalesStatusBadge status={sale.status} />
                            {sale.is_manual && (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-blue-500 text-white" title="Manual sale">
                                M
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-600">SKU: {sale.sku || 'N/A'}</p>
                        {sale.external_id && (
                          <p className="text-xs text-gray-600 font-mono mt-1">ID: {sale.external_id}</p>
                        )}
                      </div>
                          </div>
                          
                    {/* Financial Info */}
                    <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-gray-200">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Price</p>
                        <p className="text-sm font-semibold text-gray-900">{sale.price.toFixed(2)} €</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Payout</p>
                        <p className="text-sm font-semibold text-green-600">{sale.payout.toFixed(2)} €</p>
                          </div>
                          </div>
                          
                    {/* Tracking & Label Info */}
                    <div className="mb-4 pb-4 border-b border-gray-200 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 flex items-center">
                          <FaTruck className="mr-1" />
                          Tracking:
                        </span>
                        {sale.tracking_url || sale.tracking_number ? (
                          <div className="flex items-center space-x-2">
                            {sale.tracking_number && (
                              <span className="font-mono text-gray-900">{sale.tracking_number}</span>
                            )}
                            {sale.tracking_url && (
                              <a
                                href={sale.tracking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                                title="Otvoriť tracking"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <FaLink />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">not yet</span>
                        )}
                          </div>
                      {sale.carrier && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">Carrier:</span>
                          <span className="text-gray-900 font-medium">{sale.carrier}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 flex items-center">
                          <FaFilePdf className="mr-1" />
                          Label:
                        </span>
                        {sale.label_url ? (
                          <a
                            href={sale.label_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-red-600 hover:text-red-800 flex items-center space-x-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FaFilePdf />
                            <span>PDF</span>
                          </a>
                        ) : (
                          <span className="text-gray-400 italic">not yet</span>
                        )}
                      </div>
                    </div>

                    {/* Payout Date Info - Only for delivered status */}
                    {sale.status === 'delivered' && sale.payout_date && (
                      <div className="mb-4 pb-4 border-b border-gray-200">
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                          <p className="text-xs text-gray-600 mb-1">Planned payout date:</p>
                          <p className="text-sm font-semibold text-blue-900">
                            {new Date(sale.payout_date).toLocaleDateString('sk-SK', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })}
                          </p>
                          {new Date(sale.payout_date) > new Date() && (
                            <p className="text-xs text-gray-600 mt-1">
                              {Math.ceil((new Date(sale.payout_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days remaining
                            </p>
                          )}
                        </div>
                        {sale.delivered_at && (
                          <p className="text-xs text-gray-500 mt-2">
                            Delivered: {new Date(sale.delivered_at).toLocaleDateString('en-US', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* Payout Status Info */}
                    {sale.status === 'completed' ? (
                      <div className="mb-4 pb-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <p className="text-xs font-medium text-green-700">Payout has been paid</p>
                          </div>
                          {sale.payout_date && (
                            <p className="text-xs text-gray-500">
                              {new Date(sale.payout_date).toLocaleDateString('sk-SK', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4 pb-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                            <p className="text-xs font-medium text-gray-600">Payout not paid</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Date */}
                    <div className="text-xs text-gray-600 mb-4">
                      <p>{formatDate(sale.created_at)}</p>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSaleForTimeline(sale);
                      }}
                      className="w-full inline-flex items-center justify-center px-4 py-2 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200"
                    >
                      <FaEye className="mr-2" />
                      View Details
                    </button>
                  </div>
                ))}
              </div>
            )}
            </div>
        </div>

        {/* Sales Status Timeline Modal */}
        {selectedSaleForTimeline && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-50">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-3xl sm:max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Sale Details</h2>
                <button
                  onClick={() => {
                    setSelectedSaleForTimeline(null);
                    setShowTimeline(false);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                {/* Sale Info */}
                <div className="bg-gray-50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 border border-gray-200">
                  <div className="flex items-start space-x-3 sm:space-x-4">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <img
                        src={selectedSaleForTimeline.image_url || '/default-image.png'}
                        alt={selectedSaleForTimeline.name}
                        className="h-full w-full object-contain p-1 sm:p-2"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="font-semibold text-gray-900 text-base sm:text-lg flex-1">{selectedSaleForTimeline.name}</h3>
                        <div className="flex items-center space-x-1">
                          <SalesStatusBadge status={selectedSaleForTimeline.status} />
                          {selectedSaleForTimeline.is_manual && (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-blue-500 text-white" title="Manuálna sale">
                              M
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                        <div>
                          <span className="text-gray-600">Size:</span>
                          <span className="ml-2 font-medium text-gray-900">{selectedSaleForTimeline.size}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">SKU:</span>
                          <span className="ml-2 font-medium text-gray-900 break-all">{selectedSaleForTimeline.sku || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Price:</span>
                          <span className="ml-2 font-semibold text-gray-900">{selectedSaleForTimeline.price.toFixed(2)} €</span>
                    </div>
                    <div>
                          <span className="text-gray-600">Payout:</span>
                          <span className="ml-2 font-semibold text-green-600">{selectedSaleForTimeline.payout.toFixed(2)} €</span>
                        </div>
                        {selectedSaleForTimeline.external_id && (
                          <div className="col-span-1 sm:col-span-2">
                            <span className="text-gray-600">External ID:</span>
                            <span className="ml-2 font-mono text-gray-900 break-all text-xs">{selectedSaleForTimeline.external_id}</span>
                          </div>
                        )}
                        <div className="col-span-1 sm:col-span-2">
                          <span className="text-gray-600">Date:</span>
                          <span className="ml-2 text-gray-900">{formatDate(selectedSaleForTimeline.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tracking & Label Info - Prominent Display */}
                <div className="mb-4 sm:mb-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">Tracking & Label</h4>
                  <div className="space-y-2 sm:space-y-3">
                    {selectedSaleForTimeline.tracking_number ? (
                      <div className="bg-blue-50 rounded-xl p-3 sm:p-4 border border-blue-200">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <div className="flex items-center space-x-2">
                            <FaTruck className="text-blue-600 text-sm sm:text-base" />
                            <span className="text-xs sm:text-sm font-semibold text-gray-900">Tracking Information</span>
                          </div>
                          {selectedSaleForTimeline.tracking_url && (
                            <a
                              href={selectedSaleForTimeline.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium flex items-center space-x-1"
                            >
                              <FaLink className="text-xs" />
                              <span>Open</span>
                            </a>
                          )}
                        </div>
                        <div className="bg-white rounded-lg p-2 sm:p-3 border border-blue-100">
                          <p className="text-xs sm:text-sm font-mono text-gray-900 font-semibold break-all">{selectedSaleForTimeline.tracking_number}</p>
                          {selectedSaleForTimeline.carrier && (
                            <p className="text-xs text-gray-600 mt-1">Carrier: <span className="font-medium">{selectedSaleForTimeline.carrier}</span></p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-3 sm:p-4 border border-gray-200">
                        <p className="text-xs sm:text-sm text-gray-600">Tracking information is not yet available</p>
                      </div>
                    )}

                    {selectedSaleForTimeline.label_url ? (
                      <div className="bg-red-50 rounded-xl p-3 sm:p-4 border border-red-200">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center space-x-2">
                            <FaFilePdf className="text-red-600 text-sm sm:text-base" />
                            <span className="text-xs sm:text-sm font-semibold text-gray-900">Label PDF</span>
                          </div>
                          <a
                            href={selectedSaleForTimeline.label_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors"
                          >
                            <FaFilePdf />
                            <span>Open PDF</span>
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-3 sm:p-4 border border-gray-200">
                        <p className="text-xs sm:text-sm text-gray-600">Label is not yet available</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payout Date Info - Only for delivered status */}
                {selectedSaleForTimeline.status === 'delivered' && selectedSaleForTimeline.payout_date && (
                  <div className="mb-4 sm:mb-6">
                    <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">Payout Information</h4>
                    <div className="bg-blue-50 rounded-xl p-3 sm:p-4 border border-blue-200">
                      <div className="mb-2 sm:mb-3">
                        <p className="text-xs text-gray-600 mb-1">Planned payout date:</p>
                        <p className="text-xs sm:text-sm font-semibold text-blue-900">
                          {new Date(selectedSaleForTimeline.payout_date).toLocaleDateString('sk-SK', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                      {new Date(selectedSaleForTimeline.payout_date) > new Date() && (
                        <p className="text-xs text-gray-600">
                          {Math.ceil((new Date(selectedSaleForTimeline.payout_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days until payout
                        </p>
                      )}
                      {selectedSaleForTimeline.delivered_at && (
                        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-blue-200">
                          Doručené: {new Date(selectedSaleForTimeline.delivered_at).toLocaleDateString('sk-SK', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Completed Status Info */}
                {selectedSaleForTimeline.status === 'completed' && (
                  <div className="mb-4 sm:mb-6">
                    <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">Payout Information</h4>
                    <div className="bg-green-50 rounded-xl p-3 sm:p-4 border border-green-200">
                      <p className="text-xs sm:text-sm font-semibold text-green-900 mb-2">Completed - Payout has been paid</p>
                      {selectedSaleForTimeline.payout_date && (
                        <p className="text-xs text-gray-600">
                          Paid: {new Date(selectedSaleForTimeline.payout_date).toLocaleDateString('en-US', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </p>
                      )}
                      {selectedSaleForTimeline.delivered_at && (
                        <p className="text-xs text-gray-500 mt-2">
                          Doručené: {new Date(selectedSaleForTimeline.delivered_at).toLocaleDateString('sk-SK', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Status Notes */}
                {selectedSaleForTimeline.status_notes && (
                  <div className="bg-yellow-50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 border border-yellow-200">
                    <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 flex items-center">
                      <FaStickyNote className="mr-2 text-yellow-600 text-sm" />
                      Note
                    </h4>
                    <p className="text-xs sm:text-sm text-gray-700">{selectedSaleForTimeline.status_notes}</p>
                  </div>
                )}

                {/* Status Timeline - Always Visible */}
                <div className="mb-4 sm:mb-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center">
                    <FaClock className="mr-2 text-gray-600 text-sm" />
                    Status Change History
                  </h4>
                <SalesStatusTimeline 
                  saleId={selectedSaleForTimeline.id} 
                  currentStatus={selectedSaleForTimeline.status}
                />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}