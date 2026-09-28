import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AdminNavigation from '../components/AdminNavigation';
import AdminDetailSheet from '../components/AdminDetailSheet';
import { useToast } from '../components/Toast';
import { formatCurrency, formatDate } from '../lib/utils';
import {
  FaBoxOpen,
  FaEdit,
  FaExclamationTriangle,
  FaHistory,
  FaLink,
  FaPlus,
  FaSave,
  FaSearch,
  FaSignOutAlt,
  FaSort,
  FaSortDown,
  FaSortUp,
  FaSync,
  FaTimes,
  FaTrash,
  FaWarehouse,
  FaEuroSign,
  FaCheckCircle,
  FaClock,
  FaShoppingBag,
  FaFileExport,
  FaChartLine,
  FaBolt,
  FaChevronDown,
  FaChevronUp,
  FaUser
} from 'react-icons/fa';

type SourceType = 'purchase' | 'unclaimed_order';
type WarehouseStatus = 'available' | 'assigned' | 'sold';
type DocumentType = 'fa' | 'zmluva';
type SortField = 'name' | 'purchase_price' | 'created_at' | 'status';
type SortDir = 'asc' | 'desc';

interface WarehouseItem {
  id: string;
  name: string;
  size: string | null;
  sku: string | null;
  image_url: string | null;
  source_type: SourceType;
  purchase_price: number;
  document_type: DocumentType;
  status: WarehouseStatus;
  notes: string | null;
  assigned_sale_id: string | null;
  assigned_eshop_sale_id: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SaleCandidate {
  id: string;
  name: string;
  size: string | null;
  sku: string | null;
  image_url: string | null;
  price: number;
  payout: number;
  status: string;
  external_id: string | null;
  user_email: string;
  created_at: string;
}

interface UserCandidate {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
}

interface ProductCandidate {
  id: string;
  name: string;
  image_url?: string;
  sku?: string;
}

interface ProductSizeOption {
  size: string;
  price: number;
}

interface EshopCandidate {
  id: string;
  order_number: string;
  product_name: string;
  size: string | null;
  status: string;
  customer_email: string | null;
  created_at: string;
}

interface WarehouseFormState {
  name: string;
  size: string;
  sku: string;
  image_url: string;
  source_type: SourceType;
  purchase_price: string;
  document_type: DocumentType;
  notes: string;
}

type CreateMode = 'manual_product' | 'from_sale';

const emptyFormState: WarehouseFormState = {
  name: '',
  size: '',
  sku: '',
  image_url: '',
  source_type: 'unclaimed_order',
  purchase_price: '',
  document_type: 'zmluva',
  notes: ''
};

export default function WarehousePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const formRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [sales, setSales] = useState<SaleCandidate[]>([]);
  const [eshopOrders, setEshopOrders] = useState<EshopCandidate[]>([]);
  const [products, setProducts] = useState<ProductCandidate[]>([]);
  const [users, setUsers] = useState<UserCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);
  const [formState, setFormState] = useState<WarehouseFormState>(emptyFormState);
  const [createMode, setCreateMode] = useState<CreateMode>('from_sale');
  const [salePickerSearch, setSalePickerSearch] = useState('');
  const [selectedSaleTemplateId, setSelectedSaleTemplateId] = useState('');
  const [productPickerSearch, setProductPickerSearch] = useState('');
  const [selectedProductTemplateId, setSelectedProductTemplateId] = useState('');
  const [availableSizes, setAvailableSizes] = useState<ProductSizeOption[]>([]);
  const [loadingSizes, setLoadingSizes] = useState(false);

  const [assigningItem, setAssigningItem] = useState<WarehouseItem | null>(null);
  const [assignmentType, setAssignmentType] = useState<'sale' | 'eshop'>('sale');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');

  const [saleFromItem, setSaleFromItem] = useState<WarehouseItem | null>(null);
  const [saleProfileSearch, setSaleProfileSearch] = useState('');
  const [selectedSaleUserId, setSelectedSaleUserId] = useState('');
  const [warehouseSalePrice, setWarehouseSalePrice] = useState('');
  const [warehouseSalePayout, setWarehouseSalePayout] = useState('');
  const [warehouseExternalId, setWarehouseExternalId] = useState('');
  const [creatingWarehouseSale, setCreatingWarehouseSale] = useState(false);
  const [loadingSaleProfiles, setLoadingSaleProfiles] = useState(false);
  const [importingUnclaimed, setImportingUnclaimed] = useState(false);

  // Quick Add
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddSearch, setQuickAddSearch] = useState('');
  const [quickAddProductId, setQuickAddProductId] = useState('');
  const [quickAddSize, setQuickAddSize] = useState('');
  const [quickAddPrice, setQuickAddPrice] = useState('');
  const [quickAddDocType, setQuickAddDocType] = useState<DocumentType>('fa');
  const [quickAddSizes, setQuickAddSizes] = useState<ProductSizeOption[]>([]);
  const [loadingQuickAddSizes, setLoadingQuickAddSizes] = useState(false);
  const [savingQuickAdd, setSavingQuickAdd] = useState(false);

  // History
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      const [itemsRes, salesRes, eshopRes] = await Promise.all([
        supabase
          .from('warehouse_items')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('user_sales')
          .select('id, name, size, sku, image_url, price, payout, status, external_id, created_at, sale_type, profiles(email)')
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('eshop_sales')
          .select('id, order_number, product_name, size, status, customer_email, created_at')
          .order('created_at', { ascending: false })
          .limit(300)
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (salesRes.error) throw salesRes.error;
      if (eshopRes.error) throw eshopRes.error;

      const operationalSales = (salesRes.data || []).filter((sale: any) => !sale.sale_type || sale.sale_type === 'operational');

      setItems((itemsRes.data || []) as WarehouseItem[]);
      setSales(operationalSales.map((sale: any) => ({
        id: sale.id,
        name: sale.name,
        size: sale.size,
        sku: sale.sku,
        image_url: sale.image_url,
        price: Number(sale.price || 0),
        payout: Number(sale.payout || 0),
        status: sale.status,
        external_id: sale.external_id,
        user_email: sale.profiles?.email || 'N/A',
        created_at: sale.created_at
      })));
      setEshopOrders((eshopRes.data || []) as EshopCandidate[]);
    } catch (err: any) {
      setError('Error loading warehouse: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const salesMap = useMemo(() => Object.fromEntries(sales.map((sale) => [sale.id, sale])), [sales]);
  const eshopMap = useMemo(() => Object.fromEntries(eshopOrders.map((order) => [order.id, order])), [eshopOrders]);

  const getComputedStatus = useCallback((item: WarehouseItem): WarehouseStatus => {
    if (item.assigned_sale_id) {
      const linkedSale = salesMap[item.assigned_sale_id];
      if (linkedSale && ['completed', 'delivered'].includes(linkedSale.status)) return 'sold';
      return 'assigned';
    }

    if (item.assigned_eshop_sale_id) {
      const linkedOrder = eshopMap[item.assigned_eshop_sale_id];
      if (linkedOrder && ['completed', 'delivered'].includes(linkedOrder.status)) return 'sold';
      return 'assigned';
    }

    return item.status;
  }, [eshopMap, salesMap]);

  const getLinkedLabel = useCallback((item: WarehouseItem) => {
    if (item.assigned_sale_id) {
      const sale = salesMap[item.assigned_sale_id];
      if (!sale) return 'Assigned sale';
      return `${sale.name} | ${sale.user_email}${sale.external_id ? ` | ${sale.external_id}` : ''}`;
    }

    if (item.assigned_eshop_sale_id) {
      const order = eshopMap[item.assigned_eshop_sale_id];
      if (!order) return 'Assigned eshop order';
      return `${order.order_number} | ${order.product_name}${order.customer_email ? ` | ${order.customer_email}` : ''}`;
    }

    return null;
  }, [eshopMap, salesMap]);

  const handleLinkedClick = useCallback((item: WarehouseItem) => {
    if (item.assigned_sale_id) {
      navigate('/admin/sales');
    } else if (item.assigned_eshop_sale_id) {
      navigate('/admin/eshop-sales');
    }
  }, [navigate]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <FaSort className="ml-1 text-gray-300 text-xs inline" />;
    return sortDir === 'asc'
      ? <FaSortUp className="ml-1 text-amber-500 text-xs inline" />
      : <FaSortDown className="ml-1 text-amber-500 text-xs inline" />;
  };

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const computedStatus = getComputedStatus(item);
      if (sourceFilter && item.source_type !== sourceFilter) return false;
      if (statusFilter && computedStatus !== statusFilter) return false;
      if (!searchTerm) return true;

      const q = searchTerm.toLowerCase();
      return [
        item.name,
        item.size,
        item.sku,
        item.notes,
        getLinkedLabel(item)
      ].some((field) => field?.toLowerCase().includes(q));
    });

    filtered.sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortField === 'name') { aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); }
      else if (sortField === 'purchase_price') { aVal = Number(a.purchase_price); bVal = Number(b.purchase_price); }
      else if (sortField === 'created_at') { aVal = a.created_at; bVal = b.created_at; }
      else if (sortField === 'status') { aVal = getComputedStatus(a); bVal = getComputedStatus(b); }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [getComputedStatus, getLinkedLabel, items, searchTerm, sourceFilter, statusFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const total = items.length;
    const available = items.filter((item) => getComputedStatus(item) === 'available').length;
    const assigned = items.filter((item) => getComputedStatus(item) === 'assigned').length;
    const sold = items.filter((item) => getComputedStatus(item) === 'sold').length;
    const purchaseValue = items.reduce((sum, item) => sum + Number(item.purchase_price || 0), 0);

    return { total, available, assigned, sold, purchaseValue };
  }, [getComputedStatus, items]);

  const filteredPurchaseValue = useMemo(
    () => filteredItems.reduce((sum, item) => sum + Number(item.purchase_price || 0), 0),
    [filteredItems]
  );

  const soldItems = useMemo(() => filteredItems.filter((item) => getComputedStatus(item) === 'sold'), [filteredItems, getComputedStatus]);

  const importedSaleIds = useMemo(() => {
    const ids = new Set<string>();
    items.forEach((item) => {
      const match = item.notes?.match(/sale:([0-9a-f-]+)/i);
      if (match?.[1]) ids.add(match[1]);
    });
    return ids;
  }, [items]);

  const unclaimedSaleCandidates = useMemo(() => {
    return sales.filter((sale) => ['cancelled', 'returned'].includes(sale.status) && !importedSaleIds.has(sale.id));
  }, [importedSaleIds, sales]);

  const filteredUsers = useMemo(() => {
    const q = saleProfileSearch.toLowerCase().trim();
    if (!q) return users.slice(0, 30);
    return users.filter((user) => [
      user.email,
      user.first_name,
      user.last_name,
    ].some((field) => field?.toLowerCase().includes(q))).slice(0, 30);
  }, [saleProfileSearch, users]);

  const selectedSaleUser = useMemo(
    () => users.find((user) => user.id === selectedSaleUserId) || null,
    [selectedSaleUserId, users]
  );

  const filteredSaleCandidates = useMemo(() => {
    const q = assignmentSearch.toLowerCase();
    if (assignmentType === 'sale') {
      return sales.filter((item) => {
        if (!q) return true;
        return [item.name, item.size, item.user_email, item.external_id].some((field) =>
          field?.toLowerCase().includes(q)
        );
      });
    }

    return eshopOrders.filter((item) => {
      if (!q) return true;
      return [item.order_number, item.product_name, item.size, item.customer_email].some((field) =>
        field?.toLowerCase().includes(q)
      );
    });
  }, [assignmentSearch, assignmentType, eshopOrders, sales]);

  const resetForm = () => {
    setEditingItem(null);
    setFormState(emptyFormState);
    setCreateMode('from_sale');
    setSalePickerSearch('');
    setSelectedSaleTemplateId('');
    setProductPickerSearch('');
    setSelectedProductTemplateId('');
    setAvailableSizes([]);
    setShowFormModal(false);
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setFormState(emptyFormState);
    setCreateMode('from_sale');
    setSalePickerSearch('');
    setSelectedSaleTemplateId('');
    setProductPickerSearch('');
    setSelectedProductTemplateId('');
    setAvailableSizes([]);
    setShowFormModal(true);
  };

  const openEditModal = (item: WarehouseItem) => {
    setEditingItem(item);
    setFormState({
      name: item.name || '',
      size: item.size || '',
      sku: item.sku || '',
      image_url: item.image_url || '',
      source_type: item.source_type,
      purchase_price: item.purchase_price?.toString() || '',
      document_type: item.document_type || 'fa',
      notes: item.notes || ''
    });
    setCreateMode('manual_product');
    setSalePickerSearch('');
    setSelectedSaleTemplateId('');
    setProductPickerSearch('');
    setSelectedProductTemplateId('');
    setAvailableSizes([]);
    setShowFormModal(true);
  };

  const saleTemplates = useMemo(() => {
    return sales.filter((sale) => {
      if (!salePickerSearch) return true;
      const q = salePickerSearch.toLowerCase();
      return [sale.name, sale.size, sale.user_email, sale.external_id].some((field) =>
        field?.toLowerCase().includes(q)
      );
    }).slice(0, 80);
  }, [salePickerSearch, sales]);

  const selectedSaleTemplate = useMemo(
    () => sales.find((sale) => sale.id === selectedSaleTemplateId) || null,
    [sales, selectedSaleTemplateId]
  );

  const productTemplates = useMemo(() => {
    return products.filter((product) => {
      if (!productPickerSearch) return true;
      const q = productPickerSearch.toLowerCase();
      return [product.name, product.sku].some((field) => field?.toLowerCase().includes(q));
    }).slice(0, 50);
  }, [productPickerSearch, products]);

  const applySaleTemplate = (saleId: string) => {
    const sale = sales.find((item) => item.id === saleId);
    if (!sale) return;

    setSelectedSaleTemplateId(sale.id);
    setFormState((prev) => ({
      ...prev,
      name: sale.name || '',
      size: sale.size || '',
      sku: sale.sku || '',
      image_url: sale.image_url || '',
      source_type: 'unclaimed_order',
      purchase_price: String(Number(sale.payout || 0)),
      document_type: 'zmluva',
      notes: prev.notes || `Created from sale ${sale.external_id || sale.id} (sale:${sale.id})`
    }));
    setAvailableSizes([]);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const loadProductSizes = async (productId: string) => {
    try {
      setLoadingSizes(true);
      const { data, error } = await supabase
        .from('product_price_view')
        .select('size, final_price')
        .eq('product_id', productId)
        .order('size', { ascending: true });

      if (error) throw error;

      setAvailableSizes((data || []).map((item: any) => ({
        size: item.size,
        price: item.final_price
      })));
    } catch (err) {
      setAvailableSizes([]);
    } finally {
      setLoadingSizes(false);
    }
  };

  const applyProductTemplate = async (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    setSelectedProductTemplateId(product.id);
    setFormState((prev) => ({
      ...prev,
      name: product.name || '',
      size: '',
      sku: product.sku || '',
      image_url: product.image_url || '',
      source_type: 'purchase'
    }));
    await loadProductSizes(product.id);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleSave = async () => {
    if (!formState.name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: formState.name.trim(),
        size: formState.size.trim() || null,
        sku: formState.sku.trim() || null,
        image_url: formState.image_url.trim() || null,
        source_type: formState.source_type,
        purchase_price: formState.purchase_price ? Number(formState.purchase_price) : 0,
        document_type: formState.document_type,
        notes: formState.notes.trim() || null,
        updated_at: new Date().toISOString()
      };

      if (editingItem) {
        const { error: updateError } = await supabase
          .from('warehouse_items')
          .update(payload)
          .eq('id', editingItem.id);

        if (updateError) throw updateError;
        showToast('Warehouse item updated', 'success');
      } else {
        if (createMode === 'from_sale' && !selectedSaleTemplateId) {
          throw new Error('Select a sale first');
        }
        if (createMode === 'manual_product' && !selectedProductTemplateId && !formState.name.trim()) {
          throw new Error('Select a product first');
        }

        const { error: insertError } = await supabase
          .from('warehouse_items')
          .insert([{ ...payload, status: 'available' }]);

        if (insertError) throw insertError;
        showToast('Warehouse item added', 'success');
      }

      resetForm();
      loadData();
    } catch (err: any) {
      setError('Error saving warehouse item: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: WarehouseItem) => {
    if (!confirm(`Delete warehouse item "${item.name}"?`)) return;

    try {
      setDeletingId(item.id);
      setError(null);

      const { error: deleteError } = await supabase
        .from('warehouse_items')
        .delete()
        .eq('id', item.id);

      if (deleteError) throw deleteError;

      showToast('Warehouse item deleted', 'success');
      loadData();
    } catch (err: any) {
      setError('Error deleting warehouse item: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected item(s)? This cannot be undone.`)) return;

    try {
      setBulkDeleting(true);
      setError(null);

      const { error: deleteError } = await supabase
        .from('warehouse_items')
        .delete()
        .in('id', Array.from(selectedIds));

      if (deleteError) throw deleteError;

      showToast(`${selectedIds.size} item(s) deleted`, 'success');
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      setError('Error deleting items: ' + err.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllSold = () => {
    const soldIds = filteredItems
      .filter((item) => getComputedStatus(item) === 'sold')
      .map((item) => item.id);
    setSelectedIds(new Set(soldIds));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openAssignModal = (item: WarehouseItem) => {
    setAssigningItem(item);
    setAssignmentType(item.assigned_eshop_sale_id ? 'eshop' : 'sale');
    setAssignmentSearch('');
    setSelectedAssignmentId(item.assigned_sale_id || item.assigned_eshop_sale_id || '');
  };

  const closeAssignModal = () => {
    setAssigningItem(null);
    setAssignmentSearch('');
    setSelectedAssignmentId('');
  };

  const handleAssign = async () => {
    if (!assigningItem || !selectedAssignmentId) {
      setError('Select a sale or order first');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = assignmentType === 'sale'
        ? {
            assigned_sale_id: selectedAssignmentId,
            assigned_eshop_sale_id: null,
            status: 'assigned',
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        : {
            assigned_sale_id: null,
            assigned_eshop_sale_id: selectedAssignmentId,
            status: 'assigned',
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

      const { error: updateError } = await supabase
        .from('warehouse_items')
        .update(payload)
        .eq('id', assigningItem.id);

      if (updateError) throw updateError;

      showToast('Warehouse item assigned', 'success');
      closeAssignModal();
      loadData();
    } catch (err: any) {
      setError('Error assigning warehouse item: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async (item: WarehouseItem) => {
    try {
      setSaving(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('warehouse_items')
        .update({
          assigned_sale_id: null,
          assigned_eshop_sale_id: null,
          status: 'available',
          assigned_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (updateError) throw updateError;

      showToast('Warehouse item unassigned', 'success');
      loadData();
    } catch (err: any) {
      setError('Error unassigning warehouse item: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleImportUnclaimedSales = async () => {
    if (unclaimedSaleCandidates.length === 0) return;
    if (!confirm(`Import ${unclaimedSaleCandidates.length} returned/cancelled sale(s) into warehouse?`)) return;

    try {
      setImportingUnclaimed(true);
      setError(null);
      const rows = unclaimedSaleCandidates.map((sale) => ({
        name: sale.name,
        size: sale.size || null,
        sku: sale.sku || null,
        image_url: sale.image_url || null,
        source_type: 'unclaimed_order' as SourceType,
        purchase_price: sale.payout || 0,
        document_type: 'zmluva' as DocumentType,
        status: 'available' as WarehouseStatus,
        notes: `Imported from ${sale.status} sale ${sale.external_id || sale.id} (sale:${sale.id})`,
        updated_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase.from('warehouse_items').insert(rows);
      if (insertError) throw insertError;
      showToast(`${rows.length} item(s) imported to warehouse`, 'success');
      loadData();
    } catch (err: any) {
      setError('Error importing sales: ' + err.message);
    } finally {
      setImportingUnclaimed(false);
    }
  };

  const loadSaleProfiles = async () => {
    if (users.length > 0 || loadingSaleProfiles) return;

    try {
      setLoadingSaleProfiles(true);
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .order('email', { ascending: true })
        .limit(500);

      if (profilesError) throw profilesError;
      setUsers((data || []) as UserCandidate[]);
    } catch (err: any) {
      setError('Error loading profiles: ' + err.message);
    } finally {
      setLoadingSaleProfiles(false);
    }
  };

  const openWarehouseSaleModal = (item: WarehouseItem) => {
    setSaleFromItem(item);
    setSaleProfileSearch('');
    setSelectedSaleUserId('');
    setWarehouseExternalId('');
    setWarehouseSalePrice('');
    setWarehouseSalePayout(String(Number(item.purchase_price || 0)));
    loadSaleProfiles();
  };

  const closeWarehouseSaleModal = () => {
    setSaleFromItem(null);
    setSaleProfileSearch('');
    setSelectedSaleUserId('');
    setWarehouseExternalId('');
    setWarehouseSalePrice('');
    setWarehouseSalePayout('');
  };

  const handleCreateSaleFromWarehouse = async () => {
    if (!saleFromItem) return;
    if (!selectedSaleUserId) {
      setError('Select a user profile first');
      return;
    }
    const price = Number(warehouseSalePrice);
    const payout = Number(warehouseSalePayout);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Sale price must be a positive number');
      return;
    }
    if (!Number.isFinite(payout) || payout < 0 || payout > price) {
      setError('Payout must be between 0 and sale price');
      return;
    }

    try {
      setCreatingWarehouseSale(true);
      setError(null);

      const selectedUser = users.find((user) => user.id === selectedSaleUserId);
      const saleDateISO = new Date().toISOString();
      const saleData = {
        user_id: selectedSaleUserId,
        product_id: saleFromItem.id,
        name: saleFromItem.name,
        size: saleFromItem.size || '',
        price,
        payout,
        sku: saleFromItem.sku || null,
        external_id: warehouseExternalId || null,
        image_url: saleFromItem.image_url || null,
        status: 'accepted',
        is_manual: true,
        sale_type: 'operational',
        created_at: saleDateISO,
        invoice_date: saleDateISO,
        manual_sale_items: [{
          productName: saleFromItem.name,
          size: saleFromItem.size || '',
          price,
          payout
        }]
      };

      const { data: insertedSale, error: saleError } = await supabase
        .from('user_sales')
        .insert([saleData])
        .select('id')
        .single();
      if (saleError) throw saleError;

      const { error: warehouseError } = await supabase
        .from('warehouse_items')
        .update({
          assigned_sale_id: insertedSale.id,
          assigned_eshop_sale_id: null,
          status: 'assigned',
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          notes: [
            saleFromItem.notes,
            `Generated sale ${warehouseExternalId || insertedSale.id} for ${selectedUser?.email || selectedSaleUserId}`
          ].filter(Boolean).join('\n')
        })
        .eq('id', saleFromItem.id);
      if (warehouseError) throw warehouseError;

      showToast('Sale created from warehouse item', 'success');
      closeWarehouseSaleModal();
      loadData();
    } catch (err: any) {
      setError('Error creating sale from warehouse: ' + err.message);
    } finally {
      setCreatingWarehouseSale(false);
    }
  };

  const quickAddFilteredProducts = useMemo(() => {
    if (!quickAddSearch) return products.slice(0, 40);
    const q = quickAddSearch.toLowerCase();
    return products.filter((p) => [p.name, p.sku].some((f) => f?.toLowerCase().includes(q))).slice(0, 40);
  }, [quickAddSearch, products]);

  const handleQuickAddSelectProduct = async (product: ProductCandidate) => {
    if (quickAddProductId === product.id) {
      setQuickAddProductId('');
      setQuickAddSize('');
      setQuickAddPrice('');
      setQuickAddSizes([]);
      return;
    }
    setQuickAddProductId(product.id);
    setQuickAddSize('');
    setQuickAddPrice('');
    try {
      setLoadingQuickAddSizes(true);
      const { data } = await supabase
        .from('product_price_view')
        .select('size, final_price')
        .eq('product_id', product.id)
        .order('size', { ascending: true });
      setQuickAddSizes((data || []).map((d: any) => ({ size: d.size, price: d.final_price })));
    } finally {
      setLoadingQuickAddSizes(false);
    }
  };

  const handleQuickAddSave = async (product: ProductCandidate) => {
    if (!quickAddSize) { setError('Select a size'); return; }
    try {
      setSavingQuickAdd(true);
      setError(null);
      const { error: insertError } = await supabase.from('warehouse_items').insert([{
        name: product.name,
        size: quickAddSize,
        sku: product.sku || null,
        image_url: product.image_url || null,
        source_type: 'purchase',
        purchase_price: quickAddPrice ? Number(quickAddPrice) : 0,
        document_type: quickAddDocType,
        status: 'available',
        updated_at: new Date().toISOString()
      }]);
      if (insertError) throw insertError;
      showToast(`${product.name} EU ${quickAddSize} added`, 'success');
      setQuickAddProductId('');
      setQuickAddSize('');
      setQuickAddPrice('');
      setQuickAddSizes([]);
      loadData();
    } catch (err: any) {
      setError('Error: ' + err.message);
    } finally {
      setSavingQuickAdd(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleExportCSV = () => {
    const rows = [
      ['Name', 'Size', 'SKU', 'Source', 'Purchase Price', 'Status', 'Assigned To', 'Added'],
      ...filteredItems.map((item) => {
        const status = getComputedStatus(item);
        const linked = getLinkedLabel(item) || '';
        return [
          item.name,
          item.size || '',
          item.sku || '',
          item.source_type === 'purchase' ? 'Buyout' : 'Unclaimed',
          item.purchase_price?.toString() || '0',
          status,
          linked,
          formatDate(item.created_at, false)
        ];
      })
    ];

    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouse-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-amber-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Loading warehouse</h3>
          <p className="text-sm text-gray-500">Please wait...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 py-2.5 sm:px-6 lg:px-8 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="flex items-center justify-center w-8 h-8 sm:w-11 sm:h-11 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl sm:rounded-2xl shadow-md">
                <FaWarehouse className="text-white text-base sm:text-xl" />
              </div>
              <div>
                <h1 className="text-base sm:text-2xl font-bold text-white tracking-tight">Warehouse</h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Pairs you bought or kept from unclaimed orders</p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <button
                onClick={handleRefresh}
                title="Obnoviť"
                className="inline-flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-xs sm:text-sm"
              >
                <FaSync className={`text-xs sm:text-sm ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline ml-1.5">Refresh</span>
              </button>
              <button
                onClick={handleSignOut}
                title="Odhlásiť sa"
                className="inline-flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-xs sm:text-sm"
              >
                <FaSignOutAlt className="text-xs sm:text-sm" />
                <span className="hidden sm:inline ml-1.5">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <AdminNavigation />

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center">
              <FaExclamationTriangle className="text-red-400 mr-3 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-3 flex-shrink-0">
              <FaTimes className="text-red-400" />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-6">
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200 shadow-sm flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
              <FaWarehouse className="text-gray-600 text-base" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 leading-tight">Total Pairs</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">{stats.total}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200 shadow-sm flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <FaCheckCircle className="text-emerald-500 text-base" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 leading-tight">Available</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 leading-tight">{stats.available}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200 shadow-sm flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <FaClock className="text-amber-500 text-base" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 leading-tight">Assigned</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-600 leading-tight">{stats.assigned}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200 shadow-sm flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <FaShoppingBag className="text-blue-500 text-base" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 leading-tight">Sold</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 leading-tight">{stats.sold}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200 shadow-sm flex items-center gap-2 sm:gap-3 col-span-2 sm:col-span-1 lg:col-span-1 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
              <FaEuroSign className="text-violet-500 text-base" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 leading-tight">Stock Value</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 leading-tight truncate">{formatCurrency(stats.purchaseValue)}</p>
            </div>
          </div>
        </div>

        {unclaimedSaleCandidates.length > 0 && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <FaBoxOpen className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    {unclaimedSaleCandidates.length} returned/cancelled sale{unclaimedSaleCandidates.length === 1 ? '' : 's'} can be moved to warehouse
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    Import uses the sale payout as buyout value and skips sales already imported.
                  </p>
                </div>
              </div>
              <button
                onClick={handleImportUnclaimedSales}
                disabled={importingUnclaimed}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-700 disabled:opacity-50"
              >
                <FaPlus className="text-xs" />
                {importingUnclaimed ? 'Importing...' : 'Import returns'}
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">
                Warehouse Items
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {filteredItems.length} {filteredItems.length !== items.length ? `of ${items.length}` : ''}
                  {(searchTerm || sourceFilter || statusFilter) && filteredItems.length > 0 &&
                    <span className="ml-1 text-violet-600 font-medium">· {formatCurrency(filteredPurchaseValue)}</span>
                  }
                </span>
              </h2>
              <p className="text-sm text-gray-500">Track internal stock and connect it to sales</p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:items-center lg:flex-wrap">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                <input
                  type="text"
                  placeholder="Search pair, sku, order..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 lg:w-52"
                />
              </div>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 lg:w-auto"
              >
                <option value="">All Sources</option>
                <option value="purchase">Buyout</option>
                <option value="unclaimed_order">Unclaimed Order</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 lg:w-auto"
              >
                <option value="">All Statuses</option>
                <option value="available">Available</option>
                <option value="assigned">Assigned</option>
                <option value="sold">Sold</option>
              </select>
              <button
                onClick={handleExportCSV}
                title="Export CSV"
                className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all text-sm"
              >
                <FaFileExport className="mr-1.5 text-xs" />
                Export
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center px-4 py-2 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-all text-sm shadow-sm"
              >
                <FaPlus className="mr-2 text-xs" />
                Add Pair
              </button>
            </div>
          </div>

          {/* Sort bar */}
          <div className="px-4 sm:px-6 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-400 mr-2">Sort:</span>
            {(['name', 'purchase_price', 'created_at', 'status'] as SortField[]).map((field) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${sortField === field ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:bg-gray-200'}`}
              >
                {field === 'name' ? 'Name' : field === 'purchase_price' ? 'Price' : field === 'created_at' ? 'Date' : 'Status'}
                <SortIcon field={field} />
              </button>
            ))}

            {soldItems.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                {selectedIds.size === 0 ? (
                  <button
                    onClick={selectAllSold}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    Select all sold ({soldItems.length})
                  </button>
                ) : (
                  <>
                    <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
                    <button
                      onClick={clearSelection}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleting}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <FaTrash className="mr-1" />
                      {bulkDeleting ? 'Deleting...' : 'Delete selected'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="p-4 sm:p-6">
            {filteredItems.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FaBoxOpen className="text-gray-400 text-2xl" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">No warehouse items</h3>
                <p className="text-sm text-gray-500">Add your first pair or change the filters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => {
                  const computedStatus = getComputedStatus(item);
                  const linkedLabel = getLinkedLabel(item);
                  const isAssigned = item.assigned_sale_id || item.assigned_eshop_sale_id;
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`border rounded-2xl p-4 bg-white hover:border-gray-300 hover:shadow-sm transition-all ${isSelected ? 'border-red-300 bg-red-50/30' : 'border-gray-200'}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                        {/* Checkbox */}
                        <div className="flex-shrink-0 self-center sm:self-start sm:pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.id)}
                            className="w-4 h-4 accent-red-500 cursor-pointer"
                          />
                        </div>

                        {/* Image */}
                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 p-2">
                          <img
                            loading="lazy"
                            src={item.image_url || '/default-image.png'}
                            alt={item.name}
                            className="h-full w-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/default-image.png'; }}
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Name + badges row */}
                          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <h3 className="text-base font-semibold text-gray-900 leading-tight break-words">{item.name}</h3>
                              <p className="text-sm text-gray-500 mt-0.5">
                                {item.size ? <span className="font-medium text-gray-700">EU {item.size}</span> : 'No size'}
                                {item.sku && <span className="ml-2 text-gray-400 break-all">{item.sku}</span>}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                computedStatus === 'available'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : computedStatus === 'assigned'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-blue-100 text-blue-700'
                              }`}>
                                {computedStatus === 'available' ? 'Available' : computedStatus === 'assigned' ? 'Assigned' : 'Sold'}
                              </span>
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                                {item.source_type === 'purchase' ? 'Buyout' : 'Unclaimed'}
                              </span>
                            </div>
                          </div>

                          {/* Details row */}
                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm mb-2">
                            <div>
                              <span className="text-gray-400 text-xs">Bought for </span>
                              <span className="font-semibold text-gray-900">{formatCurrency(item.purchase_price || 0)}</span>
                            </div>
                            <div>
                              <span className="text-gray-400 text-xs">Added </span>
                              <span className="text-gray-700">{formatDate(item.created_at, false)}</span>
                            </div>
                          </div>

                          {/* Linked sale */}
                          {linkedLabel ? (
                            <button
                              onClick={() => handleLinkedClick(item)}
                              className="flex items-center gap-2 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl w-full text-left hover:bg-amber-100 transition-colors group"
                            >
                              <FaLink className="text-amber-500 text-xs flex-shrink-0" />
                              <p className="text-xs text-amber-800 truncate flex-1">{linkedLabel}</p>
                              <FaChartLine className="text-amber-400 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl">
                              <p className="text-xs text-gray-400">Not assigned to any sale</p>
                            </div>
                          )}

                          {item.notes && (
                            <p className="text-xs text-gray-500 mt-2 italic">"{item.notes}"</p>
                          )}

                          {/* History toggle */}
                          <button
                            onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                            className="flex items-center gap-1.5 mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <FaHistory className="text-xs" />
                            <span>História</span>
                            {expandedHistoryId === item.id ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
                          </button>

                          {expandedHistoryId === item.id && (
                            <div className="mt-2 pl-2 border-l-2 border-gray-200 space-y-2">
                              {/* Created */}
                              <div className="flex items-start gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1 flex-shrink-0" />
                                <div>
                                  <p className="text-xs font-medium text-gray-700">Pridaný do skladu</p>
                                  <p className="text-xs text-gray-400">{formatDate(item.created_at, false)}</p>
                                </div>
                              </div>
                              {/* Assigned */}
                              {item.assigned_at && (
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1 flex-shrink-0" />
                                  <div>
                                    <p className="text-xs font-medium text-gray-700">Priradený k predaju</p>
                                    <p className="text-xs text-gray-400">{formatDate(item.assigned_at, false)}</p>
                                    {linkedLabel && <p className="text-xs text-gray-500 truncate">{linkedLabel}</p>}
                                  </div>
                                </div>
                              )}
                              {/* Sold */}
                              {computedStatus === 'sold' && (
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-1 flex-shrink-0" />
                                  <div>
                                    <p className="text-xs font-medium text-gray-700">Predaný</p>
                                    <p className="text-xs text-gray-400">~{formatDate(item.updated_at, false)}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col sm:flex-nowrap">
                          <button
                            onClick={() => openEditModal(item)}
                            title="Edit"
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
                          >
                            <FaEdit />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => openAssignModal(item)}
                            title="Assign"
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
                          >
                            <FaLink />
                            <span>Assign</span>
                          </button>
                          {computedStatus === 'available' && (
                            <button
                              onClick={() => openWarehouseSaleModal(item)}
                              title="Create sale"
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-all"
                            >
                              <FaUser />
                              <span>Create sale</span>
                            </button>
                          )}
                          {isAssigned && (
                            <button
                              onClick={() => handleUnassign(item)}
                              title="Unassign"
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-amber-200 rounded-xl text-xs font-medium text-amber-700 hover:bg-amber-50 transition-all"
                            >
                              <FaTimes />
                              <span>Unassign</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={deletingId === item.id}
                            title="Delete"
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-red-200 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 transition-all disabled:opacity-40"
                          >
                            <FaTrash />
                            <span>{deletingId === item.id ? '...' : 'Delete'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add / Edit Modal */}
      {showFormModal && (
        <AdminDetailSheet
          zIndex="z-[70]"
          maxWidth="2xl"
          onBackdropClick={resetForm}
          contentClassName="p-3 sm:p-6 space-y-4"
          header={(
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{editingItem ? 'Edit Warehouse Item' : 'Add from Sale'}</h3>
                <p className="text-sm text-gray-500">{editingItem ? 'Update warehouse evidence.' : 'Select an existing sale and store that pair in warehouse.'}</p>
              </div>
              <button onClick={resetForm} className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                <FaTimes className="text-gray-500" />
              </button>
            </div>
          )}
          footer={(
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
              <button
                onClick={resetForm}
                className="px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-100 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || loadingSizes || (!editingItem && !selectedSaleTemplateId)}
                className="inline-flex items-center justify-center px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 text-sm shadow-sm"
              >
                <FaSave className="mr-2" />
                {loadingSizes ? 'Loading sizes...' : saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Add to Warehouse'}
              </button>
            </div>
          )}
        >
              {!editingItem && (
                <div className="space-y-3 rounded-2xl border border-gray-200 p-4 bg-gray-50">
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                    <input
                      type="text"
                      placeholder="Search sale, email, external ID..."
                      value={salePickerSearch}
                      onChange={(e) => setSalePickerSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
                    {saleTemplates.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500 text-center">No matching sales found.</div>
                    ) : (
                      saleTemplates.map((sale) => (
                        <button
                          key={sale.id}
                          type="button"
                          onClick={() => applySaleTemplate(sale.id)}
                          className={`w-full px-4 py-3 text-left transition-colors ${selectedSaleTemplateId === sale.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-1">
                              <img
                                loading="lazy"
                                src={sale.image_url || '/default-image.png'}
                                alt={sale.name}
                                className="h-full w-full object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).src = '/default-image.png'; }}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{sale.name} {sale.size ? `· EU ${sale.size}` : ''}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {sale.user_email}{sale.external_id ? ` · ${sale.external_id}` : ''} · {sale.status} · payout {formatCurrency(sale.payout || 0)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div ref={formRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!editingItem && selectedSaleTemplate && (
                  <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-emerald-200 bg-white p-1.5">
                        <img
                          loading="lazy"
                          src={selectedSaleTemplate.image_url || '/default-image.png'}
                          alt={selectedSaleTemplate.name}
                          className="h-full w-full object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/default-image.png'; }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{selectedSaleTemplate.name}</p>
                        <p className="text-xs text-gray-600">
                          {selectedSaleTemplate.size ? `EU ${selectedSaleTemplate.size}` : 'No size'}
                          {selectedSaleTemplate.sku ? ` · ${selectedSaleTemplate.sku}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-emerald-800">
                          Warehouse value from payout: <span className="font-semibold">{formatCurrency(selectedSaleTemplate.payout || 0)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {editingItem && (
                  <>
                    {formState.image_url && (
                      <div className="sm:col-span-2 flex items-center gap-4 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5">
                          <img
                            loading="lazy"
                            src={formState.image_url}
                            alt={formState.name || 'Product preview'}
                            className="h-full w-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/default-image.png'; }}
                          />
                        </div>
                        <p className="text-sm font-medium text-gray-700 truncate">{formState.name || 'Product'}</p>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold text-gray-900 mb-1.5">Name *</label>
                      <input
                        value={formState.name}
                        onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-1.5">Size (EU)</label>
                      <input
                        value={formState.size}
                        onChange={(e) => setFormState((prev) => ({ ...prev, size: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-1.5">SKU</label>
                      <input
                        value={formState.sku}
                        onChange={(e) => setFormState((prev) => ({ ...prev, sku: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-1.5">Source</label>
                      <select
                        value={formState.source_type}
                        onChange={(e) => setFormState((prev) => ({ ...prev, source_type: e.target.value as SourceType }))}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                      >
                        <option value="purchase">Buyout</option>
                        <option value="unclaimed_order">Unclaimed Order</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-1.5">Warehouse Value (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formState.purchase_price}
                        onChange={(e) => setFormState((prev) => ({ ...prev, purchase_price: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                      />
                    </div>
                  </>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">Notes</label>
                  <textarea
                    value={formState.notes}
                    onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none text-sm"
                  />
                </div>
              </div>
        </AdminDetailSheet>
      )}

      {/* Create Sale From Warehouse Modal */}
      {saleFromItem && (
        <AdminDetailSheet
          zIndex="z-[75]"
          maxWidth="2xl"
          onBackdropClick={closeWarehouseSaleModal}
          contentClassName="p-3 sm:p-6 space-y-4"
          header={(
            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-3">
                <h3 className="text-lg font-bold text-gray-900">Create Sale from Warehouse</h3>
                <p className="text-sm text-gray-500 truncate">{saleFromItem.name}{saleFromItem.size ? ` · EU ${saleFromItem.size}` : ''}</p>
              </div>
              <button onClick={closeWarehouseSaleModal} className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                <FaTimes className="text-gray-500" />
              </button>
            </div>
          )}
          footer={(
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
              <button
                onClick={closeWarehouseSaleModal}
                className="px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-100 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSaleFromWarehouse}
                disabled={creatingWarehouseSale || !selectedSaleUserId || !warehouseSalePrice}
                className="inline-flex items-center justify-center px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 text-sm shadow-sm"
              >
                <FaShoppingBag className="mr-2" />
                {creatingWarehouseSale ? 'Creating...' : 'Create sale'}
              </button>
            </div>
          )}
        >
          <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-2">
              <img
                loading="lazy"
                src={saleFromItem.image_url || '/default-image.png'}
                alt={saleFromItem.name}
                className="h-full w-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = '/default-image.png'; }}
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{saleFromItem.name}</p>
              <p className="text-xs text-gray-500">
                {saleFromItem.size ? `EU ${saleFromItem.size}` : 'No size'}
                {saleFromItem.sku ? ` · ${saleFromItem.sku}` : ''}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Stock value <span className="font-semibold text-gray-900">{formatCurrency(saleFromItem.purchase_price || 0)}</span>
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-900">Profile</label>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
              <input
                type="text"
                placeholder="Search profile by email or name..."
                value={saleProfileSearch}
                onChange={(e) => setSaleProfileSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {loadingSaleProfiles ? (
                <div className="p-4 text-sm text-gray-500 text-center">Loading profiles...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">No matching profiles found.</div>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedSaleUserId === user.id;
                  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedSaleUserId(user.id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${isSelected ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                          {fullName && <p className="text-xs text-gray-500 truncate">{fullName}</p>}
                        </div>
                        {isSelected && (
                          <span className="flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                            Selected
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedSaleUser && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Sale will be created for <span className="font-semibold">{selectedSaleUser.email}</span>.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1.5">External ID</label>
              <input
                value={warehouseExternalId}
                onChange={(e) => setWarehouseExternalId(e.target.value)}
                placeholder="Order ID"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1.5">Sale Price (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={warehouseSalePrice}
                onChange={(e) => setWarehouseSalePrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1.5">Payout (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={warehouseSalePayout}
                onChange={(e) => setWarehouseSalePayout(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
              />
            </div>
          </div>
        </AdminDetailSheet>
      )}

      {/* Assign Modal */}
      {assigningItem && (
        <AdminDetailSheet
          zIndex="z-[70]"
          maxWidth="2xl"
          onBackdropClick={closeAssignModal}
          contentClassName="p-3 sm:p-6 space-y-4"
          header={(
            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-3">
                <h3 className="text-lg font-bold text-gray-900">Assign to Sale</h3>
                <p className="text-sm text-gray-500 truncate">{assigningItem.name}{assigningItem.size ? ` · EU ${assigningItem.size}` : ''}</p>
              </div>
              <button onClick={closeAssignModal} className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                <FaTimes className="text-gray-500" />
              </button>
            </div>
          )}
          footer={(
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
              <button
                onClick={closeAssignModal}
                className="px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-100 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={saving || !selectedAssignmentId}
                className="inline-flex items-center justify-center px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 text-sm shadow-sm"
              >
                <FaLink className="mr-2" />
                {saving ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          )}
        >
              <div className="inline-flex rounded-xl border border-gray-300 p-1 bg-gray-100">
                <button
                  onClick={() => { setAssignmentType('sale'); setAssignmentSearch(''); setSelectedAssignmentId(''); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${assignmentType === 'sale' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Consignment Sale
                </button>
                <button
                  onClick={() => { setAssignmentType('eshop'); setAssignmentSearch(''); setSelectedAssignmentId(''); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${assignmentType === 'eshop' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Eshop Order
                </button>
              </div>

              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                <input
                  type="text"
                  placeholder={assignmentType === 'sale' ? 'Search sale, email, external ID...' : 'Search order, product, email...'}
                  value={assignmentSearch}
                  onChange={(e) => setAssignmentSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                />
              </div>

              <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                {filteredSaleCandidates.length === 0 ? (
                  <div className="p-6 text-sm text-gray-500 text-center">No matching records found.</div>
                ) : (
                  filteredSaleCandidates.map((record: any) => {
                    const isSelected = selectedAssignmentId === record.id;
                    const label = assignmentType === 'sale'
                      ? `${record.name}${record.external_id ? ` · ${record.external_id}` : ''}`
                      : `${record.order_number} · ${record.product_name}`;
                    const sub = assignmentType === 'sale'
                      ? record.user_email
                      : record.customer_email || 'No email';
                    return (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => setSelectedAssignmentId(record.id)}
                        className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
                            <p className="text-xs text-gray-500">{sub} · {record.size || 'No size'} · {record.status}</p>
                          </div>
                          {isSelected && (
                            <span className="flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                              Selected
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
        </AdminDetailSheet>
      )}
    </div>
  );
}
