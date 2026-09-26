import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AdminNavigation from './AdminNavigation';
import { formatCurrency, formatTimeAgo } from '../lib/utils';
import { 
  FaChartBar, 
  FaUsers, 
  FaShoppingBag, 
  FaChartLine, 
  FaCog, 
  FaSignOutAlt, 
  FaArrowRight,
  FaUserShield,
  FaPlus,
  FaEuroSign,
  FaList,
  FaShoppingCart,
  FaChevronDown,
  FaChevronUp,
  FaFileInvoice,
  FaStore,
  FaWarehouse,
  FaClock,
  FaSync
} from 'react-icons/fa';

interface DashboardStats {
  totalUsers: number;
  totalProducts: number;
  totalListings: number;
  activeListings: number;
  expiredListings: number;
  totalSales: number;
  totalRevenue: number;
  totalPayout: number;
  totalProfit: number;
  profitMarginPercent: number;
  recentActivity: number;
}

interface RecentActivity {
  id: string;
  type: 'user_registered' | 'product_added' | 'listing_added' | 'sale_created' | 'sale_completed';
  action: string;
  created_at: string;
  icon: any;
  productName?: string;
  price?: number;
  userEmail?: string;
  saleId?: string;
}

const getActivityTheme = (type: RecentActivity['type']) => {
  switch (type) {
    case 'sale_completed':
      return {
        bg: 'bg-emerald-50 text-emerald-600 border border-emerald-200/80',
        badge: 'bg-emerald-100 text-emerald-800'
      };
    case 'sale_created':
      return {
        bg: 'bg-blue-50 text-blue-600 border border-blue-200/80',
        badge: 'bg-blue-100 text-blue-800'
      };
    case 'listing_added':
      return {
        bg: 'bg-amber-50 text-amber-600 border border-amber-200/80',
        badge: 'bg-amber-100 text-amber-800'
      };
    case 'product_added':
      return {
        bg: 'bg-purple-50 text-purple-600 border border-purple-200/80',
        badge: 'bg-purple-100 text-purple-800'
      };
    case 'user_registered':
    default:
      return {
        bg: 'bg-indigo-50 text-indigo-600 border border-indigo-200/80',
        badge: 'bg-indigo-100 text-indigo-800'
      };
  }
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalProducts: 0,
    totalListings: 0,
    activeListings: 0,
    expiredListings: 0,
    totalSales: 0,
    totalRevenue: 0,
    totalPayout: 0,
    totalProfit: 0,
    profitMarginPercent: 0,
    recentActivity: 0
  });
  const [expirationDays, setExpirationDays] = useState<number>(60);
  const [error, setError] = useState<string | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [allActivities, setAllActivities] = useState<RecentActivity[]>([]);

  const loadOverviewStats = useCallback(async () => {
    try {
      setError(null);
      
      const [usersRes, productsRes, listingsRes, salesRes, settingsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('user_products').select('id, expires_at', { count: 'exact' }),
        supabase.from('user_sales').select('id, price, payout', { count: 'exact' }),
        supabase.from('admin_settings').select('offer_expiration_days').limit(1).maybeSingle()
      ]);

      const totalUsers = usersRes.count || 0;
      const totalProducts = productsRes.count || 0;
      const totalListings = listingsRes.count || 0;

      let activeListings = 0;
      let expiredListings = 0;
      const now = new Date();
      if (listingsRes.data) {
        listingsRes.data.forEach((item: any) => {
          if (item.expires_at && new Date(item.expires_at) <= now) {
            expiredListings++;
          } else {
            activeListings++;
          }
        });
      }

      const totalSales = salesRes.count || 0;
      const totalRevenue = salesRes.data 
        ? salesRes.data.reduce((sum: number, sale: any) => sum + (sale.price || 0), 0) 
        : 0;
      const totalPayout = salesRes.data 
        ? salesRes.data.reduce((sum: number, sale: any) => sum + (sale.payout || 0), 0) 
        : 0;
      const totalProfit = Math.max(0, totalRevenue - totalPayout);
      const profitMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      if (settingsRes.data?.offer_expiration_days) {
        setExpirationDays(settingsRes.data.offer_expiration_days);
      }

      setStats({
        totalUsers,
        totalProducts,
        totalListings,
        activeListings,
        expiredListings,
        totalSales,
        totalRevenue,
        totalPayout,
        totalProfit,
        profitMarginPercent,
        recentActivity: 0
      });

    } catch (err: any) {
      console.error('Error loading stats:', err.message);
      setError('Error loading statistics: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error signing out:', err.message);
    }
  };

  const loadRecentActivities = useCallback(async () => {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const [usersRes, productsRes, listingsRes, salesRes] = await Promise.allSettled([
        supabase
          .from('profiles')
          .select('id, created_at, email')
          .gte('created_at', oneDayAgo)
          .order('created_at', { ascending: false }),
        supabase
          .from('products')
          .select('id, created_at, name')
          .gte('created_at', oneDayAgo)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_products')
          .select('id, created_at, name, price, profiles(email)')
          .gte('created_at', oneDayAgo)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_sales')
          .select('id, created_at, status, name, price, profiles(email)')
          .gte('created_at', oneDayAgo)
          .order('created_at', { ascending: false })
      ]);

      const activities: RecentActivity[] = [];

      if (usersRes.status === 'fulfilled' && usersRes.value.data) {
        usersRes.value.data.forEach((user: any) => {
          activities.push({
            id: `user-${user.id}`,
            type: 'user_registered',
            action: 'New user registered',
            created_at: user.created_at,
            icon: FaUsers,
            userEmail: user.email
          });
        });
      }

      if (productsRes.status === 'fulfilled' && productsRes.value.data) {
        productsRes.value.data.forEach((product: any) => {
          activities.push({
            id: `product-${product.id}`,
            type: 'product_added',
            action: 'New product in catalog',
            created_at: product.created_at,
            icon: FaShoppingBag,
            productName: product.name
          });
        });
      }

      if (listingsRes.status === 'fulfilled' && listingsRes.value.data) {
        listingsRes.value.data.forEach((listing: any) => {
          activities.push({
            id: `listing-${listing.id}`,
            type: 'listing_added',
            action: 'Product offered by consignor',
            created_at: listing.created_at,
            icon: FaPlus,
            productName: listing.name,
            price: listing.price,
            userEmail: listing.profiles?.email
          });
        });
      }

      if (salesRes.status === 'fulfilled' && salesRes.value.data) {
        salesRes.value.data.forEach((sale: any) => {
          if (sale.status === 'completed') {
            activities.push({
              id: `sale-completed-${sale.id}`,
              type: 'sale_completed',
              action: 'Sale completed',
              created_at: sale.created_at,
              icon: FaChartLine,
              productName: sale.name,
              price: sale.price,
              userEmail: sale.profiles?.email,
              saleId: sale.id
            });
          } else {
            activities.push({
              id: `sale-${sale.id}`,
              type: 'sale_created',
              action: 'New sale created',
              created_at: sale.created_at,
              icon: FaShoppingCart,
              productName: sale.name,
              price: sale.price,
              userEmail: sale.profiles?.email,
              saleId: sale.id
            });
          }
        });
      }

      activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllActivities(activities);
      setRecentActivities(activities.slice(0, 10));

    } catch (err: any) {
      console.error('Error loading recent activities:', err);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadOverviewStats(), loadRecentActivities()]);
  };

  useEffect(() => {
    loadOverviewStats();
    loadRecentActivities();
    
    const interval = setInterval(() => {
      loadRecentActivities();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadOverviewStats, loadRecentActivities]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-slate-800 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900">Loading admin dashboard...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg">
                <FaUserShield className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  Admin Dashboard
                </h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">System overview, metrics & consignor operations</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-xs sm:text-sm disabled:opacity-50"
              >
                <FaSync className={`sm:mr-2 text-xs ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-xs sm:text-sm"
              >
                <FaSignOutAlt className="sm:mr-2 text-xs" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <AdminNavigation />

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-sm">
            {error}
          </div>
        )}

        {/* Overview Dashboard */}
        <div className="space-y-6 sm:space-y-8">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* Users */}
            <Link
              to="/admin/users"
              className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/80 hover:border-indigo-300 hover:shadow-lg transition-all duration-300 group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Users</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">{stats.totalUsers.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-2">Registered accounts & sellers</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FaUsers className="text-xl" />
                </div>
              </div>
            </Link>

            {/* Catalog Products */}
            <Link
              to="/admin/products"
              className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/80 hover:border-purple-300 hover:shadow-lg transition-all duration-300 group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Catalog Products</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">{stats.totalProducts.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-2">Synced with Shoptet catalog</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FaShoppingBag className="text-xl" />
                </div>
              </div>
            </Link>

            {/* Consignor Offers with Active & Expired badges */}
            <Link
              to="/admin/listed-products"
              className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/80 hover:border-amber-300 hover:shadow-lg transition-all duration-300 group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Consignor Offers</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">{stats.totalListings.toLocaleString()}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {stats.activeListings} active
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      {stats.expiredListings} expired
                    </span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FaList className="text-xl" />
                </div>
              </div>
            </Link>

            {/* Sales */}
            <Link
              to="/admin/sales"
              className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/80 hover:border-emerald-300 hover:shadow-lg transition-all duration-300 group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Sales</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">{stats.totalSales.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-2">Processed consignment sales</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FaShoppingCart className="text-xl" />
                </div>
              </div>
            </Link>
          </div>

          {/* Financial Breakdown (Revenue, Payouts, Platform Gross Margin) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {/* Total Revenue */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Sales Revenue</span>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                  <FaEuroSign className="text-base" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {formatCurrency(stats.totalRevenue)}
              </p>
              <p className="text-xs text-gray-500 mt-2">Cumulative value of all user sales</p>
            </div>

            {/* Total Payouts */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Seller Payouts</span>
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
                  <FaChartLine className="text-base" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {formatCurrency(stats.totalPayout)}
              </p>
              <p className="text-xs text-gray-500 mt-2">Paid & pending to consignors</p>
            </div>

            {/* Platform Gross Margin / Fees */}
            <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50/50 rounded-2xl p-5 sm:p-6 border border-emerald-200/80 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Platform Gross Margin</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  +{stats.profitMarginPercent.toFixed(1)}% margin
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-900 tracking-tight">
                {formatCurrency(stats.totalProfit)}
              </p>
              <p className="text-xs text-emerald-700/80 mt-2">Commission & service fees earned</p>
            </div>
          </div>

          {/* Quick Actions Hub */}
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4">Quick Operations Hub</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Link
                to="/admin/listed-products"
                className="bg-white rounded-xl p-4 border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                        <FaList className="text-sm" />
                      </div>
                      <span className="font-bold text-sm text-gray-900">User Offers</span>
                    </div>
                    {stats.expiredListings > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full">
                        {stats.expiredListings} expired
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Review pending consignments, accept sales, renew expired offers.</p>
                </div>
                <div className="mt-3 flex items-center text-xs font-semibold text-orange-600 group-hover:text-orange-700">
                  <span>Manage offers</span>
                  <FaArrowRight className="ml-1 text-[10px] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              <Link
                to="/admin/eshop-sales"
                className="bg-white rounded-xl p-4 border border-gray-200 hover:border-teal-300 hover:shadow-md transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                        <FaStore className="text-sm" />
                      </div>
                      <span className="font-bold text-sm text-gray-900">Eshop Orders</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Track and fulfill customer orders imported from Shoptet storefront.</p>
                </div>
                <div className="mt-3 flex items-center text-xs font-semibold text-teal-600 group-hover:text-teal-700">
                  <span>Open eshop</span>
                  <FaArrowRight className="ml-1 text-[10px] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              <Link
                to="/admin/warehouse"
                className="bg-white rounded-xl p-4 border border-gray-200 hover:border-amber-300 hover:shadow-md transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                        <FaWarehouse className="text-sm" />
                      </div>
                      <span className="font-bold text-sm text-gray-900">Warehouse</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Physical stock tracking, consigned inventory locations & status.</p>
                </div>
                <div className="mt-3 flex items-center text-xs font-semibold text-amber-600 group-hover:text-amber-700">
                  <span>View warehouse</span>
                  <FaArrowRight className="ml-1 text-[10px] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              <Link
                to="/admin/settings"
                className="bg-white rounded-xl p-4 border border-gray-200 hover:border-slate-400 hover:shadow-md transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                        <FaCog className="text-sm" />
                      </div>
                      <span className="font-bold text-sm text-gray-900">Settings & Fees</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                      {expirationDays}d active
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Commission tiers, currency exchange rates & offer expiration rules.</p>
                </div>
                <div className="mt-3 flex items-center text-xs font-semibold text-slate-700 group-hover:text-slate-900">
                  <span>Edit settings</span>
                  <FaArrowRight className="ml-1 text-[10px] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </div>

          {/* Live Recent Activity */}
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200/80 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900">Recent Activity</h3>
                  <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[11px] font-semibold text-emerald-700">Live 24h</span>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{allActivities.length} events logged</span>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {recentActivities.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {(showAllActivities ? allActivities : recentActivities).map((activity) => {
                      const IconComponent = activity.icon;
                      const theme = getActivityTheme(activity.type);
                      return (
                        <div 
                          key={activity.id} 
                          className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50/80 border border-gray-100 transition-colors"
                        >
                          <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
                            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${theme.bg}`}>
                              <IconComponent className="text-sm" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
                                  {activity.action}
                                </p>
                                {activity.price && (
                                  <span className="text-xs font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">
                                    {formatCurrency(activity.price)}
                                  </span>
                                )}
                              </div>
                              {activity.productName && (
                                <p className="text-xs text-gray-600 truncate mt-0.5 font-medium">{activity.productName}</p>
                              )}
                              {activity.userEmail && (
                                <p className="text-[11px] text-gray-400 truncate mt-0.5">{activity.userEmail}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex-shrink-0 text-right ml-3">
                            <span className="text-[11px] text-gray-400 flex items-center justify-end">
                              <FaClock className="mr-1 text-[9px]" />
                              {formatTimeAgo(activity.created_at)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {allActivities.length > 10 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => setShowAllActivities(!showAllActivities)}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors border border-gray-200"
                      >
                        <span>{showAllActivities ? 'Show less' : `Show all ${allActivities.length} activities`}</span>
                        {showAllActivities ? (
                          <FaChevronUp className="text-xs" />
                        ) : (
                          <FaChevronDown className="text-xs" />
                        )}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
                    <FaClock className="text-xl" />
                  </div>
                  <p className="text-gray-700 text-sm font-medium">No recent activity recorded</p>
                  <p className="text-gray-400 text-xs mt-1">Actions from the last 24 hours will automatically appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}