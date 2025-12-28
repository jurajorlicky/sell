import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import SalesStatusBadge from '../components/SalesStatusBadge';
import AdminSalesStatusManager from '../components/AdminSalesStatusManager';
import CreateSaleModal from '../components/CreateSaleModal';
import AdminNavigation from '../components/AdminNavigation';
import {
  FaSearch,
  FaSignOutAlt,
  FaSync,
  FaShoppingCart,
  FaExclamationTriangle,
  FaUserShield,
  FaFilePdf,
  FaLink,
  FaFilter,
  FaTimes,
  FaTruck,
  FaPlus
} from 'react-icons/fa';

interface Sale {
  id: string;
  product_id: string;
  name: string;
  size: string;
  price: number;
  payout: number;
  created_at: string;
  status: string;
  image_url?: string;
  user_email: string;
  status_notes?: string;
  sku?: string;
  external_id?: string;
  tracking_number?: string;
  carrier?: string;
  tracking_url?: string;
  label_url?: string;
  contract_url?: string;
  delivered_at?: string;
  payout_date?: string;
  is_manual?: boolean;
  profiles?: {
    email: string;
  };
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [userEmailFilter, setUserEmailFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [quickFilter, setQuickFilter] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSaleForStatus, setSelectedSaleForStatus] = useState<Sale | null>(null);
  const [showCreateSaleModal, setShowCreateSaleModal] = useState(false);

