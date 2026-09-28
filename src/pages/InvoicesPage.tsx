import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCheckCircle,
  FaDownload,
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
  FaChevronDown,
  FaChevronRight,
  FaFileArchive,
  FaMagic,
} from 'react-icons/fa';
import AdminNavigation from '../components/AdminNavigation';
import InvoiceEmailImportPanel from '../components/InvoiceEmailImportPanel';
import { useToast } from '../components/Toast';
import { generatePurchaseAgreement, uploadContractToStorage } from '../lib/pdfGenerator';
import { downloadFilesAsZip } from '../lib/zipExport';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDateShort } from '../lib/utils';
import {
  createInvoiceSignedUrlMap,
  invoiceStoragePathFromReference,
  invoiceStorageReference,
  resolveInvoiceReferences,
} from '../lib/storageUrls';
import {
  downloadAccountingWorkbook,
  excelDate,
  exportDateStamp,
  type AccountingItemRow,
  type AccountingOrderRow,
  type InvoiceAuditRow,
} from '../lib/xlsxExport';

interface InvoiceSale {
  id: string;
  source: 'user_sales' | 'eshop_sales';
  name: string;
  size: string | null;
  price: number;
  payout: number;
  order_total?: number | null;
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
  source?: string | null;
  linkedSale?: InvoiceSale | null;
}

type ViewMode = 'files' | 'missing' | 'contracts';
type InvoiceFilter = 'all' | 'unmatched' | 'mismatch' | 'error';

const normalizeOrderNumber = (value?: string | null) => {
  if (!value) return null;
  let str = value.trim().replace(/\.[a-z0-9]{2,4}$/i, '');

  const prefixMatch = str.match(/^(?:fakt[uú]ra|invoice|doklad|fa|obj|objedn[aá]vka|order)[-_ ]+([a-zA-Z0-9_-]{4,24})$/i);
  if (prefixMatch) {
    str = prefixMatch[1].trim();
  }

  const copyMatch = str.match(/^(.{4,})[-_ ](?:copy|\(?\d{1,2}\)?)$/i);
  if (copyMatch) {
    str = copyMatch[1].trim();
  }

  return str || null;
};

