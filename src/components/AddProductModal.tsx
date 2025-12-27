import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getFees, calculatePayout } from '../lib/fees';
import { FaSearch, FaTimes, FaCheck, FaExclamationTriangle } from 'react-icons/fa';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductAdded: (newProduct: {
    id: string;
    user_id: string;
    product_id: string;
    name: string;
    size: string;
    price: number;
    image_url: string;
    original_price?: number;
    payout: number;
    sku: string;
  }) => void;
}

interface ProductPrice {
  product_id: string;
  size: string;
  final_price: number;
  final_status: string;
  product_name: string;
  image_url: string;
  sku?: string;
}

interface Fees {
  fee_percent: number;
  fee_fixed: number;
  offer_expiration_days?: number;
}

export default function AddProductModal({ isOpen, onClose, onProductAdded }: AddProductModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [existingProducts, setExistingProducts] = useState<ProductPrice[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductPrice | null>(null);
  const [sizes, setSizes] = useState<ProductPrice[]>([]);
  const [selectedSize, setSelectedSize] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fees, setFees] = useState<Fees>({ fee_percent: 0.2, fee_fixed: 5 });
  const [searchLoading, setSearchLoading] = useState(false);
  const [sku, setSku] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      getFees().then(adminFees => {
        setFees(adminFees);
      }).catch(err => {
        console.warn('Failed to load fees:', err);
      });
    } else {
      // Reset all state when modal closes
      setSearchTerm('');
      setSelectedProduct(null);
      setSelectedSize('');
      setNewPrice('');
      setSku('');
      setError(null);
      setExistingProducts([]);
      setSizes([]);
    }
  }, [isOpen]);

  const numericNewPrice = parseInt(newPrice);
  const computedPayout = !isNaN(numericNewPrice)
    ? calculatePayout(numericNewPrice, fees.fee_percent, fees.fee_fixed)
    : null;

  const selectedSizeData = sizes.find((s) => s.size === selectedSize);
  const recommendedPrice = selectedSizeData?.final_price || 0;

  let priceColor = 'text-slate-700';
  let priceMessage = '';
  let priceBadge = null;
  
  if (!isNaN(numericNewPrice) && numericNewPrice > 0) {
    if (numericNewPrice > recommendedPrice) {
      priceColor = 'text-red-600';
      priceMessage = 'Tvoja cena je vyššia ako najnižšia cena!';
      priceBadge = <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 ml-2">Vyššia</span>;
    } else if (numericNewPrice < recommendedPrice) {
      priceColor = 'text-green-600';
      priceMessage = `Najnižšia nová cena bude ${numericNewPrice} €`;
      priceBadge = <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">Najnižšia</span>;
    }
  }

  useEffect(() => {
    const debounceTimeout = setTimeout(async () => {
      if (!searchTerm || searchTerm.length < 2) {
        setExistingProducts([]);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      setSearchLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, image_url, sku')
          .ilike('name', `%${searchTerm}%`)
          .limit(10)
          .abortSignal(controller.signal);

        clearTimeout(timeoutId);

        if (error) throw error;
        
        const uniqueProducts = data || [];
        setExistingProducts(uniqueProducts.map(product => ({
          product_id: product.id,
          size: '',
          final_price: 0,
          final_status: 'Skladom',
          product_name: product.name,
          image_url: product.image_url,
          sku: product.sku,
        })));
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('Error in fetchExistingProducts:', err);
        
        if (err.name === 'AbortError') {
          setError('Vyhľadávanie trvá príliš dlho. Skúste znova.');
        } else {
          setError(err.message);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimeout);
  }, [searchTerm]);

  const handleProductSelect = async (product: ProductPrice) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    setSelectedProduct(product);
    setNewPrice('');
    setError(null);

    try {
      const { data: sizeData, error: sizeError } = await supabase
        .from('product_price_view')
        .select('size, final_price, final_status')
        .eq('product_id', product.product_id)
        .order('final_price', { ascending: true })
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (sizeError) throw sizeError;
      
      const sortedSizes = sizeData ? [...sizeData].sort((a, b) => {
        const sizeA = parseFloat(a.size);
        const sizeB = parseFloat(b.size);
        
        if (!isNaN(sizeA) && !isNaN(sizeB)) {
          return sizeA - sizeB;
        }
        return a.size.localeCompare(b.size);
      }).map(sizeItem => ({
        product_id: product.product_id,
        size: sizeItem.size,
        final_price: sizeItem.final_price,
        final_status: sizeItem.final_status,
        product_name: product.product_name,
        image_url: product.image_url,
        sku: product.sku
      })) : [];
      
      setSizes(sortedSizes);
      setSku(product.sku || 'Neznámé SKU');
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Error fetching sizes:', err);
      
      if (err.name === 'AbortError') {
        setError('Načítavanie veľkostí trvá príliš dlho. Skúste znova.');
      } else {
        setError(err.message);
      }
    }
  };

  const handleChangeProduct = () => {
    setSelectedProduct(null);
    setSelectedSize('');
    setNewPrice('');
    setSku('');
    setError(null);
    setSearchTerm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProduct || !selectedSize || isNaN(numericNewPrice) || numericNewPrice <= 0) {
      setError('Prosím, vyberte produkt, veľkosť a zadajte platnú cenu.');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const newProductId = crypto.randomUUID();

      // Get expiration days from settings
      const expirationDays = fees.offer_expiration_days || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      const { error: insertError } = await supabase
        .from('user_products')
        .insert([
          {
            id: newProductId,
            user_id: user.id,
            product_id: selectedProduct.product_id,
            name: selectedProduct.product_name,
            size: selectedSize,
            price: numericNewPrice,
            image_url: selectedProduct.image_url,
            original_price: recommendedPrice,
            payout: computedPayout ?? 0,
            sku: sku,
            expires_at: expiresAt.toISOString(),
          },
        ])
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (insertError) throw insertError;

      const newProduct = {
        id: newProductId,
        user_id: user.id,
        product_id: selectedProduct.product_id,
        name: selectedProduct.product_name,
        size: selectedSize,
        price: numericNewPrice,
        image_url: selectedProduct.image_url,
        original_price: recommendedPrice,
        payout: computedPayout ?? 0,
        sku: sku,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      onProductAdded(newProduct);
      setSelectedProduct(null);
      setSelectedSize('');
      setNewPrice('');
      setSku('');
      onClose();
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Error in handleSubmit:', err);
      
      if (err.name === 'AbortError') {
        setError('Pridávanie produktu trvá príliš dlho. Skúste znova.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    if (selectedProduct) {
      handleProductSelect(selectedProduct);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <h2 className="text-lg sm:text-2xl font-bold text-slate-900">Pridať produkt</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <FaTimes className="text-slate-500" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-120px)] sm:max-h-[calc(90vh-140px)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {!selectedProduct ? (
              <>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-3">
                    Vyhľadajte produkt
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaSearch className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="block w-full pl-8 sm:pl-10 pr-3 py-2 sm:py-3 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm sm:text-base"
                      placeholder="Začnite písať názov produktu..."
                    />
                  </div>
                </div>

                {searchLoading && (
                  <div className="text-center py-4">
                    <div className="inline-flex items-center text-sm text-slate-500">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Vyhľadávam produkty...
                    </div>
                  </div>
                )}

                {existingProducts.length > 0 && (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-64 overflow-y-auto">
                    {existingProducts.map((product) => (
                      <div
                        key={product.product_id}
                        className="p-3 sm:p-4 cursor-pointer hover:bg-slate-50 flex items-center space-x-3 sm:space-x-4 transition-colors active:bg-slate-100"
                        onClick={() => handleProductSelect(product)}
                      >
                        <div className="h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <img
                            src={product.image_url || '/default-image.png'}
                            alt={product.product_name}
                            className="h-full w-full object-contain p-2"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{product.product_name}</p>
                          <p className="text-xs text-slate-500">SKU: {product.sku || 'N/A'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <div className="h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <img
                          src={selectedProduct.image_url || '/default-image.png'}
                          alt={selectedProduct.product_name}
                          className="h-full w-full object-contain p-2"
                        />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-semibold text-slate-900">{selectedProduct.product_name}</h3>
                        <p className="text-xs sm:text-sm text-slate-600">Vybraný produkt</p>
                        <p className="text-xs sm:text-sm text-slate-600">SKU: {sku}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleChangeProduct}
                      className="text-xs sm:text-sm text-slate-600 hover:text-slate-900 font-medium px-2 sm:px-3 py-1 hover:bg-white rounded-lg transition-colors"
                    >
                      Zmeniť
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-3">
                    Veľkosť
                  </label>
                  <select
                    value={selectedSize}
                    onChange={(e) => {
                      setSelectedSize(e.target.value);
                      setNewPrice('');
                    }}
                    className="block w-full px-3 sm:px-4 py-2 sm:py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm sm:text-base appearance-none"
                    required
                  >
                    <option value="">Vyberte veľkosť</option>
                    {sizes.map((size, index) => (
                      <option key={index} value={size.size}>
                        {size.size}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSize && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 rounded-xl p-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-xs sm:text-sm font-medium text-blue-800">
                            Najnižšia trhová cena: <span className="font-bold">{recommendedPrice} €</span>
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-3">
                        Vaša predajná cena
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={newPrice}
                          onChange={(e) => setNewPrice(e.target.value.replace(/[^0-9]/g, ''))}
                          className={`block w-full px-3 sm:px-4 py-2 sm:py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm sm:text-base ${priceColor === 'text-red-600' ? 'border-red-300' : priceColor === 'text-green-600' ? 'border-green-300' : 'border-slate-300'} appearance-none`}
                          placeholder="Zadajte cenu v eurách"
                          min="1"
                          inputMode="numeric"
                          required
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          <span className="text-slate-500 text-sm">€</span>
                        </div>
                      </div>
                      
                      {priceMessage && (
                        <div className={`mt-2 flex items-center text-sm ${priceColor}`}>
                          {priceBadge}
                          <span className="ml-2">{priceMessage}</span>
                        </div>
                      )}
                      
                      {computedPayout !== null && (
                        <div className="mt-3 bg-green-50 rounded-xl p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs sm:text-sm font-medium text-green-800">Váš payout</p>
                              <p className="text-xs text-green-600">Po odpočítaní poplatkov ({fees.fee_percent * 100}% + {fees.fee_fixed}€)</p>
                            </div>
                            <p className="text-base sm:text-lg font-bold text-green-900">{computedPayout.toFixed(2)} €</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FaExclamationTriangle className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleRetry}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Skúsiť znova
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 sm:px-6 py-2 sm:py-3 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors"
              >
                Zrušiť
              </button>
              <button
                type="submit"
                disabled={loading || !selectedProduct || !selectedSize || !newPrice}
                className="px-4 sm:px-6 py-2 sm:py-3 text-sm font-semibold text-white bg-gradient-to-r from-slate-900 to-slate-700 hover:from-slate-800 hover:to-slate-600 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Pridáva sa...
                  </>
                ) : (
                  <>
                    <FaCheck className="mr-2" />
                    <span className="hidden sm:inline">Pridať produkt</span>
                    <span className="sm:hidden">Pridať</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}