  const loadSales = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      const { data, error } = await supabase
        .from('user_sales')
        .select(`
          id, product_id, name, size, price, payout, created_at, status, image_url, external_id, sku, status_notes,
          tracking_number, carrier, tracking_url, label_url, contract_url, delivered_at, payout_date, is_manual,
          profiles(email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched = (data || []).map((sale: any) => ({
        ...sale,
        user_email: sale.profiles?.email || 'N/A',
      }));

      setSales(enriched);

    } catch (err: any) {
      console.error('Error loading sales:', err.message);
      setError('Chyba pri načítavaní predajov: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSales();
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
    loadSales();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('sk-SK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };


  useEffect(() => {
    loadSales();
  }, []);

  const filteredSales = sales.filter((sale) => {
    // Quick filters
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
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
    const matchesSearch = !searchTerm || [sale.name, sale.sku, sale.user_email, sale.external_id].some((field) =>
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

    // User email filter
    const matchesUser = !userEmailFilter || sale.user_email?.toLowerCase().includes(userEmailFilter.toLowerCase());

    return matchesSearch && matchesStatus && matchesDate && matchesUser;
  });

  const clearFilters = () => {
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setUserEmailFilter('');
    setSearchTerm('');
    setQuickFilter('');
  };

  const hasActiveFilters = statusFilter || dateFrom || dateTo || userEmailFilter || searchTerm || quickFilter;

  // Calculate statistics
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.price, 0);
  const totalPayout = sales.reduce((sum, sale) => sum + sale.payout, 0);
  const completedSales = sales.filter(sale => sale.status === 'completed').length;
  // Doručené = Čakajúce na payout (status 'delivered')
  const deliveredSales = sales.filter(sale => sale.status === 'delivered').length;
  const waitingForPayout = deliveredSales; // Rovnaké ako delivered
  
  // Dokončené = completed (automaticky sa zmení z delivered keď prijde payout_date)
  const readyForPayout = sales.filter(sale => sale.status === 'completed').length;
  
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

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-green-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Načítavajú sa predaje</h3>
          <p className="text-sm text-gray-600">Prosím čakajte...</p>
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
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-600 via-emerald-600 to-green-800 rounded-2xl shadow-lg">
                  <FaShoppingCart className="text-gray-900 text-xl" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                  Správa predajov
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Správa a prehľad predaných produktov</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 sm:space-x-3">
              <button
                onClick={() => setShowCreateSaleModal(true)}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-lg transform hover:scale-105"
                title="Vytvoriť nový predaj"
              >
                <FaPlus className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Nový predaj</span>
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50"
              >
                <FaSync className={`text-sm sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Obnovuje sa...' : 'Obnoviť'}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-lg transform hover:scale-105"
              >
                <FaSignOutAlt className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Odhlásiť</span>
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
                  Skúsiť znova
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

        {/* Navigation */}
        <AdminNavigation />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-6 mb-3 sm:mb-4 lg:mb-8">
          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gray-100 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <FaShoppingCart className="text-gray-900 text-sm sm:text-base lg:text-xl" />
                </div>
              </div>
              <div className="ml-2 sm:ml-3 lg:ml-4">
                <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-600">Celkový počet predajov</p>
                <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900">{sales.length}</p>
                {todaySales > 0 && (
                  <p className="text-xs text-green-600 mt-1">+{todaySales} dnes</p>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-green-100 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
              </div>
              <div className="ml-2 sm:ml-3 lg:ml-4">
                <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-600">Celkové tržby</p>
                <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900 truncate">{totalRevenue.toFixed(2)} €</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-blue-100 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-2 sm:ml-3 lg:ml-4">
                <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-600">Čakajúce na payout</p>
                <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900">{waitingForPayout}</p>
                <p className="text-[10px] sm:text-xs text-blue-600 mt-0.5 sm:mt-1 truncate">{waitingPayoutAmount.toFixed(2)} €</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-green-100 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-2 sm:ml-3 lg:ml-4">
                <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-600">Dokončené</p>
                <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900">{readyForPayout}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sales Cards */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Predaje ({filteredSales.length})</h3>
                <p className="text-gray-600 text-xs sm:text-sm mt-1">Správa a prehľad predajov</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm" />
                  <input
                    type="text"
                    placeholder="Vyhľadať predaje..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 ${
                    hasActiveFilters ? 'bg-gray-100 border-gray-400' : ''
                  }`}
                  title="Filtre"
                >
                  <FaFilter className="text-gray-600 text-sm" />
                  {hasActiveFilters && (
                    <span className="ml-1 w-2 h-2 bg-green-500 rounded-full"></span>
                  )}
                </button>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 text-sm text-gray-600"
                    title="Vymazať filtre"
                  >
                    <FaTimes className="text-sm" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-medium text-gray-600 mr-2">Rýchle filtre:</span>
              <button
                onClick={() => setQuickFilter(quickFilter === 'today' ? '' : 'today')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  quickFilter === 'today'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Dnešné
              </button>
              <button
                onClick={() => setQuickFilter(quickFilter === 'waiting_payout' ? '' : 'waiting_payout')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  quickFilter === 'waiting_payout'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Čakajúce na payout ({waitingForPayout})
              </button>
              <button
                onClick={() => setQuickFilter(quickFilter === 'completed' ? '' : 'completed')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  quickFilter === 'completed'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Dokončené ({readyForPayout})
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                {/* Status Filter */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Všetky statusy</option>
                    <option value="accepted">Prijatý</option>
                    <option value="processing">Spracováva sa</option>
                    <option value="shipped">Odoslaný</option>
                    <option value="delivered">Doručený</option>
                    <option value="completed">Dokončený</option>
                    <option value="cancelled">Zrušený</option>
                    <option value="returned">Vrátený</option>
                  </select>
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Dátum od</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Dátum do</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* User Email Filter */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Email používateľa</label>
                  <input
                    type="text"
                    placeholder="Filtrovať podľa emailu..."
                    value={userEmailFilter}
                    onChange={(e) => setUserEmailFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="p-3 sm:p-4 lg:p-6">
            {filteredSales.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FaShoppingCart className="text-gray-600 text-2xl" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Žiadne predaje</h3>
                <p className="text-sm sm:text-base text-gray-600">
                  {searchTerm ? 'Nenašli sa žiadne predaje pre váš vyhľadávací výraz' : 'Zatiaľ nie sú žiadne predaje'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-6">
                {filteredSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="bg-white border border-gray-200 rounded-xl p-2.5 sm:p-3 lg:p-5 hover:shadow-lg transition-all duration-200 cursor-pointer"
                    onClick={() => setSelectedSaleForStatus(sale)}
                  >
                    {/* Product Image & Basic Info */}
                    <div className="flex items-start space-x-2 sm:space-x-3 lg:space-x-4 mb-2 sm:mb-3 lg:mb-4">
                      <div className="h-14 w-14 sm:h-16 sm:w-16 lg:h-20 lg:w-20 flex-shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-gray-200 bg-white">
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
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-900 truncate mb-0.5 sm:mb-1">{sale.name}</h4>
                        <div className="flex items-center space-x-1 sm:space-x-2 mb-1 sm:mb-2 flex-wrap gap-0.5 sm:gap-1">
                          <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-gray-100 text-gray-800">
                              {sale.size}
                            </span>
                          <div className="flex items-center space-x-0.5 sm:space-x-1">
                            <SalesStatusBadge status={sale.status} />
                            {sale.is_manual && (
                              <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full text-[10px] sm:text-xs font-bold bg-blue-500 text-white" title="Manuálna sale">
                                M
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-600">SKU: {sale.sku || 'N/A'}</p>
                        {sale.external_id && (
                          <p className="text-[10px] sm:text-xs text-gray-500 font-mono mt-0.5 truncate">ID: {sale.external_id}</p>
                        )}
                      </div>
                    </div>

                    {/* Financial Info */}
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:gap-3 mb-2 sm:mb-3 lg:mb-4 pb-2 sm:pb-3 lg:pb-4 border-b border-gray-200">
                      <div>
                        <p className="text-[10px] sm:text-xs text-gray-600 mb-0.5">Cena</p>
                        <p className="text-xs sm:text-sm font-semibold text-gray-900">{sale.price.toFixed(2)} €</p>
                      </div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-gray-600 mb-0.5">Payout</p>
                        <p className="text-xs sm:text-sm font-semibold text-green-600">{sale.payout.toFixed(2)} €</p>
                          </div>
                          </div>

                    {/* Tracking & Label Info */}
                    <div className="mb-2 sm:mb-3 lg:mb-4 pb-2 sm:pb-3 lg:pb-4 border-b border-gray-200 space-y-1 sm:space-y-1.5 lg:space-y-2">
                      <div className="flex items-center justify-between text-[10px] sm:text-xs">
                        <span className="text-gray-600 flex items-center">
                          <FaTruck className="mr-0.5 sm:mr-1 text-[10px] sm:text-xs" />
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
                          <span className="text-gray-400 italic">ešte nie je</span>
                        )}
                          </div>
                      {sale.carrier && (
                        <div className="flex items-center justify-between text-[10px] sm:text-xs">
                          <span className="text-gray-600">Dopravca:</span>
                          <span className="text-gray-900 font-medium truncate ml-2">{sale.carrier}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px] sm:text-xs">
                        <span className="text-gray-600 flex items-center">
                          <FaFilePdf className="mr-0.5 sm:mr-1 text-[10px] sm:text-xs" />
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
                          <span className="text-gray-400 italic">ešte nie je</span>
                        )}
                      </div>
                    </div>

                    {/* Payout Status Info */}
                    {sale.status === 'completed' ? (
                      <div className="mb-2 sm:mb-3 lg:mb-4 pb-2 sm:pb-3 lg:pb-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1 sm:space-x-2">
                            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full"></div>
                            <p className="text-[10px] sm:text-xs font-medium text-green-700">Payout bol vyplatený</p>
                          </div>
                          {sale.payout_date && (
                            <p className="text-[10px] sm:text-xs text-gray-500">
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
                      <div className="mb-2 sm:mb-3 lg:mb-4 pb-2 sm:pb-3 lg:pb-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1 sm:space-x-2">
                            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full"></div>
                            <p className="text-[10px] sm:text-xs font-medium text-gray-600">Payout nevyplatený</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* User & Date */}
                    <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                      <div className="text-[10px] sm:text-xs text-gray-600">
                        <p className="truncate">{sale.user_email}</p>
                        <p className="mt-0.5 sm:mt-1">{formatDate(sale.created_at)}</p>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSaleForStatus(sale);
                      }}
                      className="w-full inline-flex items-center justify-center px-2.5 sm:px-3 lg:px-4 py-1.5 sm:py-2 lg:py-2.5 bg-black text-white text-[10px] sm:text-xs lg:text-sm font-semibold rounded-lg sm:rounded-xl hover:bg-gray-800 transition-all duration-200"
                    >
                      <FaUserShield className="mr-1 sm:mr-1.5 lg:mr-2 text-[10px] sm:text-xs lg:text-sm" />
                      Upraviť
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sales Status Management Modal */}
        {selectedSaleForStatus && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-2xl w-full border-t sm:border border-gray-200 max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
              {/* Sticky Header */}
              <div className="flex items-center justify-between p-3 sm:p-4 lg:p-6 border-b border-gray-200 bg-white flex-shrink-0">
                <h2 className="text-base sm:text-lg lg:text-xl text-gray-900 font-semibold flex-1 pr-2">Správa statusu predaja</h2>
                <button
                  onClick={() => setSelectedSaleForStatus(null)}
                  className="flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                  aria-label="Zatvoriť"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
              {/* Sale Info */}
              <div className="bg-gray-50 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 lg:mb-6 border border-gray-200">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <img 
                    src={selectedSaleForStatus.image_url || '/default-image.png'} 
                    alt={selectedSaleForStatus.name}
                    className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg object-cover"
                  />
                  <div>
                    <h3 className="text-gray-900 font-semibold text-base sm:text-lg">{selectedSaleForStatus.name}</h3>
                    <p className="text-gray-700 text-sm">Veľkosť: {selectedSaleForStatus.size}</p>
                    <p className="text-gray-700 text-sm">Cena: {selectedSaleForStatus.price} €</p>
                    <p className="text-gray-700 text-sm">Používateľ: {selectedSaleForStatus.user_email}</p>
                    <p className="text-gray-700 text-sm">Externé ID: {selectedSaleForStatus.external_id || 'N/A'}</p>
                  </div>
                </div>
              </div>
              
              <AdminSalesStatusManager
                saleId={selectedSaleForStatus.id}
                currentStatus={selectedSaleForStatus.status}
                currentExternalId={selectedSaleForStatus.external_id}
                currentTrackingUrl={selectedSaleForStatus.tracking_url}
                currentLabelUrl={selectedSaleForStatus.label_url}
                currentDeliveredAt={selectedSaleForStatus.delivered_at}
                currentPayoutDate={selectedSaleForStatus.payout_date}
                currentCreatedAt={selectedSaleForStatus.created_at}
                currentIsManual={selectedSaleForStatus.is_manual || false}
                onStatusUpdate={(newStatus) => {
                  setSelectedSaleForStatus({
                    ...selectedSaleForStatus,
                    status: newStatus
                  });
                  // Refresh the sales list
                  loadSales();
                }}
                onExternalIdUpdate={(newExternalId) => {
                  setSelectedSaleForStatus({
                    ...selectedSaleForStatus,
                    external_id: newExternalId
                  });
                  // Refresh the sales list
                  loadSales();
                }}
                onClose={() => setSelectedSaleForStatus(null)}
                onDelete={async () => {
                  setSelectedSaleForStatus(null);
                  await loadSales();
                }}
              />
              </div>
            </div>
          </div>
        )}

        {/* Create Sale Modal */}
        <CreateSaleModal
          isOpen={showCreateSaleModal}
          onClose={() => setShowCreateSaleModal(false)}
          onSaleCreated={() => {
            loadSales();
            setShowCreateSaleModal(false);
          }}
        />
      </div>
    </div>
  );
}