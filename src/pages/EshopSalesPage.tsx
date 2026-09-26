import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AdminNavigation from '../components/AdminNavigation';
import SalesStatusBadge from '../components/SalesStatusBadge';
import Pagination from '../components/Pagination';
import { useToast } from '../components/Toast';
import { formatDate, formatCurrency } from '../lib/utils';
import {
  downloadAccountingWorkbook,
  excelDate,
  exportDateStamp,
  type AccountingItemRow,
  type AccountingOrderRow,
  type InvoiceAuditRow,
} from '../lib/xlsxExport';
import { createInvoiceSignedUrlMap, resolveInvoiceReferences } from '../lib/storageUrls';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  FaSearch, FaPlus, FaTimes, FaFilter, FaSync, FaSignOutAlt,
  FaUserShield, FaShoppingCart, FaSave, FaLink, FaTruck,
  FaExclamationTriangle, FaEdit, FaTrash, FaExternalLinkAlt,
  FaSortAmountDown, FaSortAmountUp, FaCloudDownloadAlt, FaCheckCircle, FaDownload,
  FaCoins, FaPercentage, FaCheck, FaCalendarAlt, FaFileInvoice
} from 'react-icons/fa';

interface EshopSale {
  id: string;
  order_number: string;
  line_item_key?: string | null;
  product_name: string;
  size: string | null;
  sku: string | null;
  price: number;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  notes: string | null;
  image_url: string | null;
  quantity?: number | null;
  shoptet_status?: string | null;
  order_created_at?: string | null;
  product_id?: string | null;
  shop_remark?: string | null;
  original_order_number?: string | null;
  order_total?: number | null;
  order_product_total?: number | null;
  order_extra_total?: number | null;
  order_item_count?: number | null;
  amount_paid?: number | null;
  currency?: string | null;
  payout?: number | null;
  fa_url?: string | null;
  created_at: string;
  updated_at: string;
}

interface LinkedSale {
  id: string;
  name: string;
  size: string;
  sku?: string | null;
  price: number;
  payout: number;
  status: string;
  external_id: string;
  user_email: string;
  product_id?: string | null;
  vat_scheme?: 'VAT0' | 'MARGIN' | null;
  input_currency?: 'EUR' | 'CZK' | null;
}

interface InvoiceDocument {
  storage_path: string;
  file_name: string;
  order_number: string | null;
  status: string;
  matched_target: string | null;
  eshop_sale_id: string | null;
  payout: number | null;
  source: string | null;
  imported_at: string | null;
  extracted_total: number | null;
  extracted_product: string | null;
  extraction_status: string | null;
  extraction_error: string | null;
}

interface InvoiceDownload {
  url: string;
  fileName: string;
}

interface EshopOrderGroup {
  key: string;
  orderNumber: string;
  items: EshopSale[];
  primary: EshopSale;
  totalPrice: number;
  orderTotal: number | null;
  orderExtraTotal: number;
  createdAt: string;
}

const ESHOP_STATUSES = [
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned' },
];

const STATUS_TABS = [
  { value: '', label: 'Všetky stavy', key: 'all' },
  { value: 'processing', label: 'Spracováva sa', key: 'processing' },
  { value: 'shipped', label: 'Odoslané', key: 'shipped' },
  { value: 'delivered', label: 'Doručené', key: 'delivered' },
  { value: 'completed', label: 'Dokončené', key: 'completed' },
  { value: 'cancelled', label: 'Zrušené', key: 'cancelled' },
  { value: 'returned', label: 'Vrátené', key: 'returned' },
];

type PairingFilter = 'all' | 'matched' | 'unmatched' | 'has_invoice' | 'no_invoice';

const ITEMS_PER_PAGE = 25;

