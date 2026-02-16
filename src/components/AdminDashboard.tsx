import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  FaChartBar, 
  FaUsers, 
  FaShoppingBag, 
  FaEye, 
  FaChartLine, 
  FaCog, 
  FaSignOutAlt, 
  FaArrowLeft,
  FaUserShield,
  FaPlus,
  FaEuroSign,
  FaList,
  FaShoppingCart,
  FaChevronDown,
  FaChevronUp
} from 'react-icons/fa';

interface DashboardStats {
  totalUsers: number;
  totalProducts: number;
  totalListings: number;
  totalSales: number;
  totalRevenue: number;
  totalPayout: number;
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

export default function AdminDashboard() {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalProducts: 0,
    totalListings: 0,
    totalSales: 0,
    totalRevenue: 0,
    totalPayout: 0,
    recentActivity: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [allActivities, setAllActivities] = useState<RecentActivity[]>([]);

  const loadOverviewStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const promises = [
        supabase.from('profiles').select('id', { count: 'exact' }),
        supabase.from('products').select('id', { count: 'exact' }),
        supabase.from('user_products').select('id, price, payout', { count: 'exact' }),
        supabase.from('user_sales').select('id, price, payout', { count: 'exact' })
      ];

      const results = await Promise.allSettled(promises);

      const [usersRes, productsRes, listingsRes, salesRes] = results;

      const totalUsers = usersRes.status === 'fulfilled' ? (usersRes.value.count || 0) : 0;
      const totalProducts = productsRes.status === 'fulfilled' ? (productsRes.value.count || 0) : 0;
      const totalListings = listingsRes.status === 'fulfilled' ? (listingsRes.value.count || 0) : 0;
      const totalSales = salesRes.status === 'fulfilled' ? (salesRes.value.count || 0) : 0;

      const totalRevenue = salesRes.status === 'fulfilled' && salesRes.value.data 
        ? salesRes.value.data.reduce((sum: number, sale: any) => sum + (sale.price || 0), 0) 
        : 0;
      const totalPayout = salesRes.status === 'fulfilled' && salesRes.value.data 
        ? salesRes.value.data.reduce((sum: number, sale: any) => sum + (sale.payout || 0), 0) 
        : 0;

      setStats({
        totalUsers,
        totalProducts,
        totalListings,
        totalSales,
        totalRevenue,
        totalPayout,
        recentActivity: 0
      });

    } catch (err: any) {
      console.error('Error loading stats:', err.message);
      setError('Error loading statistics: ' + err.message);
    } finally {
      setLoading(false);
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sk-SK', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  };

  const loadRecentActivities = useCallback(async () => {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Fetch recent activities from different sources (without limits to get all activities)
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

      // Process users
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

      // Process products
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

      // Process listings (user_products)
      if (listingsRes.status === 'fulfilled' && listingsRes.value.data) {
        listingsRes.value.data.forEach((listing: any) => {
          activities.push({
            id: `listing-${listing.id}`,
            type: 'listing_added',
            action: 'Product added to listings',
            created_at: listing.created_at,
            icon: FaPlus,
            productName: listing.name,
            price: listing.price,
            userEmail: listing.profiles?.email
          });
        });
      }

      // Process sales
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

      // Sort by created_at descending
      activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllActivities(activities);
      setRecentActivities(activities.slice(0, 10));

    } catch (err: any) {
      console.error('Error loading recent activities:', err);
    }
  }, []);

