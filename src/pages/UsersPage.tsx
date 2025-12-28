import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import SalesStatusBadge from '../components/SalesStatusBadge';
import AdminSalesStatusManager from '../components/AdminSalesStatusManager';
import AdminNavigation from '../components/AdminNavigation';
import { 
  FaSignOutAlt, 
  FaSearch, 
  FaInfoCircle, 
  FaSync, 
  FaUsers, 
  FaShoppingCart, 
  FaExclamationTriangle,
  FaUser,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaBuilding,
  FaCreditCard,
  FaEuroSign,
  FaCalendarAlt,
  FaTimes,
  FaChartLine,
  FaBox,
  FaSignature,
  FaTrash,
  FaChartBar
} from 'react-icons/fa';

interface UserProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  profile_type?: string;
  vat_type?: string;
  company_name?: string;
  vat_number?: string;
  address?: string;
  popisne_cislo?: string;
  psc?: string;
  mesto?: string;
  krajina?: string;
  email: string;
  telephone?: string;
  iban?: string;
  ico?: string;
  signature_url?: string;
}

interface UserSale {
  id: string;
  product_id: string;
  name: string;
  size: string;
  price: number;
  payout: number;
  created_at: string;
  status: string;
  image_url?: string;
  sku?: string;
  external_id?: string;
  is_manual?: boolean;
  tracking_url?: string;
  label_url?: string;
  contract_url?: string;
  delivered_at?: string;
  payout_date?: string;
}

interface UserProduct {
  id: string;
  product_id: string;
  name: string;
  size: string;
  price: number;
  payout: number;
  created_at: string;
  image_url?: string;
  sku?: string;
}

