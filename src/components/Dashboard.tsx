import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getFees } from '../lib/fees';
import { logger } from '../lib/logger';
import AddProductModal from './AddProductModal';
import EditProductModal from './EditProductModal';
import {
  FaEdit, FaTrash, FaUser, FaSignOutAlt, FaChartLine, FaPlus, FaShoppingBag, FaSyncAlt, FaCog, FaExclamationTriangle
} from 'react-icons/fa';
import { Product } from '../lib/types';

interface Fees {
  fee_percent: number;
  fee_fixed: number;
}
interface DashboardProps {
  isAdmin: boolean;
}

interface MarketPriceData {
  final_price: number;
  owner: string | null;
  lowest_consignor_price?: number | null;
  lowest_eshop_price?: number | null;
  is_lowest_eshop?: boolean; // True if the lowest price is from eshop
  is_user_first_in_line?: boolean; // True if user is first in line when tied
}

export default function Dashboard({ isAdmin }: DashboardProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [marketPrices, setMarketPrices] = useState<Record<string, MarketPriceData>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fees, setFees] = useState<Fees>({ fee_percent: 0.2, fee_fixed: 5 });
  const [refreshing, setRefreshing] = useState(false);
  const [marketPricesLoading, setMarketPricesLoading] = useState(false);

  const fetchProducts = useCallback(async (userId: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      setError(null);
      const { data, error } = await supabase
        .from('user_products')
        .select('*')
        .eq('user_id', userId)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);
      if (error) throw new Error(error.message);

      if (Array.isArray(data)) {
        const validProducts = data.filter(p => p != null);
        setProducts(validProducts);
        if (validProducts.length > 0) {
          await fetchMarketPricesWithTimeout(validProducts);
        }
      } else setProducts([]);
    } catch (err: any) {
      clearTimeout(timeoutId);
      setError(err.name === 'AbortError'
        ? 'Loading products is taking too long. Please refresh the page.'
        : err.message
      );
      setProducts([]);
    }
  }, []);

  const fetchMarketPricesWithTimeout = useCallback(async (products: Product[]) => {
    if (products.length === 0) {
      setMarketPrices({});
      setMarketPricesLoading(false);
      return;
    }

    setMarketPricesLoading(true);
    const pricesMap: Record<string, MarketPriceData> = {};

    // Load market prices for all products (no limit)
    const results = await Promise.allSettled(
      products.map(async product => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
          // Get lowest consignor price EXCLUDING current user's product
          // This is for comparison - to see if user has the lowest among competitors
          // Also get all consignors with the same lowest price to check if user is first in line
          const { data: consignorPriceExcludingUser, error: consignorErrorExcluding } = await supabase
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


          // Get lowest consignor price INCLUDING current user's product
          // This is for determining the absolute lowest market price
          const { data: consignorPriceIncludingUser, error: consignorErrorIncluding } = await supabase
            .from('product_price_view')
            .select('final_price, owner')
            .eq('product_id', product.product_id)
            .eq('size', product.size)
            .in('final_status', ['Skladom', 'Skladom Expres'])
            .not('owner', 'is', null)
            .order('final_price', { ascending: true })
            .limit(1)
            .maybeSingle();

          const consignorPrice = consignorPriceIncludingUser; // Use including for market price
          const consignorError = consignorErrorIncluding || consignorErrorExcluding;

          // Get eshop price
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

          clearTimeout(timeoutId);
          
          if ((consignorError && consignorError.code !== 'PGRST116') || (eshopError && eshopError.code !== 'PGRST116')) {
            logger.warn(`Failed to fetch market price for ${product.product_id}-${product.size}:`, consignorError?.message || eshopError?.message);
            return null;
          }

          // Determine the lowest price overall (eshop or consignor)
          // But prioritize user's own product if they have the lowest consignor price
          let priceData = null;
          let finalOwner = null;
          
          // Check if user has the lowest consignor price
          const userHasLowestConsignor = consignorPriceIncludingUser && 
                                         consignorPriceIncludingUser.owner === product.user_id;
          
          if (consignorPrice && eshopPrice) {
            // Compare eshop price with consignor price
            if (eshopPrice.final_price < consignorPrice.final_price) {
              // Eshop is lower
              priceData = eshopPrice;
              finalOwner = null; // Eshop
            } else if (eshopPrice.final_price === consignorPrice.final_price) {
              // Same price - if user has the lowest consignor, show as user's price
              if (userHasLowestConsignor) {
                priceData = consignorPrice;
                finalOwner = product.user_id; // User's price
              } else {
                priceData = eshopPrice;
                finalOwner = null; // Eshop (or could be another consignor)
              }
            } else {
              // Consignor is lower
              priceData = consignorPrice;
              finalOwner = consignorPrice.owner;
            }
          } else if (consignorPrice) {
            // Only consignor price exists
            priceData = consignorPrice;
            finalOwner = consignorPrice.owner;
          } else if (eshopPrice) {
            // Only eshop price exists
            priceData = eshopPrice;
            finalOwner = null; // Eshop
          }

          if (priceData) {
            const key = `${product.product_id}-${product.size}`;
            const isLowestEshop = finalOwner === null && eshopPrice !== null;
            
            // Check if user is first in line when tied (same price as lowest consignor)
            let isUserFirstInLine = finalOwner === product.user_id;
            if (consignorPriceExcludingUser && 
                isPriceEqual(product.price, consignorPriceExcludingUser.final_price) &&
                isPriceEqual(product.price, priceData.final_price)) {
              // User has same price as lowest consignor - check if they're first in line
              try {
                const { data: samePriceConsignors } = await supabase
                  .from('user_products')
                  .select('user_id, created_at')
                  .eq('product_id', product.product_id)
                  .eq('size', product.size)
                  .eq('price', product.price)
                  .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
                  .order('created_at', { ascending: true })
                  .limit(1);
                
                if (samePriceConsignors && samePriceConsignors.length > 0) {
                  isUserFirstInLine = samePriceConsignors[0].user_id === product.user_id;
                }
              } catch (err) {
                logger.warn('Error checking if user is first in line:', err);
                // Fallback: if user is owner, they're first
                isUserFirstInLine = finalOwner === product.user_id;
              }
            }
            
            return {
              key,
              data: {
                final_price: priceData.final_price,
                owner: finalOwner, // Use determined owner
                // Store lowest consignor price EXCLUDING user (for comparison)
                lowest_consignor_price: consignorPriceExcludingUser?.final_price || null,
                // Store eshop price for comparison
                lowest_eshop_price: eshopPrice?.final_price || null,
                is_lowest_eshop: isLowestEshop,
                is_user_first_in_line: isUserFirstInLine
              }
            };
          }
          return null;
        } catch (err: any) {
          clearTimeout(timeoutId);
          if (err.name !== 'AbortError') {
            logger.warn(`Error fetching market price for ${product.product_id}-${product.size}:`, err.message || err);
          }
          return null;
        }
      })
    );

    // Process successful results
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        pricesMap[result.value.key] = result.value.data;
      }
    });

    setMarketPrices(pricesMap);
    setMarketPricesLoading(false);
  }, [user?.id]);

  // Fetch market price for a single product
  const fetchSingleMarketPrice = useCallback(async (product: Product) => {
    try {
      // Get lowest consignor price INCLUDING current user's product
      const { data: consignorPriceIncludingUser, error: consignorErrorIncluding } = await supabase
        .from('product_price_view')
        .select('final_price, owner')
        .eq('product_id', product.product_id)
        .eq('size', product.size)
        .in('final_status', ['Skladom', 'Skladom Expres'])
        .not('owner', 'is', null)
        .order('final_price', { ascending: true })
        .limit(1)
        .maybeSingle();

      // Get lowest consignor price EXCLUDING current user's product
      const { data: consignorPriceExcludingUser, error: consignorErrorExcluding } = await supabase
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

      const consignorPrice = consignorPriceIncludingUser;
      const consignorError = consignorErrorIncluding || consignorErrorExcluding;

      // Get eshop price
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

      // Determine the lowest price overall (eshop or consignor)
      // But prioritize user's own product if they have the lowest consignor price
      let finalPrice = null;
      let finalOwner = null;
      
      // Check if user has the lowest consignor price
      const userHasLowestConsignor = consignorPrice && 
                                     consignorPrice.owner === product.user_id;
      
      if (consignorPrice && eshopPrice) {
        // Compare eshop price with consignor price
        if (eshopPrice.final_price < consignorPrice.final_price) {
          // Eshop is lower
          finalPrice = eshopPrice.final_price;
          finalOwner = null; // Eshop
        } else if (eshopPrice.final_price === consignorPrice.final_price) {
          // Same price - if user has the lowest consignor, show as user's price
          if (userHasLowestConsignor) {
            finalPrice = consignorPrice.final_price;
            finalOwner = product.user_id; // User's price
          } else {
            finalPrice = eshopPrice.final_price;
            finalOwner = null; // Eshop
          }
        } else {
          // Consignor is lower
          finalPrice = consignorPrice.final_price;
          finalOwner = consignorPrice.owner;
        }
      } else if (consignorPrice) {
        // Only consignor price exists
        finalPrice = consignorPrice.final_price;
        finalOwner = consignorPrice.owner;
      } else if (eshopPrice) {
        // Only eshop price exists
        finalPrice = eshopPrice.final_price;
        finalOwner = null; // Eshop
      }

      if (finalPrice !== null) {
        const key = `${product.product_id}-${product.size}`;
        const isLowestEshop = finalOwner === null && eshopPrice !== null;
        
        // Price comparison with epsilon tolerance (1 cent)
        const PRICE_EPSILON_SINGLE = 0.01;
        const isPriceEqualSingle = (price1: number, price2: number) => Math.abs(price1 - price2) < PRICE_EPSILON_SINGLE;
        
        // Check if user is first in line when tied (same price as lowest consignor)
        let isUserFirstInLine = finalOwner === product.user_id;
        if (consignorPriceExcludingUser && 
            isPriceEqualSingle(product.price, consignorPriceExcludingUser.final_price) &&
            isPriceEqualSingle(product.price, finalPrice)) {
          // User has same price as lowest consignor - check if they're first in line
          try {
            const { data: samePriceConsignors } = await supabase
              .from('user_products')
              .select('user_id, created_at')
              .eq('product_id', product.product_id)
              .eq('size', product.size)
              .eq('price', product.price)
              .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
              .order('created_at', { ascending: true })
              .limit(1);
            
            if (samePriceConsignors && samePriceConsignors.length > 0) {
              isUserFirstInLine = samePriceConsignors[0].user_id === product.user_id;
            }
          } catch (err) {
            logger.warn('Error checking if user is first in line:', err);
            // Fallback: if user is owner, they're first
            isUserFirstInLine = finalOwner === product.user_id;
          }
        }
        
        setMarketPrices((prev) => ({
          ...prev,
          [key]: {
            final_price: finalPrice,
            owner: finalOwner, // Use determined owner
            lowest_consignor_price: consignorPriceExcludingUser?.final_price || null,
            lowest_eshop_price: eshopPrice?.final_price || null,
            is_lowest_eshop: isLowestEshop,
            is_user_first_in_line: isUserFirstInLine
          }
        }));
      }
    } catch (err: any) {
      logger.warn(`Error fetching market price for new product:`, err.message || err);
    }
  }, []);

  const initializeUser = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Reduced timeout

    try {
      setError(null);
      
      // Quick auth check
      const { data: { user }, error: authError } = await Promise.race([
        supabase.auth.getUser(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 2000))
      ]) as any;
      
      clearTimeout(timeoutId);

      if (authError || !user) {
        navigate('/');
        return;
      }
      setUser(user);

      // Load products first (priority), fees in background
      await fetchProducts(user.id);
      
      // Load fees in background (non-blocking)
      getFees().then(feesResult => {
        if (feesResult) setFees(feesResult);
      }).catch(err => {
        logger.warn('Failed to load fees:', err);
      });
      
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' || err.message === 'Auth timeout') {
        setError('Loading is taking too long. Please refresh the page.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [navigate, fetchProducts]);

  useEffect(() => { initializeUser(); }, [initializeUser]);

  // Remove automatic redirect to admin - let users choose
  // useEffect(() => {
  //   if (isAdmin && user && !loading) {
  //     navigate('/admin', { replace: true });
  //   }
  // }, [isAdmin, user, loading, navigate]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch {
      setError('Error signing out');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Do you really want to delete this product?')) return;
    try {
      const { error } = await supabase.from('user_products').delete().eq('id', id);
      if (error) throw error;
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsEditModalOpen(true);
  };

  const handleRefresh = () => {
    if (user && !refreshing) {
      setRefreshing(true);
      fetchProducts(user.id).finally(() => setRefreshing(false));
    }
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    initializeUser();
  };

  // ------------- BADGE LOGIC -------------
  // Price comparison with epsilon tolerance (1 cent)
  const PRICE_EPSILON = 0.01;
  const isPriceEqual = (price1: number, price2: number) => Math.abs(price1 - price2) < PRICE_EPSILON;
  const isPriceLower = (price1: number, price2: number) => price1 < price2 - PRICE_EPSILON;
  const isPriceHigher = (price1: number, price2: number) => price1 > price2 + PRICE_EPSILON;

  const getPriceDisplay = useCallback((product: Product) => {
    const key = `${product.product_id}-${product.size}`;
    const marketData = marketPrices[key];

    if (!marketData) {
      return {
        color: 'text-slate-900',
        badge: (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ml-2">
            No Market
          </span>
        ),
        desc: '(Market price unknown)'
      };
    }

    const { final_price: marketPrice, owner, lowest_consignor_price, lowest_eshop_price, is_lowest_eshop, is_user_first_in_line } = marketData;
    const isEshop = owner === null;
    const isUserOwner = owner === user?.id;
    
    // Compare with lowest price overall (eshop or consignor)
    // marketPrice is already the lowest of eshop and consignor prices
    const comparisonPrice = marketPrice;
    const hasConsignorPrice = lowest_consignor_price !== null;
    const hasEshopPrice = lowest_eshop_price !== null;

    // Check if user's price matches the market price
    const priceMatchesMarket = isPriceEqual(product.price, comparisonPrice);
    
    // If owner is null (eshop) but user's price matches market price AND there's a consignor price,
    // it means user has the lowest consignor price that matches eshop price
    const userHasLowestConsignorMatchingEshop = isEshop && 
                                                priceMatchesMarket && 
                                                hasConsignorPrice && 
                                                lowest_consignor_price !== null &&
                                                isPriceEqual(product.price, lowest_consignor_price as number);

    // Use stored is_user_first_in_line or fallback to isUserOwner
    const isUserFirstInLine = is_user_first_in_line !== undefined ? is_user_first_in_line : isUserOwner;

    // 1. Lowest - user is owner OR user has lowest consignor price matching market (green)
    if (priceMatchesMarket && isUserFirstInLine) {
      return {
        color: 'text-green-600 font-bold',
        badge: (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
            Lowest
          </span>
        ),
        desc: '(You have the lowest price)'
      };
    }

    // 2. Tied for lowest - not first in line (yellow)
    if (priceMatchesMarket && !isUserFirstInLine && hasConsignorPrice) {
      return {
        color: 'text-yellow-600 font-bold',
        badge: (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 ml-2">
            Tied for Lowest
          </span>
        ),
        desc: '(Same price as lowest, but you are not first in line)'
      };
    }

    // 3. Below eshop (green) - only if no consignor price exists
    if (isEshop && !hasConsignorPrice && isPriceLower(product.price, marketPrice)) {
      return {
        color: 'text-green-600 font-bold',
        badge: (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
            Below Eshop
          </span>
        ),
        desc: `(${(marketPrice - product.price).toFixed(2)} € below eshop)`
      };
    }

    // 4. Higher than lowest price - determine if it's eshop or consignor
    if (isPriceHigher(product.price, comparisonPrice)) {
      // Determine which is lower: eshop or consignor
      let higherThanWhat = '';
      let higherBy = 0;
      
      if (hasConsignorPrice && hasEshopPrice) {
        // Both exist - compare with the lower one
        if (lowest_eshop_price! < lowest_consignor_price!) {
          // Eshop is lower
          higherBy = product.price - lowest_eshop_price!;
          higherThanWhat = 'eshop price';
        } else {
          // Consignor is lower or equal
          higherBy = product.price - lowest_consignor_price!;
          higherThanWhat = 'lowest consignor price';
        }
      } else if (hasConsignorPrice) {
        // Only consignor exists
        higherBy = product.price - lowest_consignor_price!;
        higherThanWhat = 'lowest consignor price';
      } else if (hasEshopPrice) {
        // Only eshop exists
        higherBy = product.price - lowest_eshop_price!;
        higherThanWhat = 'eshop price';
      } else {
        // Fallback
        higherBy = product.price - comparisonPrice;
        higherThanWhat = 'lowest price';
      }
      
      return {
        color: 'text-red-600 font-bold',
        badge: (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 ml-2">
            Higher
          </span>
        ),
        desc: `(+${higherBy.toFixed(2)} € above ${higherThanWhat})`
      };
    }

    // 6. Everything else - competition (red)
    return {
      color: 'text-red-600 font-bold',
      badge: (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 ml-2">
          Competition
        </span>
      ),
      desc: `(Lowest price: ${comparisonPrice} € - ${hasConsignorPrice ? 'Consignor' : 'Eshop'})`
    };
  }, [marketPrices, user]);

  // Memoize stats to avoid recalculation on every render
  const totalPayout = useMemo(() => products.reduce((sum, p) => sum + (p.payout ?? 0), 0), [products]);
  const averagePrice = useMemo(() => products.length > 0 ? (products.reduce((sum, p) => sum + p.price, 0) / products.length).toFixed(2) : '0.00', [products]);

  // ------------------- RENDER ---------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-xl shadow mb-3">
            <svg className="animate-spin h-6 w-6 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="text-lg text-slate-600 mb-2">Loading dashboard...</p>
          <p className="text-sm text-slate-500">If loading seems too long, please try refreshing the page</p>
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl max-w-md mx-auto">
              <div className="flex items-center text-red-800 mb-2">
                <FaExclamationTriangle className="mr-2" />
                <span className="font-semibold">Error</span>
              </div>
              <p className="text-red-700 text-sm mb-3">{error}</p>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-slate-600 mb-4">User does not exist or is not logged in.</div>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-slate-100 rounded-xl">
                <FaShoppingBag className="text-slate-900 text-lg" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-slate-900">AirKicks Consign</h1>
                <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">Manage your products</p>
              </div>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-3">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-all duration-200 transform hover:scale-105 shadow"
              >
                <FaPlus className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Add Product</span>
              </button>
              <Link
                to="/sales"
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200 border border-slate-200 shadow-sm"
              >
                <FaChartLine className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Sales</span>
              </Link>
              <Link
                to="/profile"
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200 border border-slate-200 shadow-sm"
              >
                <FaUser className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Profile</span>
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="inline-flex items-center px-3 py-2 sm:px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg transform hover:scale-105"
                >
                  <FaCog className="text-sm sm:mr-2" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-red-50 text-red-600 font-semibold rounded-xl hover:bg-red-100 transition-all duration-200 border border-red-200"
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

        {/* Stats Cards - Mobile Optimized */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FaShoppingBag className="text-blue-600 text-lg sm:text-xl" />
                </div>
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-slate-600">Total Products</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">{products.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-slate-600">Total Payout</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">{totalPayout.toFixed(2)} €</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow sm:col-span-2 lg:col-span-1">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-slate-600">Average Price</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">
                  {averagePrice} €
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Products Section */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900">Your Products</h3>
                {marketPricesLoading && (
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">Loading market prices...</p>
                )}
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200 border border-slate-200 shadow-sm disabled:opacity-50"
                title="Refresh Products"
              >
                <FaSyncAlt className={`text-sm sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {products.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">#</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Product</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Size</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">SKU</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Price</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Payout</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Expiration</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {products.map((product, index) => {
                      const priceDisplay = getPriceDisplay(product);
                      return (
                        <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-medium">{index + 1}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                                <img
                                  loading="lazy"
                                  className="h-full w-full object-contain p-2"
                                  src={product?.image_url || '/default-image.png'}
                                  alt={product?.name || 'No image'}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = '/default-image.png';
                                  }}
                                />
                              </div>
                              <div className="ml-4 min-w-0 flex-1">
                                <div className="text-sm font-semibold text-slate-900 truncate">{product?.name || 'Unknown product'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-800">
                              {product?.size || 'Unknown size'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                            {product.sku || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center">
                              <span className={priceDisplay.color}>
                                {product?.price ? `${product.price} €` : 'Unknown price'}
                              </span>
                              {priceDisplay.badge}
                            </div>
                            {priceDisplay.desc && (
                              <div className="text-xs text-slate-500 mt-1">
                                {priceDisplay.desc}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                            {(product.payout ?? 0).toFixed(2)} €
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {product.expires_at ? (
                              <span className={new Date(product.expires_at) < new Date() ? 'text-red-600 font-semibold' : 'text-orange-600'}>
                                {new Date(product.expires_at).toLocaleDateString('sk-SK')}
                              </span>
                            ) : (
                              <span className="text-slate-400">No expiration</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={() => handleEditProduct(product)}
                                className="text-slate-600 hover:text-slate-900 transition-colors p-2 hover:bg-slate-100 rounded-lg"
                                title="Edit Product"
                              >
                                <FaEdit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product.id)}
                                className="text-red-600 hover:text-red-700 transition-colors p-2 hover:bg-red-50 rounded-lg"
                                title="Delete Product"
                              >
                                <FaTrash className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4 p-4">
                {products.map((product, index) => {
                  const priceDisplay = getPriceDisplay(product);
                  return (
                    <div key={product.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <div className="flex items-start space-x-3">
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                          <img
                            className="h-full w-full object-contain p-2"
                            src={product?.image_url || '/default-image.png'}
                            alt={product?.name || 'No image'}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = '/default-image.png';
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-slate-900 truncate">{product?.name || 'Unknown product'}</h4>
                            <span className="text-xs text-slate-500 font-medium">#{index + 1}</span>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-600">Size:</span>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-800">
                                {product?.size || 'Unknown size'}
                              </span>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-600">SKU:</span>
                              <span className="text-xs font-mono text-slate-900">{product.sku || 'N/A'}</span>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-600">Price:</span>
                              <div className="flex items-center">
                                <span className={`text-sm font-semibold ${priceDisplay.color}`}>
                                  {product?.price ? `${product.price} €` : 'Unknown price'}
                                </span>
                                {priceDisplay.badge}
                              </div>
                            </div>
                            
                            {priceDisplay.desc && (
                              <div className="text-xs text-slate-500 italic">
                                {priceDisplay.desc}
                              </div>
                            )}
                            
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-600">Payout:</span>
                              <span className="text-sm font-semibold text-green-600">
                                {(product.payout ?? 0).toFixed(2)} €
                              </span>
                            </div>
                            
                            {product.expires_at && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-600">Expiration:</span>
                                <span className={`text-xs font-semibold ${new Date(product.expires_at) < new Date() ? 'text-red-600' : 'text-orange-600'}`}>
                                  {new Date(product.expires_at).toLocaleDateString('sk-SK')}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-end space-x-2 mt-3 pt-3 border-t border-slate-200">
                            <button
                              onClick={() => handleEditProduct(product)}
                              className="inline-flex items-center px-3 py-1.5 bg-slate-600 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
                            >
                              <FaEdit className="mr-1" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                            >
                              <FaTrash className="mr-1" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FaShoppingBag className="text-slate-400 text-2xl" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">No Products</h3>
              <p className="text-sm sm:text-base text-slate-600 mb-6">Start by adding your first product</p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-all duration-200 transform hover:scale-105"
              >
                <FaPlus className="mr-2" />
                Add Product
              </button>
            </div>
          )}
        </div>

        <AddProductModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onProductAdded={async (newProduct) => {
            // Optimistically add product to state immediately
            setProducts((prev) => [newProduct, ...prev]);
            // Fetch market price in background
            fetchSingleMarketPrice(newProduct);
          }}
        />
        {editingProduct && (
          <EditProductModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onProductUpdated={(updatedProduct) =>
              setProducts((prevProducts) =>
                prevProducts.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
              )
            }
            product={editingProduct}
          />
        )}
      </main>
    </div>
  );
}