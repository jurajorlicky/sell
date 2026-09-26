import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { formatDate, formatCurrency } from '../lib/utils';
import SalesStatusBadge from '../components/SalesStatusBadge';
import AdminSalesStatusManager from '../components/AdminSalesStatusManager';
import CreateSaleModal from '../components/CreateSaleModal';
import BulkProductImportModal from '../components/BulkProductImportModal';
import AdminNavigation from '../components/AdminNavigation';
import AdminDetailSheet from '../components/AdminDetailSheet';
import { 
  FaSignOutAlt, 
  FaSearch, 
  FaInfoCircle, 
  FaSync, 
  FaUsers, 
  FaShoppingCart, 
  FaExclamationTriangle,
  FaEdit,
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
  FaChartBar,
  FaPlus,
  FaUpload
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
  sale_type?: 'operational' | 'invoice';
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
  expires_at?: string;
}

interface UserStats {
  totalSales: number;
  totalRevenue: number;
  totalPayout: number;
  totalProducts: number;
  completedSales: number;
  pendingSales: number;
}

interface EditableUserProfile {
  first_name: string;
  last_name: string;
  profile_type: 'Personal' | 'Business';
  vat_type: string;
  company_name: string;
  vat_number: string;
  address: string;
  popisne_cislo: string;
  psc: string;
  mesto: string;
  krajina: string;
  email: string;
  telephone: string;
  iban: string;
  ico: string;
  discord: string;
}

const normalizeBusinessVatType = (value?: string | null): 'NO_VAT' | 'VAT_PAYER' => {
  return value === 'VAT_PAYER' || value === 'VAT 0%' ? 'VAT_PAYER' : 'NO_VAT';
};

const selectInputClass = 'w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-gray-900 shadow-sm transition focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10';

const createEditableProfile = (user?: UserProfile | null): EditableUserProfile => ({
  first_name: user?.first_name || '',
  last_name: user?.last_name || '',
  profile_type: user?.profile_type === 'Business' ? 'Business' : 'Personal',
  vat_type: user?.profile_type === 'Business' ? normalizeBusinessVatType(user?.vat_type) : '',
  company_name: user?.company_name || '',
  vat_number: user?.vat_number || '',
  address: user?.address || '',
  popisne_cislo: user?.popisne_cislo || '',
  psc: user?.psc || '',
  mesto: user?.mesto || '',
  krajina: user?.krajina || 'Slovakia',
  email: user?.email || '',
  telephone: user?.telephone || '',
  iban: user?.iban || '',
  ico: user?.ico || '',
  discord: '',
});

