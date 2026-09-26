import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getFees, calculatePayout, getPayoutBasePrice, SK_VAT_RATE } from '../lib/fees';
import { czkToEur, eurToCzk, formatCurrency, formatCzk } from '../lib/utils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FaTimes, FaCheck } from 'react-icons/fa';
import { Product } from '../lib/types';

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductUpdated: (updatedProduct: Product) => void;
  product: Product | null;
}

interface ProductPrice {
  product_id: string;
  size: string;
  final_price: number;
  final_status: string;
  product_name: string;
  image_url: string;
}

interface Fees {
  fee_percent: number;
  fee_fixed: number;
  eur_to_czk_rate?: number | null;
}

export default function EditProductModal({
  isOpen,
  onClose,
  onProductUpdated,
  product,
}: EditProductModalProps) {
  const [newPrice, setNewPrice] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceColor, setPriceColor] = useState<string>('text-slate-700');
  const [isPriceValid, setIsPriceValid] = useState<boolean>(true);
  const [priceMessage, setPriceMessage] = useState<string>('');
  const [priceBadge, setPriceBadge] = useState<JSX.Element | null>(null);
  const [fees, setFees] = useState<Fees>({ fee_percent: 0.2, fee_fixed: 5 });
  const [currentMarketPrice, setCurrentMarketPrice] = useState<number | null>(null);
  const [currentMarketPriceOwner, setCurrentMarketPriceOwner] = useState<string | null>(null);
  const [lowestConsignorPrice, setLowestConsignorPrice] = useState<number | null>(null);
  const [currency, setCurrency] = useState<'EUR' | 'CZK'>('EUR');
  const [isBusinessProfile, setIsBusinessProfile] = useState(false);
  const [isVatPayerProfile, setIsVatPayerProfile] = useState(false);
  const [vatScheme, setVatScheme] = useState<'VAT0' | 'MARGIN'>('MARGIN');

  const parsePriceInput = (value: string): number => {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  useEffect(() => {
    if (isOpen) {
      getFees().then((adminFees) => {
        setFees(adminFees ?? { fee_percent: 0.2, fee_fixed: 5 });
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
        })
        .catch((err) => console.warn('Failed to load profile VAT settings:', err));

      if (product) {
        fetchCurrentMarketPrice(product);
      }
    }
  }, [isOpen, product]);

  const fetchCurrentMarketPrice = async (product: Product) => {
    try {
      // Get lowest consignor price INCLUDING current user's product (for market price display)
      const { data: allConsignorPrice, error: allConsignorError } = await supabase
        .from('product_price_view') 
        .select('final_price, owner')
        .eq('product_id', product.product_id)
        .eq('size', product.size)
        .in('final_status', ['Skladom', 'Skladom Expres'])
        .not('owner', 'is', null)
        .order('final_price', { ascending: true })
        .limit(1)
        .maybeSingle();

      // Get lowest consignor price EXCLUDING current user's product (for comparison)
      const { data: otherConsignorPrice, error: otherConsignorError } = await supabase
        .from('product_price_view') 
        .select('final_price, owner')
        .eq('product_id', product.product_id)
        .eq('size', product.size)
        .in('final_status', ['Skladom', 'Skladom Expres'])
        .not('owner', 'is', null)
        .neq('owner', product.user_id) // Exclude current user's product
        .order('final_price', { ascending: true })
        .limit(1)
        .maybeSingle();

      // Also get eshop price for comparison
      const { data: eshopPrice, error: eshopError } = await supabase
        .from('product_price_view')
        .select('final_price, owner')
        .eq('product_id', product.product_id)
        .eq('size', product.size)
        .in('final_status', ['Skladom', 'Skladom Expres'])
        .is('owner', null)
        .order('final_price', { ascending: true })
        .limit(1)
        .maybeSingle();

      // Set lowest consignor price (excluding current user) for comparison
      if (otherConsignorPrice) {
        setLowestConsignorPrice(otherConsignorPrice.final_price);
      } else {
        setLowestConsignorPrice(null);
      }

      // Calculate current market price (INCLUDING current user's product)
      // This is the actual lowest price on the market right now
      let marketPriceData = null;
      if (allConsignorPrice && eshopPrice) {
        // Use the lower of the two (consignor or eshop)
        marketPriceData = allConsignorPrice.final_price <= eshopPrice.final_price ? allConsignorPrice : eshopPrice;
      } else if (allConsignorPrice) {
        marketPriceData = allConsignorPrice;
      } else if (eshopPrice) {
        marketPriceData = eshopPrice;
      }

      if (marketPriceData) {
        setCurrentMarketPrice(marketPriceData.final_price);
        setCurrentMarketPriceOwner(marketPriceData.owner);
      } else {
        // Fallback to original price if no market price found
        const fallbackPrice = product?.original_price || product?.price || 0;
        setCurrentMarketPrice(fallbackPrice);
        setCurrentMarketPriceOwner(null);
        setLowestConsignorPrice(null);
      }
    } catch (err) {
      console.error('Error fetching current market price:', err);
      // Fallback to original price if market price fetch fails
      const fallbackPrice = product?.original_price || product?.price || 0;
      setCurrentMarketPrice(fallbackPrice);
      setCurrentMarketPriceOwner(null);
      setLowestConsignorPrice(null);
    }
  };

  const numericNewPrice = parsePriceInput(newPrice);
  const feePercent = fees?.fee_percent ?? 0.2;
  const feeFixed = fees?.fee_fixed ?? 5;
  const exchangeRate = fees?.eur_to_czk_rate ?? null;
  const hasExchangeRate = typeof exchangeRate === 'number' && Number.isFinite(exchangeRate) && exchangeRate > 0;
  const eurPrice = !isNaN(numericNewPrice)
    ? currency === 'CZK'
      ? hasExchangeRate
        ? czkToEur(numericNewPrice, exchangeRate)
        : NaN
      : numericNewPrice
    : NaN;
  const computedPayoutValue =
    !isNaN(eurPrice)
      ? calculatePayout(eurPrice, feePercent, feeFixed, isBusinessProfile ? (isVatPayerProfile ? vatScheme : 'MARGIN') : null)
      : 0;
  const payoutBasePrice = !isNaN(eurPrice) ? getPayoutBasePrice(eurPrice, isBusinessProfile ? (isVatPayerProfile ? vatScheme : 'MARGIN') : null) : null;

  const handleCurrencyChange = (nextCurrency: 'EUR' | 'CZK') => {
    if (nextCurrency === currency) return;
    if (nextCurrency === 'CZK' && !hasExchangeRate) return;

    const currentValue = parsePriceInput(newPrice);
    if (!Number.isFinite(currentValue) || currentValue <= 0) {
      setCurrency(nextCurrency);
      setNewPrice('');
      setIsPriceValid(false);
      setPriceMessage('');
      setPriceBadge(null);
      return;
    }

    const currentEurPrice = currency === 'CZK' && hasExchangeRate ? czkToEur(currentValue, exchangeRate) : currentValue;
    const nextValue = nextCurrency === 'CZK' && hasExchangeRate ? eurToCzk(currentEurPrice, exchangeRate) : currentEurPrice;

    setCurrency(nextCurrency);
    setNewPrice(String(nextValue));
    setIsPriceValid(true);
    updatePriceStatus(currentEurPrice, recommendedPrice);
  };

  const recommendedPrice =
    currentMarketPrice || product?.original_price || product?.price || 0;

  useEffect(() => {
    if (product) {
      const initialCurrency = product.input_currency === 'CZK' ? 'CZK' : 'EUR';
      const initialInputPrice = initialCurrency === 'CZK'
        ? product.input_price || (hasExchangeRate ? eurToCzk(product.price, product.exchange_rate || exchangeRate) : product.price)
        : product.price;
      setCurrency(initialCurrency);
      setVatScheme(product.vat_scheme === 'MARGIN' ? 'MARGIN' : product.is_vat0 ? 'VAT0' : 'MARGIN');
      setNewPrice(String(initialInputPrice));
      const initialValue = product.price;
      updatePriceStatus(initialValue, recommendedPrice);
    }
  }, [product, recommendedPrice]);

  // Price comparison with epsilon tolerance (1 cent)
  const PRICE_EPSILON = 0.01;
  const isPriceEqual = (price1: number, price2: number) => Math.abs(price1 - price2) < PRICE_EPSILON;
  const isPriceLower = (price1: number, price2: number) => price1 < price2 - PRICE_EPSILON;
  const isPriceHigher = (price1: number, price2: number) => price1 > price2 + PRICE_EPSILON;

  const updatePriceStatus = (price: number, recommended: number) => {
    // Calculate the lowest price to compare against (excluding current user's product)
    // lowestConsignorPrice already excludes current user's product
    let comparisonPrice = recommended;
    if (lowestConsignorPrice !== null && currentMarketPrice !== null) {
      // Compare with the lowest of both (eshop or other consignor)
      comparisonPrice = Math.min(lowestConsignorPrice, currentMarketPrice);
    } else if (lowestConsignorPrice !== null) {
      comparisonPrice = lowestConsignorPrice;
    } else if (currentMarketPrice !== null) {
      comparisonPrice = currentMarketPrice;
    }

    // Determine if user has the lowest price
    // If lowestConsignorPrice is null, no other consignor has a price
    const hasLowestConsignorPrice = lowestConsignorPrice === null || isPriceLower(price, lowestConsignorPrice);
    const hasLowerThanEshop = currentMarketPrice === null || isPriceLower(price, currentMarketPrice);
    const isLowest = hasLowestConsignorPrice && hasLowerThanEshop;

    if (isLowest) {
      // User has the lowest price
      setPriceColor('text-green-600');
      setPriceMessage(`Lowest new price will be ${formatCurrency(price)}`);
      setPriceBadge(
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
          Lowest
        </span>
      );
    } else if (isPriceHigher(price, comparisonPrice)) {
      // User's price is higher than the lowest market price
      const difference = (price - comparisonPrice).toFixed(2);
      setPriceColor('text-red-600');
      setPriceMessage(`Your price is ${formatCurrency(Number(difference))} higher than the lowest market price`);
      setPriceBadge(
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 ml-2">
          Higher
        </span>
      );
    } else if (isPriceLower(price, comparisonPrice)) {
      // User's price is lower (shouldn't happen if comparisonPrice is correct, but handle it)
      setPriceColor('text-green-600');
      setPriceMessage(`Lowest new price will be ${formatCurrency(price)}`);
      setPriceBadge(
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
          Lowest
        </span>
      );
    } else {
      // Price equals comparison price (within epsilon)
      // If it equals lowestConsignorPrice, someone else has the same price
      if (lowestConsignorPrice !== null && isPriceEqual(price, lowestConsignorPrice)) {
        setPriceColor('text-yellow-600');
        setPriceMessage('Tied for lowest price with another consignor');
        setPriceBadge(
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 ml-2">
            Tied
          </span>
        );
      } else {
        // Equal to eshop price or no other consignor price exists
        setPriceColor('text-green-600');
        setPriceMessage(`Lowest new price will be ${formatCurrency(price)}`);
        setPriceBadge(
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
            Lowest
          </span>
        );
      }
    }
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const sanitizedValue = value
      .replace(/[^0-9.]/g, '')
      .replace(/(\..*)\./g, '$1');
    setNewPrice(sanitizedValue);

    const numericValue = parseFloat(sanitizedValue);
    const nextEurPrice = currency === 'CZK'
      ? hasExchangeRate
        ? czkToEur(numericValue, exchangeRate)
        : NaN
      : numericValue;
    if (isNaN(numericValue) || numericValue <= 0 || isNaN(nextEurPrice) || nextEurPrice <= 0) {
      setIsPriceValid(false);
      setPriceColor('text-red-600');
      setPriceMessage('Price must be a positive number.');
      setPriceBadge(null);
    } else {
      setIsPriceValid(true);
      updatePriceStatus(nextEurPrice, recommendedPrice);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !isPriceValid) return;
    if (currency === 'CZK' && !hasExchangeRate) {
      setError('CZK rate is not set. Please use EUR or ask admin to set the CZK rate.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('user_products')
        .update({
          price: eurPrice,
          input_currency: currency,
          input_price: numericNewPrice,
          exchange_rate: currency === 'CZK' ? exchangeRate : null,
          is_vat0: isBusinessProfile && isVatPayerProfile && vatScheme === 'VAT0',
          vat_scheme: isBusinessProfile ? (isVatPayerProfile ? vatScheme : 'MARGIN') : null,
          payout: computedPayoutValue,
        })
        .eq('id', product.id);

      if (updateError) throw updateError;

      const updatedProduct = {
        ...product,
        price: eurPrice,
        input_currency: currency,
        input_price: numericNewPrice,
        exchange_rate: currency === 'CZK' ? exchangeRate : null,
        is_vat0: isBusinessProfile && isVatPayerProfile && vatScheme === 'VAT0',
        vat_scheme: isBusinessProfile ? (isVatPayerProfile ? vatScheme : 'MARGIN') : null,
        payout: computedPayoutValue,
      };
      onProductUpdated(updatedProduct);
      onClose();
    } catch (err: any) {
      console.error('Error updating product:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = useCallback(() => onClose(), [onClose]);
  useEscapeKey(handleClose, isOpen);

  if (!isOpen || !product) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <h2 className="text-lg sm:text-2xl font-bold text-slate-900">Edit Product</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <FaTimes className="text-slate-500" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-120px)] sm:max-h-[calc(90vh-140px)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Product Info */}
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center space-x-3 sm:space-x-4">
                <div className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {product.image_url && (
                    <img 
                      loading="lazy"
                      src={product.image_url} 
                      alt={product.name}
                      className="h-full w-full object-contain p-2"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 text-base sm:text-lg">{product.name}</h3>
                  <div className="flex items-center mt-2">
                    <span className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-slate-200 text-slate-800">
                      Size: {product.size}
                    </span>
                    <span className="inline-flex items-center px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium text-slate-800 ml-2">
                      SKU: {product.sku} {/* Added SKU display */}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Market Price Info */}
            {currentMarketPrice && (
              <div className="bg-blue-50/80 border border-blue-200/60 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center min-w-0">
                    <div className="flex-shrink-0">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-blue-900 truncate">
                        Current market price:{' '}
                        <span className="font-bold">{formatCurrency(currentMarketPrice)}</span>
                        {currency === 'CZK' && hasExchangeRate && (
                          <span className="ml-2 text-blue-700">({formatCzk(eurToCzk(currentMarketPrice, exchangeRate))})</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (currency === 'CZK' && hasExchangeRate) {
                        setNewPrice(Math.round(eurToCzk(currentMarketPrice, exchangeRate)).toString());
                      } else {
                        setNewPrice(currentMarketPrice.toString());
                      }
                    }}
                    className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg transition shadow-xs"
                  >
                    Match price
                  </button>
                </div>
              </div>
            )}

            {/* Price Input */}
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                  New Price
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
                  onChange={handlePriceChange}
                  className={`block w-full px-3 sm:px-4 py-2 sm:py-3 pr-12 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm sm:text-base ${priceColor === 'text-red-600' ? 'border-red-300' : priceColor === 'text-green-600' ? 'border-green-300' : 'border-slate-300'} appearance-none`}
                  placeholder={currency === 'CZK' ? 'Enter price in CZK' : 'Enter price in EUR'}
                  pattern="[0-9]*[.]?[0-9]*"
                  inputMode="numeric"
                  required
                />
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                  <span className="rounded-lg bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-500">{currency === 'CZK' ? 'Kč' : '€'}</span>
                </div>
              </div>
              {!isNaN(numericNewPrice) && numericNewPrice > 0 && !isNaN(eurPrice) && (
                <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Stored as <span className="font-semibold text-slate-900">{formatCurrency(eurPrice)}</span>
                  {currency === 'CZK' && hasExchangeRate && (
                    <span> from {formatCzk(numericNewPrice)} at {exchangeRate} CZK/EUR</span>
                  )}
                  {currency === 'CZK' && hasExchangeRate && (
                    <span className="ml-2">Display: {formatCurrency(eurPrice)} / {formatCzk(eurToCzk(eurPrice, exchangeRate))}</span>
                  )}
                </div>
              )}
              
              {priceMessage && (
                <div className={`mt-2 flex items-center text-sm ${priceColor}`}>
                  {priceBadge}
                  <span className="ml-2">{priceMessage}</span>
                </div>
              )}
              
              {computedPayoutValue !== null && (
                <div className="mt-3 bg-emerald-50/90 border border-emerald-200/70 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-emerald-900">Your payout</p>
                      <p className="text-xs text-emerald-700">After fees ({fees.fee_percent * 100}% + {fees.fee_fixed}€)</p>
                    </div>
                    <p className="text-base sm:text-lg font-bold text-emerald-900">
                      {formatCurrency(computedPayoutValue)}
                      {currency === 'CZK' && hasExchangeRate && (
                        <span className="ml-2 text-sm font-semibold text-emerald-700">
                          ({formatCzk(eurToCzk(computedPayoutValue, exchangeRate))})
                        </span>
                      )}
                    </p>
                  </div>
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
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end items-center space-x-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isPriceValid || loading}
                className="px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Updating...
                  </>
                ) : (
                  <>
                    <FaCheck className="mr-1.5 text-xs" />
                    <span>Save Changes</span>
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
