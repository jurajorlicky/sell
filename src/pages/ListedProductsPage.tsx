import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { sendNewSaleEmail } from '../lib/email';
import { eurToCzk, formatCurrency, formatCzk } from '../lib/utils';
import { calculatePayout, getFees } from '../lib/fees';
import AdminNavigation from '../components/AdminNavigation';
import {
  FaSearch, FaSignOutAlt, FaSync, FaCheck,
  FaFilter, FaTimes, FaList, FaExclamationTriangle, FaTrash,
  FaRedo, FaClock
} from 'react-icons/fa';

interface UserProduct {
  id: string;
  user_id: string;
  product_id: string;
  name: string;
  size: string;
  price: number;
  image_url?: string;
  payout: number;
  created_at: string;
  sku: string;
  user_email: string;
  profiles: { email: string } | null;
  expires_at?: string;
  input_currency?: 'EUR' | 'CZK' | null;
  input_price?: number | null;
  exchange_rate?: number | null;
  is_vat0?: boolean | null;
  vat_scheme?: 'VAT0' | 'MARGIN' | null;
}

interface FeeSettings {
  fee_percent: number;
  fee_fixed: number;
  offer_expiration_days?: number;
}

export default function ListedProductsPage() {
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [feeSettings, setFeeSettings] = useState<FeeSettings | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [userEmailFilter, setUserEmailFilter] = useState<string>('');
  const [sizeFilter, setSizeFilter] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired'>('all');
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [externalId, setExternalId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<UserProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null);

  const getOfferPriceLine = (product: UserProduct): string => {
    if (product.input_currency === 'CZK' && product.input_price) {
      return `${formatCurrency(product.price)} / ${formatCzk(product.input_price)}`;
    }
    return formatCurrency(product.price);
  };

  const getOfferPayoutLine = (product: UserProduct): string => {
    if (product.input_currency === 'CZK' && product.exchange_rate && product.exchange_rate > 0) {
      return `${formatCurrency(product.payout)} / ${formatCzk(eurToCzk(product.payout, product.exchange_rate))}`;
    }
    return formatCurrency(product.payout);
  };

  const getVatScheme = (product: UserProduct): 'VAT0' | 'MARGIN' => (
    product.vat_scheme === 'VAT0' || product.is_vat0 ? 'VAT0' : 'MARGIN'
  );

  const getCurrentPayout = (product: UserProduct): number | null => {
    if (!feeSettings) return null;
    return calculatePayout(product.price, feeSettings.fee_percent, feeSettings.fee_fixed, getVatScheme(product));
  };

  const getAcceptedPayout = (product: UserProduct): number => {
    const currentPayout = getCurrentPayout(product);
    if (currentPayout !== null) return currentPayout;
    return Math.round(Number(product.payout || 0));
  };

  const isProductExpired = useCallback((p: UserProduct) => {
    return p.expires_at ? new Date(p.expires_at) < new Date() : false;
  }, []);

  // Load all products including active and expired
  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_products')
      .select(`
        id, user_id, product_id, name, size, price, payout, created_at, image_url, sku, expires_at,
        input_currency, input_price, exchange_rate, is_vat0, vat_scheme,
        profiles(email)
      `)
      .order('created_at', { ascending: false });

    if (!error) {
      setProducts(
        data?.map((p: any) => ({
          ...p,
          user_email: p.profiles?.email || 'N/A'
        })) || []
      );      
    } else {
      console.error('Error loading products:', error.message);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    getFees()
      .then(settings => setFeeSettings({
        fee_percent: settings.fee_percent,
        fee_fixed: settings.fee_fixed,
        offer_expiration_days: settings.offer_expiration_days || 60,
      }))
      .catch(err => console.warn('Failed to load current fee settings:', err));
  }, []);

  const handleConfirmSale = async () => {
    if (!selectedProduct || !externalId) return;
    setRefreshing(true);
    setShowModal(false);
    setError(null);

    try {
      const acceptedPayout = getAcceptedPayout(selectedProduct);
      // Create single sale with invoice_date set to product creation date
      const saleData = {
        user_id: selectedProduct.user_id,
        product_id: selectedProduct.product_id,
        name: selectedProduct.name,
        sku: selectedProduct.sku,
        size: selectedProduct.size,
        price: selectedProduct.price,
        payout: acceptedPayout,
        image_url: selectedProduct.image_url,
        status: 'accepted',
        external_id: externalId,
        invoice_date: selectedProduct.created_at // Use product creation date as invoice date
      };

      const { error: insertError } = await supabase.from('user_sales').insert([saleData]);
      if (insertError) throw insertError;

      // Mažeš ponuku
      const { error: deleteError } = await supabase
        .from('user_products')
        .delete()
        .eq('id', selectedProduct.id);
      if (deleteError) throw deleteError;

      // Pošleš email ak je email vyplnený
      if (selectedProduct.user_email && selectedProduct.user_email !== 'N/A') {
        try {
          await sendNewSaleEmail({
            email: selectedProduct.user_email,
            productName: selectedProduct.name,
            size: selectedProduct.size,
            price: selectedProduct.price,
            payout: acceptedPayout,
            external_id: externalId,
            image_url: selectedProduct.image_url,
            sku: selectedProduct.sku
          });
        } catch (emailError) {
          console.warn('Failed to send email:', emailError);
        }
      }

      await loadProducts();
    } catch (err: any) {
      setError('Error processing: ' + err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteOffer = async (product: UserProduct) => {
    if (!confirm(`Delete offer "${product.name}" EU ${product.size}? This cannot be undone.`)) return;
    setDeletingOfferId(product.id);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('user_products')
        .delete()
        .eq('id', product.id);

      if (deleteError) throw deleteError;

      setProducts(prev => prev.filter(item => item.id !== product.id));
    } catch (err: any) {
      setError('Error deleting offer: ' + err.message);
    } finally {
      setDeletingOfferId(null);
    }
  };

  const handleRenewOffer = async (product: UserProduct) => {
    const days = feeSettings?.offer_expiration_days || 60;
    const nextExpires = new Date();
    nextExpires.setDate(nextExpires.getDate() + days);
    const iso = nextExpires.toISOString();

    try {
      const { error } = await supabase
        .from('user_products')
        .update({ expires_at: iso })
        .eq('id', product.id);

      if (error) throw error;
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, expires_at: iso } : p));
    } catch (err: any) {
      setError('Error renewing offer: ' + err.message);
    }
  };

  const handleRenewMultiple = async (ids: string[]) => {
    if (ids.length === 0) return;
    const days = feeSettings?.offer_expiration_days || 60;
    const nextExpires = new Date();
    nextExpires.setDate(nextExpires.getDate() + days);
    const iso = nextExpires.toISOString();

    try {
      setBulkActionLoading(true);
      const { error } = await supabase
        .from('user_products')
        .update({ expires_at: iso })
        .in('id', ids);

      if (error) throw error;
      setProducts(prev => prev.map(p => ids.includes(p.id) ? { ...p, expires_at: iso } : p));
      setSelectedOfferIds(new Set());
    } catch (err: any) {
      setError('Error renewing offers: ' + err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleDeleteMultiple = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected offer(s)? This cannot be undone.`)) return;

    try {
      setBulkActionLoading(true);
      const { error } = await supabase
        .from('user_products')
        .delete()
        .in('id', ids);

      if (error) throw error;
      setProducts(prev => prev.filter(p => !ids.includes(p.id)));
      setSelectedOfferIds(new Set());
    } catch (err: any) {
      setError('Error deleting offers: ' + err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const toggleSelectAll = (visibleProducts: UserProduct[]) => {
    if (selectedOfferIds.size === visibleProducts.length && visibleProducts.length > 0) {
      setSelectedOfferIds(new Set());
    } else {
      setSelectedOfferIds(new Set(visibleProducts.map(p => p.id)));
    }
  };

  const toggleSelectOffer = (id: string) => {
    setSelectedOfferIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeProductsCount = useMemo(() => products.filter(p => !isProductExpired(p)).length, [products, isProductExpired]);
  const expiredProductsCount = useMemo(() => products.filter(isProductExpired).length, [products, isProductExpired]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (filterStatus === 'active' && isProductExpired(p)) return false;
      if (filterStatus === 'expired' && !isProductExpired(p)) return false;

      // Text search
      const matchesSearch = !searchTerm || [p.name, p.sku, p.user_email, p.size].some(f =>
        f?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      // Date filter
      let matchesDate = true;
      if (dateFrom || dateTo) {
        const productDate = new Date(p.created_at).toISOString().split('T')[0];
        if (dateFrom && productDate < dateFrom) matchesDate = false;
        if (dateTo && productDate > dateTo) matchesDate = false;
      }

      // User email filter
      const matchesUser = !userEmailFilter || p.user_email?.toLowerCase().includes(userEmailFilter.toLowerCase());

      // Size filter
      const matchesSize = !sizeFilter || p.size?.toLowerCase().includes(sizeFilter.toLowerCase());

      return matchesSearch && matchesDate && matchesUser && matchesSize;
    });
  }, [products, filterStatus, isProductExpired, searchTerm, dateFrom, dateTo, userEmailFilter, sizeFilter]);

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setUserEmailFilter('');
    setSizeFilter('');
    setSearchTerm('');
  };

  const hasActiveFilters = dateFrom || dateTo || userEmailFilter || sizeFilter || searchTerm;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-2xl shadow-lg">
                <FaList className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  User Offers
                </h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Manage and overview of offers</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => { setRefreshing(true); loadProducts().finally(() => setRefreshing(false)); }}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm"
              >
                <FaSync className={`sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              <button
                onClick={async () => { await supabase.auth.signOut(); window.location.href = '/'; }}
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
        {/* Navigation */}
        <AdminNavigation />

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FaExclamationTriangle className="h-5 w-5 text-red-600" />
                <p className="ml-3 text-sm text-red-800">{error}</p>
              </div>
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
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          {/* Header Controls & Status Tabs */}
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white flex flex-col md:flex-row md:justify-between md:items-center gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">Offers</h3>
              {/* Status Filter Tabs */}
              <div className="inline-flex items-center p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    filterStatus === 'all'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All ({products.length})
                </button>
                <button
                  onClick={() => setFilterStatus('active')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    filterStatus === 'active'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Active ({activeProductsCount})
                </button>
                <button
                  onClick={() => setFilterStatus('expired')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    filterStatus === 'expired'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Expired ({expiredProductsCount})
                </button>
              </div>
            </div>

            {/* Search and Filters Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
                <input
                  type="text"
                  placeholder="Search offers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center px-3 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all text-sm ${
                  hasActiveFilters ? 'bg-orange-50 border-orange-300 text-orange-700' : 'text-gray-700'
                }`}
                title="Filters"
              >
                <FaFilter className="text-xs sm:mr-1.5" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <span className="ml-1.5 w-2 h-2 bg-orange-500 rounded-full"></span>
                )}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center px-2.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all text-xs"
                  title="Clear filters"
                >
                  <FaTimes />
                </button>
              )}
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="px-2 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                {/* Date From */}
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 mb-1 sm:mb-2">Date from</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-gray-300 rounded-lg sm:rounded-xl text-gray-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 mb-1 sm:mb-2">Date to</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-gray-300 rounded-lg sm:rounded-xl text-gray-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* User Email Filter */}
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 mb-1 sm:mb-2">User email</label>
                  <input
                    type="text"
                    placeholder="Filter by email..."
                    value={userEmailFilter}
                    onChange={(e) => setUserEmailFilter(e.target.value)}
                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-gray-300 rounded-lg sm:rounded-xl text-gray-900 text-xs sm:text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Size Filter */}
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 mb-1 sm:mb-2">Size</label>
                  <input
                    type="text"
                    placeholder="Filter by size..."
                    value={sizeFilter}
                    onChange={(e) => setSizeFilter(e.target.value)}
                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-gray-300 rounded-lg sm:rounded-xl text-gray-900 text-xs sm:text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Bulk Actions Toolbar */}
          <div className="px-3 sm:px-4 lg:px-6 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs sm:text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedOfferIds.size === filtered.length}
                  onChange={() => toggleSelectAll(filtered)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                />
                <span>Select all visible ({filtered.length})</span>
              </label>

              {selectedOfferIds.size > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                  {selectedOfferIds.size} selected
                </span>
              )}
            </div>

            {selectedOfferIds.size > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRenewMultiple(Array.from(selectedOfferIds))}
                  disabled={bulkActionLoading}
                  className="inline-flex items-center px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-semibold rounded-lg transition-all shadow-sm disabled:opacity-50"
                >
                  <FaRedo className={`mr-1.5 text-xs ${bulkActionLoading ? 'animate-spin' : ''}`} />
                  Renew Selected (+{feeSettings?.offer_expiration_days || 60}d)
                </button>
                <button
                  onClick={() => handleDeleteMultiple(Array.from(selectedOfferIds))}
                  disabled={bulkActionLoading}
                  className="inline-flex items-center px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold rounded-lg transition-all shadow-sm disabled:opacity-50"
                >
                  <FaTrash className="mr-1.5 text-xs" />
                  Delete Selected ({selectedOfferIds.size})
                </button>
                <button
                  onClick={() => setSelectedOfferIds(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-800 underline px-1"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="p-3 sm:p-4 lg:p-6">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FaList className="text-gray-600 text-2xl" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No offers</h3>
                <p className="text-sm sm:text-base text-gray-600">
                  {searchTerm || hasActiveFilters ? 'No offers found for your filters' : 'No offers from users yet'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-6">
                {filtered.map((product) => {
                  const vatScheme = getVatScheme(product);
                  const currentPayout = getCurrentPayout(product);
                  const payoutDiffers = currentPayout !== null && Math.abs(currentPayout - product.payout) >= 1;
                  const expired = isProductExpired(product);
                  const isSelected = selectedOfferIds.has(product.id);

                  return (
                    <div
                      key={product.id}
                      className={`relative bg-white border rounded-xl p-2.5 sm:p-3 lg:p-5 hover:shadow-lg transition-all duration-200 ${
                        isSelected
                          ? 'border-orange-500 ring-2 ring-orange-400/20'
                          : expired
                          ? 'border-rose-200 bg-rose-50/10'
                          : 'border-gray-200'
                      }`}
                    >
                      {/* Top Bar: Checkbox + Status Badge */}
                      <div className="flex items-center justify-between mb-2 sm:mb-3 pb-2 border-b border-gray-100">
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOffer(product.id)}
                            className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                          />
                          <span className="text-[10px] sm:text-xs text-gray-500 font-mono">ID: {product.id.slice(0, 8)}...</span>
                        </label>

                        {expired ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            <FaClock className="mr-1 text-[9px]" /> Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        )}
                      </div>

                      {/* Product Image & Basic Info */}
                      <div className="flex items-start space-x-2 sm:space-x-3 lg:space-x-4 mb-2 sm:mb-3 lg:mb-4">
                        <div className="h-14 w-14 sm:h-16 sm:w-16 lg:h-20 lg:w-20 flex-shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-gray-200 bg-white">
                          <img
                            loading="lazy"
                            className="h-full w-full object-contain p-1 sm:p-1.5 lg:p-2"
                            src={product.image_url || '/default-image.png'}
                            alt={product.name}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = '/default-image.png';
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs sm:text-sm font-semibold text-gray-900 truncate mb-0.5 sm:mb-1">{product.name}</h4>
                          <div className="flex items-center space-x-1 sm:space-x-1.5 lg:space-x-2 mb-1 sm:mb-1.5 lg:mb-2">
                            <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-gray-100 text-gray-800">
                              {product.size}
                            </span>
                            <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold ${
                              vatScheme === 'VAT0'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}>
                              {vatScheme === 'VAT0' ? 'VAT0 sale' : 'Margin sale'}
                            </span>
                          </div>
                          <p className="text-[10px] sm:text-xs text-gray-600">SKU: {product.sku || 'N/A'}</p>
                        </div>
                      </div>

                      {/* Financial Info */}
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5 sm:gap-2 lg:gap-3 mb-2 sm:mb-3 lg:mb-4 pb-2 sm:pb-3 lg:pb-4 border-b border-gray-200">
                        <div>
                          <p className="text-[10px] sm:text-xs text-gray-600 mb-0.5">Price</p>
                          <p className="text-xs sm:text-sm font-semibold text-gray-900">{getOfferPriceLine(product)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] sm:text-xs text-gray-600 mb-0.5">Payout</p>
                          <p className="text-xs sm:text-sm font-semibold text-green-600">{getOfferPayoutLine(product)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] sm:text-xs text-gray-600 mb-0.5">Sale</p>
                          <p className={`text-xs sm:text-sm font-semibold ${vatScheme === 'VAT0' ? 'text-amber-700' : 'text-slate-700'}`}>
                            {vatScheme === 'VAT0' ? 'VAT0' : 'Margin'}
                          </p>
                        </div>
                        {payoutDiffers && currentPayout !== null && (
                          <p className="col-span-3 text-[10px] sm:text-xs text-amber-700">
                            Current formula gives {formatCurrency(currentPayout)}. This offer keeps its stored payout.
                          </p>
                        )}
                      </div>

                      {/* User & Date */}
                      <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                        <div className="text-[10px] sm:text-xs text-gray-600">
                          <p className="truncate">{product.user_email}</p>
                          <p className="mt-0.5 sm:mt-1">Created: {new Date(product.created_at).toLocaleDateString('sk-SK')}</p>
                          {product.expires_at && (
                            <p className="mt-1">
                              <span className="font-semibold">Expiration:</span>{' '}
                              <span className={expired ? 'text-rose-600 font-semibold' : 'text-gray-700'}>
                                {new Date(product.expires_at).toLocaleDateString('sk-SK')}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            setExternalId('');
                            setShowModal(true);
                          }}
                          className="flex-1 inline-flex items-center justify-center px-2.5 sm:px-3 lg:px-4 py-1.5 sm:py-2 lg:py-2.5 bg-green-600 hover:bg-green-700 text-white text-[10px] sm:text-xs lg:text-sm font-semibold rounded-lg sm:rounded-xl transition-all duration-200"
                        >
                          <FaCheck className="mr-1 sm:mr-1.5 text-[10px] sm:text-xs" />
                          Accept
                        </button>

                        {expired && (
                          <button
                            onClick={() => handleRenewOffer(product)}
                            className="inline-flex items-center justify-center px-2.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs lg:text-sm font-semibold rounded-lg sm:rounded-xl transition-all duration-200 bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                            title={`Renew offer for ${feeSettings?.offer_expiration_days || 60} days`}
                          >
                            <FaRedo className="mr-1 text-[10px]" />
                            Renew
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteOffer(product)}
                          disabled={deletingOfferId === product.id}
                          className="inline-flex items-center justify-center px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs lg:text-sm font-semibold rounded-lg sm:rounded-xl transition-all duration-200 border border-red-200 text-red-600 hover:bg-red-50"
                          title="Delete offer"
                        >
                          <FaTrash className="mr-1" />
                          {deletingOfferId === product.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && selectedProduct && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-sm w-full border-t sm:border border-gray-200 flex flex-col">
            <div className="flex items-center justify-between p-3 sm:p-4 lg:p-6 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-base sm:text-lg text-gray-900 font-semibold">Enter External ID</h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setExternalId('');
                  setSelectedProduct(null);
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <FaTimes className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
            <div className="p-3 sm:p-4 lg:p-6 flex-1 overflow-y-auto">
              <input
                type="text"
                placeholder="e.g. AIR-001"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-white text-gray-900 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-base mb-4"
              />
              <div className="flex justify-end space-x-2 sm:space-x-3">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setExternalId('');
                    setSelectedProduct(null);
                  }}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 bg-white text-gray-800 text-sm sm:text-base rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSale}
                  disabled={!externalId || refreshing}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 bg-green-600 text-white text-sm sm:text-base rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