const extractStoragePath = (url: string | undefined, bucket: string): string | null => {
  if (!url) return null;

  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const bucketMarker = `/${bucket}/`;

  if (url.includes(publicMarker)) {
    return url.split(publicMarker)[1].split('?')[0];
  }

  if (url.includes(bucketMarker)) {
    return url.split(bucketMarker)[1].split('?')[0];
  }

  return null;
};

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
  const [showCreateSaleModal, setShowCreateSaleModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<EditableUserProfile>(createEditableProfile());
  const [savingProfile, setSavingProfile] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [removingSignature, setRemovingSignature] = useState(false);
  const [savingSignaturePreview, setSavingSignaturePreview] = useState(false);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingSignatureRef = useRef(false);
  const localSignaturePreviewRef = useRef<string | null>(null);

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
      setError('Error loading users: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  const loadUserDetails = async (userId: string) => {
    try {
      setLoadingUserData(true);
      
      // Load user sales (only operational sales for display)
      const { data: salesData, error: salesError } = await supabase
        .from('user_sales')
        .select('id, product_id, name, size, price, payout, created_at, status, image_url, sku, external_id, is_manual, sale_type, tracking_url, label_url, contract_url, delivered_at, payout_date')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      // Filter operational sales if sale_type column exists, otherwise show all (backward compatibility)
      const filteredSales = (salesData || []).filter(sale => {
        return !sale.sale_type || sale.sale_type === 'operational';
      });

      if (salesError) throw salesError;
      setUserSales(filteredSales);

      // Load user products
      const { data: productsData, error: productsError } = await supabase
        .from('user_products')
        .select('id, product_id, name, size, price, payout, created_at, image_url, sku, expires_at')
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
      setError('Error loading user details: ' + err.message);
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
    setShowEditProfileModal(false);
    setShowSignaturePad(false);
  };

  useEffect(() => {
    return () => {
      if (localSignaturePreviewRef.current) {
        URL.revokeObjectURL(localSignaturePreviewRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setEditingProfile(createEditableProfile());
      setSignaturePreviewUrl(null);
      setSignatureBlob(null);
      return;
    }

    setEditingProfile(createEditableProfile(selectedUser));
    setSignaturePreviewUrl(selectedUser.signature_url || null);
    setSignatureBlob(null);
  }, [selectedUser]);

  useEffect(() => {
    if (!showSignaturePad || !signatureCanvasRef.current) {
      return;
    }

    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [showSignaturePad]);

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    const confirmMessage = `Are you sure you want to delete user "${selectedUser.email}"? This action cannot be undone and will remove all related files (signature, sales, contracts, labels).`;
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
          const filePath = extractStoragePath(selectedUser.signature_url, 'signatures') || '';
          
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
        throw new Error('Error loading sales: ' + salesError.message);
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
        throw new Error('Error deleting sales: ' + deleteSalesError.message);
      }

      // 4. Delete user products from database
      const { error: deleteProductsError } = await supabase
        .from('user_products')
        .delete()
        .eq('user_id', userId);

      if (deleteProductsError) {
        throw new Error('Error deleting products: ' + deleteProductsError.message);
      }

      // 5. Delete user profile from database
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (deleteProfileError) {
        throw new Error('Error deleting profile: ' + deleteProfileError.message);
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
      closeModal();
      await loadUsers();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setError('Error deleting user: ' + (err.message || err));
    } finally {
      setDeletingUser(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateProfileField = <K extends keyof EditableUserProfile>(field: K, value: EditableUserProfile[K]) => {
    setEditingProfile((prev) => ({ ...prev, [field]: value }));
  };

  const openEditProfileModal = () => {
    if (!selectedUser) return;
    setEditingProfile(createEditableProfile(selectedUser));
    setSignaturePreviewUrl(selectedUser.signature_url || null);
    setSignatureBlob(null);
    setRemovingSignature(false);
    setShowSignaturePad(false);
    setShowEditProfileModal(true);
  };

  const clearSignaturePad = () => {
    if (!signatureCanvasRef.current) return;
    const ctx = signatureCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, signatureCanvasRef.current.width, signatureCanvasRef.current.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, signatureCanvasRef.current.width, signatureCanvasRef.current.height);
  };

  const startSignature = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!signatureCanvasRef.current) return;
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    isDrawingSignatureRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const moveSignature = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!signatureCanvasRef.current || !isDrawingSignatureRef.current) return;
    e.preventDefault();
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endSignature = () => {
    isDrawingSignatureRef.current = false;
  };

  const saveSignaturePreview = () => {
    if (!signatureCanvasRef.current) return;
    setSavingSignaturePreview(true);

    signatureCanvasRef.current.toBlob((blob) => {
      if (!blob) {
        setError('Error creating signature image');
        setSavingSignaturePreview(false);
        return;
      }

      if (localSignaturePreviewRef.current) {
        URL.revokeObjectURL(localSignaturePreviewRef.current);
      }

      const objectUrl = URL.createObjectURL(blob);
      localSignaturePreviewRef.current = objectUrl;
      setSignatureBlob(blob);
      setSignaturePreviewUrl(objectUrl);
      setRemovingSignature(false);
      setShowSignaturePad(false);
      setSavingSignaturePreview(false);
    }, 'image/png', 0.95);
  };

  const removeSignaturePreview = () => {
    if (localSignaturePreviewRef.current) {
      URL.revokeObjectURL(localSignaturePreviewRef.current);
      localSignaturePreviewRef.current = null;
    }

    setSignatureBlob(null);
    setSignaturePreviewUrl(null);
    setRemovingSignature(true);
    setShowSignaturePad(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      setSavingProfile(true);
      setError(null);

      if (editingProfile.profile_type === 'Business' && !editingProfile.company_name.trim()) {
        throw new Error('Company name is required for business profile.');
      }

      if (editingProfile.profile_type === 'Business' && !editingProfile.ico.trim()) {
        throw new Error('IČO is required for business profile.');
      }

      if (editingProfile.profile_type === 'Business' && editingProfile.vat_type === 'VAT_PAYER' && !editingProfile.vat_number.trim()) {
        throw new Error('VAT number is required for VAT payer.');
      }

      let nextSignatureUrl = selectedUser.signature_url || null;
      const existingSignaturePath = extractStoragePath(selectedUser.signature_url, 'signatures');

      if (removingSignature && existingSignaturePath) {
        const { error: removeError } = await supabase.storage.from('signatures').remove([existingSignaturePath]);
        if (removeError) {
          console.warn('Error deleting signature:', removeError);
        }
        nextSignatureUrl = null;
      }

      if (signatureBlob) {
        if (existingSignaturePath) {
          const { error: removeError } = await supabase.storage.from('signatures').remove([existingSignaturePath]);
          if (removeError) {
            console.warn('Error deleting old signature:', removeError);
          }
        }

        const filePath = `${selectedUser.id}/${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from('signatures')
          .upload(filePath, signatureBlob, { cacheControl: '3600', upsert: true, contentType: 'image/png' });

        if (uploadError) {
          throw new Error('Error uploading signature: ' + uploadError.message);
        }

        const { data: publicUrlData } = supabase.storage.from('signatures').getPublicUrl(filePath);
        nextSignatureUrl = publicUrlData.publicUrl;
      }

      const payload = {
        id: selectedUser.id,
        first_name: editingProfile.first_name.trim() || null,
        last_name: editingProfile.last_name.trim() || null,
        profile_type: editingProfile.profile_type,
        vat_type: editingProfile.profile_type === 'Business' ? normalizeBusinessVatType(editingProfile.vat_type) : 'PRIVATE',
        company_name: editingProfile.profile_type === 'Business' ? editingProfile.company_name.trim() || null : null,
        vat_number: editingProfile.profile_type === 'Business' && editingProfile.vat_type === 'VAT_PAYER' ? editingProfile.vat_number.trim() || null : null,
        address: editingProfile.address.trim() || null,
        popisne_cislo: editingProfile.popisne_cislo.trim() || null,
        psc: editingProfile.psc.trim() || null,
        mesto: editingProfile.mesto.trim() || null,
        krajina: editingProfile.krajina.trim() || 'Slovakia',
        email: editingProfile.email.trim() || selectedUser.email,
        telephone: editingProfile.telephone.trim() || null,
        iban: editingProfile.iban.trim() || null,
        ico: editingProfile.profile_type === 'Business' ? editingProfile.ico.trim() || null : null,
        signature_url: nextSignatureUrl
      };

      const { error: profileError } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
      if (profileError) {
        throw new Error('Error saving profile: ' + profileError.message);
      }

      const updatedUser: UserProfile = {
        ...selectedUser,
        first_name: payload.first_name || undefined,
        last_name: payload.last_name || undefined,
        profile_type: payload.profile_type || undefined,
        vat_type: payload.vat_type || undefined,
        company_name: payload.company_name || undefined,
        vat_number: payload.vat_number || undefined,
        address: payload.address || undefined,
        popisne_cislo: payload.popisne_cislo || undefined,
        psc: payload.psc || undefined,
        mesto: payload.mesto || undefined,
        krajina: payload.krajina || undefined,
        email: payload.email,
        telephone: payload.telephone || undefined,
        iban: payload.iban || undefined,
        ico: payload.ico || undefined,
        signature_url: nextSignatureUrl || undefined,
      };

      setSelectedUser(updatedUser);
      setUsers((prev) => prev.map((user) => user.id === selectedUser.id ? updatedUser : user));
      setShowEditProfileModal(false);
      setSignatureBlob(null);
      setRemovingSignature(false);
      setShowSignaturePad(false);
      await loadUserDetails(selectedUser.id);
    } catch (err: any) {
      setError(err.message || 'Error saving profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const filteredUsers = users.filter(user =>
    [user.email, user.first_name, user.last_name].some(field =>
      field?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading users</h3>
          <p className="text-sm text-gray-500">Please wait...</p>
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
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-400 to-blue-500 rounded-2xl shadow-lg">
                <FaUsers className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  User Management
                </h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Catalog and user management</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm disabled:opacity-50"
              >
                <FaSync className={`sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm"
              >
                <FaSignOutAlt className="sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-8">
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
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-sm sm:shadow-2xl overflow-hidden">
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Users ({filteredUsers.length})</h3>
                <p className="text-gray-600 text-xs sm:text-sm mt-1">Manage and overview of users</p>
              </div>
              <div className="flex items-center">
                <div className="relative w-full sm:w-auto">
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full sm:w-72 pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden p-2 sm:p-3 space-y-2">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-all cursor-pointer"
                onClick={() => handleUserSelect(user)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                    <FaUser className="text-white text-sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 truncate mb-0.5">{user.email}</h4>
                    {user.first_name || user.last_name ? (
                      <p className="text-xs text-gray-600 mb-1 truncate">
                        {`${user.first_name || ''} ${user.last_name || ''}`.trim()}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium ${
                        user.profile_type === 'Business' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.profile_type || 'N/A'}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-mono bg-gray-100 text-gray-500">
                        {user.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                  <FaInfoCircle className="text-gray-400 text-sm flex-shrink-0" />
                </div>
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
                        user.profile_type === 'Business' ? 'bg-gray-100 text-blue-800' : 'bg-gray-100 text-gray-800'
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
                        Details
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
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No users</h3>
              <p className="text-sm sm:text-base text-gray-600">
                {searchTerm ? 'No users found for your search' : 'No users have been added yet'}
              </p>
            </div>
          )}
        </div>

        {/* Enhanced Modal for User Details */}
        {selectedUser && (
          <AdminDetailSheet
            zIndex="z-[60]"
            maxWidth="6xl"
            onBackdropClick={closeModal}
            contentClassName="p-0"
            header={(
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4 flex-1 min-w-0 pr-2">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 flex-shrink-0">
                    <FaUser className="text-gray-900 text-sm sm:text-base lg:text-xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base lg:text-xl font-bold text-gray-900 truncate">
                      {selectedUser.first_name || selectedUser.last_name ? 
                        `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() : 
                        'User'
                      }
                    </h3>
                    <p className="text-gray-600 text-xs sm:text-sm break-all">{selectedUser.email}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                  <button
                    onClick={handleDeleteUser}
                    disabled={deletingUser}
                    className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm sm:shadow-lg"
                    title="Delete user"
                  >
                    {deletingUser ? (
                      <svg className="animate-spin w-5 h-5 sm:w-6 sm:h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <FaTrash className="w-5 h-5 sm:w-6 sm:h-6" />
                    )}
                  </button>
                  <button
                    onClick={closeModal}
                    disabled={deletingUser}
                    className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-gray-800 hover:bg-gray-900 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm sm:shadow-lg"
                    aria-label="Close"
                  >
                    <FaTimes className="w-5 h-5 sm:w-7 sm:h-7" />
                  </button>
                </div>
              </div>
            )}
          >
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
                <div className="p-2 sm:p-3 lg:p-4 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
                    <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-blue-500/10 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <FaShoppingCart className="text-blue-600 text-xs sm:text-sm lg:text-base" />
                      </div>
                      <p className="text-sm sm:text-base lg:text-xl font-bold text-gray-900">{userStats.totalSales}</p>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs text-gray-600 mt-0.5 sm:mt-1">Sales</p>
                    </div>
                    <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-green-500/10 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <FaEuroSign className="text-green-600 text-xs sm:text-sm lg:text-base" />
                      </div>
                      <p className="text-xs sm:text-sm lg:text-xl font-bold text-gray-900 truncate">{formatCurrency(userStats.totalRevenue)}</p>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs text-gray-600 mt-0.5 sm:mt-1">Revenue</p>
                    </div>
                    <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-purple-500/10 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <FaChartLine className="text-purple-600 text-xs sm:text-sm lg:text-base" />
                      </div>
                      <p className="text-xs sm:text-sm lg:text-xl font-bold text-gray-900 truncate">{formatCurrency(userStats.totalPayout)}</p>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs text-gray-600 mt-0.5 sm:mt-1">Payout</p>
                    </div>
                    <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-orange-500/10 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <FaBox className="text-orange-600 text-xs sm:text-sm lg:text-base" />
                      </div>
                      <p className="text-sm sm:text-base lg:text-xl font-bold text-gray-900">{userStats.totalProducts}</p>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs text-gray-600 mt-0.5 sm:mt-1">Products</p>
                    </div>
                    <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-green-500/10 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm sm:text-base lg:text-xl font-bold text-gray-900">{userStats.completedSales}</p>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs text-gray-600 mt-0.5 sm:mt-1">Completed</p>
                    </div>
                    <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 text-center border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-yellow-500/10 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-1 sm:mb-2">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm sm:text-base lg:text-xl font-bold text-gray-900">{userStats.pendingSales}</p>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs text-gray-600 mt-0.5 sm:mt-1">Pending</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Navigation */}
              <div className="sticky top-0 z-10 grid grid-cols-4 border-b border-gray-200 bg-gray-50 flex-shrink-0 sm:flex sm:overflow-x-auto">
                {[
                  { id: 'info', label: 'Info', icon: FaUser },
                  { id: 'sales', label: 'Sales', icon: FaShoppingCart },
                  { id: 'products', label: 'Products', icon: FaBox },
                  { id: 'operations', label: 'Operations', icon: FaChartBar }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1.5 py-2.5 font-semibold transition-all duration-200 text-[11px] sm:flex-row sm:px-3 sm:py-2.5 sm:text-sm lg:px-6 lg:py-4 ${
                      activeTab === tab.id
                        ? 'text-gray-900 border-b-2 border-indigo-500 bg-white'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <tab.icon className="text-sm sm:text-sm lg:mr-2" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden truncate">{tab.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="p-3 sm:p-3 lg:p-6 overflow-y-auto">
                {loadingUserData ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-indigo-500 rounded-full animate-spin"></div>
                    <span className="ml-3 text-gray-700">Loading data...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeTab === 'info' && (
                      <div className="space-y-4">
                        <div className="flex justify-end">
                          <button
                            onClick={openEditProfileModal}
                            className="inline-flex w-full items-center justify-center px-3 py-2.5 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-sm sm:w-auto sm:py-2"
                          >
                            <FaEdit className="mr-2" />
                            Edit Profile
                          </button>
                        </div>
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
                                <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Phone</p>
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
                            {selectedUser.profile_type === 'Business' && (
                              <>
                                <div className="flex items-start sm:items-center">
                                  <FaBuilding className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Company</p>
                                    <p className="text-sm sm:text-base font-semibold break-words">{selectedUser.company_name || 'N/A'}</p>
                                  </div>
                                </div>
                                <div className="flex items-start sm:items-center">
                                  <FaBuilding className="text-gray-600 mr-2 sm:mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Company ID</p>
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
                                  {selectedUser.address || selectedUser.popisne_cislo ? `${selectedUser.address || ''} ${selectedUser.popisne_cislo || ''}`.trim() : 'N/A'}
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
                                <p className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Postal Code</p>
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
                                <p className="text-xs text-gray-600 uppercase tracking-wider mb-1.5 sm:mb-2">Signature</p>
                                {selectedUser.signature_url ? (
                                  <div className="border border-gray-300 rounded-xl p-2 sm:p-3 bg-white">
                                    <img loading="lazy" src={selectedUser.signature_url} alt="Signature" className="max-w-full h-20 sm:h-24 object-contain" />
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500 italic">Signature not uploaded</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'sales' && (
                      <div>
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                          <h4 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900">Sales ({userSales.length})</h4>
                          <button
                            onClick={() => setShowCreateSaleModal(true)}
                            className="inline-flex items-center px-2 py-1.5 sm:px-3 sm:py-2 bg-black text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-sm transform hover:scale-105"
                            title="Create new sale"
                          >
                            <FaPlus className="text-xs sm:text-sm sm:mr-1.5" />
                            <span className="hidden sm:inline">New sale</span>
                          </button>
                        </div>
                        {userSales.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {userSales.map((sale) => (
                              <div 
                                key={sale.id} 
                                onClick={() => setSelectedSaleForStatus(sale)}
                                className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all shadow-sm cursor-pointer"
                              >
                                <div className="flex items-start space-x-3 mb-3">
                                  <div className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5">
                                    <img
                                      loading="lazy"
                                      className="h-full w-full object-contain"
                                      src={sale.image_url || '/default-image.png'}
                                      alt={sale.name}
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.src = '/default-image.png';
                                      }}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h5 className="text-sm sm:text-base font-semibold text-gray-900 truncate mb-1">{sale.name}</h5>
                                    <div className="flex items-center space-x-1.5 mb-1.5">
                                      <SalesStatusBadge status={sale.status} />
                                      {sale.is_manual && (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-blue-500 text-white" title="Manual sale">
                                          M
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-600">Size: {sale.size}</p>
                                    <p className="text-xs text-gray-500 font-mono truncate">SKU: {sale.sku || 'N/A'}</p>
                                  </div>
                                </div>
                                <div className="border-t border-gray-200 pt-3 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600">Price:</span>
                                    <span className="text-sm sm:text-base font-bold text-gray-900">{formatCurrency(sale.price)}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600">Payout:</span>
                                    <span className="text-sm font-semibold text-green-600">{formatCurrency(sale.payout)}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">Date:</span>
                                    <span className="text-xs text-gray-600">{formatDate(sale.created_at)}</span>
                                  </div>
                                  {sale.external_id && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-gray-500">External ID:</span>
                                      <span className="text-xs text-gray-700 font-mono truncate max-w-[120px]">{sale.external_id}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                              <FaShoppingCart className="text-gray-400 text-2xl" />
                            </div>
                            <p className="text-sm sm:text-base text-gray-600 font-medium">No sales</p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'products' && (
                      <div>
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                          <h4 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900">Products ({userProducts.length})</h4>
                          <button
                            onClick={() => setShowBulkImportModal(true)}
                            className="inline-flex items-center px-2 py-1.5 sm:px-3 sm:py-2 bg-black text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-sm transform hover:scale-105"
                            title="Bulk import products from XLSX/CSV"
                          >
                            <FaUpload className="text-xs sm:text-sm sm:mr-1.5" />
                            <span className="hidden sm:inline">Bulk Import</span>
                          </button>
                        </div>
                        {userProducts.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {userProducts.map((product) => {
                              const isExpired = product.expires_at ? new Date(product.expires_at) < new Date() : false;
                              return (
                                <div key={product.id} className={`bg-white rounded-xl p-3 sm:p-4 border transition-all shadow-sm ${isExpired ? 'border-rose-200 bg-rose-50/10' : 'border-gray-200 hover:border-indigo-300 hover:shadow-lg'}`}>
                                  <div className="flex items-start space-x-3 mb-3">
                                    <div className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5">
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
                                      <div className="flex items-center justify-between gap-1 mb-1">
                                        <h5 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{product.name}</h5>
                                        {isExpired ? (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 flex-shrink-0">Expired</span>
                                        ) : (
                                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex-shrink-0">Active</span>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-600">Size: {product.size}</p>
                                      <p className="text-xs text-gray-500 font-mono truncate">SKU: {product.sku || 'N/A'}</p>
                                    </div>
                                  </div>
                                  <div className="border-t border-gray-200 pt-3 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-gray-600">Price:</span>
                                      <span className="text-sm sm:text-base font-bold text-gray-900">{formatCurrency(product.price)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-gray-600">Payout:</span>
                                      <span className="text-sm font-semibold text-green-600">{formatCurrency(product.payout)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-gray-500">Created:</span>
                                      <span className="text-xs text-gray-600">{formatDate(product.created_at)}</span>
                                    </div>
                                    {product.expires_at && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">Expires:</span>
                                        <span className={`text-xs font-semibold ${isExpired ? 'text-rose-600' : 'text-gray-700'}`}>
                                          {new Date(product.expires_at).toLocaleDateString('sk-SK')}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                              <FaBox className="text-gray-400 text-2xl" />
                            </div>
                            <p className="text-sm sm:text-base text-gray-600 font-medium">No products</p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'operations' && (
                      <div>
                        <h4 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Operation history ({userOperations.length})</h4>
                        {loadingOperations ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-4 border-gray-300 border-t-indigo-500 rounded-full animate-spin"></div>
                            <span className="ml-3 text-gray-700 text-sm">Loading operations...</span>
                          </div>
                        ) : userOperations.length > 0 ? (
                          <div className="space-y-3">
                            {userOperations.map((op) => (
                              <div key={op.id} className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200 hover:shadow-md transition-shadow shadow-sm">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm sm:text-base font-semibold text-gray-900 truncate">{op.user_sales?.name || 'N/A'}</p>
                                    <div className="flex items-center space-x-2 mt-1.5">
                                      <SalesStatusBadge status={op.old_status} />
                                      <span className="text-gray-400 text-xs">→</span>
                                      <SalesStatusBadge status={op.new_status} />
                                    </div>
                                  </div>
                                  <p className="text-xs text-gray-500 ml-2 flex-shrink-0">{formatDate(op.created_at)}</p>
                                </div>
                                {op.notes && (
                                  <div className="mt-2 pt-2 border-t border-gray-100">
                                    <p className="text-xs text-gray-600 italic">Note: {op.notes}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                              <FaChartBar className="text-gray-400 text-2xl" />
                            </div>
                            <p className="text-sm sm:text-base text-gray-600 font-medium">No operations</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sale Status Manager Modal */}
              {selectedSaleForStatus && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-[70]">
                  <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between p-3 sm:p-4 lg:p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 truncate">Sale management</h3>
                        <p className="text-xs sm:text-sm text-gray-600 mt-0.5 truncate">{selectedSaleForStatus.name}</p>
                      </div>
                      <button
                        onClick={() => setSelectedSaleForStatus(null)}
                        className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center bg-gray-800 hover:bg-gray-900 text-white rounded-xl transition-colors flex-shrink-0 shadow-lg"
                        aria-label="Close"
                      >
                        <FaTimes className="w-6 h-6 sm:w-7 sm:h-7" />
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
                        onSaleUpdate={() => {
                          if (selectedUser) {
                            loadUserDetails(selectedUser.id);
                          }
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

              {showEditProfileModal && selectedUser && (
                <AdminDetailSheet
                  zIndex="z-[80]"
                  maxWidth="4xl"
                  onBackdropClick={() => setShowEditProfileModal(false)}
                  desktopMaxHeight="sm:max-h-[95vh]"
                  contentClassName="p-0"
                  header={(
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 pr-3">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900">Edit User Profile</h3>
                        <p className="text-sm text-gray-600 break-all">{selectedUser.email}</p>
                      </div>
                      <button
                        onClick={() => setShowEditProfileModal(false)}
                        className="w-10 h-10 sm:w-11 sm:h-11 flex flex-shrink-0 items-center justify-center bg-gray-800 hover:bg-gray-900 text-white rounded-xl transition-colors"
                      >
                        <FaTimes className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>
                    </div>
                  )}
                  footer={(
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
                      <button type="button" onClick={() => setShowEditProfileModal(false)} className="px-4 py-2.5 text-gray-800 font-medium rounded-xl hover:bg-gray-100 border border-gray-300">Cancel</button>
                      <button type="submit" form="admin-edit-user-profile-form" disabled={savingProfile} className="inline-flex items-center justify-center px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-50">
                        {savingProfile ? 'Saving...' : 'Save Profile'}
                      </button>
                    </div>
                  )}
                >
                    <form id="admin-edit-user-profile-form" onSubmit={handleSaveProfile} className="p-3 sm:p-6 space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">First Name</label>
                          <input value={editingProfile.first_name} onChange={(e) => updateProfileField('first_name', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Last Name</label>
                          <input value={editingProfile.last_name} onChange={(e) => updateProfileField('last_name', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Email</label>
                          <input type="email" value={editingProfile.email} onChange={(e) => updateProfileField('email', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Phone</label>
                          <input value={editingProfile.telephone} onChange={(e) => updateProfileField('telephone', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Profile Type</label>
                          <div className="relative">
                            <select
                              value={editingProfile.profile_type}
                              onChange={(e) => setEditingProfile((prev) => ({ ...prev, profile_type: e.target.value as 'Personal' | 'Business', vat_type: e.target.value === 'Business' ? normalizeBusinessVatType(prev.vat_type) : '' }))}
                              className={selectInputClass}
                            >
                              <option value="Personal">Personal</option>
                              <option value="Business">Business</option>
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
                              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                              </svg>
                            </span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">IBAN</label>
                          <input value={editingProfile.iban} onChange={(e) => updateProfileField('iban', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                        </div>
                        {editingProfile.profile_type === 'Business' && (
                          <>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900 mb-2">Company Name</label>
                              <input value={editingProfile.company_name} onChange={(e) => updateProfileField('company_name', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900 mb-2">VAT payer status</label>
                              <div className="relative">
                                <select value={editingProfile.vat_type} onChange={(e) => updateProfileField('vat_type', e.target.value)} className={selectInputClass}>
                                  <option value="NO_VAT">No VAT payer</option>
                                  <option value="VAT_PAYER">VAT payer</option>
                                </select>
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
                                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                  </svg>
                                </span>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900 mb-2">IČO</label>
                              <input value={editingProfile.ico} onChange={(e) => updateProfileField('ico', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900 mb-2">VAT Number</label>
                              <input value={editingProfile.vat_number} onChange={(e) => updateProfileField('vat_number', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Address</label>
                          <input value={editingProfile.address} onChange={(e) => updateProfileField('address', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Building No.</label>
                          <input value={editingProfile.popisne_cislo} onChange={(e) => updateProfileField('popisne_cislo', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">City</label>
                          <input value={editingProfile.mesto} onChange={(e) => updateProfileField('mesto', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Postal Code</label>
                          <input value={editingProfile.psc} onChange={(e) => updateProfileField('psc', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Country</label>
                          <div className="relative">
                            <select
                              value={editingProfile.krajina}
                              onChange={(e) => updateProfileField('krajina', e.target.value)}
                              className={selectInputClass}
                            >
                              <option value="Slovakia">Slovakia</option>
                              <option value="Czech Republic">Czech Republic</option>
                              <option value="Poland">Poland</option>
                              <option value="Hungary">Hungary</option>
                              <option value="Romania">Romania</option>
                              <option value="Austria">Austria</option>
                              <option value="Belgium">Belgium</option>
                              <option value="Bulgaria">Bulgaria</option>
                              <option value="Croatia">Croatia</option>
                              <option value="Cyprus">Cyprus</option>
                              <option value="Denmark">Denmark</option>
                              <option value="Estonia">Estonia</option>
                              <option value="Finland">Finland</option>
                              <option value="France">France</option>
                              <option value="Germany">Germany</option>
                              <option value="Greece">Greece</option>
                              <option value="Ireland">Ireland</option>
                              <option value="Italy">Italy</option>
                              <option value="Latvia">Latvia</option>
                              <option value="Lithuania">Lithuania</option>
                              <option value="Luxembourg">Luxembourg</option>
                              <option value="Malta">Malta</option>
                              <option value="Netherlands">Netherlands</option>
                              <option value="Portugal">Portugal</option>
                              <option value="Slovenia">Slovenia</option>
                              <option value="Spain">Spain</option>
                              <option value="Sweden">Sweden</option>
                              <option value="United Kingdom">United Kingdom</option>
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
                              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-200 p-4 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">Signature</h4>
                            <p className="text-sm text-gray-600">Add, replace, or remove the user signature here.</p>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <button type="button" onClick={() => setShowSignaturePad((prev) => !prev)} className="px-4 py-2 text-sm font-medium bg-gray-100 rounded-xl hover:bg-gray-200">
                              {showSignaturePad ? 'Hide pad' : 'Draw signature'}
                            </button>
                            {signaturePreviewUrl && (
                              <button type="button" onClick={removeSignaturePreview} className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-xl hover:bg-red-100">
                                Remove
                              </button>
                            )}
                          </div>
                        </div>

                        {signaturePreviewUrl ? (
                          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <img src={signaturePreviewUrl} alt="Signature preview" className="h-24 max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">Signature not uploaded.</div>
                        )}

                        {showSignaturePad && (
                          <div className="space-y-3">
                            <canvas
                              ref={signatureCanvasRef}
                              width={700}
                              height={220}
                              onMouseDown={startSignature}
                              onMouseMove={moveSignature}
                              onMouseUp={endSignature}
                              onMouseLeave={endSignature}
                              onTouchStart={startSignature}
                              onTouchMove={moveSignature}
                              onTouchEnd={endSignature}
                              className="w-full rounded-xl border border-gray-300 bg-white touch-none"
                            />
                            <div className="flex justify-end gap-2 flex-wrap">
                              <button type="button" onClick={clearSignaturePad} className="px-4 py-2 text-sm font-medium bg-gray-100 rounded-xl hover:bg-gray-200">Clear</button>
                              <button type="button" onClick={saveSignaturePreview} disabled={savingSignaturePreview} className="px-4 py-2 text-sm font-medium text-white bg-black rounded-xl hover:bg-gray-800 disabled:opacity-50">
                                {savingSignaturePreview ? 'Saving...' : 'Use signature'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </form>
                </AdminDetailSheet>
              )}
          </AdminDetailSheet>
        )}

        {/* Create Sale Modal */}
        <CreateSaleModal
          isOpen={showCreateSaleModal}
          onClose={() => setShowCreateSaleModal(false)}
          onSaleCreated={async () => {
            setShowCreateSaleModal(false);
            // Reload user details to get updated sales
            if (selectedUser) {
              await loadUserDetails(selectedUser.id);
            }
          }}
          preSelectedUserId={selectedUser?.id}
          preSelectedUserEmail={selectedUser?.email}
        />

        {/* Bulk Product Import Modal */}
        {selectedUser && (
          <BulkProductImportModal
            isOpen={showBulkImportModal}
            onClose={() => setShowBulkImportModal(false)}
            userId={selectedUser.id}
            userEmail={selectedUser.email}
            onImportComplete={async () => {
              if (selectedUser) {
                await loadUserDetails(selectedUser.id);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
