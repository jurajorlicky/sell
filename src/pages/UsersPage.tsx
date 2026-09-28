import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { formatDate, formatCurrency } from '../lib/utils';
import { useToast } from '../components/Toast';
import { downloadXlsx, exportDateStamp } from '../lib/xlsxExport';
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
  FaUpload,
  FaCopy,
  FaCheck,
  FaCheckCircle,
  FaDownload,
  FaExternalLinkAlt,
  FaFileContract,
  FaFileInvoice,
  FaTruck,
  FaMoneyBillWave,
  FaPaperPlane,
  FaFilter,
  FaSortAmountDown,
  FaSortAmountUp,
  FaClock,
  FaChevronRight
} from 'react-icons/fa';

export interface UserProfile {
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
  discord?: string;
  signature_url?: string;
  updated_at?: string;
}

export interface UserSale {
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
  fa_url?: string;
  delivered_at?: string;
  payout_date?: string;
}

export interface UserProduct {
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

interface UserMetrics {
  totalSales: number;
  completedSales: number;
  pendingSales: number;
  totalRevenue: number;
  totalPayout: number;
  pendingPayout: number;
  totalProducts: number;
  activeProducts: number;
  expiredProducts: number;
  totalProductsValue: number;
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

type UserFilterType = 'all' | 'business' | 'personal' | 'missing_iban' | 'missing_signature' | 'incomplete' | 'has_products' | 'has_sales';
type UserSortType = 'name' | 'email' | 'sales' | 'products' | 'payout' | 'incomplete';

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
  discord: user?.discord || '',
});

const formatIban = (iban?: string | null): string => {
  if (!iban) return '';
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
};

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

const getUserInitials = (user: UserProfile): string => {
  const f = user.first_name?.trim() || '';
  const l = user.last_name?.trim() || '';
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (user.company_name) return user.company_name.slice(0, 2).toUpperCase();
  if (user.email) return user.email.slice(0, 2).toUpperCase();
  return 'AK';
};

const USERS_PER_PAGE = 25;

