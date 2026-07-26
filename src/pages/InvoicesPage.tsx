import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaFileContract,
  FaFileInvoice,
  FaFilePdf,
  FaLink,
  FaSearch,
  FaSignOutAlt,
  FaSync,
  FaTimes,
  FaUnlink,
} from 'react-icons/fa';
import AdminNavigation from '../components/AdminNavigation';
import InvoiceEmailImportPanel from '../components/InvoiceEmailImportPanel';
import { useToast } from '../components/Toast';
import { generatePurchaseAgreement, uploadContractToStorage } from '../lib/pdfGenerator';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDateShort } from '../lib/utils';

interface InvoiceSale {
  id: string;
  source: 'user_sales' | 'eshop_sales';
  name: string;
  size: string | null;
  price: number;
  payout: number;
  invoice_date: string | null;
  created_at: string;
  status: string;
  image_url?: string | null;
  user_id?: string | null;
  user_email: string;
  sku?: string | null;
  external_id?: string | null;
  fa_url?: string | null;
  contract_url?: string | null;
  is_manual?: boolean;
  manual_sale_items?: Array<{
    productName: string;
    size: string;
    price: number;
    payout?: number;
  }> | null;
  profiles?: {
    email: string;
  } | null;
}

interface ImportedInvoice {
  id: string;
  name: string;
  path: string;
  folder: 'matched' | 'unmatched';
  orderNumber: string | null;
  publicUrl: string;
  updatedAt: string | null;
  size: number;
  extractedProduct?: string | null;
  extractedTotal?: number | null;
  extractedItems?: Array<{ product?: string; total?: number | null }> | null;
  extractionStatus?: string | null;
  extractionError?: string | null;
  linkedSale?: InvoiceSale | null;
}

type ViewMode = 'files' | 'missing' | 'contracts';

const normalizeOrderNumber = (value?: string | null) => {
  if (!value) return null;
  return value.trim().replace(/\.pdf$/i, '').replace(/[_-]\d+$/, '');
};

const extractOrderNumber = (value: string) => {
  const patterns = [
    /(?:^|[^0-9])((?:202\d{5})(?:[_-]\d+)?)(?=$|[^0-9])/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return normalizeOrderNumber(match[1]);
  }

  return null;
};

