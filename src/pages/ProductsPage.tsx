import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import AdminNavigation from '../components/AdminNavigation';
import { 
  FaSearch, 
  FaSignOutAlt, 
  FaSync,
  FaShoppingBag,
  FaExclamationTriangle
} from 'react-icons/fa';

interface Product {
  id: string;
  name: string;
  image_url?: string;
  sku: string;
  consignor_blocked: boolean;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      const { data, error } = await supabase
        .from('products')
        .select('id, name, image_url, sku, consignor_blocked')
        .order('name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      console.error('Error loading products:', err.message);
      setError('Error loading products: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
  };

  const handleRetry = () => {
    setError(null);
    loadProducts();
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading products</h3>
          <p className="text-sm text-gray-600">Please wait...</p>
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
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-600 via-violet-600 to-purple-800 rounded-2xl shadow-lg">
                  <FaShoppingBag className="text-gray-900 text-xl" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                  Product Management
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Catalog and product management</p>
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

        {/* Navigation */}
        <AdminNavigation />

        {/* Products Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Products ({filteredProducts.length})</h3>
                <p className="text-gray-600 text-xs sm:text-sm mt-1">Manage and overview of products</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-4 lg:p-6">
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
                        className="bg-white border border-gray-200 rounded-xl p-2.5 sm:p-3 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start space-x-2 sm:space-x-3">
                          <div className="h-14 w-14 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-gray-200 bg-white p-1 sm:p-1.5 shadow-sm">
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
                            <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-0.5 sm:mb-1 break-words">{product.name}</h4>
                            <p className="text-[10px] sm:text-xs text-gray-600 font-mono mb-0.5">SKU: {product.sku}</p>
                            <p className="text-[10px] sm:text-xs text-gray-500 font-mono">ID: {productId.slice(0, 8)}...</p>
                          </div>
                          <div className="flex-shrink-0 flex flex-col items-center gap-1">
                            <button
                              onClick={() => toggleConsignorBlocked(product.id, product.consignor_blocked)}
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
                          <tr key={productId} className="hover:bg-gray-50 transition-colors">
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
                              <div className="text-sm font-semibold text-gray-900">{product.name}</div>
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-sm text-gray-700 font-mono">{product.sku}</td>
                            <td className="px-3 sm:px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  onClick={() => toggleConsignorBlocked(product.id, product.consignor_blocked)}
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
    </div>
  );
}