export default function UsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [salesSummaryMap, setSalesSummaryMap] = useState<Record<string, { count: number; payout: number }>>({});
  const [productsSummaryMap, setProductsSummaryMap] = useState<Record<string, { count: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<UserFilterType>('all');
  const [sortBy, setSortBy] = useState<UserSortType>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Selected User Modal state
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userSales, setUserSales] = useState<UserSale[]>([]);
  const [userProducts, setUserProducts] = useState<UserProduct[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'sales' | 'products' | 'payouts' | 'operations'>('info');
  const [userOperations, setUserOperations] = useState<any[]>([]);
  const [loadingOperations, setLoadingOperations] = useState(false);

  // Inner modals
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

  // Filters within modal tabs
  const [salesStatusFilter, setSalesStatusFilter] = useState<string>('all');
  const [productsStatusFilter, setProductsStatusFilter] = useState<'all' | 'active' | 'expired'>('all');

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingSignatureRef = useRef(false);
  const localSignaturePreviewRef = useRef<string | null>(null);

  // Load all users and summary counters
  const loadUsers = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      const [profilesRes, salesRes, productsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            id, first_name, last_name, profile_type, vat_type, company_name, vat_number, 
            address, popisne_cislo, psc, mesto, krajina, email, telephone, iban, ico, discord, signature_url, updated_at
          `)
          .order('first_name', { ascending: true })
          .limit(500),
        supabase
          .from('user_sales')
          .select('user_id, payout, status'),
        supabase
          .from('user_products')
          .select('user_id, id')
      ]);

      if (profilesRes.error) throw profilesRes.error;
      setUsers(profilesRes.data || []);

      // Build sales summary map
      if (!salesRes.error && salesRes.data) {
        const sMap: Record<string, { count: number; payout: number }> = {};
        for (const s of salesRes.data) {
          if (!s.user_id) continue;
          if (!sMap[s.user_id]) sMap[s.user_id] = { count: 0, payout: 0 };
          sMap[s.user_id].count++;
          if (s.status !== 'cancelled' && s.status !== 'returned') {
            sMap[s.user_id].payout += Number(s.payout || 0);
          }
        }
        setSalesSummaryMap(sMap);
      }

      // Build products summary map
      if (!productsRes.error && productsRes.data) {
        const pMap: Record<string, { count: number }> = {};
        for (const p of productsRes.data) {
          if (!p.user_id) continue;
          if (!pMap[p.user_id]) pMap[p.user_id] = { count: 0 };
          pMap[p.user_id].count++;
        }
        setProductsSummaryMap(pMap);
      }

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
      
      const [salesRes, productsRes] = await Promise.all([
        supabase
          .from('user_sales')
          .select('id, product_id, name, size, price, payout, created_at, status, image_url, sku, external_id, is_manual, sale_type, tracking_url, label_url, contract_url, fa_url, delivered_at, payout_date')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_products')
          .select('id, product_id, name, size, price, payout, created_at, image_url, sku, expires_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      ]);
      
      if (salesRes.error) throw salesRes.error;
      const filteredSales = (salesRes.data || []).filter(sale => !sale.sale_type || sale.sale_type === 'operational');
      setUserSales(filteredSales);

      if (productsRes.error) throw productsRes.error;
      setUserProducts(productsRes.data || []);

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
    setSalesStatusFilter('all');
    setProductsStatusFilter('all');
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

  const closeModal = () => {
    setSelectedUser(null);
    setUserSales([]);
    setUserProducts([]);
    setUserOperations([]);
    setActiveTab('info');
    setShowEditProfileModal(false);
    setShowSignaturePad(false);
  };

  const copyToClipboard = (text: string, successMessage: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(successMessage, 'success');
  };

  const copyBillingDetails = (user: UserProfile) => {
    const lines = [
      `Meno / Firma: ${user.company_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email}`,
      user.ico ? `IČO: ${user.ico}` : null,
      user.vat_number ? `IČ DPH / DIČ: ${user.vat_number}` : null,
      user.profile_type === 'Business' ? `DPH: ${user.vat_type === 'VAT_PAYER' ? 'Platca DPH' : 'Neplatca DPH'}` : null,
      `Adresa: ${[user.address, user.popisne_cislo].filter(Boolean).join(' ')}, ${user.psc || ''} ${user.mesto || ''}, ${user.krajina || 'Slovakia'}`.trim(),
      user.telephone ? `Telefón: ${user.telephone}` : null,
      `Email: ${user.email}`,
      user.iban ? `IBAN: ${formatIban(user.iban)}` : 'IBAN: chýba',
    ].filter(Boolean).join('\n');

    copyToClipboard(lines, 'Fakturačné údaje skopírované do schránky');
  };

  const handleExtendProduct = async (productId: string) => {
    try {
      const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: updateErr } = await supabase
        .from('user_products')
        .update({ expires_at: newExpiresAt })
        .eq('id', productId);
      if (updateErr) throw updateErr;
      setUserProducts(prev => prev.map(p => p.id === productId ? { ...p, expires_at: newExpiresAt } : p));
      showToast('Ponuka predĺžená o 30 dní', 'success');
    } catch (err: any) {
      showToast('Chyba: ' + err.message, 'error');
    }
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!confirm(`Naozaj chcete vymazať ponuku "${productName}" z trhu?`)) return;
    try {
      const { error: delErr } = await supabase
        .from('user_products')
        .delete()
        .eq('id', productId);
      if (delErr) throw delErr;
      setUserProducts(prev => prev.filter(p => p.id !== productId));
      showToast('Ponuka bola zmazaná', 'success');
    } catch (err: any) {
      showToast('Chyba pri mazaní ponuky: ' + err.message, 'error');
    }
  };

  const handleMarkSaleCompleted = async (saleId: string) => {
    try {
      const { error: updateErr } = await supabase
        .from('user_sales')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', saleId);
      if (updateErr) throw updateErr;
      setUserSales(prev => prev.map(s => s.id === saleId ? { ...s, status: 'completed' } : s));
      showToast('Predaj označený ako vyplatený (Completed)', 'success');
    } catch (err: any) {
      showToast('Chyba: ' + err.message, 'error');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    const userId = selectedUser.id;
    const userEmail = selectedUser.email;

    if (!confirm(`Naozaj chcete zmazať používateľa ${userEmail}? Táto akcia vymaže jeho profil a všetky naviazané dáta!`)) {
      return;
    }

    try {
      setDeletingUser(true);
      setError(null);

      if (selectedUser.signature_url) {
        const sigPath = extractStoragePath(selectedUser.signature_url, 'signatures');
        if (sigPath) {
          await supabase.storage.from('signatures').remove([sigPath]);
        }
      }

      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (deleteProfileError) throw deleteProfileError;

      try {
        await supabase.functions.invoke('delete-user', { body: { userId } });
      } catch (e) {
        // non-fatal edge function error
      }

      showToast(`Používateľ ${userEmail} bol zmazaný`, 'success');
      closeModal();
      await loadUsers();
    } catch (err: any) {
      setError('Chyba pri mazaní: ' + (err.message || err));
      showToast('Chyba pri mazaní používateľa', 'error');
    } finally {
      setDeletingUser(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Edit profile functions
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
        throw new Error('Názov spoločnosti je povinný pre firemný profil.');
      }
      if (editingProfile.profile_type === 'Business' && !editingProfile.ico.trim()) {
        throw new Error('IČO je povinné pre firemný profil.');
      }
      if (editingProfile.profile_type === 'Business' && editingProfile.vat_type === 'VAT_PAYER' && !editingProfile.vat_number.trim()) {
        throw new Error('IČ DPH je povinné pre platcu DPH.');
      }

      let nextSignatureUrl = selectedUser.signature_url || null;
      const existingSignaturePath = extractStoragePath(selectedUser.signature_url, 'signatures');

      if (removingSignature && existingSignaturePath) {
        await supabase.storage.from('signatures').remove([existingSignaturePath]);
        nextSignatureUrl = null;
      }

      if (signatureBlob) {
        if (existingSignaturePath) {
          await supabase.storage.from('signatures').remove([existingSignaturePath]);
        }

        const filePath = `${selectedUser.id}/${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from('signatures')
          .upload(filePath, signatureBlob, { cacheControl: '3600', upsert: true, contentType: 'image/png' });

        if (uploadError) throw uploadError;

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
        iban: editingProfile.iban.trim() ? editingProfile.iban.replace(/\s+/g, '').toUpperCase() : null,
        ico: editingProfile.profile_type === 'Business' ? editingProfile.ico.trim() || null : null,
        discord: editingProfile.discord.trim() || null,
        signature_url: nextSignatureUrl
      };

      const { error: profileError } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
      if (profileError) throw profileError;

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
        discord: payload.discord || undefined,
        signature_url: nextSignatureUrl || undefined,
      };

      setSelectedUser(updatedUser);
      setUsers((prev) => prev.map((u) => u.id === selectedUser.id ? updatedUser : u));
      setShowEditProfileModal(false);
      setSignatureBlob(null);
      setRemovingSignature(false);
      setShowSignaturePad(false);
      showToast('Profil používateľa bol úspešne uložený', 'success');
      await loadUserDetails(selectedUser.id);
    } catch (err: any) {
      setError(err.message || 'Error saving profile');
      showToast('Chyba pri ukladaní profilu: ' + err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Export users to XLSX
  const exportUsersToXlsx = async () => {
    try {
      await downloadXlsx({
        fileName: `pouzivatelia_${exportDateStamp()}.xlsx`,
        sheetName: 'Používatelia',
        rows: filteredUsers,
        columns: [
          { header: 'ID', value: u => u.id, width: 36 },
          { header: 'Email', value: u => u.email, width: 28 },
          { header: 'Meno', value: u => u.first_name || '', width: 16 },
          { header: 'Priezvisko', value: u => u.last_name || '', width: 18 },
          { header: 'Telefón', value: u => u.telephone || '', width: 16 },
          { header: 'Typ profilu', value: u => u.profile_type || 'Personal', width: 14 },
          { header: 'Spoločnosť', value: u => u.company_name || '', width: 24 },
          { header: 'IČO', value: u => u.ico || '', width: 14 },
          { header: 'DIČ / IČ DPH', value: u => u.vat_number || '', width: 16 },
          { header: 'Platca DPH', value: u => u.vat_type === 'VAT_PAYER' ? 'Áno' : 'Nie', width: 12 },
          { header: 'IBAN', value: u => u.iban || '', width: 26 },
          { header: 'Ulica', value: u => [u.address, u.popisne_cislo].filter(Boolean).join(' '), width: 24 },
          { header: 'Mesto', value: u => u.mesto || '', width: 18 },
          { header: 'PSČ', value: u => u.psc || '', width: 10 },
          { header: 'Krajina', value: u => u.krajina || 'Slovakia', width: 14 },
          { header: 'Podpis nahraný', value: u => u.signature_url ? 'Áno' : 'Nie', width: 14 },
          { header: 'Predaje (počet)', value: u => salesSummaryMap[u.id]?.count || 0, width: 14 },
          { header: 'Výplaty spolu (€)', value: u => salesSummaryMap[u.id]?.payout || 0, width: 16 },
          { header: 'Ponuky na trhu', value: u => productsSummaryMap[u.id]?.count || 0, width: 14 },
        ]
      });
      showToast('Zoznam používateľov bol úspešne exportovaný', 'success');
    } catch (err: any) {
      showToast('Chyba pri exporte: ' + err.message, 'error');
    }
  };

  // Copy all filtered emails
  const copyAllFilteredEmails = () => {
    const emails = Array.from(new Set(filteredUsers.map(u => u.email).filter(Boolean))).join(', ');
    if (!emails) {
      showToast('Žiadne emaily na kopírovanie', 'info');
      return;
    }
    copyToClipboard(emails, `Skopírovaných ${filteredUsers.length} emailov do schránky`);
  };

  // Filtered & Sorted Users
  const filteredUsers = useMemo(() => {
    let result = users.filter((user) => {
      // Search match
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matches = [
          user.email,
          user.first_name,
          user.last_name,
          user.telephone,
          user.company_name,
          user.ico,
          user.iban,
          user.mesto
        ].some(field => field?.toLowerCase().includes(query));
        if (!matches) return false;
      }

      // Filter pills
      if (filterType === 'business') return user.profile_type === 'Business';
      if (filterType === 'personal') return user.profile_type !== 'Business';
      if (filterType === 'missing_iban') return !user.iban || !user.iban.trim();
      if (filterType === 'missing_signature') return !user.signature_url;
      if (filterType === 'incomplete') return !user.iban || !user.signature_url;
      if (filterType === 'has_products') return (productsSummaryMap[user.id]?.count || 0) > 0;
      if (filterType === 'has_sales') return (salesSummaryMap[user.id]?.count || 0) > 0;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email;
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.email;
        cmp = nameA.localeCompare(nameB);
      } else if (sortBy === 'email') {
        cmp = a.email.localeCompare(b.email);
      } else if (sortBy === 'sales') {
        const sA = salesSummaryMap[a.id]?.count || 0;
        const sB = salesSummaryMap[b.id]?.count || 0;
        cmp = sA - sB;
      } else if (sortBy === 'products') {
        const pA = productsSummaryMap[a.id]?.count || 0;
        const pB = productsSummaryMap[b.id]?.count || 0;
        cmp = pA - pB;
      } else if (sortBy === 'payout') {
        const pA = salesSummaryMap[a.id]?.payout || 0;
        const pB = salesSummaryMap[b.id]?.payout || 0;
        cmp = pA - pB;
      } else if (sortBy === 'incomplete') {
        const incA = (!a.iban ? 1 : 0) + (!a.signature_url ? 1 : 0);
        const incB = (!b.iban ? 1 : 0) + (!b.signature_url ? 1 : 0);
        cmp = incB - incA; // more incomplete first
      }

      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [users, searchTerm, filterType, sortBy, sortOrder, salesSummaryMap, productsSummaryMap]);

  // Paginated Users
  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * USERS_PER_PAGE;
    return filteredUsers.slice(start, start + USERS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  // High-level KPIs
  const kpis = useMemo(() => {
    const total = users.length;
    const businessCount = users.filter(u => u.profile_type === 'Business').length;
    const missingIbanCount = users.filter(u => !u.iban || !u.iban.trim()).length;
    const missingSigCount = users.filter(u => !u.signature_url).length;
    const activeSellersCount = users.filter(u => (productsSummaryMap[u.id]?.count || 0) > 0 || (salesSummaryMap[u.id]?.count || 0) > 0).length;
    return {
      total,
      businessCount,
      personalCount: total - businessCount,
      missingIbanCount,
      missingSigCount,
      activeSellersCount
    };
  }, [users, productsSummaryMap, salesSummaryMap]);

  // User detail metrics
  const userMetrics = useMemo((): UserMetrics => {
    const totalSales = userSales.length;
    const completedSales = userSales.filter(s => s.status === 'completed').length;
    const pendingSales = userSales.filter(s => ['accepted', 'processing', 'shipped', 'delivered'].includes(s.status)).length;
    const totalRevenue = userSales.filter(s => s.status !== 'cancelled' && s.status !== 'returned').reduce((sum, s) => sum + (s.price || 0), 0);
    const totalPayout = userSales.filter(s => s.status === 'completed').reduce((sum, s) => sum + (s.payout || 0), 0);

    // Pending payout: delivered/shipped/processing
    const pendingPayout = userSales.filter(s => ['delivered', 'processing', 'shipped'].includes(s.status)).reduce((sum, s) => sum + (s.payout || 0), 0);

    const totalProducts = userProducts.length;
    const now = new Date();
    const activeProducts = userProducts.filter(p => !p.expires_at || new Date(p.expires_at) >= now).length;
    const expiredProducts = totalProducts - activeProducts;
    const totalProductsValue = userProducts.reduce((sum, p) => sum + (p.price || 0), 0);

    return {
      totalSales,
      completedSales,
      pendingSales,
      totalRevenue,
      totalPayout,
      pendingPayout,
      totalProducts,
      activeProducts,
      expiredProducts,
      totalProductsValue
    };
  }, [userSales, userProducts]);

  // Payout tab categorization
  const payoutBuckets = useMemo(() => {
    const now = new Date();
    const readyToPay: UserSale[] = [];
    const inClearance: { sale: UserSale; daysLeft: number }[] = [];
    const completed: UserSale[] = [];

    for (const sale of userSales) {
      if (sale.status === 'completed') {
        completed.push(sale);
      } else if (sale.status === 'delivered') {
        let isReady = false;
        let daysLeft = 0;

        if (sale.payout_date) {
          const pDate = new Date(sale.payout_date);
          if (pDate <= now) {
            isReady = true;
          } else {
            daysLeft = Math.ceil((pDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          }
        } else if (sale.delivered_at) {
          const clearanceDate = new Date(new Date(sale.delivered_at).getTime() + 14 * 24 * 60 * 60 * 1000);
          if (clearanceDate <= now) {
            isReady = true;
          } else {
            daysLeft = Math.ceil((clearanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          }
        } else {
          // Delivered without dates: treat as ready
          isReady = true;
        }

        if (isReady) {
          readyToPay.push(sale);
        } else {
          inClearance.push({ sale, daysLeft: Math.max(daysLeft, 1) });
        }
      }
    }

    const totalReadySum = readyToPay.reduce((sum, s) => sum + (s.payout || 0), 0);
    const totalClearanceSum = inClearance.reduce((sum, i) => sum + (i.sale.payout || 0), 0);
    const totalCompletedSum = completed.reduce((sum, s) => sum + (s.payout || 0), 0);

    return {
      readyToPay,
      inClearance,
      completed,
      totalReadySum,
      totalClearanceSum,
      totalCompletedSum
    };
  }, [userSales]);

  // Copy SEPA payment order
  const copySepaOrder = () => {
    if (!selectedUser || payoutBuckets.readyToPay.length === 0) return;
    const recipient = selectedUser.company_name || `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || selectedUser.email;
    const cleanIban = selectedUser.iban ? selectedUser.iban.replace(/\s+/g, '').toUpperCase() : '';
    const ids = payoutBuckets.readyToPay.map(s => s.external_id || s.id.slice(0, 8)).join(', ');

    const text = [
      `Príjemca: ${recipient}`,
      `IBAN: ${cleanIban}`,
      `Suma k úhrade: ${payoutBuckets.totalReadySum.toFixed(2)} EUR`,
      `Správa pre príjemcu: AirKicks výplata predaja (${ids})`,
    ].join('\n');

    copyToClipboard(text, 'Platobný príkaz bol skopírovaný');
  };

  // Filtered sales in Tab 2
  const modalFilteredSales = useMemo(() => {
    if (salesStatusFilter === 'all') return userSales;
    return userSales.filter(s => s.status === salesStatusFilter);
  }, [userSales, salesStatusFilter]);

  // Filtered products in Tab 3
  const modalFilteredProducts = useMemo(() => {
    const now = new Date();
    if (productsStatusFilter === 'active') {
      return userProducts.filter(p => !p.expires_at || new Date(p.expires_at) >= now);
    }
    if (productsStatusFilter === 'expired') {
      return userProducts.filter(p => p.expires_at && new Date(p.expires_at) < now);
    }
    return userProducts;
  }, [userProducts, productsStatusFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Načítavam používateľov</h3>
          <p className="text-sm text-gray-500">Pripravujem profily a štatistiky...</p>
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
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl shadow-lg">
                <FaUsers className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  Správa používateľov
                </h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Prehľad profilov, zmlúv, ponúk a výplat consignorov</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm disabled:opacity-50"
                title="Obnoviť zoznam"
              >
                <FaSync className={`sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Obnovujem...' : 'Obnoviť'}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm"
              >
                <FaSignOutAlt className="sm:mr-2" />
                <span className="hidden sm:inline">Odhlásiť</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FaExclamationTriangle className="h-5 w-5 text-red-600" />
                <p className="ml-3 text-sm text-red-800">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800"
              >
                <FaTimes />
              </button>
            </div>
          </div>
        )}

        {/* Global Navigation */}
        <AdminNavigation />

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Používatelia</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">
                <FaUsers />
              </div>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-black text-gray-900">{kpis.total}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{kpis.personalCount} osobných · {kpis.businessCount} firiem</p>
          </div>

          <div 
            onClick={() => setFilterType(filterType === 'has_products' ? 'all' : 'has_products')}
            className={`rounded-2xl border p-3 sm:p-4 shadow-xs cursor-pointer transition-all ${
              filterType === 'has_products' ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20' : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Aktívni predajcovia</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm">
                <FaBox />
              </div>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-black text-gray-900">{kpis.activeSellersCount}</p>
            <p className="text-[11px] text-emerald-700 font-medium mt-0.5">S ponukami alebo predajmi</p>
          </div>

          <div 
            onClick={() => setFilterType(filterType === 'business' ? 'all' : 'business')}
            className={`rounded-2xl border p-3 sm:p-4 shadow-xs cursor-pointer transition-all ${
              filterType === 'business' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20' : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Firemné účty</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm">
                <FaBuilding />
              </div>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-black text-gray-900">{kpis.businessCount}</p>
            <p className="text-[11px] text-blue-700 font-medium mt-0.5">Business / IČO profily</p>
          </div>

          <div 
            onClick={() => setFilterType(filterType === 'missing_iban' ? 'all' : 'missing_iban')}
            className={`rounded-2xl border p-3 sm:p-4 shadow-xs cursor-pointer transition-all ${
              filterType === 'missing_iban' ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20' : 'bg-white border-gray-200 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Chýba IBAN</span>
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-sm">
                <FaCreditCard />
              </div>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-black text-amber-900">{kpis.missingIbanCount}</p>
            <p className="text-[11px] text-amber-700 font-medium mt-0.5">Potrebné pre výplaty</p>
          </div>

          <div 
            onClick={() => setFilterType(filterType === 'missing_signature' ? 'all' : 'missing_signature')}
            className={`rounded-2xl border p-3 sm:p-4 shadow-xs cursor-pointer transition-all col-span-2 sm:col-span-1 ${
              filterType === 'missing_signature' ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20' : 'bg-white border-gray-200 hover:border-rose-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Chýba Podpis</span>
              <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center text-sm">
                <FaSignature />
              </div>
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-black text-rose-900">{kpis.missingSigCount}</p>
            <p className="text-[11px] text-rose-700 font-medium mt-0.5">Potrebné pre zmluvy</p>
          </div>
        </div>

        {/* Main Users Table Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Controls Bar: Search, Filters, Sort, Actions */}
          <div className="p-3 sm:p-5 border-b border-gray-200 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search input */}
              <div className="relative flex-1 max-w-md">
                <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input
                  type="text"
                  placeholder="Hľadať meno, email, firmu, mesto, IBAN..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    <FaTimes />
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button
                  onClick={copyAllFilteredEmails}
                  className="inline-flex items-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl transition border border-gray-200"
                  title="Skopírovať emaily zobrazených používateľov"
                >
                  <FaCopy className="mr-1.5 text-gray-500" />
                  Kopírovať emaily ({filteredUsers.length})
                </button>

                <button
                  onClick={exportUsersToXlsx}
                  className="inline-flex items-center px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-sm"
                  title="Stiahnuť excel so všetkými údajmi"
                >
                  <FaDownload className="mr-1.5" />
                  Export XLSX
                </button>
              </div>
            </div>

            {/* Filter Pills Bar */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter:</span>
                {[
                  { key: 'all', label: 'Všetci' },
                  { key: 'business', label: 'Firma (Business)' },
                  { key: 'personal', label: 'Osobný (Personal)' },
                  { key: 'has_products', label: 'S ponukami' },
                  { key: 'has_sales', label: 'S predajmi' },
                  { key: 'missing_iban', label: 'Chýba IBAN' },
                  { key: 'missing_signature', label: 'Chýba podpis' },
                  { key: 'incomplete', label: 'Neúplný profil' },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => { setFilterType(f.key as UserFilterType); setCurrentPage(1); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      filterType === f.key
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="hidden sm:inline">Zoradiť:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as UserSortType)}
                  className="bg-gray-50 border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-800 focus:outline-none"
                >
                  <option value="name">Meno</option>
                  <option value="email">Email</option>
                  <option value="sales">Predaje</option>
                  <option value="payout">Výplata</option>
                  <option value="products">Ponuky</option>
                  <option value="incomplete">Neúplné prvé</option>
                </select>
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-1.5 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100"
                  title={sortOrder === 'asc' ? 'Vzostupne' : 'Zostupne'}
                >
                  {sortOrder === 'asc' ? <FaSortAmountUp className="text-xs" /> : <FaSortAmountDown className="text-xs" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden divide-y divide-gray-100">
            {paginatedUsers.map((user) => {
              const salesSummary = salesSummaryMap[user.id] || { count: 0, payout: 0 };
              const productsSummary = productsSummaryMap[user.id] || { count: 0 };
              const isMissingIban = !user.iban || !user.iban.trim();
              const isMissingSig = !user.signature_url;
              const isComplete = !isMissingIban && !isMissingSig;

              return (
                <div
                  key={user.id}
                  onClick={() => handleUserSelect(user)}
                  className="p-3.5 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-indigo-900 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs shadow-sm">
                        {getUserInitials(user)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {user.first_name || user.last_name 
                            ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                            : user.company_name || 'Používateľ bez mena'}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                      user.profile_type === 'Business' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {user.profile_type || 'Personal'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-xl p-2 mb-2">
                    <span>Ponuky: <strong>{productsSummary.count}</strong></span>
                    <span>Predaje: <strong>{salesSummary.count}</strong></span>
                    <span>Výplaty: <strong className="text-emerald-700">{formatCurrency(salesSummary.payout)}</strong></span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isComplete ? (
                        <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <FaCheck className="mr-1 text-[8px]" /> Kompletný
                        </span>
                      ) : (
                        <>
                          {isMissingIban && (
                            <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              Chýba IBAN
                            </span>
                          )}
                          {isMissingSig && (
                            <span className="text-[10px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                              Chýba podpis
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleUserSelect(user); }}
                      className="text-xs font-bold text-indigo-600 inline-flex items-center"
                    >
                      Detail <FaChevronRight className="ml-1 text-[10px]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3.5">Používateľ</th>
                  <th className="px-4 py-3.5">Typ profilu</th>
                  <th className="px-4 py-3.5">Fakturácia & Podpis</th>
                  <th className="px-4 py-3.5 text-center">Ponuky</th>
                  <th className="px-4 py-3.5 text-center">Predaje</th>
                  <th className="px-4 py-3.5 text-right">Výplata celkovo</th>
                  <th className="px-4 py-3.5">Mesto</th>
                  <th className="px-4 py-3.5 text-right">Akcie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedUsers.map((user) => {
                  const salesSummary = salesSummaryMap[user.id] || { count: 0, payout: 0 };
                  const productsSummary = productsSummaryMap[user.id] || { count: 0 };
                  const isMissingIban = !user.iban || !user.iban.trim();
                  const isMissingSig = !user.signature_url;
                  const isComplete = !isMissingIban && !isMissingSig;

                  return (
                    <tr 
                      key={user.id} 
                      onClick={() => handleUserSelect(user)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Používateľ: Avatar, Meno, Email */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-900 to-indigo-900 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs shadow-xs">
                            {getUserInitials(user)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                              {user.first_name || user.last_name 
                                ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                                : user.company_name || 'Používateľ bez mena'}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-gray-500 font-normal truncate max-w-[200px]" title={user.email}>
                                {user.email}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(user.email, 'Email skopírovaný');
                                }}
                                className="text-gray-400 hover:text-gray-700 p-0.5 rounded"
                                title="Kopírovať email"
                              >
                                <FaCopy className="text-[10px]" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Typ profilu */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          user.profile_type === 'Business' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {user.profile_type === 'Business' ? (
                            <>
                              <FaBuilding className="mr-1 text-[10px]" />
                              {user.company_name || 'Firma'}
                            </>
                          ) : (
                            'Osobný'
                          )}
                        </span>
                        {user.profile_type === 'Business' && user.vat_type === 'VAT_PAYER' && (
                          <span className="block mt-1 text-[10px] text-emerald-700 font-bold">Platca DPH</span>
                        )}
                      </td>

                      {/* Fakturácia & Podpis */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="space-y-1">
                          {isComplete ? (
                            <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <FaCheck className="mr-1 text-[9px]" /> Profil kompletný
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {isMissingIban && (
                                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                  Bez IBAN
                                </span>
                              )}
                              {isMissingSig && (
                                <span className="text-[11px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                  Bez podpisu
                                </span>
                              )}
                            </div>
                          )}
                          {user.iban && (
                            <p className="text-[10px] font-mono text-gray-500 truncate max-w-[140px]" title={user.iban}>
                              {user.iban}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Ponuky */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-lg font-bold ${
                          productsSummary.count > 0 ? 'bg-indigo-50 text-indigo-700' : 'text-gray-400'
                        }`}>
                          {productsSummary.count}
                        </span>
                      </td>

                      {/* Predaje */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-lg font-bold ${
                          salesSummary.count > 0 ? 'bg-emerald-50 text-emerald-700' : 'text-gray-400'
                        }`}>
                          {salesSummary.count}
                        </span>
                      </td>

                      {/* Výplata celkovo */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span className="font-extrabold text-gray-900 text-sm">
                          {formatCurrency(salesSummary.payout)}
                        </span>
                      </td>

                      {/* Mesto */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">
                        {user.mesto ? (
                          <div className="flex items-center gap-1">
                            <FaMapMarkerAlt className="text-gray-400 text-[10px]" />
                            <span className="truncate max-w-[100px]">{user.mesto}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Akcie */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {user.iban && (
                            <button
                              onClick={() => copyToClipboard(user.iban!, 'IBAN skopírovaný')}
                              className="p-1.5 text-gray-500 hover:text-slate-900 hover:bg-gray-100 rounded-lg transition"
                              title="Kopírovať IBAN"
                            >
                              <FaCreditCard className="text-xs" />
                            </button>
                          )}
                          <a
                            href={`mailto:${user.email}`}
                            className="p-1.5 text-gray-500 hover:text-slate-900 hover:bg-gray-100 rounded-lg transition"
                            title="Poslať email"
                          >
                            <FaEnvelope className="text-xs" />
                          </a>
                          <button
                            onClick={() => handleUserSelect(user)}
                            className="inline-flex items-center px-2.5 py-1.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition text-xs shadow-xs"
                          >
                            Detail
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-400 text-xl">
                <FaUsers />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Žiadni používatelia</h3>
              <p className="text-xs text-gray-500">
                {searchTerm ? 'Pre zadané kritériá vyhľadávania sa nenašli žiadni používatelia.' : 'V databáze nie sú žiadni používatelia.'}
              </p>
            </div>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-600">
              <span>Zobrazených {(currentPage - 1) * USERS_PER_PAGE + 1} - {Math.min(currentPage * USERS_PER_PAGE, filteredUsers.length)} z {filteredUsers.length}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-gray-300 bg-white disabled:opacity-40"
                >
                  Predchádzajúca
                </button>
                <span className="px-2 font-bold text-gray-900">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg border border-gray-300 bg-white disabled:opacity-40"
                >
                  Ďalšia
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced User Detail Sheet */}
        {selectedUser && (
          <AdminDetailSheet
            zIndex="z-[60]"
            maxWidth="6xl"
            onBackdropClick={closeModal}
            contentClassName="p-0"
            header={(
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 text-white font-black text-base flex items-center justify-center flex-shrink-0 shadow-md">
                    {getUserInitials(selectedUser)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">
                        {selectedUser.first_name || selectedUser.last_name 
                          ? `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim()
                          : selectedUser.company_name || 'Používateľ'}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedUser.profile_type === 'Business' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {selectedUser.profile_type || 'Personal'}
                      </span>
                      {selectedUser.iban && selectedUser.signature_url ? (
                        <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <FaCheck className="mr-1 text-[8px]" /> Kompletný
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          Neúplný profil
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span className="truncate">{selectedUser.email}</span>
                      <button
                        onClick={() => copyToClipboard(selectedUser.email, 'Email skopírovaný')}
                        className="text-gray-400 hover:text-gray-700"
                        title="Kopírovať email"
                      >
                        <FaCopy className="text-[10px]" />
                      </button>
                      <span>·</span>
                      <span className="font-mono text-[10px] text-gray-400">ID: {selectedUser.id.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>

                {/* Quick actions in modal header */}
                <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                  <button
                    onClick={openEditProfileModal}
                    className="inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl transition"
                    title="Upraviť údaje"
                  >
                    <FaEdit className="mr-1.5 text-gray-500" />
                    Upraviť
                  </button>

                  <button
                    onClick={() => setShowCreateSaleModal(true)}
                    className="inline-flex items-center px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-xs"
                    title="Vytvoriť predaj pre tohto používateľa"
                  >
                    <FaPlus className="mr-1.5 text-[10px]" />
                    Nový predaj
                  </button>

                  <button
                    onClick={handleDeleteUser}
                    disabled={deletingUser}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition border border-rose-200"
                    title="Zmazať používateľa"
                  >
                    <FaTrash className="text-xs" />
                  </button>

                  <button
                    onClick={closeModal}
                    className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition"
                    aria-label="Zavrieť"
                  >
                    <FaTimes className="text-sm" />
                  </button>
                </div>
              </div>
            )}
          >
            {/* Modal Metrics Bar */}
            <div className="bg-gray-50/80 border-b border-gray-200 p-3 sm:p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="bg-white rounded-xl p-2.5 border border-gray-200/80 shadow-2xs text-center">
                  <div className="flex items-center justify-center text-indigo-600 mb-1">
                    <FaShoppingCart className="text-xs mr-1" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Predaje</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-gray-900">{userMetrics.totalSales}</p>
                  <p className="text-[10px] text-gray-500">{userMetrics.completedSales} hotových · {userMetrics.pendingSales} v procese</p>
                </div>

                <div className="bg-white rounded-xl p-2.5 border border-gray-200/80 shadow-2xs text-center">
                  <div className="flex items-center justify-center text-green-600 mb-1">
                    <FaEuroSign className="text-xs mr-1" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Obrat predajov</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-gray-900">{formatCurrency(userMetrics.totalRevenue)}</p>
                  <p className="text-[10px] text-gray-500">Hrubá hodnota objednávok</p>
                </div>

                <div className="bg-white rounded-xl p-2.5 border border-gray-200/80 shadow-2xs text-center">
                  <div className="flex items-center justify-center text-emerald-600 mb-1">
                    <FaCheckCircle className="text-xs mr-1" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Vyplatené</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-emerald-700">{formatCurrency(userMetrics.totalPayout)}</p>
                  <p className="text-[10px] text-emerald-600">Už odoslané peniaze</p>
                </div>

                <div className="bg-white rounded-xl p-2.5 border border-gray-200/80 shadow-2xs text-center">
                  <div className="flex items-center justify-center text-amber-600 mb-1">
                    <FaClock className="text-xs mr-1" />
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Na výplatu</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-amber-800">{formatCurrency(userMetrics.pendingPayout)}</p>
                  <p className="text-[10px] text-amber-700">Doručené / v ochrannej lehote</p>
                </div>

                <div className="bg-white rounded-xl p-2.5 border border-gray-200/80 shadow-2xs text-center">
                  <div className="flex items-center justify-center text-indigo-600 mb-1">
                    <FaBox className="text-xs mr-1" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Ponuky</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-gray-900">{userMetrics.totalProducts}</p>
                  <p className="text-[10px] text-gray-500">{userMetrics.activeProducts} aktívnych · {userMetrics.expiredProducts} expirovaných</p>
                </div>

                <div className="bg-white rounded-xl p-2.5 border border-gray-200/80 shadow-2xs text-center">
                  <div className="flex items-center justify-center text-purple-600 mb-1">
                    <FaChartLine className="text-xs mr-1" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hodnota ponúk</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-gray-900">{formatCurrency(userMetrics.totalProductsValue)}</p>
                  <p className="text-[10px] text-gray-500">Zalistované na e-shope</p>
                </div>
              </div>
            </div>

            {/* Modal Tabs Navigation */}
            <div className="border-b border-gray-200 bg-white px-3 sm:px-6 flex overflow-x-auto gap-2">
              {[
                { id: 'info', label: 'Profil & Fakturácia', icon: FaUser, badge: (!selectedUser.iban || !selectedUser.signature_url) ? '!' : null },
                { id: 'sales', label: `Predaje (${userSales.length})`, icon: FaShoppingCart },
                { id: 'products', label: `Ponuky (${userProducts.length})`, icon: FaBox },
                { id: 'payouts', label: `Vyúčtovanie & Banka`, icon: FaMoneyBillWave, badge: payoutBuckets.readyToPay.length > 0 ? `${payoutBuckets.readyToPay.length}` : null },
                { id: 'operations', label: `História operácií (${userOperations.length})`, icon: FaChartBar },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 px-3 font-bold text-xs sm:text-sm border-b-2 flex items-center space-x-1.5 whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <tab.icon className="text-xs" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Modal Tab Content */}
            <div className="p-3 sm:p-6 overflow-y-auto max-h-[calc(90vh-230px)]">
              {loadingUserData ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-gray-300 border-t-slate-900 rounded-full animate-spin"></div>
                  <span className="ml-3 text-sm text-gray-700">Načítavam údaje používateľa...</span>
                </div>
              ) : (
                <>
                  {/* TAB 1: INFO & BILLING */}
                  {activeTab === 'info' && (
                    <div className="space-y-4">
                      {/* Alert banners if missing essential details */}
                      {(!selectedUser.iban || !selectedUser.signature_url) && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start justify-between gap-3">
                          <div className="flex items-start space-x-3">
                            <FaExclamationTriangle className="text-amber-600 text-base mt-0.5 flex-shrink-0" />
                            <div className="text-xs text-amber-900">
                              <p className="font-bold">Používateľ nemá kompletne vyplnený profil:</p>
                              <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-800">
                                {!selectedUser.iban && <li>Chýba bankový účet (IBAN) – predajcovi nebude možné po predaji poslať výplatu.</li>}
                                {!selectedUser.signature_url && <li>Chýba digitálny podpis – kúpna zmluva sa nemôže vygenerovať automaticky.</li>}
                              </ul>
                            </div>
                          </div>
                          <button
                            onClick={openEditProfileModal}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl flex-shrink-0 shadow-xs"
                          >
                            Doplniť údaje
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Údaje consignora</h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyBillingDetails(selectedUser)}
                            className="inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl transition"
                          >
                            <FaCopy className="mr-1.5 text-gray-500" />
                            Kopírovať fakturačný blok
                          </button>
                          <button
                            onClick={openEditProfileModal}
                            className="inline-flex items-center px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-xs"
                          >
                            <FaEdit className="mr-1.5" />
                            Upraviť profil
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Card 1: Contact Details */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-xs">
                          <div className="flex items-center space-x-2 text-indigo-600 border-b border-gray-100 pb-2">
                            <FaUser className="text-xs" />
                            <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Osobné údaje</h5>
                          </div>

                          <div>
                            <p className="text-[11px] text-gray-400">Meno a priezvisko</p>
                            <p className="text-sm font-bold text-gray-900">
                              {selectedUser.first_name || selectedUser.last_name 
                                ? `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() 
                                : '—'}
                            </p>
                          </div>

                          <div>
                            <p className="text-[11px] text-gray-400">Email</p>
                            <div className="flex items-center justify-between">
                              <a href={`mailto:${selectedUser.email}`} className="text-sm font-semibold text-indigo-600 hover:underline truncate">
                                {selectedUser.email}
                              </a>
                              <button
                                onClick={() => copyToClipboard(selectedUser.email, 'Email skopírovaný')}
                                className="text-gray-400 hover:text-gray-700"
                                title="Kopírovať email"
                              >
                                <FaCopy className="text-xs" />
                              </button>
                            </div>
                          </div>

                          <div>
                            <p className="text-[11px] text-gray-400">Telefón</p>
                            {selectedUser.telephone ? (
                              <a href={`tel:${selectedUser.telephone}`} className="text-sm font-semibold text-gray-900 hover:underline">
                                {selectedUser.telephone}
                              </a>
                            ) : (
                              <p className="text-sm text-gray-400">—</p>
                            )}
                          </div>

                          {selectedUser.discord && (
                            <div>
                              <p className="text-[11px] text-gray-400">Discord</p>
                              <p className="text-sm font-mono text-gray-800">{selectedUser.discord}</p>
                            </div>
                          )}
                        </div>

                        {/* Card 2: Company & Billing */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-xs">
                          <div className="flex items-center space-x-2 text-blue-600 border-b border-gray-100 pb-2">
                            <FaBuilding className="text-xs" />
                            <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Fakturačné údaje</h5>
                          </div>

                          <div>
                            <p className="text-[11px] text-gray-400">Typ profilu</p>
                            <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              selectedUser.profile_type === 'Business' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {selectedUser.profile_type === 'Business' ? 'Firemný (IČO)' : 'Osobný'}
                            </span>
                          </div>

                          {selectedUser.profile_type === 'Business' ? (
                            <>
                              <div>
                                <p className="text-[11px] text-gray-400">Názov spoločnosti</p>
                                <p className="text-sm font-bold text-gray-900">{selectedUser.company_name || '—'}</p>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[11px] text-gray-400">IČO</p>
                                  <p className="text-sm font-mono font-semibold text-gray-900">{selectedUser.ico || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] text-gray-400">IČ DPH / DIČ</p>
                                  <p className="text-sm font-mono font-semibold text-gray-900">{selectedUser.vat_number || '—'}</p>
                                </div>
                              </div>

                              <div>
                                <p className="text-[11px] text-gray-400">Platca DPH</p>
                                <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold ${
                                  selectedUser.vat_type === 'VAT_PAYER' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {selectedUser.vat_type === 'VAT_PAYER' ? 'Platca DPH' : 'Neplatca DPH'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-gray-500 italic">Predajca predáva ako fyzická nepodnikajúca osoba (kúpna zmluva).</p>
                          )}

                          {/* Bank details */}
                          <div className="pt-2 border-t border-gray-100">
                            <p className="text-[11px] text-gray-400">Bankové spojenie (IBAN)</p>
                            {selectedUser.iban ? (
                              <div className="flex items-center justify-between mt-1 bg-gray-50 p-2 rounded-xl border border-gray-200">
                                <span className="font-mono text-xs font-bold text-gray-900 break-all">{formatIban(selectedUser.iban)}</span>
                                <button
                                  onClick={() => copyToClipboard(selectedUser.iban!, 'IBAN skopírovaný')}
                                  className="p-1 text-gray-500 hover:text-slate-900 ml-2"
                                  title="Kopírovať IBAN"
                                >
                                  <FaCopy className="text-xs" />
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-amber-700 font-semibold mt-1">IBAN nie je zadaný!</p>
                            )}
                          </div>
                        </div>

                        {/* Card 3: Address & Digital Signature */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4 shadow-xs">
                          <div>
                            <div className="flex items-center space-x-2 text-rose-600 border-b border-gray-100 pb-2 mb-2">
                              <FaMapMarkerAlt className="text-xs" />
                              <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Adresa</h5>
                            </div>
                            <p className="text-sm font-semibold text-gray-900">
                              {[selectedUser.address, selectedUser.popisne_cislo].filter(Boolean).join(' ') || '—'}
                            </p>
                            <p className="text-xs text-gray-600">
                              {[selectedUser.psc, selectedUser.mesto].filter(Boolean).join(' ')}
                            </p>
                            <p className="text-xs text-gray-500 font-medium">{selectedUser.krajina || 'Slovakia'}</p>
                          </div>

                          <div className="pt-3 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-1.5 text-slate-800">
                                <FaSignature className="text-xs" />
                                <h5 className="text-xs font-bold uppercase tracking-wider">Digitálny podpis</h5>
                              </div>
                              {selectedUser.signature_url ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  Nahraný
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                  Chýba
                                </span>
                              )}
                            </div>

                            {selectedUser.signature_url ? (
                              <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 flex items-center justify-center">
                                <img
                                  loading="lazy"
                                  src={selectedUser.signature_url}
                                  alt="Podpis"
                                  className="max-h-20 object-contain"
                                />
                              </div>
                            ) : (
                              <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-500">Podpis ešte nebol nahraný.</p>
                                <button
                                  onClick={openEditProfileModal}
                                  className="mt-2 inline-flex items-center text-xs font-bold text-indigo-600 hover:underline"
                                >
                                  <FaPlus className="mr-1" /> Nakresliť podpis
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: SALES */}
                  {activeTab === 'sales' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Status:</span>
                          {['all', 'accepted', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'].map((st) => (
                            <button
                              key={st}
                              onClick={() => setSalesStatusFilter(st)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                salesStatusFilter === st
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {st === 'all' ? 'Všetky' : st}
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={() => setShowCreateSaleModal(true)}
                          className="inline-flex items-center px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-xs self-start sm:self-auto"
                        >
                          <FaPlus className="mr-1.5" />
                          Nový predaj pre používateľa
                        </button>
                      </div>

                      {modalFilteredSales.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {modalFilteredSales.map((sale) => (
                            <div
                              key={sale.id}
                              onClick={() => setSelectedSaleForStatus(sale)}
                              className="bg-white rounded-2xl p-4 border border-gray-200 hover:border-slate-400 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-start space-x-3 mb-3">
                                  <div className="w-16 h-16 rounded-xl border border-gray-200 bg-white p-1 flex-shrink-0 overflow-hidden">
                                    <img
                                      loading="lazy"
                                      src={sale.image_url || '/default-image.png'}
                                      alt={sale.name}
                                      className="w-full h-full object-contain"
                                      onError={(e) => { (e.target as HTMLImageElement).src = '/default-image.png'; }}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h5 className="text-sm font-bold text-gray-900 truncate">{sale.name}</h5>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <SalesStatusBadge status={sale.status} />
                                      {sale.is_manual && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                                          Manuálny
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">Veľkosť: EU {sale.size}</p>
                                    {sale.sku && <p className="text-[11px] font-mono text-gray-400 truncate">{sale.sku}</p>}
                                  </div>
                                </div>

                                <div className="border-t border-gray-100 pt-2.5 space-y-1 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="text-gray-500">Predajná cena:</span>
                                    <span className="font-bold text-gray-900">{formatCurrency(sale.price)}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-gray-500">Výplata:</span>
                                    <span className="font-bold text-emerald-700">{formatCurrency(sale.payout)}</span>
                                  </div>
                                  {sale.external_id && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-500">Objednávka:</span>
                                      <span className="font-mono text-gray-700">{sale.external_id}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between">
                                    <span className="text-gray-400">Dátum:</span>
                                    <span className="text-gray-500">{formatDate(sale.created_at)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Documents bar */}
                              <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-1 text-[11px]">
                                <div className="flex items-center gap-2">
                                  {sale.contract_url && (
                                    <a
                                      href={sale.contract_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center text-blue-600 hover:underline font-semibold"
                                      title="Otvoriť zmluvu PDF"
                                    >
                                      <FaFileContract className="mr-0.5" /> Zmluva
                                    </a>
                                  )}
                                  {sale.fa_url && (
                                    <a
                                      href={sale.fa_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center text-emerald-700 hover:underline font-semibold"
                                      title="Otvoriť faktúru PDF"
                                    >
                                      <FaFileInvoice className="mr-0.5" /> FA
                                    </a>
                                  )}
                                  {sale.tracking_url && (
                                    <a
                                      href={sale.tracking_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center text-purple-600 hover:underline font-semibold"
                                      title="Sledovať zásielku"
                                    >
                                      <FaTruck className="mr-0.5" /> Sledovanie
                                    </a>
                                  )}
                                </div>

                                <span className="text-gray-400 text-[10px] group-hover:text-slate-900">Upraviť →</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-200">
                          <FaShoppingCart className="text-gray-400 text-2xl mx-auto mb-2" />
                          <p className="text-sm font-semibold text-gray-700">Žiadne predaje</p>
                          <p className="text-xs text-gray-500 mt-1">Tento používateľ zatiaľ nemá žiadne zaznamenané predaje.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: PRODUCTS / OFFERS */}
                  {activeTab === 'products' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Filter:</span>
                          {[
                            { key: 'all', label: `Všetky (${userProducts.length})` },
                            { key: 'active', label: `Aktívne (${userMetrics.activeProducts})` },
                            { key: 'expired', label: `Expirované (${userMetrics.expiredProducts})` },
                          ].map((f) => (
                            <button
                              key={f.key}
                              onClick={() => setProductsStatusFilter(f.key as any)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                productsStatusFilter === f.key
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={() => setShowBulkImportModal(true)}
                          className="inline-flex items-center px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-xs self-start sm:self-auto"
                        >
                          <FaUpload className="mr-1.5" />
                          Bulk Import ponúk (XLSX)
                        </button>
                      </div>

                      {modalFilteredProducts.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {modalFilteredProducts.map((product) => {
                            const now = new Date();
                            const isExpired = product.expires_at ? new Date(product.expires_at) < now : false;
                            const daysLeft = product.expires_at 
                              ? Math.ceil((new Date(product.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                              : 30;

                            return (
                              <div
                                key={product.id}
                                className={`rounded-2xl p-4 border bg-white shadow-xs flex flex-col justify-between ${
                                  isExpired ? 'border-rose-200 bg-rose-50/20' : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <div>
                                  <div className="flex items-start space-x-3 mb-3">
                                    <div className="w-16 h-16 rounded-xl border border-gray-200 bg-white p-1 flex-shrink-0 overflow-hidden">
                                      <img
                                        loading="lazy"
                                        src={product.image_url || '/default-image.png'}
                                        alt={product.name}
                                        className="w-full h-full object-contain"
                                        onError={(e) => { (e.target as HTMLImageElement).src = '/default-image.png'; }}
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h5 className="text-sm font-bold text-gray-900 truncate">{product.name}</h5>
                                      <p className="text-xs text-gray-600 mt-0.5">Veľkosť: EU {product.size}</p>
                                      {product.sku && <p className="text-[11px] font-mono text-gray-400 truncate">{product.sku}</p>}
                                      
                                      <div className="mt-1.5">
                                        {isExpired ? (
                                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                            Expirovaná
                                          </span>
                                        ) : (
                                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                            Aktívna (ešte {daysLeft}d)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="border-t border-gray-100 pt-2.5 space-y-1 text-xs">
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-500">Predajná cena:</span>
                                      <span className="font-bold text-gray-900">{formatCurrency(product.price)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-500">Výplata predajcovi:</span>
                                      <span className="font-bold text-emerald-700">{formatCurrency(product.payout)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-400">Pridané:</span>
                                      <span className="text-gray-500">{formatDate(product.created_at)}</span>
                                    </div>
                                    {product.expires_at && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-400">Expirácia:</span>
                                        <span className="text-gray-700 font-medium">
                                          {new Date(product.expires_at).toLocaleDateString('sk-SK')}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
                                  <button
                                    onClick={() => handleExtendProduct(product.id)}
                                    className="px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100 rounded-lg border border-gray-200 transition"
                                    title="Predĺžiť expiráciu o ďalších 30 dní"
                                  >
                                    <FaSync className="inline mr-1 text-[10px]" /> +30 dní
                                  </button>

                                  <button
                                    onClick={() => handleDeleteProduct(product.id, product.name)}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                    title="Zmazať ponuku"
                                  >
                                    <FaTrash className="text-xs" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-200">
                          <FaBox className="text-gray-400 text-2xl mx-auto mb-2" />
                          <p className="text-sm font-semibold text-gray-700">Žiadne ponuky</p>
                          <p className="text-xs text-gray-500 mt-1">Používateľ nemá zalistované žiadne tenisky.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: PAYOUTS & BANK */}
                  {activeTab === 'payouts' && (
                    <div className="space-y-5">
                      {/* Bank Order Wire Generator Box */}
                      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-bold tracking-wider text-indigo-300 uppercase">SEPA Platobný Príkaz</span>
                            <h4 className="text-base sm:text-lg font-bold text-white mt-0.5">
                              {payoutBuckets.totalReadySum > 0 
                                ? `Pripravené na prevod: ${formatCurrency(payoutBuckets.totalReadySum)}`
                                : 'Žiadne platby pripravené na okamžitý prevod'}
                            </h4>
                          </div>

                          {payoutBuckets.readyToPay.length > 0 && selectedUser.iban && (
                            <button
                              onClick={copySepaOrder}
                              className="inline-flex items-center px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl transition shadow-md"
                            >
                              <FaCopy className="mr-1.5" />
                              Kopírovať platobný príkaz
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10 text-xs">
                          <div>
                            <p className="text-gray-400">Príjemca</p>
                            <p className="font-bold text-white mt-0.5">
                              {selectedUser.company_name || `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || selectedUser.email}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400">IBAN</p>
                            <p className="font-mono font-bold text-indigo-200 mt-0.5">
                              {selectedUser.iban ? formatIban(selectedUser.iban) : 'Chýba IBAN!'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400">Položky na úhradu</p>
                            <p className="font-bold text-emerald-300 mt-0.5">
                              {payoutBuckets.readyToPay.length} predajov ({formatCurrency(payoutBuckets.totalReadySum)})
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Ready to pay list */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Pripravené na úhradu ({payoutBuckets.readyToPay.length})
                          </h5>
                          <span className="text-xs font-extrabold text-emerald-700">
                            Spolu: {formatCurrency(payoutBuckets.totalReadySum)}
                          </span>
                        </div>

                        {payoutBuckets.readyToPay.length > 0 ? (
                          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden shadow-xs">
                            {payoutBuckets.readyToPay.map(sale => (
                              <div key={sale.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-gray-900 truncate">{sale.name} (EU {sale.size})</p>
                                  <p className="text-[11px] text-gray-500">
                                    Objednávka: {sale.external_id || sale.id.slice(0, 8)} · Predaj: {formatCurrency(sale.price)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <span className="text-xs text-gray-500 block">K úhrade:</span>
                                    <span className="text-sm font-extrabold text-emerald-700">{formatCurrency(sale.payout)}</span>
                                  </div>
                                  <button
                                    onClick={() => handleMarkSaleCompleted(sale.id)}
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition shadow-xs whitespace-nowrap"
                                    title="Označiť ako vyplatené bankovým prevodom"
                                  >
                                    Vyplatené ✓
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-xl p-4 text-center text-xs text-gray-500 border border-gray-200">
                            Žiadne predaje nečakajú na bezprostredný prevod.
                          </div>
                        )}
                      </div>

                      {/* In 14-day clearance hold */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                            V 14-dňovej ochrannej lehote ({payoutBuckets.inClearance.length})
                          </h5>
                          <span className="text-xs font-bold text-amber-800">
                            Spolu: {formatCurrency(payoutBuckets.totalClearanceSum)}
                          </span>
                        </div>

                        {payoutBuckets.inClearance.length > 0 ? (
                          <div className="bg-white rounded-2xl border border-amber-200 divide-y divide-gray-100 overflow-hidden shadow-xs">
                            {payoutBuckets.inClearance.map(({ sale, daysLeft }) => (
                              <div key={sale.id} className="p-3.5 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-gray-900 truncate">{sale.name} (EU {sale.size})</p>
                                  <p className="text-[11px] text-gray-500">
                                    Doručené: {sale.delivered_at ? formatDate(sale.delivered_at) : 'nedávno'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 block">
                                    Ešte {daysLeft} dní
                                  </span>
                                  <span className="text-xs font-bold text-gray-900 mt-1 block">{formatCurrency(sale.payout)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-xl p-3 text-center text-xs text-gray-500 border border-gray-200">
                            Žiadne predaje v ochrannej lehote.
                          </div>
                        )}
                      </div>

                      {/* Completed / Already paid */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Už vyplatené históriu ({payoutBuckets.completed.length})
                          </h5>
                          <span className="text-xs font-bold text-gray-700">
                            Celkovo: {formatCurrency(payoutBuckets.totalCompletedSum)}
                          </span>
                        </div>

                        {payoutBuckets.completed.length > 0 && (
                          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto shadow-xs text-xs">
                            {payoutBuckets.completed.map(sale => (
                              <div key={sale.id} className="p-2.5 flex items-center justify-between text-gray-600">
                                <span className="truncate">{sale.name} ({sale.external_id || sale.id.slice(0, 8)})</span>
                                <span className="font-bold text-gray-900 ml-2">{formatCurrency(sale.payout)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 5: OPERATIONS / AUDIT LOG */}
                  {activeTab === 'operations' && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Audit zmien a aktivít</h4>
                      {loadingOperations ? (
                        <div className="py-8 text-center text-xs text-gray-500">Načítavam históriu operácií...</div>
                      ) : userOperations.length > 0 ? (
                        <div className="space-y-2.5">
                          {userOperations.map((op) => (
                            <div key={op.id} className="bg-white rounded-xl p-3.5 border border-gray-200 shadow-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-gray-900 truncate">{op.sale_name}</p>
                                  <div className="flex items-center space-x-2 mt-1">
                                    <SalesStatusBadge status={op.old_status} />
                                    <span className="text-gray-400 text-xs">→</span>
                                    <SalesStatusBadge status={op.new_status} />
                                  </div>
                                </div>
                                <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDate(op.created_at)}</span>
                              </div>
                              {op.notes && (
                                <p className="mt-2 text-xs text-gray-600 italic bg-gray-50 p-2 rounded-lg border border-gray-100">
                                  {op.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-2xl p-8 text-center border border-gray-200">
                          <FaChartBar className="text-gray-400 text-2xl mx-auto mb-2" />
                          <p className="text-sm font-semibold text-gray-700">Žiadne operácie</p>
                          <p className="text-xs text-gray-500 mt-1">V histórii statusov zatiaľ nie sú zaznamenané žiadne zmeny.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </AdminDetailSheet>
        )}

        {/* Sale Status Manager Modal */}
        {selectedSaleForStatus && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 bg-white flex-shrink-0">
                <div className="min-w-0 pr-2">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">Správa predaja</h3>
                  <p className="text-xs text-gray-500 truncate">{selectedSaleForStatus.name} (EU {selectedSaleForStatus.size})</p>
                </div>
                <button
                  onClick={() => setSelectedSaleForStatus(null)}
                  className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <AdminSalesStatusManager
                  saleId={selectedSaleForStatus.id}
                  currentStatus={selectedSaleForStatus.status}
                  currentExternalId={selectedSaleForStatus.external_id}
                  currentTrackingUrl={selectedSaleForStatus.tracking_url}
                  currentLabelUrl={selectedSaleForStatus.label_url}
                  currentFaUrl={selectedSaleForStatus.fa_url}
                  currentDeliveredAt={selectedSaleForStatus.delivered_at}
                  currentPayoutDate={selectedSaleForStatus.payout_date}
                  currentCreatedAt={selectedSaleForStatus.created_at}
                  currentIsManual={selectedSaleForStatus.is_manual || false}
                  onStatusUpdate={(newStatus) => {
                    setUserSales(prev => prev.map(s => s.id === selectedSaleForStatus.id ? { ...s, status: newStatus } : s));
                    if (selectedUser) loadUserDetails(selectedUser.id);
                  }}
                  onExternalIdUpdate={(newExtId) => {
                    setUserSales(prev => prev.map(s => s.id === selectedSaleForStatus.id ? { ...s, external_id: newExtId } : s));
                  }}
                  onSaleUpdate={() => {
                    if (selectedUser) loadUserDetails(selectedUser.id);
                  }}
                  onClose={() => {
                    setSelectedSaleForStatus(null);
                    if (selectedUser) loadUserDetails(selectedUser.id);
                  }}
                  onDelete={async () => {
                    setSelectedSaleForStatus(null);
                    if (selectedUser) await loadUserDetails(selectedUser.id);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Edit Profile Modal */}
        {showEditProfileModal && selectedUser && (
          <AdminDetailSheet
            zIndex="z-[80]"
            maxWidth="4xl"
            onBackdropClick={() => setShowEditProfileModal(false)}
            desktopMaxHeight="sm:max-h-[95vh]"
            contentClassName="p-0"
            header={(
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900">Upraviť profil používateľa</h3>
                  <p className="text-xs text-gray-500">{selectedUser.email}</p>
                </div>
                <button
                  onClick={() => setShowEditProfileModal(false)}
                  className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl"
                >
                  <FaTimes />
                </button>
              </div>
            )}
            footer={(
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditProfileModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-300"
                >
                  Zrušiť
                </button>
                <button
                  type="submit"
                  form="admin-edit-user-profile-form"
                  disabled={savingProfile}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
                >
                  {savingProfile ? 'Ukladám...' : 'Uložiť zmeny'}
                </button>
              </div>
            )}
          >
            <form id="admin-edit-user-profile-form" onSubmit={handleSaveProfile} className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Meno</label>
                  <input
                    value={editingProfile.first_name}
                    onChange={(e) => updateProfileField('first_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Priezvisko</label>
                  <input
                    value={editingProfile.last_name}
                    onChange={(e) => updateProfileField('last_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editingProfile.email}
                    onChange={(e) => updateProfileField('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Telefón</label>
                  <input
                    value={editingProfile.telephone}
                    onChange={(e) => updateProfileField('telephone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Typ profilu</label>
                  <select
                    value={editingProfile.profile_type}
                    onChange={(e) => setEditingProfile(prev => ({ ...prev, profile_type: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm bg-white"
                  >
                    <option value="Personal">Osobný (Personal)</option>
                    <option value="Business">Firemný (Business)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">IBAN (Bankový účet)</label>
                  <input
                    value={editingProfile.iban}
                    onChange={(e) => updateProfileField('iban', e.target.value)}
                    placeholder="SK..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-mono uppercase"
                  />
                </div>

                {editingProfile.profile_type === 'Business' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Názov spoločnosti</label>
                      <input
                        value={editingProfile.company_name}
                        onChange={(e) => updateProfileField('company_name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">IČO</label>
                      <input
                        value={editingProfile.ico}
                        onChange={(e) => updateProfileField('ico', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">IČ DPH / DIČ</label>
                      <input
                        value={editingProfile.vat_number}
                        onChange={(e) => updateProfileField('vat_number', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Status DPH</label>
                      <select
                        value={editingProfile.vat_type}
                        onChange={(e) => updateProfileField('vat_type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm bg-white"
                      >
                        <option value="NO_VAT">Neplatca DPH</option>
                        <option value="VAT_PAYER">Platca DPH</option>
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Ulica</label>
                  <input
                    value={editingProfile.address}
                    onChange={(e) => updateProfileField('address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Číslo domu</label>
                  <input
                    value={editingProfile.popisne_cislo}
                    onChange={(e) => updateProfileField('popisne_cislo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Mesto</label>
                  <input
                    value={editingProfile.mesto}
                    onChange={(e) => updateProfileField('mesto', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">PSČ</label>
                  <input
                    value={editingProfile.psc}
                    onChange={(e) => updateProfileField('psc', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Krajina</label>
                  <input
                    value={editingProfile.krajina}
                    onChange={(e) => updateProfileField('krajina', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Signature Management in edit form */}
              <div className="rounded-2xl border border-gray-200 p-4 space-y-3 bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Podpis pre zmluvy</h5>
                    <p className="text-xs text-gray-500">Nahrajte alebo nakreslite digitálny podpis consignora.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSignaturePad(prev => !prev)}
                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-semibold rounded-xl"
                    >
                      {showSignaturePad ? 'Skryť kreslenie' : 'Nakresliť podpis'}
                    </button>
                    {signaturePreviewUrl && (
                      <button
                        type="button"
                        onClick={removeSignaturePreview}
                        className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-semibold rounded-xl"
                      >
                        Odstrániť
                      </button>
                    )}
                  </div>
                </div>

                {signaturePreviewUrl ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-3 flex justify-center">
                    <img src={signaturePreviewUrl} alt="Náhľad podpisu" className="max-h-20 object-contain" />
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Podpis zatiaľ nie je nahraný.</p>
                )}

                {showSignaturePad && (
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <canvas
                      ref={signatureCanvasRef}
                      width={600}
                      height={180}
                      onMouseDown={startSignature}
                      onMouseMove={moveSignature}
                      onMouseUp={endSignature}
                      onMouseLeave={endSignature}
                      onTouchStart={startSignature}
                      onTouchMove={moveSignature}
                      onTouchEnd={endSignature}
                      className="w-full rounded-xl border border-gray-300 bg-white touch-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={clearSignaturePad}
                        className="px-3 py-1.5 text-xs text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg"
                      >
                        Vymazať
                      </button>
                      <button
                        type="button"
                        onClick={saveSignaturePreview}
                        disabled={savingSignaturePreview}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                      >
                        {savingSignaturePreview ? 'Ukladám...' : 'Použiť nakreslený podpis'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </AdminDetailSheet>
        )}

        {/* Create Sale Modal */}
        <CreateSaleModal
          isOpen={showCreateSaleModal}
          onClose={() => setShowCreateSaleModal(false)}
          onSaleCreated={async () => {
            setShowCreateSaleModal(false);
            if (selectedUser) await loadUserDetails(selectedUser.id);
            await loadUsers();
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
              if (selectedUser) await loadUserDetails(selectedUser.id);
              await loadUsers();
            }}
          />
        )}
      </div>
    </div>
  );
}
