import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getFees, calculatePayout } from '../lib/fees';
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

  useEffect(() => {
    if (isOpen) {
      getFees().then((adminFees) => {
        setFees(adminFees ?? { fee_percent: 0.2, fee_fixed: 5 });
      });

      if (product) {
        fetchCurrentMarketPrice(product);
      }
    }
  }, [isOpen, product]);

  const fetchCurrentMarketPrice = async (product: Product) => {
    try {
      // First, try to find lowest price from consignor (not eshop)
      // Exclude current user's product from comparison
      const { data: consignorPrice, error: consignorError } = await supabase
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

      // Set consignor price separately for comparison
      if (consignorPrice) {
        setLowestConsignorPrice(consignorPrice.final_price);
      } else {
        setLowestConsignorPrice(null);
      }

      // Use the lowest price overall (eshop or consignor)
      let priceData = null;
      if (consignorPrice && eshopPrice) {
        // Use the lower of the two
        priceData = consignorPrice.final_price <= eshopPrice.final_price ? consignorPrice : eshopPrice;
      } else if (consignorPrice) {
        priceData = consignorPrice;
      } else if (eshopPrice) {
        priceData = eshopPrice;
      }

      if (priceData) {
        setCurrentMarketPrice(priceData.final_price);
        setCurrentMarketPriceOwner(priceData.owner);
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

  const numericNewPrice = parseFloat(newPrice);
  const feePercent = fees?.fee_percent ?? 0.2;
  const feeFixed = fees?.fee_fixed ?? 5;
  const computedPayoutValue =
    !isNaN(numericNewPrice)
      ? calculatePayout(numericNewPrice, feePercent, feeFixed)
      : 0;

  const recommendedPrice =
    currentMarketPrice || product?.original_price || product?.price || 0;

  useEffect(() => {
    if (product) {
      setNewPrice(product.price.toString());
      const initialValue = product.price;
      updatePriceStatus(initialValue, recommendedPrice);
    }
  }, [product, recommendedPrice]);

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
    const hasLowestConsignorPrice = lowestConsignorPrice === null || price < lowestConsignorPrice;
    const hasLowerThanEshop = currentMarketPrice === null || price < currentMarketPrice;
    const isLowest = hasLowestConsignorPrice && hasLowerThanEshop;

    if (isLowest) {
      // User has the lowest price
      setPriceColor('text-green-600');
      setPriceMessage(`Najnižšia nová cena bude ${price} €`);
      setPriceBadge(
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
          Najnižšia
        </span>
      );
    } else if (price > comparisonPrice) {
      // User's price is higher than the lowest market price
      setPriceColor('text-red-600');
      setPriceMessage('Tvoja cena je vyššia ako najnižšia trhová cena!');
      setPriceBadge(
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 ml-2">
          Vyššia
        </span>
      );
    } else if (price < comparisonPrice) {
      // User's price is lower (shouldn't happen if comparisonPrice is correct, but handle it)
      setPriceColor('text-green-600');
      setPriceMessage(`Najnižšia nová cena bude ${price} €`);
      setPriceBadge(
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
          Najnižšia
        </span>
      );
    } else {
      // Price equals comparison price
      // If it equals lowestConsignorPrice, someone else has the same price
      if (lowestConsignorPrice !== null && price === lowestConsignorPrice) {
        setPriceColor('text-slate-700');
        setPriceMessage('Niekto má rovnakú cenu.');
        setPriceBadge(null);
      } else {
        // Equal to eshop price or no other consignor price exists
        setPriceColor('text-green-600');
        setPriceMessage(`Najnižšia nová cena bude ${price} €`);
        setPriceBadge(
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
            Najnižšia
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
    if (isNaN(numericValue) || numericValue <= 0) {
      setIsPriceValid(false);
      setPriceColor('text-red-600');
      setPriceMessage('Cena musí byť kladné číslo.');
      setPriceBadge(null);
    } else {
      setIsPriceValid(true);
      updatePriceStatus(numericValue, recommendedPrice);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !isPriceValid) return;

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('user_products')
        .update({
          price: parseFloat(newPrice),
          payout: computedPayoutValue,
        })
        .eq('id', product.id);

      if (updateError) throw updateError;

      const updatedProduct = {
        ...product,
        price: parseFloat(newPrice),
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

  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <h2 className="text-lg sm:text-2xl font-bold text-slate-900">Upraviť produkt</h2>
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
                      Veľkosť: {product.size}
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
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-xs sm:text-sm font-medium text-blue-800">
                      Aktuálna trhová cena: <span className="font-bold">{currentMarketPrice} €</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Price Input */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-3">
                Nová cena
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={newPrice}
                  onChange={handlePriceChange}
                  className={`block w-full px-3 sm:px-4 py-2 sm:py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm sm:text-base ${priceColor === 'text-red-600' ? 'border-red-300' : priceColor === 'text-green-600' ? 'border-green-300' : 'border-slate-300'} appearance-none`}
                  placeholder="Zadajte novú cenu"
                  step="1" // Changed to step=1 for €1 increments
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
              
              {computedPayoutValue !== null && (
                <div className="mt-3 bg-green-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-green-800">Váš payout</p>
                      <p className="text-xs text-green-600">Po odpočítaní poplatkov ({fees.fee_percent * 100}% + {fees.fee_fixed}€)</p>
                    </div>
                    <p className="text-base sm:text-lg font-bold text-green-900">{computedPayoutValue.toFixed(2)} €</p>
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
                disabled={!isPriceValid || loading}
                className="px-4 sm:px-6 py-2 sm:py-3 text-sm font-semibold text-white bg-gradient-to-r from-slate-900 to-slate-700 hover:from-slate-800 hover:to-slate-600 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Upravuje sa...
                  </>
                ) : (
                  <>
                    <FaCheck className="mr-2" />
                    <span className="hidden sm:inline">Uložiť zmeny</span>
                    <span className="sm:hidden">Uložiť</span>
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