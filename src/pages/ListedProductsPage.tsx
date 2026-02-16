import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { sendNewSaleEmail } from '../lib/email';
import { formatCurrency } from '../lib/utils';
import AdminNavigation from '../components/AdminNavigation';
import {
  FaSearch, FaSignOutAlt, FaSync, FaCheck,
  FaFilter, FaTimes, FaList, FaExclamationTriangle
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
}

export default function ListedProductsPage() {
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [userEmailFilter, setUserEmailFilter] = useState<string>('');
  const [sizeFilter, setSizeFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [externalId, setExternalId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<UserProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hlavný JOIN na profiles(email)
  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_products')
      .select(`
        id, user_id, product_id, name, size, price, payout, created_at, image_url, sku, expires_at,
        profiles(email)
      `)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
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

  const handleConfirmSale = async () => {
    if (!selectedProduct || !externalId) return;
    setRefreshing(true);
    setShowModal(false);
    setError(null);

    try {
      // Create single sale with invoice_date set to product creation date
      const saleData = {
        user_id: selectedProduct.user_id,
        product_id: selectedProduct.product_id,
        name: selectedProduct.name,
        sku: selectedProduct.sku,
        size: selectedProduct.size,
        price: selectedProduct.price,
        payout: selectedProduct.payout,
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
            payout: selectedProduct.payout,
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

  const filtered = products.filter(p => {
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

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setUserEmailFilter('');
    setSizeFilter('');
    setSearchTerm('');
  };

  const hasActiveFilters = dateFrom || dateTo || userEmailFilter || sizeFilter || searchTerm;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="relative">
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-600 via-amber-600 to-orange-800 rounded-2xl shadow-lg">
                  <FaList className="text-gray-900 text-xl" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                  User Offers
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Manage and overview of offers</p>
              </div>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-3">
              <button
                onClick={() => { setRefreshing(true); loadProducts().finally(() => setRefreshing(false)); }}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50"
              >
                <FaSync className={`text-sm sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              <button
                onClick={async () => { await supabase.auth.signOut(); window.location.href = '/'; }}
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
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0 gap-2 sm:gap-0">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">Offers ({filtered.length})</h3>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm sm:text-base"
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
                  <span className="ml-1 w-2 h-2 bg-orange-500 rounded-full"></span>
                )}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 text-sm text-gray-600"
                  title="Clear filters"
                >
                  <FaTimes className="text-sm" />
                </button>
              )}
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="px-2 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                {/* Date From */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 mb-1 sm:mb-2">Date from</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-gray-300 rounded-lg sm:rounded-xl text-gray-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Date To */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 mb-1 sm:mb-2">Date to</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-gray-300 rounded-lg sm:rounded-xl text-gray-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* User Email Filter */}
                <div className="col-span-2 sm:col-span-1">
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
                <div className="col-span-2 sm:col-span-1">
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
                {filtered.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white border border-gray-200 rounded-xl p-2.5 sm:p-3 lg:p-5 hover:shadow-lg transition-all duration-200"
                  >
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
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-600">SKU: {product.sku || 'N/A'}</p>
                        <p className="text-[10px] sm:text-xs text-gray-500 font-mono mt-0.5">ID: {product.id.slice(0, 8)}...</p>
                      </div>
                    </div>

                    {/* Financial Info */}
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:gap-3 mb-2 sm:mb-3 lg:mb-4 pb-2 sm:pb-3 lg:pb-4 border-b border-gray-200">
                      <div>
                        <p className="text-[10px] sm:text-xs text-gray-600 mb-0.5">Price</p>
                        <p className="text-xs sm:text-sm font-semibold text-gray-900">{formatCurrency(product.price)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-gray-600 mb-0.5">Payout</p>
                        <p className="text-xs sm:text-sm font-semibold text-green-600">{formatCurrency(product.payout)}</p>
                      </div>
                    </div>

                    {/* User & Date */}
                    <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                      <div className="text-[10px] sm:text-xs text-gray-600">
                        <p className="truncate">{product.user_email}</p>
                        <p className="mt-0.5 sm:mt-1">Created: {new Date(product.created_at).toLocaleDateString('sk-SK')}</p>
                        {product.expires_at && (
                          <p className="mt-1">
                            <span className="font-semibold">Expiration:</span>{' '}
                            <span className={new Date(product.expires_at) < new Date() ? 'text-red-600' : 'text-orange-600'}>
                              {new Date(product.expires_at).toLocaleDateString('sk-SK')}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => {
                        setSelectedProduct(product);
                        setExternalId('');
                        setShowModal(true);
                      }}
                      className="w-full inline-flex items-center justify-center px-2.5 sm:px-3 lg:px-4 py-1.5 sm:py-2 lg:py-2.5 bg-green-600 hover:bg-green-700 text-white text-[10px] sm:text-xs lg:text-sm font-semibold rounded-lg sm:rounded-xl transition-all duration-200"
                    >
                      <FaCheck className="mr-1 sm:mr-1.5 lg:mr-2 text-[10px] sm:text-xs lg:text-sm" />
                      Accept
                    </button>
                  </div>
                ))}
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