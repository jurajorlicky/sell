import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getFees, calculatePayout, getPayoutBasePrice, SK_VAT_RATE } from '../lib/fees';
import { czkToEur, eurToCzk, formatCurrency, formatCzk } from '../lib/utils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FaSearch, FaTimes, FaCheck, FaCheckCircle, FaExclamationTriangle, FaPlus, FaTrash } from 'react-icons/fa';

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
    input_currency?: 'EUR' | 'CZK';
    input_price?: number;
    exchange_rate?: number;
    is_vat0?: boolean;
    vat_scheme?: 'VAT0' | 'MARGIN' | null;
    created_at?: string;
    expires_at?: string;
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
  consignor_blocked?: boolean;
}

interface Fees {
  fee_percent: number;
  fee_fixed: number;
  offer_expiration_days?: number;
  eur_to_czk_rate?: number | null;
}

interface QueuedProduct {
  product: ProductPrice;
  size: string;
  quantity: number;
  price: number;
  inputPrice: number;
  currency: 'EUR' | 'CZK';
  originalPrice: number;
  payout: number;
  sku: string;
  exchangeRate: number | null;
  vatScheme: 'VAT0' | 'MARGIN' | null;
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
  const [hasOtherConsignors, setHasOtherConsignors] = useState(false);
  const [currency, setCurrency] = useState<'EUR' | 'CZK'>('EUR');
  const [quantity, setQuantity] = useState(1);
  const [queuedProducts, setQueuedProducts] = useState<QueuedProduct[]>([]);
  const [isBusinessProfile, setIsBusinessProfile] = useState(false);
  const [isVatPayerProfile, setIsVatPayerProfile] = useState(false);
  const [vatScheme, setVatScheme] = useState<'VAT0' | 'MARGIN'>('MARGIN');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const parsePriceInput = (value: string): number => {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const handleCurrencyChange = (nextCurrency: 'EUR' | 'CZK') => {
    if (nextCurrency === currency) return;
    if (nextCurrency === 'CZK' && !hasExchangeRate) return;

    const currentValue = parsePriceInput(newPrice);
    if (!Number.isFinite(currentValue) || currentValue <= 0) {
      setCurrency(nextCurrency);
      setNewPrice('');
      return;
    }

    const currentEurPrice = currency === 'CZK' && hasExchangeRate ? czkToEur(currentValue, exchangeRate) : currentValue;
    const nextValue = nextCurrency === 'CZK' && hasExchangeRate ? eurToCzk(currentEurPrice, exchangeRate) : currentEurPrice;

    setCurrency(nextCurrency);
    setNewPrice(String(nextValue));
  };

  useEffect(() => {
    if (isOpen) {
      getFees().then(adminFees => {
        setFees(adminFees);
      }).catch(err => {
        console.warn('Failed to load fees:', err);
      });
      supabase.auth.getUser()
        .then(async ({ data: { user } }) => {
          if (!user) return;
          const { data } = await supabase
            .from('profiles')
            .select('profile_type, vat_type')
            .eq('id', user.id)
            .maybeSingle();
          const isBusiness = data?.profile_type === 'Business';
          const isVatPayer = ['VAT_PAYER', 'VAT 0%'].includes(String(data?.vat_type || ''));
          setIsBusinessProfile(isBusiness);
          setIsVatPayerProfile(isBusiness && isVatPayer);
          setVatScheme('MARGIN');
        })
        .catch((err) => console.warn('Failed to load profile VAT settings:', err));
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
      setHasOtherConsignors(false);
      setCurrency('EUR');
      setQuantity(1);
      setQueuedProducts([]);
      setIsBusinessProfile(false);
      setIsVatPayerProfile(false);
      setVatScheme('MARGIN');
    }
  }, [isOpen]);

  // Check market offers for this product+size. Repeated listings are allowed;
  // this only powers the pricing warning.
  useEffect(() => {
    if (!selectedProduct || !selectedSize) {
      setHasOtherConsignors(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { count } = await supabase
          .from('user_products')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', selectedProduct.product_id)
          .eq('size', selectedSize);
        if (!cancelled) {
          setHasOtherConsignors((count ?? 0) > 0);
        }
      } catch {
        if (!cancelled) setHasOtherConsignors(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedProduct, selectedSize]);

  const exchangeRate = fees.eur_to_czk_rate ?? null;
  const hasExchangeRate = typeof exchangeRate === 'number' && Number.isFinite(exchangeRate) && exchangeRate > 0;
  const numericInputPrice = parsePriceInput(newPrice);
  const numericNewPrice = !isNaN(numericInputPrice)
    ? currency === 'CZK'
      ? hasExchangeRate
        ? czkToEur(numericInputPrice, exchangeRate)
        : NaN
      : numericInputPrice
    : NaN;
  const effectiveVatScheme = isBusinessProfile ? (isVatPayerProfile ? vatScheme : 'MARGIN') : null;
  const computedPayout = !isNaN(numericNewPrice)
    ? calculatePayout(numericNewPrice, fees.fee_percent, fees.fee_fixed, effectiveVatScheme)
    : null;
  const payoutBasePrice = !isNaN(numericNewPrice) ? getPayoutBasePrice(numericNewPrice, effectiveVatScheme) : null;

  const selectedSizeData = sizes.find((s) => s.size === selectedSize);
  const recommendedPrice = selectedSizeData?.final_price || 0;

  let priceColor = 'text-slate-700';
  let priceMessage = '';
  let priceBadge = null;
  
  if (hasOtherConsignors && !isNaN(numericNewPrice) && numericNewPrice > 0) {
    if (numericNewPrice > recommendedPrice) {
      priceColor = 'text-red-600';
      priceMessage = 'Your price is higher than the lowest price!';
      priceBadge = <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 ml-2">Higher</span>;
    } else if (numericNewPrice < recommendedPrice) {
      priceColor = 'text-green-600';
      priceMessage = `Lowest new price will be ${formatCurrency(numericNewPrice)}`;
      priceBadge = <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">Lowest</span>;
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
          .select('id, name, image_url, sku, consignor_blocked')
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
          consignor_blocked: product.consignor_blocked ?? false,
        })));
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('Error in fetchExistingProducts:', err);
        
        if (err.name === 'AbortError') {
          setError('Search is taking too long. Please try again.');
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
      setSku(product.sku || 'Unknown SKU');
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Error fetching sizes:', err);
      
      if (err.name === 'AbortError') {
        setError('Loading sizes is taking too long. Please try again.');
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
    setHasOtherConsignors(false);
    setQuantity(1);
    setSuccessMessage(null);
  };

  const currentItemIsValid = Boolean(
    selectedProduct &&
    selectedSize &&
    Number.isFinite(numericNewPrice) &&
    numericNewPrice > 0 &&
    Number.isFinite(numericInputPrice) &&
    numericInputPrice > 0 &&
    quantity >= 1
  );

  const getCurrentQueuedProduct = (): QueuedProduct | null => {
    if (!selectedProduct || !currentItemIsValid) return null;

    return {
      product: selectedProduct,
      size: selectedSize,
      quantity,
      price: numericNewPrice,
      inputPrice: numericInputPrice,
      currency,
      originalPrice: recommendedPrice,
      payout: computedPayout ?? 0,
      sku,
      exchangeRate: currency === 'CZK' ? exchangeRate : null,
      vatScheme: effectiveVatScheme,
    };
  };

  const handleQueueCurrentProduct = (target: 'same' | 'different' = 'same') => {
    if (currency === 'CZK' && !hasExchangeRate) {
      setError('CZK rate is not set. Please use EUR or ask admin to set the CZK rate.');
      return;
    }

    const queuedProduct = getCurrentQueuedProduct();
    if (!queuedProduct) {
      setError('Please select a product, size and enter a valid price.');
      return;
    }

    setQueuedProducts((current) => {
      const existingIndex = current.findIndex(
        (item) =>
          item.product.product_id === queuedProduct.product.product_id &&
          item.size === queuedProduct.size &&
          item.price === queuedProduct.price &&
          item.vatScheme === queuedProduct.vatScheme &&
          item.currency === queuedProduct.currency
      );
      if (existingIndex >= 0) {
        return current.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: Math.min(100, item.quantity + queuedProduct.quantity) }
            : item
        );
      }
      return [...current, queuedProduct];
    });

    if (target === 'different') {
      setSelectedProduct(null);
      setSearchTerm('');
      setExistingProducts([]);
      setSku('');
      setHasOtherConsignors(false);
    }
    setSelectedSize('');
    setNewPrice('');
    setQuantity(1);
    setError(null);
    setSuccessMessage(null);
  };

  const updateQueuedQuantity = (index: number, delta: number) => {
    setQueuedProducts((current) =>
      current.map((item, idx) => {
        if (idx !== index) return item;
        const nextQty = Math.max(1, Math.min(100, item.quantity + delta));
        return { ...item, quantity: nextQty };
      })
    );
  };

  const removeQueuedProduct = (index: number) => {
    setQueuedProducts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const totalProductsCount =
    queuedProducts.reduce((sum, item) => sum + item.quantity, 0) +
    (currentItemIsValid ? quantity : 0);

  const saveProducts = async (closeAfterSave: boolean) => {
    if (currency === 'CZK' && !hasExchangeRate) {
      setError('CZK rate is not set. Please use EUR or ask admin to set the CZK rate.');
      return;
    }

    const currentProduct = getCurrentQueuedProduct();
    const productsToAdd = currentProduct ? [...queuedProducts, currentProduct] : queuedProducts;

    if (productsToAdd.length === 0) {
      setError('Please select a product, size and enter a valid price.');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const expirationDays = fees.offer_expiration_days || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      const rowsToInsert = productsToAdd.flatMap((item) =>
        Array.from({ length: item.quantity }, () => ({
          id: crypto.randomUUID(),
          user_id: user.id,
          product_id: item.product.product_id,
          name: item.product.product_name,
          size: item.size,
          price: item.price,
          image_url: item.product.image_url,
          original_price: item.originalPrice,
          payout: item.payout,
          sku: item.sku,
          input_currency: item.currency,
          input_price: item.inputPrice,
          exchange_rate: item.exchangeRate,
          is_vat0: item.vatScheme === 'VAT0',
          vat_scheme: item.vatScheme,
          expires_at: expiresAt.toISOString(),
        }))
      );

      const { error: insertError } = await supabase
        .from('user_products')
        .insert(rowsToInsert)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (insertError) throw insertError;

      rowsToInsert.forEach((row) => {
        onProductAdded({
          ...row,
          exchange_rate: row.exchange_rate ?? undefined,
          created_at: new Date().toISOString(),
        });
      });

      setSelectedProduct(null);
      setSelectedSize('');
      setNewPrice('');
      setSku('');
      setSearchTerm('');
      setExistingProducts([]);
      setCurrency('EUR');
      setQuantity(1);
      setQueuedProducts([]);
      setVatScheme('MARGIN');

      if (closeAfterSave) {
        onClose();
      } else {
        setSuccessMessage(`Successfully added ${rowsToInsert.length} product(s)! You can search and add more.`);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Error in saveProducts:', err);

      if (err.name === 'AbortError') {
        setError('Adding product is taking too long. Please try again.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProducts(true);
  };

  const handleRetry = () => {
    setError(null);
    if (selectedProduct) {
      handleProductSelect(selectedProduct);
    }
  };

  const handleClose = useCallback(() => onClose(), [onClose]);
  useEscapeKey(handleClose, isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <h2 className="text-lg sm:text-2xl font-bold text-slate-900">Add Product</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <FaTimes className="text-slate-500" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-120px)] sm:max-h-[calc(90vh-140px)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center">
                  <FaCheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  <p className="ml-3 text-sm font-medium text-emerald-900">{successMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMessage(null)}
                  className="text-emerald-700 hover:text-emerald-900 p-1 rounded-lg"
                  aria-label="Dismiss message"
                >
                  <FaTimes className="h-4 w-4" />
                </button>
              </div>
            )}

            {queuedProducts.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                      {queuedProducts.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">Products ready to add</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQueuedProducts([])}
                    className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
                  >
                    Clear all
                  </button>
                </div>
                <div className="divide-y divide-slate-200 max-h-60 overflow-y-auto">
                  {queuedProducts.map((item, index) => (
                    <div key={`${item.product.product_id}-${item.size}-${index}`} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50/50 transition-colors">
                      <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <img
                          src={item.product.image_url || '/default-image.png'}
                          alt=""
                          className="h-full w-full object-contain p-1"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.product.product_name}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">Size {item.size}</span>
                          <span>·</span>
                          <span>{formatCurrency(item.price)}/pc</span>
                          <span>·</span>
                          <span className="text-emerald-600 font-medium">Payout: {formatCurrency(item.payout * item.quantity)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQueuedQuantity(index, -1)}
                          disabled={item.quantity <= 1}
                          className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm font-bold"
                          title="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-xs font-bold text-slate-900">
                          {item.quantity}×
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQueuedQuantity(index, 1)}
                          disabled={item.quantity >= 100}
                          className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm font-bold"
                          title="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeQueuedProduct(index)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-1"
                        title="Remove item"
                        aria-label="Remove item"
                      >
                        <FaTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!selectedProduct ? (
              <>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-3">
                    Search for product
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
                      placeholder="Start typing product name..."
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
                      Searching products...
                    </div>
                  </div>
                )}

                {existingProducts.length > 0 && (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-64 overflow-y-auto">
                    {existingProducts.map((product) => (
                      <div
                        key={product.product_id}
                        className={`p-3 sm:p-4 flex items-center space-x-3 sm:space-x-4 transition-colors ${
                          product.consignor_blocked
                            ? 'opacity-50 cursor-not-allowed bg-slate-50'
                            : 'cursor-pointer hover:bg-slate-50 active:bg-slate-100'
                        }`}
                        onClick={() => !product.consignor_blocked && handleProductSelect(product)}
                      >
                        <div className="h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <img
                            loading="lazy"
                            src={product.image_url || '/default-image.png'}
                            alt={product.product_name}
                            className="h-full w-full object-contain p-2"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{product.product_name}</p>
                          <p className="text-xs text-slate-500">SKU: {product.sku || 'N/A'}</p>
                        </div>
                        {product.consignor_blocked && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 flex-shrink-0">
                            Blocked
                          </span>
                        )}
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
                          loading="lazy"
                          src={selectedProduct.image_url || '/default-image.png'}
                          alt={selectedProduct.product_name}
                          className="h-full w-full object-contain p-2"
                        />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-semibold text-slate-900">{selectedProduct.product_name}</h3>
                        <p className="text-xs sm:text-sm text-slate-600">Selected product</p>
                        <p className="text-xs sm:text-sm text-slate-600">SKU: {sku}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleChangeProduct}
                      className="text-xs sm:text-sm text-slate-600 hover:text-slate-900 font-medium px-2 sm:px-3 py-1 hover:bg-white rounded-lg transition-colors"
                    >
                      Change
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-3">
                    Size
                  </label>
                  <select
                    value={selectedSize}
                    onChange={(e) => {
                      setSelectedSize(e.target.value);
                      setNewPrice('');
                    }}
                    className="block w-full px-3 sm:px-4 py-2 sm:py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm sm:text-base appearance-none"
                  >
                    <option value="">Select size</option>
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
                            {hasOtherConsignors ? 'Lowest market price' : 'Market price'}:{' '}
                            <span className="font-bold">{formatCurrency(recommendedPrice)}</span>
                            {currency === 'CZK' && hasExchangeRate && (
                              <span className="ml-2 text-blue-700">({formatCzk(eurToCzk(recommendedPrice, exchangeRate))})</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                          Your sale price
                        </label>
                        <div className="inline-flex rounded-xl border border-slate-300 bg-slate-100 p-1">
                          {(['EUR', 'CZK'] as const).map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => handleCurrencyChange(option)}
                              disabled={option === 'CZK' && !hasExchangeRate}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                currency === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                              } ${option === 'CZK' && !hasExchangeRate ? 'cursor-not-allowed opacity-40 hover:text-slate-500' : ''}`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={newPrice}
                          onChange={(e) => setNewPrice(e.target.value.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                          className={`block w-full px-3 sm:px-4 py-2 sm:py-3 pr-12 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm sm:text-base ${priceColor === 'text-red-600' ? 'border-red-300' : priceColor === 'text-green-600' ? 'border-green-300' : 'border-slate-300'} appearance-none`}
                          placeholder={currency === 'CZK' ? 'Enter price in CZK' : 'Enter price in EUR'}
                          pattern="[0-9]*[.]?[0-9]*"
                          inputMode="numeric"
                        />
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                          <span className="rounded-lg bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-500">{currency === 'CZK' ? 'Kč' : '€'}</span>
                        </div>
                      </div>
                      {!isNaN(numericInputPrice) && numericInputPrice > 0 && (
                        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          Stored as <span className="font-semibold text-slate-900">{formatCurrency(numericNewPrice)}</span>
                          {currency === 'CZK' && hasExchangeRate && (
                            <span> from {formatCzk(numericInputPrice)} at {exchangeRate} CZK/EUR</span>
                          )}
                          {currency === 'CZK' && hasExchangeRate && (
                            <span className="ml-2">Display: {formatCurrency(numericNewPrice)} / {formatCzk(eurToCzk(numericNewPrice, exchangeRate))}</span>
                          )}
                        </div>
                      )}
                      
                      {priceMessage && (
                        <div className={`mt-2 flex items-center text-sm ${priceColor}`}>
                          {priceBadge}
                          <span className="ml-2">{priceMessage}</span>
                        </div>
                      )}

                      {isVatPayerProfile && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="mb-3">
                            <p className="text-sm font-semibold text-slate-800">Business VAT mode</p>
                            <p className="text-xs text-slate-500">VAT payer listing. Choose margin sale or VAT0. VAT0 uses Slovak VAT {Math.round(SK_VAT_RATE * 100)}% base in payout calculation.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { value: 'MARGIN' as const, label: 'Margin', desc: 'No VAT base deduction' },
                              { value: 'VAT0' as const, label: 'VAT0', desc: `Base ${formatCurrency(payoutBasePrice ?? 0)}` },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setVatScheme(option.value)}
                                className={`rounded-xl border px-3 py-2 text-left transition ${
                                  vatScheme === option.value
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                                }`}
                              >
                                <span className="block text-sm font-semibold">{option.label}</span>
                                <span className={`block text-xs ${vatScheme === option.value ? 'text-slate-200' : 'text-slate-500'}`}>{option.desc}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {computedPayout !== null && (
                        <div className="mt-3 bg-green-50 rounded-xl p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs sm:text-sm font-medium text-green-800">Your payout</p>
                              <p className="text-xs text-green-600">After fees ({fees.fee_percent * 100}% + {fees.fee_fixed}€)</p>
                            </div>
                            <p className="text-base sm:text-lg font-bold text-green-900">
                              {formatCurrency(computedPayout)}
                              {currency === 'CZK' && hasExchangeRate && (
                                <span className="ml-2 text-sm font-semibold text-green-700">
                                  {formatCzk(eurToCzk(computedPayout, exchangeRate))}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label htmlFor="product-quantity" className="block text-xs sm:text-sm font-semibold text-slate-700 mb-3">
                        Quantity
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                          disabled={quantity <= 1}
                          className="h-11 w-11 border border-slate-300 rounded-lg text-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <input
                          id="product-quantity"
                          type="number"
                          min="1"
                          max="100"
                          value={quantity}
                          onChange={(e) => setQuantity(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                          className="h-11 w-20 border border-slate-300 rounded-lg text-center text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setQuantity((current) => Math.min(100, current + 1))}
                          disabled={quantity >= 100}
                          className="h-11 w-11 border border-slate-300 rounded-lg text-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={() => handleQueueCurrentProduct('same')}
                        disabled={!currentItemIsValid}
                        className="w-full inline-flex items-center justify-center px-4 py-3 border border-slate-300 text-sm font-semibold text-slate-800 bg-white rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                        <FaPlus className="mr-2 text-slate-500" />
                        + Add another size
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQueueCurrentProduct('different')}
                        disabled={!currentItemIsValid}
                        className="w-full inline-flex items-center justify-center px-4 py-3 border border-slate-900 text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                        <FaSearch className="mr-2" />
                        + Add another product
                      </button>
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
                    Try again
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => saveProducts(false)}
                  disabled={loading || totalProductsCount === 0}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {loading ? 'Saving...' : 'Save & add more'}
                </button>
                <button
                  type="submit"
                  disabled={loading || totalProductsCount === 0}
                  className="px-4 sm:px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-slate-900 to-slate-700 hover:from-slate-800 hover:to-slate-600 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center shadow-sm"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      <FaCheck className="mr-2" />
                      <span>
                        Save & close ({totalProductsCount} {totalProductsCount === 1 ? 'pc' : 'pcs'})
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