interface UserStats {
  totalSales: number;
  totalRevenue: number;
  totalPayout: number;
  totalProducts: number;
  completedSales: number;
  pendingSales: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userSales, setUserSales] = useState<UserSale[]>([]);
  const [userProducts, setUserProducts] = useState<UserProduct[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'sales' | 'products' | 'operations'>('info');
  const [userOperations, setUserOperations] = useState<any[]>([]);
  const [loadingOperations, setLoadingOperations] = useState(false);
  const [selectedSaleForStatus, setSelectedSaleForStatus] = useState<UserSale | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, first_name, last_name, profile_type, vat_type, company_name, vat_number, 
          address, popisne_cislo, psc, mesto, krajina, email, telephone, iban, ico, signature_url
        `)
        .limit(100);

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error('Error loading users:', err.message);
      setError('Chyba pri načítavaní užívateľov: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  const loadUserDetails = async (userId: string) => {
    try {
      setLoadingUserData(true);
      
      // Load user sales
      const { data: salesData, error: salesError } = await supabase
        .from('user_sales')
        .select('id, product_id, name, size, price, payout, created_at, status, image_url, sku, external_id, is_manual, tracking_url, label_url, contract_url, delivered_at, payout_date')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;
      setUserSales(salesData || []);

      // Load user products
      const { data: productsData, error: productsError } = await supabase
        .from('user_products')
        .select('id, product_id, name, size, price, payout, created_at, image_url, sku')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;
      setUserProducts(productsData || []);

      // Calculate stats
      const sales = salesData || [];
      const products = productsData || [];
      
      const stats: UserStats = {
        totalSales: sales.length,
        totalRevenue: sales.reduce((sum, sale) => sum + sale.price, 0),
        totalPayout: sales.reduce((sum, sale) => sum + sale.payout, 0),
        totalProducts: products.length,
        completedSales: sales.filter(sale => sale.status === 'completed').length,
        pendingSales: sales.filter(sale => ['accepted', 'processing', 'shipped'].includes(sale.status)).length
      };
      
      setUserStats(stats);

      // Load user operations (sales status history)
      await loadUserOperations(userId);

    } catch (err: any) {
      console.error('Error loading user details:', err.message);
      setError('Chyba pri načítavaní detailov užívateľa: ' + err.message);
    } finally {
      setLoadingUserData(false);
    }
  };

  const loadUserOperations = async (userId: string) => {
    try {
      setLoadingOperations(true);
      
      // Load sales status history for this user
      const { data: salesHistory, error: salesHistoryError } = await supabase
        .from('sales_status_history')
        .select(`
          id,
          sale_id,
          old_status,
          new_status,
          created_at,
          notes,
          user_sales!inner(id, name, user_id)
        `)
        .eq('user_sales.user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (salesHistoryError) throw salesHistoryError;

      // Format operations
      const operations = (salesHistory || []).map((item: any) => ({
        id: item.id,
        type: 'sale_status_change',
        sale_id: item.sale_id,
        sale_name: item.user_sales?.name || 'N/A',
        old_status: item.old_status,
        new_status: item.new_status,
        created_at: item.created_at,
        notes: item.notes
      }));

      setUserOperations(operations);
    } catch (err: any) {
      console.error('Error loading user operations:', err.message);
    } finally {
      setLoadingOperations(false);
    }
  };

  const handleUserSelect = async (user: UserProfile) => {
    setSelectedUser(user);
    setActiveTab('info');
    await loadUserDetails(user.id);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error signing out:', err.message);
    }
  };

  const handleRetry = () => {
    setError(null);
    loadUsers();
  };

  const closeModal = () => {
    setSelectedUser(null);
    setUserSales([]);
    setUserProducts([]);
    setUserStats(null);
    setUserOperations([]);
    setActiveTab('info');
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    const confirmMessage = `Naozaj chcete odstrániť používateľa "${selectedUser.email}"? Táto akcia je nevratná a odstráni aj všetky súvisiace súbory (podpis, predaje, zmluvy, labels).`;
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setError(null);
      setDeletingUser(true);
      const userId = selectedUser.id;

      // 1. Delete signature from storage if exists
      if (selectedUser.signature_url) {
        try {
          let filePath = '';
          if (selectedUser.signature_url.includes('/storage/v1/object/public/signatures/')) {
            filePath = selectedUser.signature_url.split('/storage/v1/object/public/signatures/')[1].split('?')[0];
          } else if (selectedUser.signature_url.includes('/signatures/')) {
            filePath = selectedUser.signature_url.split('/signatures/')[1].split('?')[0];
          }
          
          if (filePath) {
            const { error: deleteError } = await supabase.storage
              .from('signatures')
              .remove([filePath]);
            if (deleteError) {
              console.warn('Failed to delete signature from storage:', deleteError);
            }
          }
        } catch (err) {
          console.warn('Error deleting signature from storage:', err);
        }
      }

      // 2. Delete all user sales and their associated files (labels, contracts)
      const { data: userSalesData, error: salesError } = await supabase
        .from('user_sales')
        .select('id, label_url, contract_url')
        .eq('user_id', userId);

      if (salesError) {
        throw new Error('Chyba pri načítavaní predajov: ' + salesError.message);
      }

      if (userSalesData) {
        for (const sale of userSalesData) {
          // Delete label if exists
          if (sale.label_url) {
            try {
              let filePath = '';
              if (sale.label_url.includes('/storage/v1/object/public/labels/')) {
                filePath = sale.label_url.split('/storage/v1/object/public/labels/')[1].split('?')[0];
              } else if (sale.label_url.includes('/labels/')) {
                filePath = sale.label_url.split('/labels/')[1].split('?')[0];
              }
              
              if (filePath) {
                const { error: deleteError } = await supabase.storage.from('labels').remove([filePath]);
                if (deleteError) {
                  console.warn(`Error deleting label for sale ${sale.id}:`, deleteError);
                }
              }
            } catch (err) {
              console.warn('Error deleting label from storage:', err);
            }
          }

          // Delete contract if exists
          if (sale.contract_url) {
            try {
              const filePath = `contracts/${sale.id}.pdf`;
              const { error: deleteError } = await supabase.storage.from('contracts').remove([filePath]);
              if (deleteError) {
                console.warn(`Error deleting contract for sale ${sale.id}:`, deleteError);
              }
            } catch (err) {
              console.warn('Error deleting contract from storage:', err);
            }
          }
        }
      }

      // 3. Delete all user sales from database
      const { error: deleteSalesError } = await supabase
        .from('user_sales')
        .delete()
        .eq('user_id', userId);

      if (deleteSalesError) {
        throw new Error('Chyba pri odstraňovaní predajov: ' + deleteSalesError.message);
      }

      // 4. Delete user products from database
      const { error: deleteProductsError } = await supabase
        .from('user_products')
        .delete()
        .eq('user_id', userId);

      if (deleteProductsError) {
        throw new Error('Chyba pri odstraňovaní produktov: ' + deleteProductsError.message);
      }

      // 5. Delete user profile from database
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (deleteProfileError) {
        throw new Error('Chyba pri odstraňovaní profilu: ' + deleteProfileError.message);
      }

      // 6. Try to delete user from auth.users using Edge Function
      // Note: This requires the Edge Function to be deployed (see supabase/functions/delete-user)
      // If Edge Function is not deployed, user must be manually deleted from Supabase Dashboard
      try {
        const { data, error: deleteAuthUserError } = await supabase.functions.invoke('delete-user', {
          body: { userId }
        });
        if (deleteAuthUserError) {
          console.warn('Failed to delete user from auth.users via Edge Function (profile was deleted):', deleteAuthUserError);
          // Profile is already deleted, so we continue anyway
          // User can be manually deleted from Supabase Dashboard > Authentication > Users
        }
      } catch (edgeFunctionError) {
        console.warn('Edge Function delete-user not available or failed (profile was deleted):', edgeFunctionError);
        // Profile is already deleted, so we continue anyway
        // User can be manually deleted from Supabase Dashboard > Authentication > Users
      }

      // Success - close modal and reload users
      alert(`Používateľ "${selectedUser.email}" bol úspešne odstránený.`);
      closeModal();
      await loadUsers();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setError('Chyba pri odstraňovaní používateľa: ' + (err.message || err));
      alert('Chyba pri odstraňovaní používateľa: ' + (err.message || err));
    } finally {
      setDeletingUser(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('sk-SK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('sk-SK', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = users.filter(user =>
    [user.email, user.first_name, user.last_name].some(field =>
      field?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Načítavajú sa užívatelia</h3>
          <p className="text-sm text-gray-600">Prosím čakajte...</p>
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
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-800 rounded-2xl shadow-lg">
                  <FaUsers className="text-gray-900 text-xl" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                  Správa užívateľov
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Katalóg a správa užívateľov</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 sm:space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50"
              >
                <FaSync className={`text-sm sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Obnovuje sa...' : 'Obnoviť'}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-lg transform hover:scale-105"
              >
                <FaSignOutAlt className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Odhlásiť</span>
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
                  Skúsiť znova
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

        {/* Users Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Užívatelia ({filteredUsers.length})</h3>
                <p className="text-gray-600 text-xs sm:text-sm mt-1">Správa a prehľad užívateľov</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm" />
                  <input
                    type="text"
                    placeholder="Vyhľadať užívateľov..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-3">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 truncate mb-1">{user.email}</h4>
                    {user.first_name || user.last_name ? (
                      <p className="text-xs text-gray-600 mb-2">
                        {`${user.first_name || ''} ${user.last_name || ''}`.trim()}
                      </p>
                    ) : null}
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      user.profile_type === 'Obchodný' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.profile_type || 'N/A'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleUserSelect(user)}
                  className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200"
                >
                  <FaInfoCircle className="mr-2" />
                  Detail
                </button>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto -mx-3 sm:mx-0">
            <table className="min-w-full divide-y divide-gray-200/50">
              <thead className="bg-white">
                <tr>
                  <th className="px-3 sm:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">ID</th>
                  <th className="px-3 sm:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Email</th>
                  <th className="px-3 sm:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Meno</th>
                  <th className="px-3 sm:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Typ</th>
                  <th className="px-3 sm:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Akcie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/30">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 sm:px-6 py-4 text-sm text-gray-700 font-mono hidden lg:table-cell">{user.id.slice(0, 8)}...</td>
                    <td className="px-3 sm:px-6 py-4">
                      <div className="text-sm text-gray-900 break-all">{user.email}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 text-sm text-gray-700">
                      {user.first_name || user.last_name ? 
                        `${user.first_name || ''} ${user.last_name || ''}`.trim() : 
                        'N/A'
                      }
                    </td>
                    <td className="px-3 sm:px-6 py-4 text-sm text-gray-700">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        user.profile_type === 'Obchodný' ? 'bg-gray-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.profile_type || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-4">
                      <button
                        onClick={() => handleUserSelect(user)}
                        className="inline-flex items-center px-3 py-2 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-sm"
                      >
                        <FaInfoCircle className="mr-2" />
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FaUsers className="text-gray-600 text-2xl" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Žiadni užívatelia</h3>
              <p className="text-sm sm:text-base text-gray-600">
                {searchTerm ? 'Nenašli sa žiadni užívatelia pre váš vyhľadávací výraz' : 'Zatiaľ nie sú pridaní žiadni užívatelia'}
              </p>
            </div>
          )}
        </div>

        {/* Enhanced Modal for User Details */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-[60]">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-6xl border-t sm:border border-gray-200 max-h-[95vh] overflow-hidden shadow-2xl flex flex-col">
              {/* Sticky Modal Header */}
              <div className="flex items-center justify-between p-3 sm:p-4 lg:p-6 border-b border-gray-200 bg-white flex-shrink-0">
                <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4 flex-1 min-w-0 pr-2">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 flex-shrink-0">
                    <FaUser className="text-gray-900 text-sm sm:text-base lg:text-xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base lg:text-xl font-bold text-gray-900 truncate">
                      {selectedUser.first_name || selectedUser.last_name ? 
                        `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() : 
                        'Užívateľ'
                      }
                    </h3>
                    <p className="text-gray-600 text-xs sm:text-sm break-all">{selectedUser.email}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                  <button
                    onClick={handleDeleteUser}
                    disabled={deletingUser}
                    className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Odstrániť používateľa"
                  >
                    {deletingUser ? (
                      <svg className="animate-spin w-4 h-4 sm:w-5 sm:h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <FaTrash className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </button>
                  <button
                    onClick={closeModal}
                    disabled={deletingUser}
                    className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Zatvoriť"
                  >
                    <FaTimes className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
              {/* Error Message */}
              {error && (
                <div className="mx-3 sm:mx-4 lg:mx-6 mt-3 sm:mt-4 bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4">
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

              {/* Stats Cards */}
              {userStats && (
                <div className="p-2 sm:p-3 lg:p-6 border-b border-gray-200 bg-gray-50">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 sm:gap-2 lg:gap-4">
                    <div className="bg-white rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-gray-200 shadow-sm">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <FaShoppingCart className="text-blue-400 text-xs sm:text-sm" />
                      </div>
                      <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900">{userStats.totalSales}</p>
                      <p className="text-[10px] sm:text-xs text-gray-600">Predaje</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-xl p-2 sm:p-3 lg:p-4 text-center">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <FaEuroSign className="text-green-600 text-xs sm:text-sm" />
                      </div>
                      <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900 truncate">{formatCurrency(userStats.totalRevenue)}</p>
                      <p className="text-[10px] sm:text-xs text-gray-600">Tržby</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-xl p-2 sm:p-3 lg:p-4 text-center">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <FaChartLine className="text-purple-400 text-xs sm:text-sm" />
                      </div>
                      <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900 truncate">{formatCurrency(userStats.totalPayout)}</p>
                      <p className="text-[10px] sm:text-xs text-gray-600">Payout</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-xl p-2 sm:p-3 lg:p-4 text-center">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 bg-orange-500/20 rounded-lg flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <FaBox className="text-orange-400 text-xs sm:text-sm" />
                      </div>
                      <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900">{userStats.totalProducts}</p>
                      <p className="text-[10px] sm:text-xs text-gray-600">Produkty</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-xl p-2 sm:p-3 lg:p-4 text-center">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900">{userStats.completedSales}</p>
                      <p className="text-[10px] sm:text-xs text-gray-600">Dokončené</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-xl p-2 sm:p-3 lg:p-4 text-center">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900">{userStats.pendingSales}</p>
                      <p className="text-[10px] sm:text-xs text-gray-600">Čakajúce</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Navigation */}
              <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto flex-shrink-0">
                {[
                  { id: 'info', label: 'Informácie', icon: FaUser },
                  { id: 'sales', label: 'Predaje', icon: FaShoppingCart },
                  { id: 'products', label: 'Produkty', icon: FaBox },
                  { id: 'operations', label: 'Operácie', icon: FaChartBar }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 font-semibold transition-all duration-200 whitespace-nowrap text-xs sm:text-sm ${
                      activeTab === tab.id
                        ? 'text-gray-900 border-b-2 border-indigo-500 bg-white'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <tab.icon className="text-xs sm:text-sm sm:mr-1 lg:mr-2" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="p-2 sm:p-3 lg:p-6 overflow-y-auto">
                {loadingUserData ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-indigo-500 rounded-full animate-spin"></div>
                    <span className="ml-3 text-gray-700">Načítavajú sa údaje...</span>
                  </div>
                ) : (
                  <>
                    {/* User Info Tab */}
                    {activeTab === 'info' && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3 lg:gap-6 text-gray-700">
                        <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                          <div className="flex items-start sm:items-center">
                            <FaUser className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Meno</p>
                              <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.first_name || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-start sm:items-center">
                            <FaUser className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Priezvisko</p>
                              <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.last_name || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-start sm:items-center">
                            <FaEnvelope className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Email</p>
                              <p className="text-sm sm:text-base font-semibold break-all">{selectedUser.email}</p>
                            </div>
                          </div>
                          <div className="flex items-start sm:items-center">
                            <FaPhone className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Telefón</p>
                              <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.telephone || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-start sm:items-center">
                            <FaBuilding className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Typ profilu</p>
                              <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.profile_type || 'N/A'}</p>
                            </div>
                          </div>
                          {selectedUser.profile_type === 'Obchodný' && (
                            <>
                              <div className="flex items-start sm:items-center">
                                <FaBuilding className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Spoločnosť</p>
                                  <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.company_name || 'N/A'}</p>
                                </div>
                              </div>
                              <div className="flex items-start sm:items-center">
                                <FaBuilding className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">IČO</p>
                                  <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.ico || 'N/A'}</p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="space-y-3 sm:space-y-4">
                          <div className="flex items-start sm:items-center">
                            <FaMapMarkerAlt className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Adresa</p>
                              <p className="text-sm sm:text-base font-semibold break-words">
                                {selectedUser.address || selectedUser.popisne_cislo ? 
                                  `${selectedUser.address || ''} ${selectedUser.popisne_cislo || ''}`.trim() : 'N/A'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start sm:items-center">
                            <FaMapMarkerAlt className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Mesto</p>
                              <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.mesto || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-start sm:items-center">
                            <FaMapMarkerAlt className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">PSČ</p>
                              <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.psc || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-start sm:items-center">
                            <FaMapMarkerAlt className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Krajina</p>
                              <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.krajina || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-start sm:items-center">
                            <FaCreditCard className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">IBAN</p>
                              <p className="text-sm font-semibold font-mono break-all">{selectedUser.iban || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-start sm:items-center">
                            <FaSignature className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 uppercase tracking-wider mb-1.5 sm:mb-2">Podpis</p>
                              {selectedUser.signature_url ? (
                                <div className="border border-gray-300 rounded-xl p-2 sm:p-3 bg-white">
                                  <img 
                                    src={selectedUser.signature_url} 
                                    alt="Podpis" 
                                    className="max-w-full h-20 sm:h-24 object-contain"
                                  />
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500 italic">Podpis nie je nahraný</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sales Tab */}
                    {activeTab === 'sales' && (
                      <div>
                        <h4 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">Predaje ({userSales.length})</h4>
                        {userSales.length > 0 ? (
                          <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                            {userSales.map((sale) => (
                              <div 
                                key={sale.id} 
                                onClick={() => setSelectedSaleForStatus(sale)}
                                className="bg-white rounded-xl p-2 sm:p-3 lg:p-4 border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4 flex-1 min-w-0">
                                    <div className="h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-300 bg-white">
                                      <img
                                        className="h-full w-full object-contain p-1.5 sm:p-2"
                                        src={sale.image_url || '/default-image.png'}
                                        alt={sale.name}
                                        onError={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          target.src = '/default-image.png';
                                        }}
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h5 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 truncate">{sale.name}</h5>
                                      <p className="text-xs text-gray-600">Veľkosť: {sale.size}</p>
                                      <p className="text-xs text-gray-600">SKU: {sale.sku || 'N/A'}</p>
                                      <p className="text-xs text-gray-600 truncate">ID: {sale.external_id || 'N/A'}</p>
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0 ml-2">
                                    <div className="flex items-center justify-end space-x-1 mb-1.5 sm:mb-2">
                                      <SalesStatusBadge status={sale.status} />
                                      {sale.is_manual && (
                                        <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full text-[10px] sm:text-xs font-bold bg-blue-500 text-white" title="Manuálna sale">
                                          M
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">{formatCurrency(sale.price)}</p>
                                    <p className="text-xs sm:text-sm text-green-600">Payout: {formatCurrency(sale.payout)}</p>
                                    <p className="text-xs text-gray-600">{formatDate(sale.created_at)}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <FaShoppingCart className="text-gray-600 text-2xl sm:text-4xl mx-auto mb-4" />
                            <p className="text-sm sm:text-base text-gray-600">Žiadne predaje</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Products Tab */}
                    {activeTab === 'products' && (
                      <div>
                        <h4 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">Produkty ({userProducts.length})</h4>
                        {userProducts.length > 0 ? (
                          <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                            {userProducts.map((product) => (
                              <div key={product.id} className="bg-white rounded-xl p-2 sm:p-3 lg:p-4 border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4 flex-1 min-w-0">
                                    <div className="h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-300 bg-white">
                                      <img
                                        className="h-full w-full object-contain p-1.5 sm:p-2"
                                        src={product.image_url || '/default-image.png'}
                                        alt={product.name}
                                        onError={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          target.src = '/default-image.png';
                                        }}
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h5 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 truncate">{product.name}</h5>
                                      <p className="text-xs text-gray-600">Veľkosť: {product.size}</p>
                                      <p className="text-xs text-gray-600">SKU: {product.sku || 'N/A'}</p>
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0 ml-2">
                                    <p className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">{formatCurrency(product.price)}</p>
                                    <p className="text-xs sm:text-sm text-green-600">Payout: {formatCurrency(product.payout)}</p>
                                    <p className="text-xs text-gray-600">{formatDate(product.created_at)}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <FaBox className="text-gray-600 text-2xl sm:text-4xl mx-auto mb-4" />
                            <p className="text-sm sm:text-base text-gray-600">Žiadne produkty</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Operations Tab */}
                    {activeTab === 'operations' && (
                      <div>
                        <h4 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">História operácií ({userOperations.length})</h4>
                        {loadingOperations ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-4 border-gray-300 border-t-indigo-500 rounded-full animate-spin"></div>
                            <span className="ml-3 text-gray-700">Načítavajú sa operácie...</span>
                          </div>
                        ) : userOperations.length > 0 ? (
                          <div className="space-y-3">
                            {userOperations.map((operation) => (
                              <div key={operation.id} className="bg-white rounded-xl p-4 border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm">
                                <div className="flex items-start space-x-3">
                                  <div className="flex-shrink-0 mt-1">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                      <FaChartBar className="text-blue-600 text-sm" />
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                      <h5 className="text-sm font-semibold text-gray-900">{operation.sale_name}</h5>
                                      <span className="text-xs text-gray-500">{formatDate(operation.created_at)}</span>
                                    </div>
                                    <div className="flex items-center space-x-2 flex-wrap gap-1">
                                      <span className="text-xs text-gray-600">Zmena statusu:</span>
                                      {operation.old_status ? (
                                        <>
                                          <SalesStatusBadge status={operation.old_status} />
                                          <span className="text-gray-400 text-xs">→</span>
                                        </>
                                      ) : (
                                        <span className="text-xs text-gray-500">Začiatok</span>
                                      )}
                                      <SalesStatusBadge status={operation.new_status} />
                                    </div>
                                    {operation.notes && (
                                      <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-100">
                                        <p className="text-xs text-gray-700">{operation.notes}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <FaChartBar className="text-gray-600 text-2xl sm:text-4xl mx-auto mb-4" />
                            <p className="text-sm sm:text-base text-gray-600">Žiadne operácie</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Sale Status Manager Modal */}
              {selectedSaleForStatus && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-[70]">
                  <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between p-3 sm:p-4 lg:p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 truncate">Správa predaja</h3>
                        <p className="text-xs sm:text-sm text-gray-600 mt-0.5 truncate">{selectedSaleForStatus.name}</p>
                      </div>
                      <button
                        onClick={() => setSelectedSaleForStatus(null)}
                        className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors flex-shrink-0"
                        aria-label="Zatvoriť"
                      >
                        <FaTimes className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
                      <AdminSalesStatusManager
                        saleId={selectedSaleForStatus.id}
                        currentStatus={selectedSaleForStatus.status}
                        currentExternalId={selectedSaleForStatus.external_id}
                        currentTrackingUrl={selectedSaleForStatus.tracking_url}
                        currentLabelUrl={selectedSaleForStatus.label_url}
                        currentDeliveredAt={selectedSaleForStatus.delivered_at}
                        currentPayoutDate={selectedSaleForStatus.payout_date}
                        currentCreatedAt={selectedSaleForStatus.created_at}
                        currentIsManual={selectedSaleForStatus.is_manual || false}
                        onStatusUpdate={(newStatus) => {
                          // Update the sale in the list
                          setUserSales(prevSales => 
                            prevSales.map(sale => 
                              sale.id === selectedSaleForStatus.id 
                                ? { ...sale, status: newStatus }
                                : sale
                            )
                          );
                          // Reload user details to get updated data
                          if (selectedUser) {
                            loadUserDetails(selectedUser.id);
                          }
                        }}
                        onExternalIdUpdate={(newExternalId) => {
                          // Update the sale in the list
                          setUserSales(prevSales => 
                            prevSales.map(sale => 
                              sale.id === selectedSaleForStatus.id 
                                ? { ...sale, external_id: newExternalId }
                                : sale
                            )
                          );
                        }}
                        onClose={() => {
                          setSelectedSaleForStatus(null);
                          // Reload user details to get updated data
                          if (selectedUser) {
                            loadUserDetails(selectedUser.id);
                          }
                        }}
                        onDelete={async () => {
                          setSelectedSaleForStatus(null);
                          if (selectedUser) {
                            await loadUserDetails(selectedUser.id);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}