const extractOrderNumber = (value: string) => {
  if (!value) return null;

  const direct = normalizeOrderNumber(value);
  if (direct && (/^\d{6,14}$/.test(direct) || /^[a-zA-Z]{2,4}[-_]\d{4,14}$/.test(direct))) {
    return direct;
  }

  // 1. High confidence: Labeled order numbers
  const labeled = [
    /(?:objedn[aá]vk[ay]|obj\.?\s*č\.?|order\s*(?:no\.?|id|#)?|číslo\s*objedn[aá]vky|č\.\s*obj\.?|bestellung(?:snr)?)\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{3,24})/i,
    /(?:variabiln[yý]\s*symbol|v\.?\s*s\.?|var\.?\s*sym\.?|v-symbol)\s*[:#-]?\s*(\d{6,14})/i,
  ];
  for (const pattern of labeled) {
    const match = value.match(pattern);
    if (match?.[1]) return normalizeOrderNumber(match[1]);
  }

  // 2. Prefixed patterns
  const prefixed = value.match(/\b((?:AIR|OBJ|ORD)[-_]?\d{4,14})\b/i);
  if (prefixed?.[1]) return normalizeOrderNumber(prefixed[1]);

  // 3. Shoptet Year patterns: 202x (8-12 digits) or 24-27 (8 digits)
  const shoptetLong = value.match(/(?:^|[^0-9])(20[2-3]\d{6,8})(?=$|[^0-9])/);
  if (shoptetLong?.[1]) return normalizeOrderNumber(shoptetLong[1]);

  const shoptetShort = value.match(/(?:^|[^0-9])((?:2[3-7])\d{6})(?=$|[^0-9])/);
  if (shoptetShort?.[1]) return normalizeOrderNumber(shoptetShort[1]);

  // 4. General standalone 7-12 digit numbers
  const general = value.match(/(?:^|[^0-9])(\d{7,12})(?=$|[^0-9])/);
  if (general?.[1]) return normalizeOrderNumber(general[1]);

  // 5. Fallback to invoice number only if nothing else matches
  const invoiceMatch = value.match(/(?:fakt[uú]ra\s*č\.?|daňový\s*doklad\s*č\.?|invoice\s*(?:no\.?|#)?|fa)[^a-z0-9]{0,10}([a-z0-9][a-z0-9_-]{3,24})/i);
  if (invoiceMatch?.[1]) return normalizeOrderNumber(invoiceMatch[1]);

  return null;
};

const saleMatchesOrder = (sale: InvoiceSale, orderNumber: string) => {
  if (!sale || !orderNumber) return false;
  const externalId = String(sale.external_id || '').trim();
  if (!externalId) return false;

  const target = orderNumber.trim().toLowerCase();
  const lowerExt = externalId.toLowerCase();
  if (lowerExt === target) return true;

  const saleExternalId = (normalizeOrderNumber(sale.external_id) || '').toLowerCase();
  if (saleExternalId === target) return true;

  if (target.length >= 6 && lowerExt.includes(target)) return true;
  if (lowerExt.length >= 6 && target.includes(lowerExt)) return true;

  return false;
};

const expectedInvoiceAmount = (sale: InvoiceSale, allSales: InvoiceSale[]) => {
  if (sale.source === 'eshop_sales') {
    if (sale.order_total !== null && sale.order_total !== undefined) return Number(sale.order_total);
    return allSales
      .filter(item => item.source === 'eshop_sales' && item.external_id === sale.external_id)
      .reduce((sum, item) => sum + Number(item.price || 0), 0);
  }
  return Number(sale.payout || sale.price || 0);
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
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all');
  const [attachModalFile, setAttachModalFile] = useState<ImportedInvoice | null>(null);
  const [attachTarget, setAttachTarget] = useState('');
  const [attachingPath, setAttachingPath] = useState<string | null>(null);
  const [generatingContractId, setGeneratingContractId] = useState<string | null>(null);
  const [payoutModalSale, setPayoutModalSale] = useState<InvoiceSale | null>(null);
  const [payoutDraft, setPayoutDraft] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedInvoiceGroup, setExpandedInvoiceGroup] = useState<string | null>(null);
  const [reparsingPath, setReparsingPath] = useState<string | null>(null);
  const [zipping, setZipping] = useState<'contracts' | 'invoices' | null>(null);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkGeneratingContracts, setBulkGeneratingContracts] = useState(false);
  const [bulkContractProgress, setBulkContractProgress] = useState<{ current: number; total: number } | null>(null);

  const linkFilesToSales = useCallback((nextFiles: ImportedInvoice[], nextSales: InvoiceSale[]) => {
    return nextFiles.map((file) => {
      const linkedByUrl = nextSales.find((sale) =>
        invoiceStoragePathFromReference(sale.fa_url) === file.path ||
        Boolean(sale.fa_url?.includes(`/invoices/${file.path}`))
      );
      const linkedByOrder = file.orderNumber
        ? nextSales.find((sale) => saleMatchesOrder(sale, file.orderNumber as string))
        : null;
      const normalizedExtractedProduct = file.extractedProduct?.trim().toLowerCase();
      const amountAndProductMatches = file.extractedTotal !== null && file.extractedTotal !== undefined
        ? nextSales.filter((sale) => {
          const amountMatches = Math.abs(expectedInvoiceAmount(sale, nextSales) - Number(file.extractedTotal)) <= 0.05;
          if (!amountMatches) return false;
          if (!normalizedExtractedProduct) return true;

          const saleName = sale.name.toLowerCase();
          if (saleName.includes(normalizedExtractedProduct) || normalizedExtractedProduct.includes(saleName)) {
            return true;
          }

          // Fuzzy token matching
          const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'ks', 'pcs']);
          const productTokens = normalizedExtractedProduct
            .split(/[\s,.\-_/]+/)
            .filter((t) => t.length > 2 && !stopWords.has(t));
          const saleTokens = new Set(
            saleName.split(/[\s,.\-_/]+/).filter((t) => t.length > 2 && !stopWords.has(t))
          );

          if (productTokens.length > 0) {
            const matchingCount = productTokens.filter((token) => saleTokens.has(token)).length;
            const ratio = matchingCount / productTokens.length;
            if (ratio >= 0.5 || matchingCount >= 2) return true;
          }

          return false;
        })
        : [];
      const linkedByDetails = amountAndProductMatches.length === 1 ? amountAndProductMatches[0] : null;

      return {
        ...file,
        linkedSale: linkedByUrl || linkedByOrder || linkedByDetails || null,
      };
    });
  }, []);

  const loadSales = useCallback(async () => {
    const userSales: any[] = [];
    const eshopSales: any[] = [];
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
      const { data, error: salesError } = await supabase
        .from('user_sales')
        .select(`
          id, user_id, name, size, price, payout, invoice_date, created_at, status, image_url,
          external_id, sku, fa_url, contract_url, is_manual, manual_sale_items, profiles(email)
        `)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (salesError) throw salesError;
      userSales.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data, error: eshopError } = await supabase
        .from('eshop_sales')
        .select(`
          id, order_number, product_name, size, price, payout, status, image_url,
          customer_email, sku, fa_url, order_created_at, order_total, created_at
        `)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (eshopError) throw eshopError;
      eshopSales.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    const normalizedUserSales = userSales.map((sale: any) => ({
      ...sale,
      source: 'user_sales' as const,
      user_email: sale.profiles?.email || 'N/A',
    }));

    const normalizedEshopSales = eshopSales.map((sale: any) => ({
      id: sale.id,
      source: 'eshop_sales' as const,
      name: sale.product_name,
      size: sale.size,
      price: Number(sale.price || 0),
      payout: Number(sale.payout || 0),
      order_total: sale.order_total !== null && sale.order_total !== undefined ? Number(sale.order_total) : null,
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

    const normalizedSales = [...normalizedEshopSales, ...normalizedUserSales] as InvoiceSale[];
    const signedInvoiceUrls = await resolveInvoiceReferences(normalizedSales.map(sale => sale.fa_url));
    return normalizedSales.map(sale => ({
      ...sale,
      fa_url: signedInvoiceUrls.get(sale.fa_url || '') || sale.fa_url,
    }));
  }, []);

  const loadFilesFromStorage = useCallback(async () => {
    const folders: Array<'matched' | 'unmatched'> = ['matched', 'unmatched'];
    const loaded: ImportedInvoice[] = [];

    for (const folder of folders) {
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error: listError } = await supabase.storage
          .from('invoices')
          .list(folder, {
            limit: pageSize,
            offset,
            sortBy: { column: 'updated_at', order: 'desc' },
          });

        if (listError) throw listError;

        for (const item of data || []) {
          if (!item.name || item.name === '.emptyFolderPlaceholder') continue;
          const path = `${folder}/${item.name}`;
          loaded.push({
            id: path,
            name: item.name,
            path,
            folder,
            orderNumber: extractOrderNumber(item.name),
            publicUrl: '',
            updatedAt: item.updated_at || item.created_at || null,
            size: Number(item.metadata?.size || 0),
          });
        }
        if (!data || data.length < pageSize) break;
      }
    }

    return loaded;
  }, []);

  const loadFiles = useCallback(async () => {
    const storageFiles = await loadFilesFromStorage();

    const documentRows: any[] = [];
    let documentsError: any = null;
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const response = await supabase
        .from('invoice_documents')
        .select('id, storage_path, file_name, order_number, status, source, updated_at, imported_at, extracted_product, extracted_total, extracted_items, extraction_status, extraction_error')
        .eq('document_type', 'fa')
        .order('imported_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (response.error) {
        documentsError = response.error;
        break;
      }
      documentRows.push(...(response.data || []));
      if (!response.data || response.data.length < pageSize) break;
    }

    const tableIsMissing = documentsError && /invoice_documents|schema cache|does not exist|not found/i.test(documentsError.message || '');
    if (documentsError && !tableIsMissing) throw documentsError;
    const signedUrls = await createInvoiceSignedUrlMap([
      ...storageFiles.map(file => file.path),
      ...documentRows.map(row => row.storage_path).filter(Boolean),
    ]);

    const byPath = new Map<string, ImportedInvoice>();
    storageFiles.forEach((file) => byPath.set(file.path, { ...file, publicUrl: signedUrls.get(file.path) || '' }));

    if (!documentsError) {
      documentRows.forEach((row: any) => {
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
          publicUrl: signedUrls.get(path) || fallback?.publicUrl || '',
          updatedAt: row.updated_at || row.imported_at || fallback?.updatedAt || null,
          size: fallback?.size || 0,
          extractedProduct: row.extracted_product || null,
          extractedTotal: row.extracted_total !== null && row.extracted_total !== undefined ? Number(row.extracted_total) : null,
          extractedItems: Array.isArray(row.extracted_items) ? row.extracted_items : [],
          extractionStatus: row.extraction_status || null,
          extractionError: row.extraction_error || null,
          source: row.source || null,
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
      const stableInvoiceReference = invoiceStorageReference(attachModalFile.path);
      const { error: updateError } = await supabase
        .from(source === 'eshop_sales' ? 'eshop_sales' : 'user_sales')
        .update({ fa_url: stableInvoiceReference, updated_at: new Date().toISOString() })
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
          public_url: stableInvoiceReference,
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

  const handleReparseFile = async (file: ImportedInvoice) => {
    try {
      setReparsingPath(file.path);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Chýba prihlásenie');

      const response = await fetch('/.netlify/functions/import-email-invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'reprocess',
          storagePath: file.path,
        }),
      });

      const res = await response.json();
      if (!response.ok || res.error) {
        throw new Error(res.error || 'Pre-parsovanie zlyhalo');
      }

      showToast(`Faktúra bola úspešne pre-parsovaná (${res.summary?.matched ? 'Spárovaná' : 'Nespárovaná'})`, 'success');
      await loadPage();
    } catch (err: any) {
      showToast(err.message || 'Chyba pri pre-parsovaní', 'error');
    } finally {
      setReparsingPath(null);
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
      const updatePayload: any = { payout, updated_at: now };
      if (
        payoutModalSale.source === 'user_sales' &&
        Array.isArray(payoutModalSale.manual_sale_items) &&
        payoutModalSale.manual_sale_items.length > 0
      ) {
        updatePayload.manual_sale_items = payoutModalSale.manual_sale_items.map((item, idx) =>
          idx === 0 || payoutModalSale.manual_sale_items!.length === 1 ? { ...item, payout } : item
        );
      }

      const { error: updateError } = await supabase
        .from(payoutModalSale.source === 'eshop_sales' ? 'eshop_sales' : 'user_sales')
        .update(updatePayload)
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

  const generateSingleContractInternal = async (sale: InvoiceSale, adminSettings: any) => {
    const { data: freshSale, error: freshSaleError } = await supabase
      .from('user_sales')
      .select('id, user_id, name, size, price, is_manual, payout, created_at, external_id, invoice_date, manual_sale_items')
      .eq('id', sale.id)
      .single();

    if (freshSaleError || !freshSale) throw new Error('Sale nenájdené');
    if (!freshSale.user_id) throw new Error('Sale nemá priradený profil predajcu');

    const { data: freshProfile, error: freshProfileError } = await supabase
      .from('profiles')
      .select('first_name, last_name, ico, address, popisne_cislo, psc, mesto, krajina, email, telephone, iban, signature_url')
      .eq('id', freshSale.user_id)
      .single();

    if (freshProfileError || !freshProfile) throw new Error('Profil nenájdený');

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
    return url;
  };

  const handleBulkGenerateContracts = async () => {
    const missing = contractSales.filter((s) => !s.contract_url);
    if (!missing.length) {
      showToast('Všetky zmluvy sú už vygenerované', 'info');
      return;
    }

    try {
      setBulkGeneratingContracts(true);
      const { data: adminSettings } = await supabase
        .from('admin_settings')
        .select('buyer_signature_url')
        .single();

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < missing.length; i++) {
        setBulkContractProgress({ current: i + 1, total: missing.length });
        try {
          await generateSingleContractInternal(missing[i], adminSettings);
          successCount++;
        } catch {
          errorCount++;
        }
      }

      showToast(`Vygenerovaných ${successCount} zmlúv (${errorCount > 0 ? `${errorCount} chýb` : 'všetky v poriadku'})`, 'success');
      await loadPage();
    } catch (err: any) {
      showToast(err.message || 'Hromadné generovanie zlyhalo', 'error');
    } finally {
      setBulkGeneratingContracts(false);
      setBulkContractProgress(null);
    }
  };

  const handleDownloadContractsZip = async () => {
    const withContracts = contractSales.filter((s) => Boolean(s.contract_url));
    if (!withContracts.length) {
      showToast('Žiadne vygenerované zmluvy na stiahnutie', 'info');
      return;
    }

    try {
      setZipping('contracts');
      const items = withContracts.map((s) => ({
        url: s.contract_url as string,
        filename: `zmluva-${s.external_id || s.id}.pdf`,
      }));

      await downloadFilesAsZip(items, `kupne-zmluvy-${exportDateStamp()}.zip`, (current, total) => {
        setZipProgress({ current, total });
      });

      showToast(`Stiahnutých ${items.length} zmlúv v ZIP archíve`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Chyba pri sťahovaní ZIP', 'error');
    } finally {
      setZipping(null);
      setZipProgress(null);
    }
  };

  const handleDownloadInvoicesZip = async () => {
    const withInvoices = files.filter((f) => Boolean(f.publicUrl));
    if (!withInvoices.length) {
      showToast('Žiadne faktúry na stiahnutie', 'info');
      return;
    }

    try {
      setZipping('invoices');
      const items = withInvoices.map((f) => ({
        url: f.publicUrl,
        filename: f.name || `faktura-${f.orderNumber || f.id}.pdf`,
      }));

      await downloadFilesAsZip(items, `faktury-${exportDateStamp()}.zip`, (current, total) => {
        setZipProgress({ current, total });
      });

      showToast(`Stiahnutých ${items.length} faktúr v ZIP archíve`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Chyba pri sťahovaní ZIP', 'error');
    } finally {
      setZipping(null);
      setZipProgress(null);
    }
  };

  const handleConfirmSmartMatch = async (file: ImportedInvoice, sale: InvoiceSale) => {
    try {
      const stableInvoiceReference = invoiceStorageReference(file.path);
      const isEshop = sale.source === 'eshop_sales';

      const { error: updateError } = await supabase
        .from(isEshop ? 'eshop_sales' : 'user_sales')
        .update({ fa_url: stableInvoiceReference, updated_at: new Date().toISOString() })
        .eq('id', sale.id);

      if (updateError) throw updateError;

      const now = new Date().toISOString();
      const { error: documentError } = await supabase
        .from('invoice_documents')
        .upsert({
          document_type: 'fa',
          status: 'matched',
          bucket: 'invoices',
          storage_path: file.path,
          public_url: stableInvoiceReference,
          file_name: file.name,
          order_number: sale.external_id || file.orderNumber,
          matched_target: isEshop ? 'eshop_sales' : 'user_sales',
          user_sale_id: isEshop ? null : sale.id,
          eshop_sale_id: isEshop ? sale.id : null,
          source: 'smart_match',
          updated_at: now,
        }, { onConflict: 'storage_path' });

      if (documentError) throw documentError;

      showToast(`Faktúra spárovaná so sale ${sale.name}`, 'success');
      await loadPage();
    } catch (err: any) {
      showToast(err.message || 'Párovanie zlyhalo', 'error');
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

  const smartMatchSuggestions = useMemo(() => {
    const map = new Map<string, { sale: InvoiceSale; reason: string }>();

    files.forEach((file) => {
      if (file.linkedSale) return;
      const extractedTotal = file.extractedTotal;
      const orderNum = file.orderNumber;
      const product = file.extractedProduct?.toLowerCase();

      let bestCandidate: { sale: InvoiceSale; reason: string; score: number } | null = null;

      for (const sale of sales) {
        const saleAmount = expectedInvoiceAmount(sale, sales);
        const amountMatches = extractedTotal !== null && extractedTotal !== undefined && Math.abs(saleAmount - extractedTotal) <= 0.05;
        const orderMatches = orderNum ? saleMatchesOrder(sale, orderNum) : false;
        const nameMatches = Boolean(product && sale.name && (sale.name.toLowerCase().includes(product) || product.includes(sale.name.toLowerCase())));

        let score = 0;
        let reason = '';

        if (orderMatches && amountMatches) {
          score = 100;
          reason = `Zhoda čísla #${orderNum} aj sumy (${formatCurrency(saleAmount)})`;
        } else if (orderMatches) {
          score = 70;
          reason = `Zhoda čísla objednávky #${orderNum}`;
        } else if (amountMatches && nameMatches) {
          score = 80;
          reason = `Zhoda produktu a presná suma (${formatCurrency(saleAmount)})`;
        } else if (amountMatches) {
          score = 50;
          reason = `Presná zhoda sumy (${formatCurrency(saleAmount)})`;
        }

        if (score > 0 && (!bestCandidate || score > bestCandidate.score)) {
          bestCandidate = { sale, reason, score };
        }
      }

      if (bestCandidate && bestCandidate.score >= 50) {
        map.set(file.id, { sale: bestCandidate.sale, reason: bestCandidate.reason });
      }
    });

    return map;
  }, [files, sales]);

  const visibleFiles = useMemo(() => {
    return files.filter((file) => {
      const mismatch = Boolean(
        file.linkedSale &&
        file.extractedTotal !== null &&
        file.extractedTotal !== undefined &&
        Math.abs(Number(file.extractedTotal) - expectedInvoiceAmount(file.linkedSale, sales)) > 0.02
      );
      if (invoiceFilter === 'unmatched' && file.linkedSale) return false;
      if (invoiceFilter === 'mismatch' && !mismatch) return false;
      if (invoiceFilter === 'error' && file.extractionStatus !== 'error') return false;
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
  }, [files, invoiceFilter, q, sales]);

  const invoiceGroups = useMemo(() => {
    const grouped = new Map<string, ImportedInvoice[]>();
    visibleFiles.forEach((file) => {
      const key = normalizeOrderNumber(file.orderNumber) || `file:${file.id}`;
      const current = grouped.get(key) || [];
      current.push(file);
      grouped.set(key, current);
    });

    return Array.from(grouped.entries()).map(([key, groupFiles]) => ({
      key,
      orderNumber: groupFiles.find(file => file.orderNumber)?.orderNumber || null,
      files: [...groupFiles].sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()),
    }));
  }, [visibleFiles]);

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

  const exportAccountingXlsx = async () => {
    try {
      setExporting(true);
      const exportSales = q
        ? sales.filter(sale => [sale.name, sale.external_id, sale.sku, sale.user_email]
          .some(field => field?.toLowerCase().includes(q)))
        : sales;
      const exportFiles = visibleFiles;
      const accountingItems: AccountingItemRow[] = exportSales.map(sale => {
        const taxableMargin = Math.max(0, Number(sale.price || 0) - Number(sale.payout || 0));
        const vatBase = taxableMargin / 1.23;
        return {
          orderNumber: sale.external_id || sale.id,
          originalOrderNumber: '',
          orderDate: excelDate(sale.invoice_date || sale.created_at),
          product: sale.name,
          size: sale.size || '',
          sku: sale.sku || '',
          quantity: 1,
          itemRevenue: Number(sale.price || 0),
          currency: 'EUR',
          status: sale.status,
          customer: '',
          customerEmail: sale.user_email,
          linkedSaleId: sale.id,
          consignorEmail: sale.source === 'user_sales' ? sale.user_email : '',
          payout: Number(sale.payout || 0),
          profit: Number(sale.price || 0) - Number(sale.payout || 0),
          matchStatus: sale.source === 'user_sales' ? 'matched' : sale.payout > 0 ? 'matched' : 'unmatched',
          vatScheme: 'MARGIN',
          vatBase,
          vatAmount: taxableMargin - vatBase,
          invoiceUrl: sale.fa_url || '',
          trackingNumber: '',
          importedAt: excelDate(sale.created_at),
          notes: sale.is_manual ? 'Manual sale' : '',
        };
      });

      const groupedItems = accountingItems.reduce((map, item) => {
        const current = map.get(item.orderNumber) || [];
        current.push(item);
        map.set(item.orderNumber, current);
        return map;
      }, new Map<string, AccountingItemRow[]>());
      const accountingOrders: AccountingOrderRow[] = Array.from(groupedItems.entries()).map(([orderNumber, items]) => {
        const matchingFile = exportFiles.find(file => file.orderNumber === normalizeOrderNumber(orderNumber));
        const itemRevenue = items.reduce((sum, item) => sum + item.itemRevenue, 0);
        const payout = items.reduce((sum, item) => sum + item.payout, 0);
        const invoiceTotal = matchingFile?.extractedTotal !== null && matchingFile?.extractedTotal !== undefined
          ? Number(matchingFile.extractedTotal)
          : null;
        return {
          orderNumber,
          orderDate: items[0]?.orderDate || null,
          customer: '',
          customerEmail: items[0]?.customerEmail || '',
          currency: 'EUR',
          status: Array.from(new Set(items.map(item => item.status))).join(', '),
          shoptetStatus: '',
          itemCount: items.length,
          quantity: items.reduce((sum, item) => sum + item.quantity, 0),
          itemRevenue,
          orderTotal: itemRevenue,
          extraTotal: 0,
          payout,
          profit: itemRevenue - payout,
          matchedItems: items.filter(item => item.matchStatus === 'matched').length,
          unmatchedItems: items.filter(item => item.matchStatus !== 'matched').length,
          invoiceStatus: matchingFile ? matchingFile.linkedSale ? 'matched' : 'unmatched' : items.some(item => item.invoiceUrl) ? 'linked' : 'missing',
          invoiceTotal,
          invoiceDifference: invoiceTotal === null ? null : invoiceTotal - itemRevenue,
          invoiceUrl: matchingFile?.publicUrl || items.find(item => item.invoiceUrl)?.invoiceUrl || '',
          trackingNumber: '',
          notes: '',
        };
      });

      const invoiceAudit: InvoiceAuditRow[] = exportFiles.map(file => {
        const sale = file.linkedSale;
        const saleAmount = sale ? expectedInvoiceAmount(sale, sales) : null;
        const extractedAmount = file.extractedTotal !== null && file.extractedTotal !== undefined
          ? Number(file.extractedTotal)
          : null;
        return {
          fileName: file.name,
          orderNumber: file.orderNumber || '',
          source: file.source || 'storage',
          matchStatus: sale ? 'matched' : 'unmatched',
          saleSource: sale?.source || '',
          product: file.extractedProduct || sale?.name || '',
          customerEmail: sale?.user_email || '',
          saleAmount,
          extractedAmount,
          difference: saleAmount !== null && extractedAmount !== null ? extractedAmount - saleAmount : null,
          payout: sale ? Number(sale.payout || 0) : null,
          extractionStatus: file.extractionStatus || '',
          extractionError: file.extractionError || '',
          importedAt: excelDate(file.updatedAt),
          invoiceUrl: file.publicUrl,
        };
      });

      await downloadAccountingWorkbook({
        fileName: `invoice_audit_${exportDateStamp()}.xlsx`,
        orders: accountingOrders,
        items: accountingItems,
        invoices: invoiceAudit,
      });
      showToast('Invoice audit XLSX downloaded', 'success');
    } catch (err: any) {
      showToast(err.message || 'XLSX export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const matchedInvoiceCount = files.filter((file) => file.linkedSale || file.folder === 'matched').length;
  const documentsCount = files.length + contractSales.length;
  const linkedDocumentsCount = matchedInvoiceCount + generatedContractCount;

  const invoiceFilterCounts = useMemo(() => {
    let unmatched = 0;
    let mismatch = 0;
    let error = 0;
    files.forEach((file) => {
      if (!file.linkedSale) unmatched++;
      if (file.extractionStatus === 'error') error++;
      if (file.linkedSale && file.extractedTotal !== null && file.extractedTotal !== undefined) {
        const expected = expectedInvoiceAmount(file.linkedSale, sales);
        if (Math.abs(Number(file.extractedTotal) - expected) > 0.02) {
          mismatch++;
        }
      }
    });
    return {
      all: files.length,
      unmatched,
      mismatch,
      error,
    };
  }, [files, sales]);

  const overviewCards = [
    {
      label: 'Všetky dokumenty',
      value: documentsCount,
      detail: `${files.length} FA · ${contractSales.length} zmluvy`,
      icon: FaFileInvoice,
      tone: 'bg-purple-50 text-purple-600 border border-purple-100',
      activeTone: 'ring-2 ring-purple-500/30 border-purple-300',
      mode: 'files' as ViewMode,
    },
    {
      label: 'Prijaté faktúry',
      value: files.length,
      detail: `${matchedInvoiceCount} spárovaných so sale`,
      icon: FaFilePdf,
      tone: 'bg-rose-50 text-rose-600 border border-rose-100',
      activeTone: 'ring-2 ring-rose-500/30 border-rose-300',
      mode: 'files' as ViewMode,
    },
    {
      label: 'Spárované doklady',
      value: linkedDocumentsCount,
      detail: `${documentsCount > 0 ? Math.round((linkedDocumentsCount / documentsCount) * 100) : 0}% miera spárovania`,
      icon: FaCheckCircle,
      tone: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      activeTone: 'ring-2 ring-emerald-500/30 border-emerald-300',
      mode: 'missing' as ViewMode,
    },
    {
      label: 'Kúpne zmluvy',
      value: generatedContractCount,
      detail: `${contractSales.length - generatedContractCount} čaká na vygenerovanie`,
      icon: FaFileContract,
      tone: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
      activeTone: 'ring-2 ring-indigo-500/30 border-indigo-300',
      mode: 'contracts' as ViewMode,
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-3 border-gray-300 border-t-pink-500" />
          <h3 className="text-sm font-semibold text-gray-900">Načítavam faktúry a zmluvy...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center rounded-2xl bg-white p-6 border border-gray-200 shadow-sm">
          <FaExclamationTriangle className="mx-auto mb-3 text-3xl text-rose-500" />
          <h3 className="mb-1 text-base font-bold text-gray-900">Chyba pri načítaní faktúr</h3>
          <p className="mb-4 text-xs text-gray-600">{error}</p>
          <button onClick={loadPage} className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black transition-colors">
            Skúsiť znova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 py-2.5 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex h-8 w-8 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 shadow-md">
                <FaFileInvoice className="text-base sm:text-xl text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-2xl font-bold tracking-tight text-white">Invoices</h1>
                <p className="hidden text-sm text-gray-400 sm:block">Faktúry, kúpne zmluvy a párovanie dokladov</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-2 rounded-xl border border-white/20 bg-white/10 text-xs font-semibold text-white hover:bg-white/20 transition-all disabled:opacity-50"
                title="Obnoviť"
              >
                <FaSync className={refreshing ? 'animate-spin sm:mr-1.5 text-xs sm:text-sm' : 'sm:mr-1.5 text-xs sm:text-sm'} />
                <span className="hidden sm:inline">Obnoviť</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-2 rounded-xl border border-white/20 bg-white/10 text-xs font-semibold text-white hover:bg-white/20 transition-all"
                title="Odhlásiť sa"
              >
                <FaSignOutAlt className="sm:mr-1.5 text-xs sm:text-sm" />
                <span className="hidden sm:inline">Odhlásiť sa</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <AdminNavigation />

        {/* Overview cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {overviewCards.map((card) => {
            const isActive = viewMode === card.mode;
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => setViewMode(card.mode)}
                className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md ${
                  isActive ? card.activeTone : 'border-gray-200/80 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{card.label}</span>
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                    <card.icon className="text-sm" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-black tracking-tight text-gray-900">{card.value}</p>
                <p className="mt-1 truncate text-xs text-gray-500">{card.detail}</p>
              </button>
            );
          })}
        </div>

        <InvoiceEmailImportPanel onImportComplete={loadPage} />

        {/* Tab switcher & Search toolbar */}
        <section className="mb-5 rounded-2xl border border-gray-200/80 bg-white p-3 sm:p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* View Mode Pills */}
            <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200/60 flex-wrap gap-1">
              <button
                onClick={() => setViewMode('files')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === 'files' ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Importované FA
                <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${viewMode === 'files' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-700'}`}>
                  {files.length}
                </span>
              </button>
              <button
                onClick={() => setViewMode('missing')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === 'missing' ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Sales s FA
                <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${viewMode === 'missing' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-700'}`}>
                  {salesWithFa.length}
                </span>
              </button>
              <button
                onClick={() => setViewMode('contracts')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === 'contracts' ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Zmluvy
                <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${viewMode === 'contracts' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-700'}`}>
                  {contractSales.length}
                </span>
              </button>
            </div>

            {/* Search + XLSX Export */}
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative w-full sm:w-72 lg:w-80">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Hľadať číslo obj, PDF, email, produkt..."
                  className="w-full pl-8 pr-8 py-2 bg-gray-50/70 hover:bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400 transition-all"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <FaTimes className="text-xs" />
                  </button>
                )}
              </div>

              <button
                onClick={exportAccountingXlsx}
                disabled={exporting || (!sales.length && !files.length)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-800 shadow-xs hover:bg-gray-50 transition-all disabled:opacity-50"
                title="Stiahnuť účtovný audit s faktúrami"
              >
                <FaDownload className={`text-xs ${exporting ? 'animate-pulse text-emerald-600' : 'text-gray-600'}`} />
                <span>{exporting ? 'Exportujem...' : 'Účtovný XLSX'}</span>
              </button>

              <button
                onClick={handleDownloadInvoicesZip}
                disabled={zipping === 'invoices' || !files.some(f => Boolean(f.publicUrl))}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-800 shadow-xs hover:bg-gray-50 transition-all disabled:opacity-50"
                title="Zbaliť a stiahnuť všetky PDF faktúry do ZIP archívu"
              >
                <FaFileArchive className={`text-xs ${zipping === 'invoices' ? 'animate-bounce text-pink-600' : 'text-pink-600'}`} />
                <span>
                  {zipping === 'invoices'
                    ? zipProgress
                      ? `Zbalujem (${zipProgress.current}/${zipProgress.total})...`
                      : 'Pripravujem ZIP...'
                    : 'Faktúry v ZIP'}
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Files View */}
        {viewMode === 'files' && (
          <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Importované faktúry ({invoiceGroups.length})</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Spárované faktúry sú priradené k objednávkam. Nespárované vieš pripnúť ručne.
                  </p>
                </div>

                {/* Sub-filter tabs with dynamic counts */}
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ['all', 'Všetky', invoiceFilterCounts.all, 'default'],
                    ['unmatched', 'Nespárované', invoiceFilterCounts.unmatched, 'amber'],
                    ['mismatch', 'Rozdiel sumy', invoiceFilterCounts.mismatch, 'orange'],
                    ['error', 'Chyby PDF', invoiceFilterCounts.error, 'rose'],
                  ] as Array<[InvoiceFilter, string, number, string]>).map(([value, label, count, tone]) => (
                    <button
                      key={value}
                      onClick={() => setInvoiceFilter(value)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                        invoiceFilter === value
                          ? 'bg-gray-900 text-white'
                          : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span>{label}</span>
                      <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        invoiceFilter === value
                          ? 'bg-white/20 text-white'
                          : tone === 'rose' && count > 0
                            ? 'bg-rose-100 text-rose-800'
                            : tone === 'orange' && count > 0
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-gray-100 text-gray-600'
                      }`}>
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {invoiceGroups.length === 0 ? (
              <div className="py-20 text-center px-4">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                  <FaFilePdf className="text-xl" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">Neboli nájdené žiadne PDF faktúry</h3>
                <p className="mt-1 text-xs text-gray-500">Skontroluj vybraný filter alebo vyhľadávanie.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {invoiceGroups.map((group) => {
                  const file = group.files[0];
                  const linkedSale = file.linkedSale;
                  const expectedAmount = linkedSale ? expectedInvoiceAmount(linkedSale, sales) : null;
                  const amountMismatch = Boolean(
                    linkedSale &&
                    file.extractedTotal !== null &&
                    file.extractedTotal !== undefined &&
                    expectedAmount !== null &&
                    Math.abs(Number(file.extractedTotal) - expectedAmount) > 0.02
                  );
                  const totalUnknown = file.extractedTotal === null || file.extractedTotal === undefined;
                  const hasPdfError = group.files.some(item => item.extractionStatus === 'error');
                  const expanded = expandedInvoiceGroup === group.key;
                  const status = hasPdfError
                    ? { label: 'Chyba PDF', bg: 'bg-rose-50 border-rose-200/80', text: 'text-rose-800', dot: 'bg-rose-500' }
                    : !linkedSale
                      ? { label: 'Nespárované', bg: 'bg-amber-50 border-amber-200/80', text: 'text-amber-800', dot: 'bg-amber-500' }
                      : amountMismatch
                        ? { label: 'Rozdiel v sume', bg: 'bg-orange-50 border-orange-200/80', text: 'text-orange-800', dot: 'bg-orange-500' }
                        : totalUnknown
                          ? { label: 'Suma nezistená', bg: 'bg-slate-50 border-slate-200/80', text: 'text-slate-800', dot: 'bg-slate-400' }
                          : { label: 'Spárované', bg: 'bg-emerald-50 border-emerald-200/80', text: 'text-emerald-800', dot: 'bg-emerald-500' };

                  return (
                    <div key={group.key} className="hover:bg-slate-50/60 transition-colors">
                      <div className="grid gap-3 px-4 py-3.5 sm:px-6 lg:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.4fr)_180px_220px] lg:items-center">
                        {/* Order identifier */}
                        <button
                          type="button"
                          onClick={() => setExpandedInvoiceGroup(expanded ? null : group.key)}
                          className="flex min-w-0 items-center gap-3 text-left"
                        >
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                            {expanded ? <FaChevronDown className="text-xs" /> : <FaChevronRight className="text-xs" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-xs font-bold text-gray-900 bg-gray-100 border border-gray-200/80 rounded-md px-2 py-0.5 inline-block">
                              #{group.orderNumber || 'Bez objednávky'}
                            </span>
                            <span className="mt-1 block text-[11px] text-gray-500">
                              {group.files.length} {group.files.length === 1 ? 'PDF súbor' : 'PDF súbory'} · {file.updatedAt ? formatDateShort(file.updatedAt) : '-'}
                            </span>
                          </span>
                        </button>

                        {/* Product / Status */}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${status.bg} ${status.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                              {status.label}
                            </span>
                            <span className="truncate text-xs font-bold text-gray-900" title={linkedSale?.name || file.extractedProduct || file.name}>
                              {linkedSale?.name || file.extractedProduct || file.name}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[11px] text-gray-500">
                            {linkedSale ? `${linkedSale.user_email} · ${linkedSale.source === 'eshop_sales' ? 'E-shop' : 'Consign'}` : 'Faktúra ešte nie je pripojená k predaju'}
                          </p>
                          {!linkedSale && smartMatchSuggestions.get(file.id) && (() => {
                            const match = smartMatchSuggestions.get(file.id)!;
                            return (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 text-[11px] font-medium text-indigo-900">
                                  <FaMagic className="text-[10px] text-indigo-600" />
                                  <span className="truncate max-w-[280px]">Návrh: #{match.sale.external_id || match.sale.id.slice(0, 8)} ({match.reason})</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmSmartMatch(file, match.sale)}
                                  className="rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-indigo-700 transition-colors shadow-xs"
                                >
                                  Spárovať
                                </button>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Financial extraction */}
                        <div className="grid grid-cols-2 gap-2 lg:block">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">PDF Suma</p>
                            <p className={`text-xs font-bold ${amountMismatch ? 'text-orange-700' : 'text-gray-900'}`}>
                              {totalUnknown ? 'Nezistená' : formatCurrency(file.extractedTotal || 0)}
                            </p>
                          </div>
                          {expectedAmount !== null && (
                            <div className="lg:mt-0.5">
                              <p className="text-[11px] text-gray-500 font-medium">Očakávané {formatCurrency(expectedAmount)}</p>
                              {amountMismatch && file.extractedTotal !== null && file.extractedTotal !== undefined && (
                                <p className="text-[10px] font-bold text-orange-600">
                                  Rozdiel {formatCurrency(Number(file.extractedTotal) - expectedAmount)}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-1.5 lg:justify-end">
                          <button
                            type="button"
                            onClick={() => handleReparseFile(file)}
                            disabled={reparsingPath === file.path}
                            title="Znova spustiť inteligentný parser na tomto PDF"
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-xs disabled:opacity-50"
                          >
                            <FaSync className={`mr-1.5 text-[10px] ${reparsingPath === file.path ? 'animate-spin text-pink-600' : ''}`} />
                            <span>{reparsingPath === file.path ? 'Parsujem...' : 'Pre-parsovať'}</span>
                          </button>
                          <a
                            href={file.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-xs"
                          >
                            <span>Otvoriť PDF</span>
                            <FaExternalLinkAlt className="ml-1.5 text-[10px]" />
                          </a>
                          {!linkedSale && (
                            <button
                              onClick={() => openAttachModal(file)}
                              className="inline-flex h-8 items-center justify-center rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-black transition-colors shadow-xs"
                            >
                              <FaLink className="mr-1.5 text-[10px]" /> Pripnúť
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Drawer */}
                      {expanded && (
                        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4 sm:px-6">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-3">
                              <div>
                                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">Párovanie so sale</p>
                                {linkedSale ? (
                                  <div className="rounded-xl border border-gray-200 bg-white p-3.5 text-xs shadow-xs space-y-1">
                                    <p className="font-bold text-gray-900">{linkedSale.name}</p>
                                    <div className="flex flex-wrap gap-1 text-[11px] text-gray-600">
                                      <span className="rounded bg-gray-100 px-1.5 py-0.2">Veľkosť {linkedSale.size || '-'}</span>
                                      <span className="rounded bg-gray-100 px-1.5 py-0.2 font-mono">SKU {linkedSale.sku || '-'}</span>
                                      <span className="rounded bg-gray-100 px-1.5 py-0.2">Ext #{linkedSale.external_id || '-'}</span>
                                    </div>
                                    <div className="pt-1 flex items-center justify-between text-xs">
                                      <span className="text-gray-500">Predajná cena: <span className="font-bold text-gray-900">{formatCurrency(linkedSale.price)}</span></span>
                                      <span className="text-gray-500">Výplata: <span className="font-bold text-blue-700">{formatCurrency(linkedSale.payout)}</span></span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-500 bg-white border border-gray-200/80 rounded-xl p-3">
                                    K tejto faktúre nie je automaticky priradený žiaden predaj. Použi tlačidlo <strong className="text-gray-900">Pripnúť</strong>.
                                  </p>
                                )}
                              </div>

                              {Array.isArray(file.extractedItems) && file.extractedItems.length > 0 && (
                                <div>
                                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">Rozpoznané položky z PDF</p>
                                  <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1.5 text-xs shadow-xs">
                                    {file.extractedItems.map((itm, itmIdx) => (
                                      <div key={itmIdx} className="flex items-center justify-between gap-2 border-b border-gray-100 last:border-0 pb-1.5 last:pb-0">
                                        <span className="truncate font-medium text-gray-800">{itm.product}</span>
                                        {itm.total !== null && itm.total !== undefined && (
                                          <span className="font-bold text-gray-900 whitespace-nowrap">{formatCurrency(itm.total)}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div>
                              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">Súbory v objednávke</p>
                              <div className="space-y-1.5">
                                {group.files.map(item => (
                                  <a
                                    key={item.id}
                                    href={item.publicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs hover:border-gray-300 transition-colors shadow-xs"
                                  >
                                    <span className="min-w-0 truncate font-semibold text-gray-800">{item.name}</span>
                                    <span className="flex-shrink-0 text-[11px] font-mono text-gray-500">{formatFileSize(item.size)}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Sales with FA View */}
        {viewMode === 'missing' && (
          <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
              <h2 className="text-lg font-bold text-gray-900">Sales s priradenou FA ({visibleSalesWithFa.length})</h2>
              <p className="mt-0.5 text-xs text-gray-500">Predaje a objednávky, ktoré už majú priradenú FA URL v databáze.</p>
            </div>

            {visibleSalesWithFa.length === 0 ? (
              <div className="py-20 text-center px-4">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                  <FaFilePdf className="text-xl" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">Žiadne sales s faktúrou</h3>
                <p className="mt-1 text-xs text-gray-500">Zatiaľ žiadny predaj nevyhovuje zadaným filtrom.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {visibleSalesWithFa.map((sale) => (
                  <div key={sale.id} className="p-4 hover:bg-slate-50/60 transition-colors">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px_240px] lg:items-center">
                      <div className="flex min-w-0 gap-3">
                        {sale.image_url ? (
                          <img src={sale.image_url} alt={sale.name} loading="lazy" className="h-12 w-12 flex-shrink-0 rounded-xl object-contain border border-gray-200 p-0.5 bg-white" />
                        ) : (
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
                            <FaFileInvoice className="text-base" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-gray-900">{sale.name}</p>
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-gray-500">
                            <span className="rounded bg-gray-100 px-1.5 py-0.2">{sale.size || '-'}</span>
                            {sale.sku && <span className="rounded bg-gray-100 px-1.5 py-0.2 font-mono">SKU {sale.sku}</span>}
                            <span>· {sale.user_email}</span>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-gray-400">
                            #{sale.external_id || sale.id.slice(0, 8)} · {formatDateShort(sale.invoice_date || sale.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Cena</p>
                          <p className="font-bold text-gray-900">{formatCurrency(sale.price || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Výplata</p>
                          <p className="font-bold text-blue-700">{formatCurrency(sale.payout || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Stav</p>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(sale.status)}`}>
                            {sale.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 lg:justify-end">
                        <button
                          onClick={() => openPayoutModal(sale)}
                          className="inline-flex h-8 items-center justify-center rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-black transition-colors shadow-xs"
                        >
                          Upraviť payout
                        </button>
                        {sale.fa_url && (
                          <a
                            href={sale.fa_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-xs"
                          >
                            <span>Otvoriť FA</span>
                            <FaExternalLinkAlt className="ml-1.5 text-[10px]" />
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

        {/* Contracts View */}
        {viewMode === 'contracts' && (
          <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Kúpne zmluvy ({visibleContractSales.length})</h2>
                  <p className="mt-0.5 text-xs text-gray-500">Všetky consign predaje. Vygenerované zmluvy otvoríš, chýbajúce vygeneruješ 1 klikom.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {contractSales.length - generatedContractCount > 0 && (
                    <button
                      type="button"
                      onClick={handleBulkGenerateContracts}
                      disabled={bulkGeneratingContracts}
                      className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-all disabled:opacity-50"
                    >
                      <FaFileContract className={`mr-1.5 text-xs ${bulkGeneratingContracts ? 'animate-spin' : ''}`} />
                      <span>
                        {bulkGeneratingContracts
                          ? bulkContractProgress
                            ? `Generujem (${bulkContractProgress.current}/${bulkContractProgress.total})...`
                            : 'Generujem...'
                          : `Vygenerovať chýbajúce (${contractSales.length - generatedContractCount})`}
                      </span>
                    </button>
                  )}
                  {generatedContractCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadContractsZip}
                      disabled={zipping === 'contracts'}
                      className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-800 shadow-xs hover:bg-gray-50 transition-all disabled:opacity-50"
                    >
                      <FaFileArchive className={`mr-1.5 text-xs ${zipping === 'contracts' ? 'animate-bounce text-indigo-600' : 'text-indigo-600'}`} />
                      <span>
                        {zipping === 'contracts'
                          ? zipProgress
                            ? `Zbalujem (${zipProgress.current}/${zipProgress.total})...`
                            : 'Pripravujem ZIP...'
                          : `Zmluvy v ZIP (${generatedContractCount})`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {visibleContractSales.length === 0 ? (
              <div className="py-20 text-center px-4">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                  <FaFileContract className="text-xl" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">Žiadne zmluvy</h3>
                <p className="mt-1 text-xs text-gray-500">Nenašli sa žiadne consign predaje vyhovujúce filtru.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {visibleContractSales.map((sale) => (
                  <div key={sale.id} className="p-4 hover:bg-slate-50/60 transition-colors">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px_220px] lg:items-center">
                      <div className="flex min-w-0 gap-3">
                        {sale.image_url ? (
                          <img src={sale.image_url} alt={sale.name} loading="lazy" className="h-12 w-12 flex-shrink-0 rounded-xl object-contain border border-gray-200 p-0.5 bg-white" />
                        ) : (
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
                            <FaFileContract className="text-base" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-gray-900">{sale.name}</p>
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-gray-500">
                            <span className="rounded bg-gray-100 px-1.5 py-0.2">{sale.size || '-'}</span>
                            {sale.sku && <span className="rounded bg-gray-100 px-1.5 py-0.2 font-mono">SKU {sale.sku}</span>}
                            <span>· {sale.user_email}</span>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-gray-400">
                            #{sale.external_id || sale.id.slice(0, 8)} · {formatDateShort(sale.invoice_date || sale.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Cena</p>
                          <p className="font-bold text-gray-900">{formatCurrency(sale.price || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Výplata</p>
                          <p className="font-bold text-blue-700">{formatCurrency(sale.payout || 0)}</p>
                        </div>
                        <div className="col-span-2 mt-0.5">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            sale.contract_url ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/60' : 'bg-amber-100 text-amber-800 border border-amber-200/60'
                          }`}>
                            {sale.contract_url ? 'Zmluva hotová' : 'Bez zmluvy'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 lg:justify-end">
                        {sale.contract_url ? (
                          <a
                            href={sale.contract_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-xs"
                          >
                            <span>Otvoriť zmluvu</span>
                            <FaExternalLinkAlt className="ml-1.5 text-[10px]" />
                          </a>
                        ) : (
                          <button
                            onClick={() => generateContractForSale(sale)}
                            disabled={generatingContractId === sale.id}
                            className="inline-flex h-8 items-center justify-center rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-black transition-colors shadow-xs disabled:opacity-50"
                          >
                            <FaFileContract className="mr-1.5 text-[10px]" />
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

      {/* Attach Invoice Modal */}
      {attachModalFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <FaLink className="text-gray-400" /> Párovanie faktúry
                </span>
                <h2 className="text-base font-black text-gray-900 mt-0.5 truncate">{attachModalFile.name}</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {attachModalFile.orderNumber ? `Objednávka #${attachModalFile.orderNumber}` : 'Bez detekovaného čísla objednávky'}
                </p>
              </div>
              <button
                onClick={closeAttachModal}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                aria-label="Zavrieť"
              >
                <FaTimes />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Vyber zodpovedajúci predaj (Sale)
                </label>
                <select
                  value={attachTarget}
                  onChange={(event) => setAttachTarget(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-black/10"
                >
                  <option value="">Vyber sale zo zoznamu...</option>
                  {attachableSales.map((sale) => (
                    <option key={`${sale.source}:${sale.id}`} value={`${sale.source}:${sale.id}`}>
                      #{sale.external_id || sale.id.slice(0, 8)} · {sale.source === 'eshop_sales' ? 'Eshop' : 'Consign'} · {sale.name} · {sale.user_email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 text-xs text-gray-600">
                Po pripnutí sa faktúra natrvalo spáruje s vybraným predajom a prepojí sa do FA dokumentu pre účtovníctvo.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-3.5 sm:flex-row sm:justify-end bg-gray-50/50">
              <button
                onClick={closeAttachModal}
                disabled={Boolean(attachingPath)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Zrušiť
              </button>
              <button
                onClick={attachFileToSale}
                disabled={Boolean(attachingPath) || !attachTarget}
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black transition-colors disabled:opacity-50 shadow-xs"
              >
                <FaLink className="mr-1.5 text-xs" />
                {attachingPath ? 'Pripínam...' : 'Pripnúť k objednávke'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payout Modal */}
      {payoutModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Úprava výplaty</span>
                <h2 className="text-base font-black text-gray-900 mt-0.5 truncate">{payoutModalSale.name}</h2>
                <p className="mt-0.5 text-xs text-gray-500 font-mono">
                  #{payoutModalSale.external_id || payoutModalSale.id.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={closePayoutModal}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                aria-label="Zavrieť"
              >
                <FaTimes />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Predajná cena</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">{formatCurrency(payoutModalSale.price || 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Aktuálna výplata</p>
                  <p className="text-sm font-black text-blue-700 mt-0.5">{formatCurrency(payoutModalSale.payout || 0)}</p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-700 uppercase tracking-wider">Nová výplata consignora</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payoutDraft}
                    onChange={(event) => setPayoutDraft(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 pr-12 text-sm font-bold text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-black/10"
                    autoFocus
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">EUR</span>
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600">
                Zmena sa okamžite prejaví v databáze predaja aj v evidencii faktúr pre účtovníctvo.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-3.5 sm:flex-row sm:justify-end bg-gray-50/50">
              <button
                onClick={closePayoutModal}
                disabled={savingPayout}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Zrušiť
              </button>
              <button
                onClick={savePayoutForSale}
                disabled={savingPayout}
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black transition-colors disabled:opacity-50 shadow-xs"
              >
                {savingPayout ? 'Ukladám...' : 'Uložiť výplatu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