  useEffect(() => {
    loadOverviewStats();
    loadRecentActivities();
    
    // Auto-refresh activities every 30 seconds
    const interval = setInterval(() => {
      loadRecentActivities();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadOverviewStats, loadRecentActivities]);

  // Kratší loading
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900">Loading admin dashboard</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Enhanced Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="relative">
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800 rounded-2xl shadow-lg">
                  <FaUserShield className="text-white text-xl" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                  Admin Dashboard
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">System management and data analysis</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 sm:space-x-3">
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

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Navigation Tabs */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-8 overflow-hidden">
          <div className="flex overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: FaChartBar, path: '/admin' },
              { id: 'products', label: 'Products', icon: FaShoppingBag, path: '/admin/products' },
              { id: 'listed-products', label: 'Listings', icon: FaList, path: '/admin/listed-products' },
              { id: 'sales', label: 'Sales', icon: FaShoppingCart, path: '/admin/sales' },
              { id: 'users', label: 'Users', icon: FaUsers, path: '/admin/users' },
              { id: 'settings', label: 'Settings', icon: FaCog, path: '/admin/settings' },
            ].map((tab) => {
              const isActive = location.pathname === tab.path;
              return (
                <Link
                  key={tab.id}
                  to={tab.path}
                  className={`relative flex items-center px-4 sm:px-6 py-3 sm:py-4 font-semibold transition-all duration-300 min-w-max ${
                    isActive ? 'text-black' : 'text-gray-600 hover:text-black hover:bg-gray-50'
                  }`}
                >
                  <tab.icon className={`text-base sm:text-sm mr-2 ${isActive ? 'text-black' : 'text-gray-600'}`} />
                  <span className={`text-sm sm:text-base ${isActive ? 'text-black font-bold' : 'text-gray-600'}`}>
                    {tab.label}
                  </span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black rounded-full"></div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Overview Dashboard */}
        <div className="space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[
              { 
                title: 'Users', 
                value: stats.totalUsers, 
                icon: FaUsers, 
                color: 'from-green-500 to-emerald-500'
              },
              { 
                title: 'Products', 
                value: stats.totalProducts, 
                icon: FaShoppingBag, 
                color: 'from-purple-500 to-violet-500'
              },
              { 
                title: 'Active listings', 
                value: stats.totalListings, 
                icon: FaEye, 
                color: 'from-orange-500 to-amber-500'
              },
              { 
                title: 'Sales', 
                value: stats.totalSales, 
                icon: FaChartLine, 
                color: 'from-blue-500 to-cyan-500'
              },
            ].map((stat, index) => (
              <div key={index} className="relative group">
                <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 hover:border-gray-300 transition-all duration-300 transform hover:scale-105 hover:shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-xs sm:text-sm font-medium">{stat.title}</p>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2">{stat.value.toLocaleString()}</p>
                    </div>
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-black flex items-center justify-center shadow-lg">
                      <stat.icon className="text-white text-2xl" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Revenue Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Total Revenue</h3>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-black flex items-center justify-center">
                  <FaEuroSign className="text-white text-lg" />
                </div>
              </div>
              <p className="text-2xl sm:text-4xl font-bold text-gray-900">
                {formatCurrency(stats.totalRevenue)}
              </p>
              <p className="text-gray-600 text-xs sm:text-sm mt-2">Total revenue from all sales</p>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Total Payouts</h3>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-black flex items-center justify-center">
                  <FaChartLine className="text-white text-lg" />
                </div>
              </div>
              <p className="text-2xl sm:text-4xl font-bold text-gray-900">
                {formatCurrency(stats.totalPayout)}
              </p>
              <p className="text-gray-600 text-xs sm:text-sm mt-2">Total payouts to sellers</p>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Recent Activity</h3>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs sm:text-sm text-gray-600">Live</span>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              {recentActivities.length > 0 ? (
                <>
                  <div className="space-y-4">
                    {(showAllActivities ? allActivities : recentActivities).map((activity) => {
                      const IconComponent = activity.icon;
                      return (
                        <div key={activity.id} className="flex items-start space-x-3 sm:space-x-4 p-2 sm:p-3 rounded-xl hover:bg-gray-50 transition-colors">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-black flex items-center justify-center flex-shrink-0">
                            <IconComponent className="text-sm text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-900 text-xs sm:text-sm font-medium">{activity.action}</p>
                            {activity.productName && (
                              <p className="text-gray-700 text-xs sm:text-sm mt-1 font-semibold">{activity.productName}</p>
                            )}
                            {activity.price && (
                              <p className="text-gray-600 text-xs mt-1">{formatCurrency(activity.price)}</p>
                            )}
                            {activity.userEmail && (
                              <p className="text-gray-500 text-xs mt-1">From: {activity.userEmail}</p>
                            )}
                            <p className="text-gray-500 text-xs mt-1">{formatTimeAgo(activity.created_at)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {allActivities.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => setShowAllActivities(!showAllActivities)}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                      >
                        <span>{showAllActivities ? 'Hide' : recentActivities.length < allActivities.length ? `Show all (${allActivities.length})` : `Show history (${allActivities.length})`}</span>
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
                <div className="text-center py-8">
                  <p className="text-gray-600 text-sm">No recent activity</p>
                  <p className="text-gray-500 text-xs mt-2">Activities from the last 24 hours will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}