export default function EshopSalesPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [sales, setSales] = useState<EshopSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pairingFilter, setPairingFilter] = useState<PairingFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<'created_at' | 'price' | 'profit'>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSale, setEditingSale] = useState<EshopSale | null>(null);
  const [matchDetailSale, setMatchDetailSale] = useState<EshopSale | null>(null);
  const [linkedSales, setLinkedSales] = useState<Record<string, LinkedSale | null>>({});
  const [importingOrders, setImportingOrders] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [invoiceBySaleId, setInvoiceBySaleId] = useState<Record<string, InvoiceDownload>>({});
  const [invoiceByOrder, setInvoiceByOrder] = useState<Record<string, InvoiceDownload>>({});
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);

  useEscapeKey(() => {
    setShowCreateModal(false);
    setEditingSale(null);
  });

  const findLinkedSale = (sale: EshopSale, candidates: any[]) => {
    const saleSkuBase = sale.sku?.split('/')[0]?.toLowerCase();
    return candidates.find((row: any) =>
      row.external_id === sale.original_order_number &&
      row.size?.trim() === sale.size?.trim() &&
      saleSkuBase &&
      row.sku?.split('/')[0]?.toLowerCase() === saleSkuBase
    ) || candidates.find((row: any) =>
      row.external_id === sale.original_order_number &&
      row.size?.trim() === sale.size?.trim()
    ) || candidates.find((row: any) =>
      row.size?.trim() === sale.size?.trim() &&
      saleSkuBase &&
      row.sku?.split('/')[0]?.toLowerCase() === saleSkuBase
    ) || candidates.find((row: any) =>
      row.size?.trim() === sale.size?.trim() &&
      row.name?.toLowerCase() === sale.product_name?.toLowerCase()
    ) || candidates.find((row: any) =>
      row.size?.trim() === sale.size?.trim()
    ) || candidates[0] || null;
  };

  const loadLinkedSales = async (nextSales: EshopSale[]) => {
    const orderNumbers = Array.from(new Set(nextSales.flatMap(sale =>
      [sale.order_number, sale.original_order_number].filter(Boolean) as string[]
    )));
    const candidates: any[] = [];

    for (let offset = 0; offset < orderNumbers.length; offset += 100) {
      const { data, error: linkedError } = await supabase
        .from('user_sales')
        .select('id, product_id, name, size, sku, price, payout, status, external_id, profiles(email, profile_type, vat_type)')
        .in('external_id', orderNumbers.slice(offset, offset + 100));
      if (linkedError) throw linkedError;
      candidates.push(...(data || []));
    }

    const numericProductIds = Array.from(new Set(
      candidates
        .map(row => parseInt(String(row.product_id), 10))
        .filter(num => Number.isInteger(num))
    ));
    const productMeta = new Map<string, { vat_scheme?: 'VAT0' | 'MARGIN' | null; input_currency?: 'EUR' | 'CZK' | null }>();
    if (numericProductIds.length > 0) {
      for (let offset = 0; offset < numericProductIds.length; offset += 100) {
        const { data, error: productError } = await supabase
          .from('user_products')
          .select('product_id, vat_scheme, input_currency')
          .in('product_id', numericProductIds.slice(offset, offset + 100));
        if (!productError && data) {
          data.forEach((row: any) => {
            if (row.product_id && !productMeta.has(String(row.product_id))) {
              productMeta.set(String(row.product_id), row);
            }
          });
        }
      }
    }

    const byOrder = candidates.reduce((map, candidate) => {
      const list = map.get(candidate.external_id) || [];
      list.push(candidate);
      map.set(candidate.external_id, list);
      return map;
    }, new Map<string, any[]>());
    const nextLinked: Record<string, LinkedSale | null> = {};

    nextSales.forEach(sale => {
      const possible = [
        ...(byOrder.get(sale.order_number) || []),
        ...(sale.original_order_number ? byOrder.get(sale.original_order_number) || [] : []),
      ];
      const linkedRow = findLinkedSale(sale, possible);
      if (!linkedRow) {
        nextLinked[sale.id] = null;
        return;
      }
      const profile = linkedRow.profiles as any;
      const isVatPayer = profile?.profile_type === 'Business' && ['VAT_PAYER', 'VAT 0%'].includes(String(profile?.vat_type || ''));
      const meta = productMeta.get(String(linkedRow.product_id)) || {};
      const vatScheme: 'VAT0' | 'MARGIN' = meta.vat_scheme || (isVatPayer ? 'VAT0' : 'MARGIN');

      nextLinked[sale.id] = {
        id: linkedRow.id,
        name: linkedRow.name,
        size: linkedRow.size,
        sku: linkedRow.sku,
        price: Number(linkedRow.price || 0),
        payout: Number(linkedRow.payout || 0),
        status: linkedRow.status,
        external_id: linkedRow.external_id,
        user_email: profile?.email || '',
        product_id: linkedRow.product_id,
        vat_scheme: vatScheme,
        input_currency: meta.input_currency || 'EUR',
      };
    });

    return nextLinked;
  };

  const fetchSales = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextSales: EshopSale[] = [];
      const pageSize = 1000;

      for (let from = 0; ; from += pageSize) {
        const { data, error: fetchError } = await supabase
          .from('eshop_sales')
          .select('*')
          .order(sortField === 'created_at' ? 'order_created_at' : sortField, { ascending: sortAsc, nullsFirst: false })
          .order('order_number', { ascending: true })
          .order('line_item_key', { ascending: true })
          .range(from, from + pageSize - 1);
        if (fetchError) throw fetchError;
        nextSales.push(...((data || []) as EshopSale[]));
        if (!data || data.length < pageSize) break;
      }

      const signedInvoiceUrls = await resolveInvoiceReferences(nextSales.map(sale => sale.fa_url));
      const resolvedSales = nextSales.map(sale => ({
        ...sale,
        fa_url: signedInvoiceUrls.get(sale.fa_url || '') || sale.fa_url,
      }));
      setSales(resolvedSales);
      const [nextLinkedSales, invoiceResult] = await Promise.all([
        loadLinkedSales(resolvedSales),
        supabase
          .from('invoice_documents')
          .select('storage_path, file_name, order_number, eshop_sale_id, imported_at')
          .eq('document_type', 'fa')
          .order('imported_at', { ascending: false })
          .limit(2000),
      ]);
      setLinkedSales(nextLinkedSales);

      if (!invoiceResult.error) {
        const invoiceRows = (invoiceResult.data || []) as Array<Pick<InvoiceDocument, 'storage_path' | 'file_name' | 'order_number' | 'eshop_sale_id' | 'imported_at'>>;
        const signedUrls = await createInvoiceSignedUrlMap(invoiceRows.map(invoice => invoice.storage_path));
        const bySale: Record<string, InvoiceDownload> = {};
        const byOrder: Record<string, InvoiceDownload> = {};
        invoiceRows.forEach(invoice => {
          const url = signedUrls.get(invoice.storage_path);
          if (!url) return;
          const value = { url, fileName: invoice.file_name || 'invoice.pdf' };
          if (invoice.eshop_sale_id && !bySale[invoice.eshop_sale_id]) bySale[invoice.eshop_sale_id] = value;
          if (invoice.order_number && !byOrder[invoice.order_number]) byOrder[invoice.order_number] = value;
        });
        setInvoiceBySaleId(bySale);
        setInvoiceByOrder(byOrder);
      } else {
        setInvoiceBySaleId({});
        setInvoiceByOrder({});
      }
    } catch (err: any) {
      setError('Error loading eshop sales: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortAsc]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  // Derived: filtered + paginated
  const filtered = sales.filter(s => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (dateFrom && s.created_at.split('T')[0] < dateFrom) return false;
    if (dateTo && s.created_at.split('T')[0] > dateTo) return false;

    if (pairingFilter === 'matched' && !linkedSales[s.id]) return false;
    if (pairingFilter === 'unmatched' && linkedSales[s.id]) return false;
    const hasInvoice = Boolean(invoiceBySaleId[s.id] || invoiceByOrder[s.order_number] || s.fa_url);
    if (pairingFilter === 'has_invoice' && !hasInvoice) return false;
    if (pairingFilter === 'no_invoice' && hasInvoice) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (
        !s.order_number?.toLowerCase().includes(q) &&
        !s.original_order_number?.toLowerCase().includes(q) &&
        !s.product_name?.toLowerCase().includes(q) &&
        !s.customer_email?.toLowerCase().includes(q) &&
        !s.customer_name?.toLowerCase().includes(q) &&
        !s.sku?.toLowerCase().includes(q) &&
        !s.tracking_number?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: sales.length,
      processing: 0,
      shipped: 0,
      delivered: 0,
      completed: 0,
      cancelled: 0,
      returned: 0,
      matched: 0,
      unmatched: 0,
      has_invoice: 0,
      no_invoice: 0,
    };
    for (const sale of sales) {
      if (counts[sale.status] !== undefined) {
        counts[sale.status]++;
      }
      if (linkedSales[sale.id]) {
        counts.matched++;
      } else {
        counts.unmatched++;
      }
      const hasInvoice = Boolean(invoiceBySaleId[sale.id] || invoiceByOrder[sale.order_number] || sale.fa_url);
      if (hasInvoice) {
        counts.has_invoice++;
      } else {
        counts.no_invoice++;
      }
    }
    return counts;
  }, [sales, linkedSales, invoiceBySaleId, invoiceByOrder]);

  const orderGroups = Array.from(
    filtered.reduce((groups, sale) => {
      const key = sale.order_number || sale.id;
      const next = groups.get(key) || [];
      next.push(sale);
      groups.set(key, next);
      return groups;
    }, new Map<string, EshopSale[]>())
  ).map(([key, items]): EshopOrderGroup => {
    const sortedItems = [...items].sort((a, b) =>
      String(a.sku || a.product_name).localeCompare(String(b.sku || b.product_name), undefined, { numeric: true }) ||
      String(a.size || '').localeCompare(String(b.size || ''), undefined, { numeric: true })
    );
    const primary = sortedItems[0];
    const totalPrice = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
    const orderTotalValue = items.find(item => item.order_total !== null && item.order_total !== undefined)?.order_total;
    const orderExtraTotal = Number(items.find(item => item.order_extra_total !== null && item.order_extra_total !== undefined)?.order_extra_total || 0);
    const createdAt = primary.order_created_at || primary.created_at;

    return {
      key,
      orderNumber: primary.order_number,
      items: sortedItems,
      primary,
      totalPrice,
      orderTotal: orderTotalValue !== null && orderTotalValue !== undefined ? Number(orderTotalValue) : null,
      orderExtraTotal,
      createdAt,
    };
  }).sort((a, b) => {
    if (sortField === 'price') {
      return sortAsc ? a.totalPrice - b.totalPrice : b.totalPrice - a.totalPrice;
    }
    if (sortField === 'profit') {
      const profitA = a.items.reduce((sum, sale) => {
        const linked = linkedSales[sale.id];
        return linked ? sum + (sale.price - linked.payout) : sum;
      }, 0);
      const profitB = b.items.reduce((sum, sale) => {
        const linked = linkedSales[sale.id];
        return linked ? sum + (sale.price - linked.payout) : sum;
      }, 0);
      return sortAsc ? profitA - profitB : profitB - profitA;
    }
    const dateDifference = sortAsc
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return dateDifference || a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
  });

  const paginatedGroups = orderGroups.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const hasFilters = Boolean(searchTerm || statusFilter || pairingFilter !== 'all' || dateFrom || dateTo);

  const isCurrentMonth = useMemo(() => {
    if (!dateFrom || !dateTo) return false;
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const toIso = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    return dateFrom === toIso(firstDay) && dateTo === toIso(lastDay);
  }, [dateFrom, dateTo]);

  const isLastMonth = useMemo(() => {
    if (!dateFrom || !dateTo) return false;
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    const toIso = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    return dateFrom === toIso(firstDay) && dateTo === toIso(lastDay);
  }, [dateFrom, dateTo]);

  const applyMonthFilter = (monthOffset: number) => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
    const toLocalIsoDate = (date: Date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    setDateFrom(toLocalIsoDate(firstDay));
    setDateTo(toLocalIsoDate(lastDay));
    setCurrentPage(1);
  };

  const clearMonthFilter = () => {
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setPairingFilter('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const toggleSort = (field: 'created_at' | 'price' | 'profit') => {
    if (sortField === field) setSortAsc(a => !a);
    else { setSortField(field); setSortAsc(false); }
  };

  const getGroupInvoice = (group: EshopOrderGroup): InvoiceDownload | null => (
    group.items.map(item => invoiceBySaleId[item.id]).find(Boolean) ||
    invoiceByOrder[group.orderNumber] ||
    group.items.map(item => item.original_order_number ? invoiceByOrder[item.original_order_number] : null).find(Boolean) ||
    null
  );

  const downloadInvoice = async (invoice: InvoiceDownload, orderNumber: string) => {
    try {
      setDownloadingInvoice(orderNumber);
      const response = await fetch(invoice.url);
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `FA-${orderNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (downloadError: any) {
      setError('Error downloading invoice: ' + (downloadError?.message || 'Unknown error'));
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const exportToXlsx = async () => {
    try {
      setExporting(true);
      const documents: InvoiceDocument[] = [];
      const pageSize = 500;

      for (let from = 0; ; from += pageSize) {
        const { data, error: invoiceError } = await supabase
          .from('invoice_documents')
          .select('storage_path, file_name, order_number, status, matched_target, eshop_sale_id, payout, source, imported_at, extracted_total, extracted_product, extraction_status, extraction_error')
          .eq('document_type', 'fa')
          .order('imported_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (invoiceError) {
          const tableMissing = /invoice_documents|schema cache|does not exist|not found/i.test(invoiceError.message || '');
          if (tableMissing) break;
          throw invoiceError;
        }
        documents.push(...((data || []) as InvoiceDocument[]));
        if (!data || data.length < pageSize) break;
      }

      const relevantOrderNumbers = new Set(orderGroups.flatMap(group =>
        group.items.flatMap(item => [item.order_number, item.original_order_number].filter(Boolean) as string[])
      ));
      const relevantSaleIds = new Set(orderGroups.flatMap(group => group.items.map(item => item.id)));
      const relevantDocuments = documents.filter(document =>
        (document.eshop_sale_id && relevantSaleIds.has(document.eshop_sale_id)) ||
        (document.order_number && relevantOrderNumbers.has(document.order_number))
      );
      const signedUrls = await createInvoiceSignedUrlMap(relevantDocuments.map(document => document.storage_path));
      const invoiceBySaleId = new Map<string, InvoiceDocument>();
      const invoiceByOrder = new Map<string, InvoiceDocument>();
      relevantDocuments.forEach(document => {
        if (document.eshop_sale_id && !invoiceBySaleId.has(document.eshop_sale_id)) {
          invoiceBySaleId.set(document.eshop_sale_id, document);
        }
        if (document.order_number && !invoiceByOrder.has(document.order_number)) {
          invoiceByOrder.set(document.order_number, document);
        }
      });

      const accountingItems: AccountingItemRow[] = orderGroups.flatMap(group => group.items.map(sale => {
        const linked = linkedSales[sale.id];
        const payout = linked ? Number(linked.payout || 0) : Number(sale.payout || 0);
        const revenue = Number(sale.price || 0);
        const vatScheme = linked?.vat_scheme || 'MARGIN';
        const taxableAmount = vatScheme === 'VAT0' ? revenue : Math.max(0, revenue - payout);
        const vatBase = taxableAmount / 1.23;
        const invoice = invoiceBySaleId.get(sale.id) || invoiceByOrder.get(sale.order_number);
        const invoiceUrl = invoice ? signedUrls.get(invoice.storage_path) || '' : sale.fa_url || '';

        return {
          orderNumber: sale.order_number,
          originalOrderNumber: sale.original_order_number || '',
          orderDate: excelDate(sale.order_created_at || sale.created_at),
          product: sale.product_name,
          size: sale.size || '',
          sku: sale.sku || '',
          quantity: Number(sale.quantity || 1),
          itemRevenue: revenue,
          currency: sale.currency || 'EUR',
          status: sale.status,
          customer: sale.customer_name || '',
          customerEmail: sale.customer_email || '',
          linkedSaleId: linked?.id || '',
          consignorEmail: linked?.user_email || '',
          payout,
          profit: revenue - payout,
          matchStatus: linked ? 'matched' : 'unmatched',
          vatScheme,
          vatBase,
          vatAmount: taxableAmount - vatBase,
          invoiceUrl,
          trackingNumber: sale.tracking_number || '',
          importedAt: excelDate(sale.created_at),
          notes: sale.notes || sale.shop_remark || '',
        };
      }));

      const accountingOrders: AccountingOrderRow[] = orderGroups.map(group => {
        const itemRows = accountingItems.filter(item => item.orderNumber === group.orderNumber);
        const primary = group.primary;
        const invoice = group.items
          .map(item => invoiceBySaleId.get(item.id))
          .find(Boolean) || invoiceByOrder.get(group.orderNumber);
        const invoiceUrl = invoice
          ? signedUrls.get(invoice.storage_path) || ''
          : group.items.find(item => item.fa_url)?.fa_url || '';
        const orderTotal = group.orderTotal ?? group.totalPrice + group.orderExtraTotal;
        const invoiceTotal = invoice?.extracted_total !== null && invoice?.extracted_total !== undefined
          ? Number(invoice.extracted_total)
          : null;

        return {
          orderNumber: group.orderNumber,
          orderDate: excelDate(primary.order_created_at || group.createdAt),
          customer: primary.customer_name || '',
          customerEmail: primary.customer_email || '',
          currency: primary.currency || 'EUR',
          status: Array.from(new Set(group.items.map(item => item.status))).join(', '),
          shoptetStatus: primary.shoptet_status || '',
          itemCount: group.items.length,
          quantity: group.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
          itemRevenue: group.totalPrice,
          orderTotal,
          extraTotal: group.orderExtraTotal,
          payout: itemRows.reduce((sum, item) => sum + item.payout, 0),
          profit: itemRows.reduce((sum, item) => sum + item.profit, 0),
          matchedItems: itemRows.filter(item => item.matchStatus === 'matched').length,
          unmatchedItems: itemRows.filter(item => item.matchStatus !== 'matched').length,
          invoiceStatus: invoice ? invoice.status : invoiceUrl ? 'linked' : 'missing',
          invoiceTotal,
          invoiceDifference: invoiceTotal === null ? null : invoiceTotal - orderTotal,
          invoiceUrl,
          trackingNumber: Array.from(new Set(group.items.map(item => item.tracking_number).filter(Boolean))).join(', '),
          notes: primary.notes || primary.shop_remark || '',
        };
      });

      const invoiceAudit: InvoiceAuditRow[] = relevantDocuments.map(document => {
        const sale = orderGroups.flatMap(group => group.items).find(item =>
          item.id === document.eshop_sale_id ||
          item.order_number === document.order_number ||
          item.original_order_number === document.order_number
        );
        const linked = sale ? linkedSales[sale.id] : null;
        const saleAmount = sale ? Number(sale.price || 0) : null;
        const extractedAmount = document.extracted_total !== null ? Number(document.extracted_total) : null;
        return {
          fileName: document.file_name,
          orderNumber: document.order_number || sale?.order_number || '',
          source: document.source || 'invoice_documents',
          matchStatus: sale || document.status === 'matched' ? 'matched' : 'unmatched',
          saleSource: document.matched_target || 'eshop_sales',
          product: document.extracted_product || sale?.product_name || '',
          customerEmail: sale?.customer_email || '',
          saleAmount,
          extractedAmount,
          difference: saleAmount !== null && extractedAmount !== null ? extractedAmount - saleAmount : null,
          payout: linked ? linked.payout : document.payout,
          extractionStatus: document.extraction_status || '',
          extractionError: document.extraction_error || '',
          importedAt: excelDate(document.imported_at),
          invoiceUrl: signedUrls.get(document.storage_path) || '',
        };
      });

      await downloadAccountingWorkbook({
        fileName: `accounting_sales_${exportDateStamp()}.xlsx`,
        orders: accountingOrders,
        items: accountingItems,
        invoices: invoiceAudit,
        dateFrom,
        dateTo,
      });
      showToast('Accounting XLSX downloaded', 'success');
    } catch (err: any) {
      console.error('Error exporting eshop sales to XLSX:', err);
      setError('Error exporting eshop sales to XLSX: ' + (err?.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  const handleImportOrders = async () => {
    try {
      setImportingOrders(true);
      setError(null);
      setImportResult(null);

      const { data, error: invokeError } = await supabase.functions.invoke('import-shoptet-orders', {
        body: {
          dateFrom: dateFrom || undefined,
          dateUntil: dateTo || undefined,
        },
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      const message = `Imported Shoptet orders: ${data?.inserted ?? 0} new, ${data?.updated ?? 0} updated, ${data?.matched ?? 0} matched, ${data?.unmatched ?? 0} unmatched.`;
      setImportResult(message);
      showToast(message, data?.unmatched ? 'info' : 'success');
      setLinkedSales({});
      await fetchSales();
    } catch (err: any) {
      const message = err?.message || 'Unknown Shoptet import error';
      setError('Error importing Shoptet orders: ' + message);
      showToast('Shoptet import failed', 'error');
    } finally {
      setImportingOrders(false);
    }
  };

  // Stats
  const totalRevenue = sales.reduce((s, e) => s + e.price, 0);
  const activeCount = sales.filter(s => !['completed', 'cancelled', 'returned'].includes(s.status)).length;
  const completedCount = sales.filter(s => s.status === 'completed').length;
  const loadedProfit = sales.reduce((sum, sale) => {
    const linked = linkedSales[sale.id];
    return linked ? sum + (sale.price - linked.payout) : sum;
  }, 0);
  const matchedLoadedCount = sales.filter(sale => linkedSales[sale.id]).length;
  const checkedMatchCount = sales.filter(sale => linkedSales[sale.id] !== undefined).length;
  const unmatchedLoadedCount = sales.filter(sale => linkedSales[sale.id] === null).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl shadow-lg">
                <FaUserShield className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">Eshop Sales</h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Orders from the eshop</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={fetchSales}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm"
                title="Refresh"
              >
                <FaSync className="sm:mr-2" />
                <span className="hidden sm:inline">Refresh</span>
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

      <main className="mx-auto max-w-[1680px] px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <AdminNavigation />

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center">
              <FaExclamationTriangle className="text-red-400 mr-3" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button onClick={() => setError(null)}><FaTimes className="text-red-400" /></button>
          </div>
        )}

        {importResult && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
            <p className="text-sm text-green-800">{importResult}</p>
            <button onClick={() => setImportResult(null)}><FaTimes className="text-green-700" /></button>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Objednávky</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                <FaShoppingCart className="text-sm" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-gray-900">{sales.length}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-700 border border-amber-200/60">
                {activeCount} aktívnych
              </span>
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 border border-emerald-200/60">
                {completedCount} hotových
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Celkový obrat</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <FaCoins className="text-sm" />
              </div>
            </div>
            <p className="mt-2 truncate text-2xl font-black tracking-tight text-gray-900">{formatCurrency(totalRevenue)}</p>
            <p className="mt-2 text-xs text-gray-500 truncate">
              Priem. {sales.length ? formatCurrency(totalRevenue / sales.length) : '0 €'} na objednávku
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Spárovanie</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                <FaLink className="text-sm" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-purple-700">{matchedLoadedCount}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 font-semibold text-purple-700 border border-purple-200/60">
                {sales.length > 0 ? Math.round((matchedLoadedCount / sales.length) * 100) : 0}% spárovaných
              </span>
              <span className="text-gray-400">· {unmatchedLoadedCount} bez páru</span>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-teal-50/50 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Hrubý zisk</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
                <FaPercentage className="text-xs" />
              </div>
            </div>
            <p className="mt-2 truncate text-2xl font-black tracking-tight text-emerald-800">{formatCurrency(loadedProfit)}</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center rounded-md bg-emerald-100/80 px-2 py-0.5 font-bold text-emerald-800">
                {totalRevenue > 0 && loadedProfit > 0 ? ((loadedProfit / totalRevenue) * 100).toFixed(1) : '0'}% marža
              </span>
              <span className="text-emerald-700 font-medium">po výplatách</span>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
          {/* Card Header */}
          <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900">Eshop Objednávky</h2>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700">
                    {orderGroups.length}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Importované objednávky zo Shoptetu spárované s výplatami predajcov · {filtered.length} položiek · Celkom: {formatCurrency(filtered.reduce((sum, s) => sum + Number(s.price || 0), 0))}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Export XLSX */}
                <button
                  onClick={exportToXlsx}
                  disabled={orderGroups.length === 0 || exporting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-gray-800 font-semibold rounded-xl hover:bg-gray-50 transition-all text-xs border border-gray-200 shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                  title="Stiahnuť účtovný XLSX audit"
                >
                  <FaDownload className={`text-xs ${exporting ? 'animate-pulse text-emerald-600' : 'text-gray-600'}`} />
                  <span>{exporting ? 'Exportujem...' : 'Účtovný XLSX'}</span>
                </button>

                {/* Import XML */}
                <button
                  onClick={handleImportOrders}
                  disabled={importingOrders}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-gray-800 font-semibold rounded-xl hover:bg-gray-50 transition-all text-xs border border-gray-200 shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
                  title="Importovať objednávky zo Shoptet XML"
                >
                  <FaCloudDownloadAlt className={`text-xs ${importingOrders ? 'animate-pulse text-blue-600' : 'text-gray-600'}`} />
                  <span>{importingOrders ? 'Importujem...' : 'Import XML'}</span>
                </button>

                {/* New Order */}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 text-white font-semibold rounded-xl hover:bg-black transition-all text-xs shadow-xs"
                >
                  <FaPlus className="text-xs" />
                  <span>Nová objednávka</span>
                </button>
              </div>
            </div>
          </div>

          {/* Status Tabs Bar */}
          <div className="border-b border-gray-200/80 bg-gray-50/50 px-4 sm:px-6">
            <div className="flex items-center gap-1 overflow-x-auto py-2.5 no-scrollbar">
              {STATUS_TABS.map((tab) => {
                const count = statusCounts[tab.key] || 0;
                const isActive = statusFilter === tab.value;
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setStatusFilter(tab.value); setCurrentPage(1); }}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-gray-900 text-white shadow-xs'
                        : 'text-gray-600 hover:bg-white hover:text-gray-900'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-200/70 text-gray-700'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search, Sub-filters and Date Controls */}
          <div className="border-b border-gray-200/80 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                <input
                  type="text"
                  placeholder="Hľadať číslo objednávky, produkt, zákazníka, SKU..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-8 pr-8 py-2 bg-gray-50/70 hover:bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <FaTimes className="text-xs" />
                  </button>
                )}
              </div>

              {/* Pairing & Invoice Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200/60">
                  <button
                    onClick={() => { setPairingFilter('all'); setCurrentPage(1); }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      pairingFilter === 'all'
                        ? 'bg-white text-gray-900 shadow-xs font-bold'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Všetko
                  </button>
                  <button
                    onClick={() => { setPairingFilter('matched'); setCurrentPage(1); }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      pairingFilter === 'matched'
                        ? 'bg-purple-600 text-white shadow-xs font-bold'
                        : 'text-gray-600 hover:text-purple-700'
                    }`}
                  >
                    <FaLink className="text-[10px]" />
                    <span>Spárované</span>
                    <span className={`text-[10px] rounded px-1 ${pairingFilter === 'matched' ? 'bg-purple-700 text-white' : 'bg-gray-200/70 text-gray-600'}`}>
                      {statusCounts.matched}
                    </span>
                  </button>
                  <button
                    onClick={() => { setPairingFilter('unmatched'); setCurrentPage(1); }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      pairingFilter === 'unmatched'
                        ? 'bg-amber-600 text-white shadow-xs font-bold'
                        : 'text-gray-600 hover:text-amber-700'
                    }`}
                  >
                    <FaExclamationTriangle className="text-[10px]" />
                    <span>Bez páru</span>
                    <span className={`text-[10px] rounded px-1 ${pairingFilter === 'unmatched' ? 'bg-amber-700 text-white' : 'bg-gray-200/70 text-gray-600'}`}>
                      {statusCounts.unmatched}
                    </span>
                  </button>
                  <button
                    onClick={() => { setPairingFilter('has_invoice'); setCurrentPage(1); }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      pairingFilter === 'has_invoice'
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-gray-600 hover:text-emerald-700'
                    }`}
                  >
                    <FaFileInvoice className="text-[10px]" />
                    <span>S FA</span>
                    <span className={`text-[10px] rounded px-1 ${pairingFilter === 'has_invoice' ? 'bg-emerald-700 text-white' : 'bg-gray-200/70 text-gray-600'}`}>
                      {statusCounts.has_invoice}
                    </span>
                  </button>
                  <button
                    onClick={() => { setPairingFilter('no_invoice'); setCurrentPage(1); }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      pairingFilter === 'no_invoice'
                        ? 'bg-rose-600 text-white shadow-xs font-bold'
                        : 'text-gray-600 hover:text-rose-700'
                    }`}
                  >
                    <FaTimes className="text-[10px]" />
                    <span>Bez FA</span>
                    <span className={`text-[10px] rounded px-1 ${pairingFilter === 'no_invoice' ? 'bg-rose-700 text-white' : 'bg-gray-200/70 text-gray-600'}`}>
                      {statusCounts.no_invoice}
                    </span>
                  </button>
                </div>

                {/* Quick month pills */}
                <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200/60">
                  <button
                    onClick={clearMonthFilter}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      !dateFrom && !dateTo ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Všetko
                  </button>
                  <button
                    onClick={() => applyMonthFilter(0)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      isCurrentMonth ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Tento mesiac
                  </button>
                  <button
                    onClick={() => applyMonthFilter(-1)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      isLastMonth ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Minulý mesiac
                  </button>
                  <button
                    onClick={() => setShowFilters(v => !v)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all ${
                      showFilters || (dateFrom && !isCurrentMonth && !isLastMonth)
                        ? 'bg-gray-900 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    title="Vlastný rozsah dátumov"
                  >
                    <FaCalendarAlt className="text-[10px]" />
                    <span className="hidden sm:inline">Rozsah</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Custom Date Range Collapsible Drawer */}
          {showFilters && (
            <div className="px-4 sm:px-6 py-3.5 bg-gray-50 border-b border-gray-200 transition-all">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">Dátum od</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">Dátum do</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400"
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={clearMonthFilter}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-red-600 transition-colors"
                  >
                    <FaTimes className="text-xs" />
                    <span>Zrušiť rozsah</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Active Filter Chips Ribbon */}
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2 bg-amber-50/70 border-b border-amber-200/50 text-xs">
              <span className="font-bold text-amber-900 text-[11px] uppercase tracking-wider">Aktívne filtre:</span>

              {searchTerm && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-gray-800 border border-amber-200 shadow-xs">
                  <span>Hľadanie: <strong>"{searchTerm}"</strong></span>
                  <button onClick={() => setSearchTerm('')} className="text-gray-400 hover:text-red-600">
                    <FaTimes className="text-[10px]" />
                  </button>
                </span>
              )}

              {statusFilter && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-gray-800 border border-amber-200 shadow-xs">
                  <span>Stav: <strong>{STATUS_TABS.find(t => t.value === statusFilter)?.label || statusFilter}</strong></span>
                  <button onClick={() => setStatusFilter('')} className="text-gray-400 hover:text-red-600">
                    <FaTimes className="text-[10px]" />
                  </button>
                </span>
              )}

              {pairingFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-gray-800 border border-amber-200 shadow-xs">
                  <span>
                    Párovanie: <strong>
                      {pairingFilter === 'matched' ? 'Spárované' :
                       pairingFilter === 'unmatched' ? 'Bez páru' :
                       pairingFilter === 'has_invoice' ? 'S faktúrou' : 'Bez faktúry'}
                    </strong>
                  </span>
                  <button onClick={() => setPairingFilter('all')} className="text-gray-400 hover:text-red-600">
                    <FaTimes className="text-[10px]" />
                  </button>
                </span>
              )}

              {(dateFrom || dateTo) && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-gray-800 border border-amber-200 shadow-xs">
                  <span>
                    Obdobie: <strong>
                      {isCurrentMonth ? 'Tento mesiac' :
                       isLastMonth ? 'Minulý mesiac' :
                       `${dateFrom || '...'} – ${dateTo || '...'}`}
                    </strong>
                  </span>
                  <button onClick={clearMonthFilter} className="text-gray-400 hover:text-red-600">
                    <FaTimes className="text-[10px]" />
                  </button>
                </span>
              )}

              <button
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-800 transition-colors"
              >
                <FaTimes className="text-[10px]" />
                <span>Vyčistiť všetky filtre</span>
              </button>
            </div>
          )}

          {/* Sort bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/50 px-4 py-2.5 text-xs text-gray-600 sm:px-6">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-gray-500">Zoradiť podľa:</span>
              <button
                onClick={() => toggleSort('created_at')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  sortField === 'created_at' ? 'bg-white shadow-xs border border-gray-200 text-gray-900 font-bold' : 'text-gray-600 hover:bg-white/60'
                }`}
              >
                Dátum {sortField === 'created_at' ? (sortAsc ? <FaSortAmountUp className="text-gray-400" /> : <FaSortAmountDown className="text-gray-400" />) : null}
              </button>
              <button
                onClick={() => toggleSort('price')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  sortField === 'price' ? 'bg-white shadow-xs border border-gray-200 text-gray-900 font-bold' : 'text-gray-600 hover:bg-white/60'
                }`}
              >
                Cena {sortField === 'price' ? (sortAsc ? <FaSortAmountUp className="text-gray-400" /> : <FaSortAmountDown className="text-gray-400" />) : null}
              </button>
              <button
                onClick={() => toggleSort('profit')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  sortField === 'profit' ? 'bg-white shadow-xs border border-gray-200 text-emerald-800 font-bold' : 'text-gray-600 hover:bg-white/60'
                }`}
              >
                Marža / Zisk {sortField === 'profit' ? (sortAsc ? <FaSortAmountUp className="text-emerald-500" /> : <FaSortAmountDown className="text-emerald-500" />) : null}
              </button>
            </div>
            <div className="text-xs text-gray-500 font-medium">
              Zobrazených <span className="font-bold text-gray-900">{paginatedGroups.length}</span> z {orderGroups.length} objednávok ({filtered.length} položiek)
            </div>
          </div>


          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <div className="w-9 h-9 border-3 border-gray-200 border-t-black rounded-full animate-spin" />
                <p className="text-xs font-medium text-gray-500">Načítavam objednávky...</p>
              </div>
            </div>
          ) : paginatedGroups.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                <FaShoppingCart className="text-2xl" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {hasFilters ? 'Žiadne objednávky nevyhovujú filtru' : 'Zatiaľ žiadne e-shop objednávky'}
              </h3>
              <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                {hasFilters
                  ? 'Skús upraviť vyhľadávanie alebo vyčistiť filtre pre zobrazenie všetkých objednávok.'
                  : 'Importuj objednávky zo Shoptetu alebo vytvor novú objednávku ručne.'}
              </p>
              {hasFilters ? (
                <button
                  onClick={clearFilters}
                  className="mt-4 inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all text-xs"
                >
                  Vyčistiť filtre
                </button>
              ) : (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 inline-flex items-center px-4 py-2 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all text-xs shadow-xs"
                >
                  <FaPlus className="mr-1.5" /> Pridať prvú objednávku
                </button>
              )}
            </div>
          ) : (
            <>
            {/* Mobile View */}
            <div className="md:hidden divide-y divide-gray-100">
              {paginatedGroups.map(group => {
                const primary = group.primary;
                const invoice = getGroupInvoice(group);
                const linkedCount = group.items.filter(sale => linkedSales[sale.id]).length;
                const profit = group.items.reduce((sum, sale) => {
                  const linked = linkedSales[sale.id];
                  return linked ? sum + (sale.price - linked.payout) : sum;
                }, 0);

                return (
                  <div key={group.key} className="p-3.5 space-y-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-gray-900">#{group.orderNumber}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                            {group.items.length} {group.items.length === 1 ? 'položka' : 'položiek'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">{formatDate(group.createdAt)}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {invoice && (
                          <button
                            onClick={() => downloadInvoice(invoice, group.orderNumber)}
                            disabled={downloadingInvoice === group.orderNumber}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            title="Stiahnuť FA faktúru"
                          >
                            <FaDownload className={`text-xs ${downloadingInvoice === group.orderNumber ? 'animate-pulse' : ''}`} />
                          </button>
                        )}
                        <button
                          onClick={() => setEditingSale(primary)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                          title="Upraviť objednávku"
                        >
                          <FaEdit className="text-xs" />
                        </button>
                      </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {Array.from(new Set(group.items.map(item => item.status))).map(status => (
                        <EshopStatusBadge key={status} status={status} />
                      ))}
                      {primary.shoptet_status && (
                        <span className="rounded-full bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-[11px] text-slate-700 font-medium">
                          {primary.shoptet_status}
                        </span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="space-y-2">
                      {group.items.map(sale => (
                        <div key={sale.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-2.5">
                          <div className="flex items-start gap-2.5">
                            {sale.image_url ? (
                              <img
                                src={sale.image_url}
                                alt={sale.product_name}
                                className="h-12 w-12 flex-shrink-0 rounded-lg border border-gray-200 bg-white object-contain p-0.5"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="h-12 w-12 flex-shrink-0 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-400">
                                <FaShoppingCart className="text-xs" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-xs font-bold text-gray-900">{sale.product_name}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-600">
                                <span className="rounded-md bg-white border border-gray-200 px-1.5 py-0.2 font-semibold">{sale.size || 'Bez veľkosti'}</span>
                                {sale.sku && <span className="rounded-md bg-white border border-gray-200 px-1.5 py-0.2 font-mono text-[10px]">SKU {sale.sku}</span>}
                                {(sale.quantity || 1) > 1 && <span className="rounded-md bg-white border border-gray-200 px-1.5 py-0.2 font-semibold">Qty {sale.quantity}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => setEditingSale(sale)}
                              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
                              title="Upraviť položku"
                            >
                              <FaEdit className="text-xs" />
                            </button>
                          </div>

                          <div className="mt-2 pt-2 border-t border-gray-200/50 flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-gray-900">{formatCurrency(sale.price)}</span>
                            <MatchSummary
                              linked={linkedSales[sale.id]}
                              originalOrderNumber={sale.original_order_number}
                              onOpen={linkedSales[sale.id] ? () => setMatchDetailSale(sale) : undefined}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Financial summary */}
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-2.5 text-xs">
                      <div>
                        <p className="font-semibold text-gray-500 uppercase text-[10px]">Suma položiek</p>
                        <p className="text-sm font-bold text-gray-900">{formatCurrency(group.totalPrice)}</p>
                        {group.orderTotal !== null && Math.abs(group.orderTotal - group.totalPrice) > 0.009 && (
                          <p className="text-[11px] text-gray-500 mt-0.5">Objednávka: {formatCurrency(group.orderTotal)}</p>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-500 uppercase text-[10px]">Zisk AirKicks</p>
                        {linkedCount > 0 ? (
                          <p className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {formatCurrency(profit)}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">Po spárovaní</p>
                        )}
                      </div>
                    </div>

                    {/* Customer */}
                    {(primary.customer_name || primary.customer_email) && (
                      <div className="text-xs text-gray-500 pt-1">
                        <span className="font-medium text-gray-700">{primary.customer_name || 'Zákazník'}</span>
                        {primary.customer_email && <span className="ml-1 text-gray-400">· {primary.customer_email}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50/80 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider">Objednávka</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider">Položky</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider">Zákazník</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider">Financie</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider">Stav</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider">Párovanie</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider">Dátum</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600 uppercase tracking-wider">Akcie</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedGroups.map(group => {
                    const primary = group.primary;
                    const invoice = getGroupInvoice(group);
                    const linkedCount = group.items.filter(sale => linkedSales[sale.id]).length;
                    const checkedCount = group.items.filter(sale => linkedSales[sale.id] !== undefined).length;
                    const profit = group.items.reduce((sum, sale) => {
                      const linked = linkedSales[sale.id];
                      return linked ? sum + (sale.price - linked.payout) : sum;
                    }, 0);

                    return (
                      <tr key={group.key} className="group hover:bg-slate-50/70 transition-colors">
                        {/* Order info */}
                        <td className="px-4 py-3.5 align-top">
                          <div className="space-y-1">
                            <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 border border-gray-200/80 rounded-lg px-2 py-0.5 inline-block">
                              #{group.orderNumber}
                            </span>
                            <p className="text-[11px] font-semibold text-gray-500">
                              {group.items.length} {group.items.length === 1 ? 'položka' : 'položky'}
                            </p>
                            {primary.shoptet_status && (
                              <p className="max-w-[120px] truncate text-[11px] font-medium text-slate-600 bg-slate-100 rounded px-1.5 py-0.2 inline-block">
                                {primary.shoptet_status}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Items list */}
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex max-w-[500px] flex-wrap gap-2">
                            {group.items.map(sale => (
                              <div key={sale.id} className="flex min-w-[220px] max-w-[245px] flex-1 items-center gap-2 rounded-xl border border-gray-200/70 bg-white p-2 shadow-xs">
                                {sale.image_url ? (
                                  <img
                                    src={sale.image_url}
                                    alt={sale.product_name}
                                    className="h-10 w-10 flex-shrink-0 rounded-lg border border-gray-200 bg-white object-contain p-0.5"
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-400">
                                    <FaShoppingCart className="text-xs" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-bold text-gray-900 text-xs" title={sale.product_name}>
                                    {sale.product_name}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-gray-600">
                                    <span className="rounded-md bg-gray-100 px-1.5 py-0.2 font-semibold">{sale.size || 'No size'}</span>
                                    {sale.sku && <span className="max-w-[110px] truncate rounded-md bg-gray-100 px-1.5 py-0.2 font-mono">SKU {sale.sku}</span>}
                                    {(sale.quantity || 1) > 1 && <span className="rounded-md bg-gray-100 px-1.5 py-0.2 font-bold">Qty {sale.quantity}</span>}
                                  </div>
                                  <p className="mt-0.5 text-xs font-bold text-gray-900">{formatCurrency(sale.price)}</p>
                                </div>
                                <button
                                  onClick={() => setEditingSale(sale)}
                                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                  title="Upraviť položku"
                                >
                                  <FaEdit className="text-xs" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="px-4 py-3.5 align-top">
                          <p className="font-bold text-gray-900 text-xs truncate max-w-[160px]">{primary.customer_name || '—'}</p>
                          {primary.customer_email ? (
                            <a
                              href={`mailto:${primary.customer_email}`}
                              className="text-gray-500 hover:text-blue-600 transition-colors truncate max-w-[160px] block mt-0.5"
                            >
                              {primary.customer_email}
                            </a>
                          ) : (
                            <p className="text-xs text-gray-400 mt-0.5">—</p>
                          )}
                        </td>

                        {/* Financials */}
                        <td className="px-4 py-3.5 align-top">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-900">
                              Položky: {formatCurrency(group.totalPrice)}
                            </p>
                            {group.orderTotal !== null && Math.abs(group.orderTotal - group.totalPrice) > 0.009 && (
                              <p className="text-[11px] text-gray-500">
                                Celkovo: {formatCurrency(group.orderTotal)}
                              </p>
                            )}
                            {Math.abs(group.orderExtraTotal) > 0.009 && (
                              <p className="text-[10px] text-gray-400">Extras: {formatCurrency(group.orderExtraTotal)}</p>
                            )}
                            {linkedCount > 0 ? (
                              <div className="pt-0.5">
                                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-bold text-xs ${
                                  profit >= 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/70' : 'bg-rose-50 text-rose-800 border border-rose-200/70'
                                }`}>
                                  Zisk {formatCurrency(profit)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-400">Zisk po spárovaní</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex flex-wrap gap-1">
                            {Array.from(new Set(group.items.map(item => item.status))).map(status => (
                              <EshopStatusBadge key={status} status={status} />
                            ))}
                          </div>
                        </td>

                        {/* Match */}
                        <td className="px-4 py-3.5 align-top">
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                              {checkedCount < group.items.length ? 'Kontrola...' : `${linkedCount}/${group.items.length} spárované`}
                            </p>
                            {group.items.map(sale => (
                              <div key={sale.id} className="flex items-center gap-1.5">
                                <MatchSummary
                                  linked={linkedSales[sale.id]}
                                  originalOrderNumber={sale.original_order_number}
                                  onOpen={linkedSales[sale.id] ? () => setMatchDetailSale(sale) : undefined}
                                />
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5 align-top text-gray-600 whitespace-nowrap">
                          {formatDate(group.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 align-top text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {invoice && (
                              <button
                                onClick={() => downloadInvoice(invoice, group.orderNumber)}
                                disabled={downloadingInvoice === group.orderNumber}
                                className="flex h-8 w-8 items-center justify-center text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 rounded-lg transition-colors disabled:opacity-50"
                                title={`Stiahnuť faktúru FA-${group.orderNumber}.pdf`}
                              >
                                <FaDownload className={`text-xs ${downloadingInvoice === group.orderNumber ? 'animate-pulse' : ''}`} />
                              </button>
                            )}
                            <button
                              onClick={() => setEditingSale(primary)}
                              className="flex h-8 w-8 items-center justify-center text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                              title="Upraviť objednávku"
                            >
                              <FaEdit className="text-xs" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}

          {orderGroups.length > ITEMS_PER_PAGE && (
            <div className="px-4 py-3.5 border-t border-gray-200 bg-gray-50/50">
              <Pagination
                currentPage={currentPage}
                totalItems={orderGroups.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <EshopSaleModal
          onClose={() => setShowCreateModal(false)}
          onSaved={() => { setShowCreateModal(false); fetchSales(); showToast('Objednávka vytvorená', 'success'); }}
        />
      )}

      {/* Edit Modal */}
      {editingSale && (
        <EshopSaleModal
          sale={editingSale}
          onClose={() => setEditingSale(null)}
          onSaved={() => {
            setEditingSale(null);
            fetchSales();
            showToast('Objednávka aktualizovaná', 'success');
          }}
          onDeleted={() => {
            setEditingSale(null);
            fetchSales();
            showToast('Objednávka vymazaná', 'success');
          }}
        />
      )}

      {matchDetailSale && (
        <MatchDetailModal
          sale={matchDetailSale}
          linked={linkedSales[matchDetailSale.id]}
          onClose={() => setMatchDetailSale(null)}
        />
      )}
    </div>
  );
}

// ─── Eshop Status Badge & Match Summary ───────────────────────────────────────

function MatchSummary({
  linked,
  originalOrderNumber,
  onOpen,
}: {
  linked: LinkedSale | null | undefined;
  originalOrderNumber?: string | null;
  onOpen?: () => void;
}) {
  if (linked === undefined) {
    return (
      <div className="space-y-0.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
          Overujem...
        </div>
        {originalOrderNumber && (
          <p className="text-[10px] font-semibold text-amber-700">orig #{originalOrderNumber}</p>
        )}
      </div>
    );
  }

  if (linked === null) {
    return (
      <div className="space-y-0.5">
        <div className="inline-flex whitespace-nowrap items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/70 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Bez páru
        </div>
        {originalOrderNumber && (
          <p className="text-[10px] font-semibold text-amber-700">orig #{originalOrderNumber}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex whitespace-nowrap items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 transition-colors shadow-xs"
        title="Klikni pre zobrazenie detailu párovania"
      >
        <FaCheckCircle className="text-emerald-600 text-xs" />
        <span>Spárované</span>
      </button>
      {originalOrderNumber && (
        <p className="text-[10px] font-semibold text-amber-700">orig #{originalOrderNumber}</p>
      )}
    </div>
  );
}

function MatchDetailModal({
  sale,
  linked,
  onClose,
}: {
  sale: EshopSale;
  linked: LinkedSale | null | undefined;
  onClose: () => void;
}) {
  const profit = linked ? sale.price - linked.payout : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:rounded-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 p-4 sm:p-5">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              <FaCheckCircle className="text-emerald-600" /> Detail consignment párovania
            </span>
            <h2 className="mt-1.5 text-lg font-black text-gray-900">Objednávka #{sale.order_number}</h2>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200 transition-colors">
            <FaTimes />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
          {!linked ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm text-amber-800">
              K tejto položke objednávky nie je priradený žiadny consignment predaj.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Financial metric breakdown */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200/80 bg-gray-50/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Predajná cena</p>
                  <p className="mt-1.5 text-xl font-black text-gray-900">{formatCurrency(sale.price)}</p>
                  {sale.order_total !== null && sale.order_total !== undefined && (
                    <p className="mt-1 text-[11px] text-gray-500">Celá obj: {formatCurrency(Number(sale.order_total))}</p>
                  )}
                </div>

                <div className="rounded-2xl border border-blue-200/80 bg-blue-50/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Výplata consignora</p>
                  <p className="mt-1.5 text-xl font-black text-blue-900">{formatCurrency(linked.payout)}</p>
                  <p className="mt-1 text-[11px] text-blue-600 truncate">{linked.user_email || '-'}</p>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Hrubý zisk AirKicks</p>
                  <p className={`mt-1.5 text-xl font-black ${profit !== null && profit >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                    {formatCurrency(profit ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-emerald-700">
                    {sale.price > 0 && profit !== null ? ((profit / sale.price) * 100).toFixed(1) : 0}% marža
                  </p>
                </div>
              </div>

              {/* Items side by side comparison */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Eshop položka</p>
                  <p className="mt-2 font-bold text-gray-900 text-sm">{sale.product_name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1 text-xs text-gray-600">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 font-semibold">Veľkosť {sale.size || '-'}</span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono">SKU {sale.sku || '-'}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                    <p><span className="text-gray-400">Zákazník:</span> {sale.customer_name || '-'}</p>
                    <p><span className="text-gray-400">Email:</span> {sale.customer_email || '-'}</p>
                  </div>
                  {sale.original_order_number && (
                    <p className="mt-2.5 rounded-lg bg-amber-50 border border-amber-200/80 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      Pôvodná výkupná objednávka: #{sale.original_order_number}
                    </p>
                  )}
                  <div className="mt-3"><EshopStatusBadge status={sale.status} /></div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Consignment predajca</p>
                  <p className="mt-2 font-bold text-gray-900 text-sm">{linked.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1 text-xs text-emerald-800">
                    <span className="rounded-md bg-emerald-100/70 px-2 py-0.5 font-semibold">Veľkosť {linked.size || '-'}</span>
                    <span className="rounded-md bg-emerald-100/70 px-2 py-0.5 font-mono">SKU {linked.sku || '-'}</span>
                  </div>
                  <div className="mt-2 text-xs text-emerald-900 space-y-0.5">
                    <p><span className="text-emerald-700/70">Consignor:</span> {linked.user_email || '-'}</p>
                    <p><span className="text-emerald-700/70">External ID:</span> {linked.external_id || '-'}</p>
                  </div>
                  <div className="mt-3"><SalesStatusBadge status={linked.status} /></div>
                </div>
              </div>

              {(sale.shop_remark || sale.notes) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Poznámka zo Shoptetu</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-amber-900">{sale.shop_remark || sale.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EshopStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    processing: { bg: 'bg-amber-50 border-amber-200/80', text: 'text-amber-800', dot: 'bg-amber-500', label: 'Processing' },
    shipped: { bg: 'bg-purple-50 border-purple-200/80', text: 'text-purple-800', dot: 'bg-purple-500', label: 'Shipped' },
    delivered: { bg: 'bg-blue-50 border-blue-200/80', text: 'text-blue-800', dot: 'bg-blue-500', label: 'Delivered' },
    completed: { bg: 'bg-emerald-50 border-emerald-200/80', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'Completed' },
    cancelled: { bg: 'bg-rose-50 border-rose-200/80', text: 'text-rose-800', dot: 'bg-rose-500', label: 'Cancelled' },
    returned: { bg: 'bg-orange-50 border-orange-200/80', text: 'text-orange-800', dot: 'bg-orange-500', label: 'Returned' },
  };
  const config = map[status] || { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-800', dot: 'bg-slate-400', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

// ─── Create / Edit Modal ─────────────────────────────────────────────────────

interface EshopSaleModalProps {
  sale?: EshopSale;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

function EshopSaleModal({ sale, onClose, onSaved, onDeleted }: EshopSaleModalProps) {
  const [orderNumber, setOrderNumber] = useState(sale?.order_number || '');
  const [productName, setProductName] = useState(sale?.product_name || '');
  const [size, setSize] = useState(sale?.size || '');
  const [sku, setSku] = useState(sale?.sku || '');
  const [price, setPrice] = useState(sale?.price?.toString() || '');
  const [customerName, setCustomerName] = useState(sale?.customer_name || '');
  const [customerEmail, setCustomerEmail] = useState(sale?.customer_email || '');
  const [status, setStatus] = useState(sale?.status || 'processing');
  const [trackingNumber, setTrackingNumber] = useState(sale?.tracking_number || '');
  const [trackingUrl, setTrackingUrl] = useState(sale?.tracking_url || '');
  const [notes, setNotes] = useState(sale?.notes || '');
  const [imageUrl, setImageUrl] = useState(sale?.image_url || '');
  const [saleDate, setSaleDate] = useState(
    sale?.created_at ? sale.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-preview linked consignment sale
  const [linkedSale, setLinkedSale] = useState<LinkedSale | null | undefined>(undefined);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (!orderNumber.trim()) { setLinkedSale(undefined); return; }
    const timer = setTimeout(async () => {
      setLookingUp(true);
      const { data } = await supabase
        .from('user_sales')
        .select('id, name, size, price, payout, status, external_id, profiles(email)')
        .eq('external_id', orderNumber.trim())
        .maybeSingle();
      setLinkedSale(data ? {
        id: data.id,
        name: data.name,
        size: data.size,
        price: data.price,
        payout: data.payout,
        status: data.status,
        external_id: data.external_id,
        user_email: (data.profiles as any)?.email || '',
      } : null);
      setLookingUp(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [orderNumber]);

  const handleSave = async () => {
    if (!orderNumber.trim()) { setError('Order number is required'); return; }
    if (!productName.trim()) { setError('Product name is required'); return; }
    if (!price || isNaN(Number(price))) { setError('Valid price is required'); return; }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        order_number: orderNumber.trim(),
        product_name: productName.trim(),
        size: size.trim() || null,
        sku: sku.trim() || null,
        price: Number(price),
        customer_name: customerName.trim() || null,
        customer_email: customerEmail.trim() || null,
        status,
        tracking_number: trackingNumber.trim() || null,
        tracking_url: trackingUrl.trim() || null,
        notes: notes.trim() || null,
        image_url: imageUrl.trim() || null,
        created_at: saleDate ? new Date(saleDate + 'T12:00:00').toISOString() : undefined,
        updated_at: new Date().toISOString(),
      };

      if (sale) {
        const { error: updateError } = await supabase
          .from('eshop_sales')
          .update(payload)
          .eq('id', sale.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('eshop_sales')
          .insert(payload);
        if (insertError) throw insertError;
      }

      onSaved();
    } catch (err: any) {
      setError('Error saving: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!sale || !onDeleted) return;
    if (!confirm('Delete this eshop order? This action cannot be undone.')) return;
    try {
      setDeleting(true);
      const { error: deleteError } = await supabase.from('eshop_sales').delete().eq('id', sale.id);
      if (deleteError) throw deleteError;
      onDeleted();
    } catch (err: any) {
      setError('Error deleting: ' + err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{sale ? 'Edit Eshop Order' : 'New Eshop Order'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <FaTimes className="text-gray-600" />
          </button>
        </div>

        {/* Modal body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <FaExclamationTriangle className="text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Order number + live-link preview */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">
              Order Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              placeholder="e.g. AIR-001, #12345..."
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            {/* Linked consignment sale preview */}
            <div className="mt-2">
              {lookingUp && <p className="text-xs text-gray-400">Looking up consignment sale...</p>}
              {!lookingUp && linkedSale === null && orderNumber.trim() && (
                <p className="text-xs text-orange-600">No matching consignment sale found for this order number.</p>
              )}
              {!lookingUp && linkedSale && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-900">Linked consignment sale found:</p>
                    <p className="text-sm font-medium text-blue-800">{linkedSale.name} · {linkedSale.size}</p>
                    <p className="text-xs text-blue-600">{linkedSale.user_email} · payout {formatCurrency(linkedSale.payout)}</p>
                  </div>
                  <SalesStatusBadge status={linkedSale.status} />
                </div>
              )}
            </div>
          </div>

          {/* Product */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="e.g. Nike Air Jordan 1 Retro High OG"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Size</label>
              <input
                type="text"
                value={size}
                onChange={e => setSize(e.target.value)}
                placeholder="e.g. EU 42"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">SKU</label>
              <input
                type="text"
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="e.g. DZ5485-612"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Price (€) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Sale Date</label>
              <input
                type="date"
                value={saleDate}
                onChange={e => setSaleDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>

          {/* Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Customer Email</label>
              <input
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              {ESHOP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Tracking */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                <FaTruck className="inline mr-1 text-gray-600" /> Tracking Number
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={e => setTrackingNumber(e.target.value)}
                placeholder="1Z999AA10123456784"
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                <FaLink className="inline mr-1 text-gray-600" /> Tracking URL
              </label>
              <input
                type="url"
                value={trackingUrl}
                onChange={e => setTrackingUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>

          {/* Image URL */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Image URL</label>
            <input
              type="url"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes about this order..."
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-t border-gray-200 flex-shrink-0 gap-3">
          {sale && onDeleted ? (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="inline-flex items-center px-4 py-2.5 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors border border-red-200 disabled:opacity-50 text-sm"
            >
              {deleting ? <span className="animate-spin w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full mr-2" /> : <FaTrash className="mr-2" />}
              Delete
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving || deleting}
              className="px-4 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors border border-gray-300 disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="inline-flex items-center px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 text-sm"
            >
              {saving ? (
                <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />Saving...</>
              ) : (
                <><FaSave className="mr-2" />{sale ? 'Save Changes' : 'Create Order'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