const saleMatchesOrder = (sale: InvoiceSale, orderNumber: string) => {
  const saleExternalId = normalizeOrderNumber(sale.external_id);
  if (saleExternalId === orderNumber) return true;
  return Boolean(sale.external_id?.toLowerCase().includes(orderNumber.toLowerCase()));
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return '-';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const statusBadge = (status: string) => {
  if (status === 'completed') return 'bg-green-100 text-green-800';
  if (status === 'delivered') return 'bg-indigo-100 text-indigo-800';
  if (status === 'shipped') return 'bg-purple-100 text-purple-800';
  if (status === 'processing') return 'bg-yellow-100 text-yellow-800';
  if (status === 'accepted') return 'bg-blue-100 text-blue-800';
  if (status === 'cancelled') return 'bg-red-100 text-red-800';
  if (status === 'returned') return 'bg-orange-100 text-orange-800';
  return 'bg-gray-100 text-gray-800';
};

export default function InvoicesPage() {
  const { showToast } = useToast();
  const [sales, setSales] = useState<InvoiceSale[]>([]);
  const [files, setFiles] = useState<ImportedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('files');
  const [attachModalFile, setAttachModalFile] = useState<ImportedInvoice | null>(null);
  const [attachTarget, setAttachTarget] = useState('');
  const [attachingPath, setAttachingPath] = useState<string | null>(null);
  const [generatingContractId, setGeneratingContractId] = useState<string | null>(null);
  const [payoutModalSale, setPayoutModalSale] = useState<InvoiceSale | null>(null);
  const [payoutDraft, setPayoutDraft] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);

  const linkFilesToSales = useCallback((nextFiles: ImportedInvoice[], nextSales: InvoiceSale[]) => {
    return nextFiles.map((file) => {
      const linkedByUrl = nextSales.find((sale) => sale.fa_url && sale.fa_url.includes(`/invoices/${file.path}`));
      const linkedByOrder = file.orderNumber
        ? nextSales.find((sale) => saleMatchesOrder(sale, file.orderNumber as string))
        : null;

      return {
        ...file,
        linkedSale: linkedByUrl || linkedByOrder || null,
      };
    });
  }, []);

  const loadSales = useCallback(async () => {
    const { data: userSales, error: salesError } = await supabase
      .from('user_sales')
      .select(`
        id, user_id, name, size, price, payout, invoice_date, created_at, status, image_url,
        external_id, sku, fa_url, contract_url, is_manual, manual_sale_items, profiles(email)
      `)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (salesError) throw salesError;

    const { data: eshopSales, error: eshopError } = await supabase
      .from('eshop_sales')
      .select(`
        id, order_number, product_name, size, price, payout, status, image_url,
        customer_email, sku, fa_url, order_created_at, created_at
      `)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (eshopError) throw eshopError;

    const normalizedUserSales = (userSales || []).map((sale: any) => ({
      ...sale,
      source: 'user_sales' as const,
      user_email: sale.profiles?.email || 'N/A',
    }));

    const normalizedEshopSales = (eshopSales || []).map((sale: any) => ({
      id: sale.id,
      source: 'eshop_sales' as const,
      name: sale.product_name,
      size: sale.size,
      price: Number(sale.price || 0),
      payout: Number(sale.payout || 0),
      invoice_date: sale.order_created_at || sale.created_at,
      created_at: sale.created_at,
      status: sale.status,
      image_url: sale.image_url,
      user_id: null,
      user_email: sale.customer_email || 'Eshop',
      sku: sale.sku,
      external_id: sale.order_number,
      fa_url: sale.fa_url,
      contract_url: null,
      is_manual: false,
      manual_sale_items: null,
      profiles: null,
    }));

    return [...normalizedEshopSales, ...normalizedUserSales] as InvoiceSale[];
  }, []);

  const loadFilesFromStorage = useCallback(async () => {
    const folders: Array<'matched' | 'unmatched'> = ['matched', 'unmatched'];
    const loaded: ImportedInvoice[] = [];

    for (const folder of folders) {
      const { data, error: listError } = await supabase.storage
        .from('invoices')
        .list(folder, {
          limit: 100,
          sortBy: { column: 'updated_at', order: 'desc' },
        });

      if (listError) throw listError;

      for (const item of data || []) {
        if (!item.name || item.name === '.emptyFolderPlaceholder') continue;
        const path = `${folder}/${item.name}`;
        const publicUrl = supabase.storage.from('invoices').getPublicUrl(path).data.publicUrl;
        loaded.push({
          id: path,
          name: item.name,
          path,
          folder,
          orderNumber: extractOrderNumber(item.name),
          publicUrl,
          updatedAt: item.updated_at || item.created_at || null,
          size: Number(item.metadata?.size || 0),
        });
      }
    }

    return loaded;
  }, []);

  const loadFiles = useCallback(async () => {
    const storageFiles = await loadFilesFromStorage();

    const { data: documentRows, error: documentsError } = await supabase
      .from('invoice_documents')
      .select('id, storage_path, file_name, order_number, public_url, status, updated_at, imported_at, extracted_product, extracted_total, extracted_items, extraction_status, extraction_error')
      .eq('document_type', 'fa')
      .order('imported_at', { ascending: false })
      .limit(250);

    const tableIsMissing = documentsError && /invoice_documents|schema cache|does not exist|not found/i.test(documentsError.message || '');
    if (documentsError && !tableIsMissing) throw documentsError;

    const byPath = new Map<string, ImportedInvoice>();
    storageFiles.forEach((file) => byPath.set(file.path, file));

    if (!documentsError) {
      (documentRows || []).forEach((row: any) => {
        const path = row.storage_path;
        if (!path) return;

        const fallback = byPath.get(path);
        const folder = path.startsWith('matched/') ? 'matched' : 'unmatched';
        byPath.set(path, {
          id: path,
          name: row.file_name || fallback?.name || path.split('/').pop() || path,
          path,
          folder,
          orderNumber: normalizeOrderNumber(row.order_number) || fallback?.orderNumber || extractOrderNumber(path),
          publicUrl: row.public_url || fallback?.publicUrl || supabase.storage.from('invoices').getPublicUrl(path).data.publicUrl,
          updatedAt: row.updated_at || row.imported_at || fallback?.updatedAt || null,
          size: fallback?.size || 0,
          extractedProduct: row.extracted_product || null,
          extractedTotal: row.extracted_total !== null && row.extracted_total !== undefined ? Number(row.extracted_total) : null,
          extractedItems: Array.isArray(row.extracted_items) ? row.extracted_items : [],
          extractionStatus: row.extraction_status || null,
          extractionError: row.extraction_error || null,
          linkedSale: fallback?.linkedSale || null,
        });
      });
    }

    return Array.from(byPath.values()).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }, [loadFilesFromStorage]);

  const loadPage = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);
      const [nextSales, nextFiles] = await Promise.all([loadSales(), loadFiles()]);
      setSales(nextSales);
      setFiles(linkFilesToSales(nextFiles, nextSales));
    } catch (err: any) {
      setError(err.message || 'Error loading invoices');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [linkFilesToSales, loadFiles, loadSales, refreshing]);

  useEffect(() => {
    loadPage();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPage();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const openAttachModal = (file: ImportedInvoice) => {
    const suggestedSale = file.orderNumber
      ? attachableSales.find((sale) => saleMatchesOrder(sale, file.orderNumber as string))
      : null;
    setAttachModalFile(file);
    setAttachTarget(suggestedSale ? `${suggestedSale.source}:${suggestedSale.id}` : '');
  };

  const closeAttachModal = () => {
    if (attachingPath) return;
    setAttachModalFile(null);
    setAttachTarget('');
  };

  const attachFileToSale = async () => {
    if (!attachModalFile) return;
    const target = attachTarget;
    if (!target) {
      showToast('Select sale first', 'error');
      return;
    }

    try {
      setAttachingPath(attachModalFile.id);
      const [source, saleId] = target.split(':');
      const { error: updateError } = await supabase
        .from(source === 'eshop_sales' ? 'eshop_sales' : 'user_sales')
        .update({ fa_url: attachModalFile.publicUrl, updated_at: new Date().toISOString() })
        .eq('id', saleId);

      if (updateError) throw updateError;

      const now = new Date().toISOString();
      const { error: documentError } = await supabase
        .from('invoice_documents')
        .upsert({
          document_type: 'fa',
          status: 'matched',
          bucket: 'invoices',
          storage_path: attachModalFile.path,
          public_url: attachModalFile.publicUrl,
          file_name: attachModalFile.name,
          order_number: attachModalFile.orderNumber,
          matched_target: source === 'eshop_sales' ? 'eshop_sales' : 'user_sales',
          user_sale_id: source === 'user_sales' ? saleId : null,
          eshop_sale_id: source === 'eshop_sales' ? saleId : null,
          source: 'manual_attach',
          updated_at: now,
        }, { onConflict: 'storage_path' });

      if (documentError) throw documentError;

      showToast('Invoice attached', 'success');
      setAttachModalFile(null);
      setAttachTarget('');
      await loadPage();
    } catch (err: any) {
      showToast(err.message || 'Attach failed', 'error');
    } finally {
      setAttachingPath(null);
    }
  };

  const buildSellerAddress = (profile: any) => {
    const addressBase = (profile.address || '').trim();
    const houseNumber = (profile.popisne_cislo || '').trim();
    const addressHasNumber = houseNumber && addressBase.toLowerCase().includes(houseNumber.toLowerCase());
    const streetAndNumber = [addressBase, addressHasNumber ? '' : houseNumber].filter(Boolean).join(' ');
    const parts = [];

    if (streetAndNumber) parts.push(streetAndNumber);
    if (profile.psc && profile.mesto) parts.push(`${profile.psc} ${profile.mesto}`);
    else if (profile.mesto) parts.push(profile.mesto);
    parts.push(profile.krajina || 'Slovakia');

    return parts.join(', ');
  };

  const generateContractForSale = async (sale: InvoiceSale) => {
    if (sale.source !== 'user_sales') {
      showToast('Zmluvu vieme generovať len pre consign sale', 'error');
      return;
    }

    try {
      setGeneratingContractId(sale.id);

      const { data: freshSale, error: freshSaleError } = await supabase
        .from('user_sales')
        .select('id, user_id, name, size, price, is_manual, payout, created_at, external_id, invoice_date, manual_sale_items')
        .eq('id', sale.id)
        .single();

      if (freshSaleError || !freshSale) {
        throw new Error(freshSaleError?.message || 'Failed to load sale data');
      }

      if (!freshSale.user_id) {
        throw new Error('Sale nemá priradený profil predajcu');
      }

      const { data: freshProfile, error: freshProfileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, ico, address, popisne_cislo, psc, mesto, krajina, email, telephone, iban, signature_url')
        .eq('id', freshSale.user_id)
        .single();

      if (freshProfileError || !freshProfile) {
        throw new Error(freshProfileError?.message || 'Failed to load user profile');
      }

      const { data: adminSettings } = await supabase
        .from('admin_settings')
        .select('buyer_signature_url')
        .single();

      const contractDateISO = freshSale.invoice_date || freshSale.created_at || new Date().toISOString();
      const pdfBlob = await generatePurchaseAgreement({
        saleId: sale.id,
        externalId: freshSale.external_id || undefined,
        formId: sale.id,
        productName: freshSale.name,
        size: freshSale.size || '',
        price: Number(freshSale.price || 0),
        isManual: Boolean(freshSale.is_manual),
        payout: Number(freshSale.payout || 0),
        items: Array.isArray(freshSale.manual_sale_items) ? freshSale.manual_sale_items : undefined,
        buyerName: 'Juraj Orlicky ml.',
        buyerCIN: '55702660',
        buyerAddress: 'Lysica 336, 013 05 Lysica, SLOVAKIA',
        buyerEmail: 'info@airkicks.eu',
        buyerSignatureUrl: adminSettings?.buyer_signature_url || undefined,
        sellerName: freshProfile.first_name || '',
        sellerSurname: freshProfile.last_name || '',
        sellerCIN: freshProfile.ico || undefined,
        sellerAddress: buildSellerAddress(freshProfile),
        sellerEmail: freshProfile.email || sale.user_email,
        sellerPhone: freshProfile.telephone || undefined,
        sellerIBAN: freshProfile.iban || undefined,
        sellerSignatureUrl: freshProfile.signature_url || undefined,
        location: freshProfile.mesto || 'Slovakia',
        saleDate: contractDateISO,
      });

      const storageFileId = freshSale.external_id || sale.id;
      const url = await uploadContractToStorage(storageFileId, pdfBlob);

      const { error: updateError } = await supabase
        .from('user_sales')
        .update({ contract_url: url, updated_at: new Date().toISOString() })
        .eq('id', sale.id);

      if (updateError) throw updateError;

      showToast('Zmluva vygenerovaná', 'success');
      await loadPage();
    } catch (err: any) {
      showToast(err.message || 'Generovanie zmluvy zlyhalo', 'error');
    } finally {
      setGeneratingContractId(null);
    }
  };

  const openPayoutModal = (sale: InvoiceSale) => {
    setPayoutModalSale(sale);
    setPayoutDraft(String(sale.payout || 0));
  };

  const closePayoutModal = () => {
    if (savingPayout) return;
    setPayoutModalSale(null);
    setPayoutDraft('');
  };

  const savePayoutForSale = async () => {
    if (!payoutModalSale) return;

    const payout = Number(payoutDraft.replace(',', '.'));

    if (!Number.isFinite(payout) || payout < 0) {
      showToast('Payout musí byť platné číslo', 'error');
      return;
    }

    try {
      setSavingPayout(true);
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from(payoutModalSale.source === 'eshop_sales' ? 'eshop_sales' : 'user_sales')
        .update({ payout, updated_at: now })
        .eq('id', payoutModalSale.id);

      if (updateError) throw updateError;

      await supabase
        .from('invoice_documents')
        .update({ payout, updated_at: now })
        .eq(payoutModalSale.source === 'eshop_sales' ? 'eshop_sale_id' : 'user_sale_id', payoutModalSale.id)
        .eq('document_type', 'fa');

      showToast('Payout uložený', 'success');
      setPayoutModalSale(null);
      setPayoutDraft('');
      await loadPage();
    } catch (err: any) {
      showToast(err.message || 'Payout sa nepodarilo uložiť', 'error');
    } finally {
      setSavingPayout(false);
    }
  };

  const q = query.toLowerCase().trim();

  const salesWithFa = useMemo(() => {
    return sales.filter((sale) => sale.fa_url);
  }, [sales]);

  const contractSales = useMemo(() => {
    return sales.filter((sale) => sale.source === 'user_sales');
  }, [sales]);

  const generatedContractCount = useMemo(() => {
    return contractSales.filter((sale) => sale.contract_url).length;
  }, [contractSales]);

  const visibleFiles = useMemo(() => {
    return files.filter((file) => {
      if (!q) return true;
      return [
        file.name,
        file.path,
        file.orderNumber,
        file.extractedProduct,
        file.extractedTotal !== null && file.extractedTotal !== undefined ? String(file.extractedTotal) : null,
        file.linkedSale?.name,
        file.linkedSale?.external_id,
        file.linkedSale?.user_email,
      ].some((field) => field?.toLowerCase().includes(q));
    });
  }, [files, q]);

  const visibleSalesWithFa = useMemo(() => {
    return salesWithFa.filter((sale) => {
      if (!q) return true;
      return [sale.name, sale.external_id, sale.sku, sale.user_email].some((field) => field?.toLowerCase().includes(q));
    });
  }, [salesWithFa, q]);

  const visibleContractSales = useMemo(() => {
    return contractSales.filter((sale) => {
      if (!q) return true;
      return [sale.name, sale.external_id, sale.sku, sale.user_email].some((field) => field?.toLowerCase().includes(q));
    });
  }, [contractSales, q]);

  const attachableSales = useMemo(() => sales.slice(0, 500), [sales]);

  const matchedInvoiceCount = files.filter((file) => file.linkedSale || file.folder === 'matched').length;
  const documentsCount = files.length + contractSales.length;
  const linkedDocumentsCount = matchedInvoiceCount + generatedContractCount;

  const overviewCards = [
    {
      label: 'Dokumenty',
      value: documentsCount,
      detail: `${files.length} FA · ${contractSales.length} zmluvy`,
      icon: FaFileInvoice,
      tone: 'bg-pink-50 text-pink-600',
      action: () => setViewMode('files'),
    },
    {
      label: 'Faktúry',
      value: files.length,
      detail: `${matchedInvoiceCount} spárované`,
      icon: FaFilePdf,
      tone: 'bg-rose-50 text-rose-600',
      action: () => setViewMode('files'),
    },
    {
      label: 'Spárované',
      value: linkedDocumentsCount,
      detail: `${matchedInvoiceCount} FA · ${generatedContractCount} zmluvy`,
      icon: FaCheckCircle,
      tone: 'bg-emerald-50 text-emerald-600',
      action: () => setViewMode('files'),
    },
    {
      label: 'Zmluvy',
      value: generatedContractCount,
      detail: `${contractSales.length - generatedContractCount} treba vygenerovať`,
      icon: FaFileContract,
      tone: 'bg-indigo-50 text-indigo-600',
      action: () => setViewMode('contracts'),
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-pink-500" />
          <h3 className="text-lg font-semibold text-gray-900">Loading invoices...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center">
          <FaExclamationTriangle className="mx-auto mb-4 text-4xl text-red-500" />
          <h3 className="mb-2 text-lg font-semibold text-gray-900">Error loading invoices</h3>
          <p className="mb-4 text-gray-600">{error}</p>
          <button onClick={loadPage} className="rounded-lg bg-pink-600 px-4 py-2 font-semibold text-white hover:bg-pink-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 shadow-lg">
                <FaFileInvoice className="text-xl text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Invoices</h1>
                <p className="hidden text-sm text-gray-400 sm:block">FA, contracts a sales bez dokumentov</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50"
              >
                <FaSync className={refreshing ? 'animate-spin sm:mr-2' : 'sm:mr-2'} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20"
              >
                <FaSignOutAlt className="sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-2 py-3 sm:px-4 sm:py-6 lg:px-8 lg:py-8">
        <AdminNavigation />

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={card.action}
              className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-500">{card.label}</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-gray-900">{card.value}</p>
                  <p className="mt-1 truncate text-xs text-gray-500">{card.detail}</p>
                </div>
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                  <card.icon />
                </div>
              </div>
            </button>
          ))}
        </div>

        <InvoiceEmailImportPanel onImportComplete={loadPage} />

        <section className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setViewMode('files')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${viewMode === 'files' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Importované FA
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${viewMode === 'files' ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                  {files.length}
                </span>
              </button>
              <button
                onClick={() => setViewMode('missing')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${viewMode === 'missing' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Sales s FA
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${viewMode === 'missing' ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                  {salesWithFa.length}
                </span>
              </button>
              <button
                onClick={() => setViewMode('contracts')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${viewMode === 'contracts' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Zmluvy
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${viewMode === 'contracts' ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                  {contractSales.length}
                </span>
              </button>
            </div>

            <div className="relative lg:w-96">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search order, PDF, sale, email..."
                className="w-full rounded-xl border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
        </section>

        {viewMode === 'files' && (
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-4">
              <h2 className="text-lg font-bold text-gray-900">Importované faktúry</h2>
              <p className="text-sm text-gray-500">Matched faktúry sú spárované so sale. Unmatched vieš pripnúť ručne.</p>
            </div>

            {visibleFiles.length === 0 ? (
              <div className="py-16 text-center">
                <FaFilePdf className="mx-auto mb-3 text-4xl text-gray-300" />
                <p className="font-semibold text-gray-900">No PDFs found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {visibleFiles.map((file) => {
                  const linkedSale = file.linkedSale;
                  const amountMismatch = Boolean(
                    linkedSale &&
                    file.extractedTotal !== null &&
                    file.extractedTotal !== undefined &&
                    Math.abs(Number(file.extractedTotal) - Number(linkedSale.price || 0)) > 0.01
                  );
                  return (
                    <div key={file.id} className="p-4">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)_320px] lg:items-center">
                        <div className="flex min-w-0 gap-3">
                          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${linkedSale ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                            {linkedSale ? <FaCheckCircle /> : <FaUnlink />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold text-gray-900">{file.name}</p>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${linkedSale ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {linkedSale ? 'matched' : 'unmatched'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              Order {file.orderNumber || '-'} · {formatFileSize(file.size)} · {file.updatedAt ? formatDateShort(file.updatedAt) : '-'}
                            </p>
                          </div>
                        </div>

                        <div className="grid min-h-[64px] min-w-0 gap-3 rounded-xl bg-gray-50 px-4 py-3 sm:grid-cols-2">
                          {linkedSale ? (
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">{linkedSale.name}</p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {linkedSale.user_email} · {linkedSale.external_id || 'No order'} · sale {formatCurrency(linkedSale.price || 0)}
                              </p>
                            </div>
                          ) : (
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">Nie je pripnuté k sale</p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {file.orderNumber ? `Order ${file.orderNumber}` : 'Bez order number'}
                              </p>
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {file.extractedProduct || 'PDF produkt nezistený'}
                              </p>
                              {file.extractionStatus === 'error' && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">PDF error</span>
                              )}
                              {file.extractionStatus === 'empty' && (
                                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">bez textu</span>
                              )}
                            </div>
                            <p className={`mt-0.5 text-xs ${amountMismatch ? 'font-semibold text-amber-700' : 'text-gray-500'}`}>
                              PDF suma {file.extractedTotal !== null && file.extractedTotal !== undefined ? formatCurrency(file.extractedTotal) : '-'}
                              {amountMismatch ? ' · nesedí so sale' : ''}
                            </p>
                          </div>
                        </div>

                        <div className="grid w-full grid-cols-1 gap-2 sm:w-[320px] sm:grid-cols-2 lg:justify-self-end">
                          <a
                            href={file.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Otvoriť PDF <FaExternalLinkAlt className="ml-2 text-xs" />
                          </a>
                          {!linkedSale && (
                            <button
                              onClick={() => openAttachModal(file)}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                            >
                              <FaLink className="mr-2 text-xs" />
                              Pripnúť
                            </button>
                          )}
                          {linkedSale && <div className="hidden sm:block" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {viewMode === 'missing' && (
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-4">
              <h2 className="text-lg font-bold text-gray-900">Sales s FA</h2>
              <p className="text-sm text-gray-500">Sales, ktoré už majú pripojenú faktúru.</p>
            </div>

            {visibleSalesWithFa.length === 0 ? (
              <div className="py-16 text-center">
                <FaFilePdf className="mx-auto mb-3 text-4xl text-gray-300" />
                <p className="font-semibold text-gray-900">No sales with FA</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {visibleSalesWithFa.map((sale) => (
                  <div key={sale.id} className="p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px_260px] lg:items-center">
                      <div className="flex min-w-0 gap-3">
                        {sale.image_url ? (
                          <img src={sale.image_url} alt={sale.name} loading="lazy" className="h-12 w-12 flex-shrink-0 rounded-xl object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
                            <FaFileInvoice />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-gray-900">{sale.name}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {sale.size || '-'} · {sale.sku || '-'} · {sale.user_email}
                          </p>
                          <p className="mt-1 font-mono text-xs text-gray-500">
                            {sale.external_id || sale.id.slice(0, 8)} · {formatDateShort(sale.invoice_date || sale.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">Price</p>
                          <p className="font-bold text-gray-900">{formatCurrency(sale.price || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Payout</p>
                          <p className="font-bold text-gray-900">{formatCurrency(sale.payout || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Status</p>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge(sale.status)}`}>
                            {sale.status}
                          </span>
                        </div>
                      </div>

                      <div className="grid w-full grid-cols-1 gap-2 sm:w-[260px] lg:justify-self-end">
                        <button
                          onClick={() => openPayoutModal(sale)}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                        >
                          Upraviť payout
                        </button>
                        {sale.fa_url && (
                          <a
                            href={sale.fa_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Otvoriť FA <FaExternalLinkAlt className="ml-2 text-xs" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {viewMode === 'contracts' && (
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-4">
              <h2 className="text-lg font-bold text-gray-900">Zmluvy</h2>
              <p className="text-sm text-gray-500">Všetky consign sales. Hotové zmluvy otvoríš, chýbajúce vygeneruješ.</p>
            </div>

            {visibleContractSales.length === 0 ? (
              <div className="py-16 text-center">
                <FaFileContract className="mx-auto mb-3 text-4xl text-gray-300" />
                <p className="font-semibold text-gray-900">No sales found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {visibleContractSales.map((sale) => (
                  <div key={sale.id} className="p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px_220px] lg:items-center">
                      <div className="flex min-w-0 gap-3">
                        {sale.image_url ? (
                          <img src={sale.image_url} alt={sale.name} loading="lazy" className="h-12 w-12 flex-shrink-0 rounded-xl object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
                            <FaFileContract />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-gray-900">{sale.name}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {sale.size || '-'} · {sale.sku || '-'} · {sale.user_email}
                          </p>
                          <p className="mt-1 font-mono text-xs text-gray-500">
                            {sale.external_id || sale.id.slice(0, 8)} · {formatDateShort(sale.invoice_date || sale.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">Price</p>
                          <p className="font-bold text-gray-900">{formatCurrency(sale.price || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Payout</p>
                          <p className="font-bold text-gray-900">{formatCurrency(sale.payout || 0)}</p>
                        </div>
                        <div className="col-span-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${sale.contract_url ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {sale.contract_url ? 'zmluva hotová' : 'bez zmluvy'}
                          </span>
                        </div>
                      </div>

                      <div className="grid w-full grid-cols-1 gap-2 sm:w-[220px] lg:justify-self-end">
                        {sale.contract_url ? (
                          <a
                            href={sale.contract_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Otvoriť zmluvu <FaExternalLinkAlt className="ml-2 text-xs" />
                          </a>
                        ) : (
                          <button
                            onClick={() => generateContractForSale(sale)}
                            disabled={generatingContractId === sale.id}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                          >
                            <FaFileContract className="mr-2 text-xs" />
                            {generatingContractId === sale.id ? 'Generujem...' : 'Vygenerovať'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {attachModalFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900">Pripnúť faktúru</h2>
                <p className="mt-1 truncate text-sm text-gray-500">
                  {attachModalFile.name} · {attachModalFile.orderNumber ? `Order ${attachModalFile.orderNumber}` : 'Bez order number'}
                </p>
              </div>
              <button
                onClick={closeAttachModal}
                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Zavrieť"
              >
                <FaTimes />
              </button>
            </div>

            <div className="px-5 py-4">
              <label className="mb-2 block text-sm font-semibold text-gray-900">Sale</label>
              <select
                value={attachTarget}
                onChange={(event) => setAttachTarget(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
              >
                <option value="">Vyber sale...</option>
                {attachableSales.map((sale) => (
                  <option key={`${sale.source}:${sale.id}`} value={`${sale.source}:${sale.id}`}>
                    {sale.external_id || sale.id.slice(0, 8)} · {sale.source === 'eshop_sales' ? 'Eshop' : 'Consign'} · {sale.name} · {sale.user_email}
                  </option>
                ))}
              </select>

              <div className="mt-4 rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-600">
                Po pripnutí sa faktúra uloží k vybranému sale do FA URL.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                onClick={closeAttachModal}
                disabled={Boolean(attachingPath)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Zrušiť
              </button>
              <button
                onClick={attachFileToSale}
                disabled={Boolean(attachingPath) || !attachTarget}
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                <FaLink className="mr-2 text-xs" />
                {attachingPath ? 'Pripínam...' : 'Pripnúť'}
              </button>
            </div>
          </div>
        </div>
      )}

      {payoutModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900">Upraviť payout</h2>
                <p className="mt-1 truncate text-sm text-gray-500">
                  {payoutModalSale.external_id || payoutModalSale.id.slice(0, 8)} · {payoutModalSale.name}
                </p>
              </div>
              <button
                onClick={closePayoutModal}
                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Zavrieť"
              >
                <FaTimes />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 px-3 py-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Sale price</p>
                  <p className="font-bold text-gray-900">{formatCurrency(payoutModalSale.price || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Aktuálny payout</p>
                  <p className="font-bold text-gray-900">{formatCurrency(payoutModalSale.payout || 0)}</p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Nový payout</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payoutDraft}
                    onChange={(event) => setPayoutDraft(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-3 pr-12 text-base font-semibold text-gray-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
                    autoFocus
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">EUR</span>
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-600">
                Ukladá sa priamo do sale. Ak je faktúra zaevidovaná v importe, uloží sa tam aj payout snapshot pre prehľad.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                onClick={closePayoutModal}
                disabled={savingPayout}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Zrušiť
              </button>
              <button
                onClick={savePayoutForSale}
                disabled={savingPayout}
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {savingPayout ? 'Ukladám...' : 'Uložiť payout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
