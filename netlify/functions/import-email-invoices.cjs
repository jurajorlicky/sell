const { ImapFlow } = require('imapflow');
const { createClient } = require('@supabase/supabase-js');
const { createHash } = require('crypto');
const pdfParse = require('pdf-parse');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const getHeader = (headers, name) => {
  const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
};

const sanitizeSegment = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'document';

const FUNCTION_SOFT_LIMIT_MS = 23000;
const DOWNLOAD_TIMEOUT_MS = 12000;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const DEFAULT_IMPORT_ATTACHMENTS = 5;

const streamToBuffer = async (stream, timeoutMs = 0) => {
  const chunks = [];
  let timeout = null;

  try {
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        if (typeof stream.destroy === 'function') {
          stream.destroy(new Error('PDF download timeout'));
        }
      }, timeoutMs);
    }

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  return Buffer.concat(chunks);
};

const collectAttachments = (part, attachments = []) => {
  if (!part) return attachments;

  const filename = part.dispositionParameters?.filename || part.parameters?.name || '';
  const disposition = typeof part.disposition === 'string' ? part.disposition.toLowerCase() : '';
  const contentType = String(part.type || '').toLowerCase();
  const lowerName = filename.toLowerCase();

  if (
    part.part &&
    (disposition === 'attachment' || lowerName.endsWith('.pdf') || lowerName.endsWith('.xml') || contentType.includes('pdf'))
  ) {
    attachments.push({
      part: part.part,
      filename: filename || `attachment-${part.part}`,
      type: part.type || '',
      size: part.size || 0,
      isPdf: lowerName.endsWith('.pdf') || contentType.includes('pdf'),
    });
  }

  if (Array.isArray(part.childNodes)) {
    for (const child of part.childNodes) collectAttachments(child, attachments);
  }

  return attachments;
};

const collectTextParts = (part, parts = []) => {
  if (!part) return parts;

  const disposition = typeof part.disposition === 'string' ? part.disposition.toLowerCase() : '';
  const contentType = String(part.type || '').toLowerCase();

  if (part.part && disposition !== 'attachment' && (contentType.includes('text/plain') || contentType.includes('text/html'))) {
    parts.push({
      part: part.part,
      type: contentType,
      size: part.size || 0,
    });
  }

  if (Array.isArray(part.childNodes)) {
    for (const child of part.childNodes) collectTextParts(child, parts);
  }

  return parts;
};

const stripHtml = (value) =>
  String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const readMessageText = async (client, uid, bodyStructure) => {
  const parts = collectTextParts(bodyStructure).filter((part) => part.size <= 150000).slice(0, 3);
  const chunks = [];

  for (const part of parts) {
    try {
      const download = await client.download(uid, part.part, { uid: true });
      const content = await streamToBuffer(download.content, 4000);
      const text = content.toString('utf8');
      chunks.push(part.type.includes('html') ? stripHtml(text) : text);
    } catch {
      // Body text is only used for matching hints, so failed reads should not fail the import.
    }
  }

  return chunks.join(' ').slice(0, 200000);
};

const cleanOrderNumber = (value) => {
  if (!value) return '';
  let str = String(value).trim().replace(/\.[a-z0-9]{2,4}$/i, '');

  // Strip prefixes like 'faktura_', 'fa-', 'invoice_', 'obj_'
  const prefixMatch = str.match(/^(?:fakt[uú]ra|invoice|doklad|fa|obj|objedn[aá]vka|order)[-_ ]+([a-zA-Z0-9_-]{4,24})$/i);
  if (prefixMatch) {
    str = prefixMatch[1].trim();
  }

  // Strip duplicate copy suffixes like '_1', '-1', ' (1)', '_copy'
  const copyMatch = str.match(/^(.{4,})[-_ ](?:copy|\(?\d{1,2}\)?)$/i);
  if (copyMatch) {
    str = copyMatch[1].trim();
  }

  return str || '';
};

const normalizePdfText = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const parseMoney = (value) => {
  if (value === null || value === undefined) return null;
  let raw = String(value).trim();
  if (!raw) return null;

  // Handle Slovak/Czech "150,-" or "150,- €"
  raw = raw.replace(/,-\s*(?:€|eur)?$/i, '');

  // Strip non-digit characters except commas, periods, spaces, minus
  raw = raw.replace(/[^\d,.\s-]/g, '').trim();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, '');
  if (!compact || compact === '-') return null;

  // Handle decimal separators
  let normalized;
  if (compact.includes(',') && compact.includes('.')) {
    if (compact.lastIndexOf(',') > compact.lastIndexOf('.')) {
      normalized = compact.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = compact.replace(/,/g, '');
    }
  } else if (compact.includes(',')) {
    normalized = compact.replace(',', '.');
  } else {
    normalized = compact;
  }

  // Guard against dates like 12.03.2024 or multiple dots
  const parts = normalized.split('.');
  if (parts.length > 2) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

const extractMoneyValues = (text) => {
  const values = [];
  if (!text) return values;

  // Match amounts with decimals (e.g. 144,00 or 144.00 or 1 250,00) OR integer followed by currency
  const pattern = /(?:^|[^\d,.-])((?:\d{1,3}(?:[ \u00a0.]\d{3})+|\d+)(?:,\d{2}|\.\d{2}|,-)|\d+\s*(?:€|EUR|eur|CZK|kč|\$))\s*(?:€|EUR|eur|CZK|kč|\$)?(?!\s*%)(?=$|[^\d,.-])/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const val = parseMoney(match[1]);
    if (val !== null && val > 0) {
      values.push({ amount: val, raw: match[1].trim(), index: match.index });
    }
  }
  return values;
};

const extractInvoiceTotal = (text) => {
  const normalized = normalizePdfText(text);
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);

  // Tier 1: Explicit payment due labels (Slovak, Czech, English, German)
  const tier1Labels = [
    /(?:celkom\s+k\s+[uú]hrade|celkem\s+k\s+[uú]hrad[eě]|k\s+[uú]hrade|k\s+[uú]hrad[eě]|spolu\s+(?:na\s+|k\s+)?[uú]hradu|suma\s+(?:na\s+|k\s+)?[uú]hradu|čiastka\s+k\s+[uú]hrad[eě]|částka\s+k\s+[uú]hrad[eě]|zost[aá]va\s+(?:k\s+|na\s+)?[uú]hradiť|zost[aá]va\s+(?:k\s+)?[uú]hrad[eě]|k\s+platb[eě]|k\s+zaplateniu|k\s+zaplacen[ií])/i,
    /(?:total\s+due|amount\s+due|grand\s+total|total\s+to\s+pay|balance\s+due|net\s+to\s+pay|fakturovan[aá]\s+suma|fakturovan[aá]\s+čiastka|konečn[aá]\s+suma)/i,
    /(?:gesamtbetrag|zu\s+zahlender\s+betrag|rechnungsbetrag|endbetrag|gesamtsumme|zahlbetrag)/i,
  ];

  // Tier 2: General total including VAT
  const tier2Labels = [
    /(?:celkov[aá]\s+suma|suma\s+celkom|celkom\s+s\s+dph|celkem\s+s\s+dph|spolu\s+s\s+dph|total\s+(?:with\s+vat|incl\.?\s*vat)?|cena\s+celkom\s+s\s+dph|cena\s+spolu\s+s\s+dph)/i,
  ];

  // Tier 3: Simple total labels
  const tier3Labels = [
    /(?:^|\s)(?:celkom|celkem|spolu|total)\s*[:\-]?\s*$/i,
    /(?:^|\s)(?:celkom|celkem|spolu|total)\s*[:\-]/i,
  ];

  const searchTiers = [tier1Labels, tier2Labels, tier3Labels];

  for (const tier of searchTiers) {
    for (const labelPattern of tier) {
      // Search lines backwards (totals are usually near bottom of invoice)
      for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index];

        // Skip lines that are clearly NOT the total (tax base, rates, etc.)
        if (/(?:z[aá]klad\s+dane|sadzba|sadzby|rekapitul[aá]cia|daňov[yý]\s+z[aá]klad|výška\s+dph|mwst\s+\d+%|tax\s+base)/i.test(line) && !tier1Labels[0].test(line)) {
          continue;
        }

        const labelMatch = line.match(labelPattern);
        if (!labelMatch) continue;

        const afterLabel = line.slice((labelMatch.index || 0) + labelMatch[0].length);
        const amounts = extractMoneyValues(afterLabel);

        if (amounts.length > 0) {
          // The total is the FIRST amount right after the label
          return amounts[0].amount;
        }

        // Check next 1-3 lines if label is alone
        for (let nextOffset = 1; nextOffset <= 3 && index + nextOffset < lines.length; nextOffset++) {
          const nextLine = lines[index + nextOffset];
          if (nextLine.length > 60) continue;
          if (/(?:iban|swift|ico|dic|ičo|dič|d[aá]tum|dod[aá]vateľ|odberateľ)/i.test(nextLine)) break;
          const nextAmounts = extractMoneyValues(nextLine);
          if (nextAmounts.length > 0) {
            return nextAmounts[0].amount;
          }
        }
      }
    }
  }

  // Fallback: look for currency amounts on lines mentioning payment words and EUR or €
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (/(?:z[aá]klad\s+dane|rekapitul[aá]cia|daňov[yý]|sadzba)/i.test(line)) continue;
    if (/(?:k\s*[uú]hrad|celkom|celkem|spolu|suma|total|gesamt)/i.test(line) && /(?:€|EUR|eur)/i.test(line)) {
      const amounts = extractMoneyValues(line);
      if (amounts.length) {
        return amounts[0].amount;
      }
    }
  }

  return null;
};

const cleanProductName = (name) => {
  return String(name || '')
    .replace(/^\s*(?:\d+[\s.)-]+\s*)/, '') // Leading line numbers '1.'
    .replace(/^\s*(?:\d+\s*[x×*]|\d+\s*(?:ks|pcs|kusov|kusy)?)\s*/i, '') // Leading '1 ks'
    .replace(/\s*(?:\d+[,.]\d{2}\s*(?:€|eur)?|\d+%\s*|\b\d+\s*ks\b|\bks\b)\s*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const isLikelyProductLine = (line) => {
  const text = line.toLowerCase();
  if (line.length < 4 || line.length > 200) return false;
  if (!/[a-záäčďéíľĺňóôŕšťúýž]/i.test(line)) return false;

  if (/^(?:fakt[uú]ra|daňov[yý]|doklad|dod[aá]vateľ|odberateľ|iban|swift|variabil|celkom|celkem|spolu|total|dph|vat|suma|price|qty|ks|množstvo|d[aá]tum|sp[oô]sob|[uú]čet|adresa|ičo|dič|ič\s*dph|pozn[aá]mka|prevzal|vystavil|podpis|raz[ií]tko)/i.test(text)) {
    return false;
  }

  if (/^(?:doprava|poštovn[eé]|packeta|gls|dpd|zásielkovňa|zasielkovna|kuri[eé]r|shipping|delivery)\b/i.test(text)) {
    return false;
  }

  const productHints = [
    'nike', 'jordan', 'adidas', 'yeezy', 'new balance', 'asics', 'salomon', 'hoka',
    'ugg', 'crocs', 'puma', 'converse', 'dunk', 'air ', 'slide', 'foam', 'runner',
    'samba', 'gazelle', 'force', 'retro', 'low', 'high', 'mid', 'travis', 'sp5der',
    'denim tears', 'supreme', 'bape', 'stussy', 'fear of god', 'essentials', 'corteiz',
    'broken planet', 'hellstar', 'kobe', 'cactus jack', 'campus', 'spezial', '550',
    '2002r', '1906r', '9060', '990', '991', '992', '993', 'gel-kayano', 'gel-1130',
    'gel-nyc', 'xt-6', 'tasman', 'tazz', 'pollex', 'trapstar', 'represent', 'syna',
    'hoodie', 't-shirt', 'tee', 'pants', 'crewneck', 'jacket', 'tenisky', 'topánky',
    'mikina', 'tričko', 'nohavice'
  ];

  if (productHints.some((hint) => text.includes(hint))) return true;

  // Sneaker SKU styles: e.g. DD1391-100, CW2288-111, DZ5485-612, BB550...
  if (/\b[a-z]{1,3}\d{4,5}[-_]\d{3,4}\b/i.test(line) || /\b[a-z]{2}\d{4}[a-z0-9]\b/i.test(line)) {
    return true;
  }

  return false;
};

const extractInvoiceItems = (text) => {
  const lines = normalizePdfText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const items = [];

  for (const line of lines) {
    if (!isLikelyProductLine(line)) continue;

    // Normalize isolated quantity before price: 'EU 43 1 135,00 EUR' -> 'EU 43 1 ks 135,00 EUR'
    const normalizedLine = line.replace(/\s+(\d{1,2})\s+(\d{2,4}[,.]\d{2})/g, ' $1 ks $2');

    const amounts = extractMoneyValues(normalizedLine);
    let itemTotal = null;
    if (amounts.length > 0) {
      itemTotal = amounts[amounts.length - 1].amount;
    }

    let rawProduct = normalizedLine;
    const firstAmountMatch = normalizedLine.search(/(?:^|[^\d,.-])((?:\d{1,3}(?:[ \u00a0.]\d{3})+|\d+)(?:,\d{2}|\.\d{2}|,-)|\d+\s*(?:€|EUR|eur|CZK|kč|\$))/i);
    if (firstAmountMatch > 4) {
      rawProduct = normalizedLine.slice(0, firstAmountMatch);
    }

    const cleaned = cleanProductName(rawProduct);
    if (cleaned.length >= 3) {
      items.push({
        product: cleaned.slice(0, 180),
        total: itemTotal,
      });
    }

    if (items.length >= 10) break;
  }

  if (!items.length) {
    const productLine = lines.find(isLikelyProductLine);
    if (productLine) {
      items.push({ product: cleanProductName(productLine).slice(0, 180), total: null });
    }
  }

  return items;
};

const extractPdfDetails = async (content) => {
  try {
    const parsed = await pdfParse(content, { max: 8 });
    const extractedText = normalizePdfText(parsed.text || '');

    if (!extractedText) {
      return {
        status: 'empty',
        text: null,
        total: null,
        product: null,
        items: [],
        error: null,
      };
    }

    const items = extractInvoiceItems(extractedText);
    return {
      status: 'extracted',
      text: extractedText.slice(0, 200000),
      total: extractInvoiceTotal(extractedText),
      product: items[0]?.product || null,
      items,
      error: null,
    };
  } catch (error) {
    return {
      status: 'error',
      text: null,
      total: null,
      product: null,
      items: [],
      error: error?.message || 'PDF extraction failed',
    };
  }
};

const extractOrderNumbers = (...values) => {
  const explicitOrders = [];
  const varSymbols = [];
  const prefixedOrders = [];
  const shoptetFormatOrders = [];
  const generalNumbers = [];
  const invoiceNumbers = [];

  const addUnique = (list, candidate) => {
    const cleaned = cleanOrderNumber(candidate);
    if (cleaned && cleaned.length >= 4 && !list.includes(cleaned)) {
      list.push(cleaned);
    }
  };

  const textValues = values.filter(Boolean).map((v) => String(v));

  // 1. Explicit Order labels (Highest Priority)
  const EXPLICIT_ORDER_PATTERNS = [
    /(?:objedn[aá]vk[ay]|obj\.?\s*č\.?|order\s*(?:no\.?|id|#)?|číslo\s*objedn[aá]vky|č\.\s*obj\.?|bestellung(?:snr)?)\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{3,24})/gi,
  ];

  // 2. Variable Symbol (High Priority - in Shoptet stores VS = Order Number)
  const VS_PATTERNS = [
    /(?:variabiln[yý]\s*symbol|v\.?\s*s\.?|var\.?\s*sym\.?|v-symbol)\s*[:#-]?\s*(\d{6,14})/gi,
  ];

  // 3. Prefixed orders: AIR-123456, OBJ-123456, ORD-123456
  const PREFIXED_PATTERNS = [
    /\b((?:AIR|OBJ|ORD)[-_]?\d{4,14})\b/gi,
  ];

  // 4. Shoptet Order formats:
  // - 10 digits starting with 202x (e.g. 2024001234)
  // - 8 digits starting with 23, 24, 25, 26, 27 (e.g. 24001234, 25001234)
  const SHOPTET_PATTERNS = [
    /(?:^|[^0-9])(20[2-3]\d{6,8})(?=$|[^0-9])/g,
    /(?:^|[^0-9])((?:2[3-7])\d{6})(?=$|[^0-9])/g,
  ];

  // 5. General standalone 7-12 digit numbers
  const GENERAL_PATTERNS = [
    /(?:^|[^0-9])(\d{7,12})(?=$|[^0-9])/g,
  ];

  // 6. Invoice number (Lowest Priority - only if no order number found)
  const INVOICE_PATTERNS = [
    /(?:fakt[uú]ra\s*č\.?|daňový\s*doklad\s*č\.?|invoice\s*(?:no\.?|#)?|rechnung\s*nr\.?)\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{3,24})/gi,
    /\b((?:INV|FA)[-_]?\d{4,14})\b/gi,
  ];

  for (const text of textValues) {
    for (const pattern of EXPLICIT_ORDER_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) addUnique(explicitOrders, match[1]);
    }
    for (const pattern of VS_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) addUnique(varSymbols, match[1]);
    }
    for (const pattern of PREFIXED_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) addUnique(prefixedOrders, match[1]);
    }
    for (const pattern of SHOPTET_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) addUnique(shoptetFormatOrders, match[1]);
    }
    for (const pattern of GENERAL_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) addUnique(generalNumbers, match[1]);
    }
    for (const pattern of INVOICE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) addUnique(invoiceNumbers, match[1]);
    }
  }

  const combined = [];
  const addCandidate = (cand) => {
    if (cand && !combined.includes(cand)) combined.push(cand);
  };

  explicitOrders.forEach(addCandidate);
  varSymbols.forEach(addCandidate);
  prefixedOrders.forEach(addCandidate);
  shoptetFormatOrders.forEach(addCandidate);
  generalNumbers.forEach(addCandidate);
  invoiceNumbers.forEach(addCandidate);

  return combined;
};

const extractOrderNumber = (...values) => {
  return extractOrderNumbers(...values)[0] || null;
};

const normalizeOrderNumber = (value) => {
  const extracted = extractOrderNumber(value);
  return extracted || cleanOrderNumber(value) || null;
};

const detectDocumentType = (subject, filename, requestedType) => {
  if (requestedType === 'invoice' || requestedType === 'contract') return requestedType;
  const text = `${subject || ''} ${filename || ''}`.toLowerCase();
  if (text.includes('zmluv') || text.includes('smlouv') || text.includes('contract') || text.includes('agreement')) {
    return 'contract';
  }
  return 'invoice';
};

const makePath = ({ type, matched, orderNumber, filename, index }) => {
  const folder = matched ? 'matched' : 'unmatched';
  const base = orderNumber
    ? sanitizeSegment(orderNumber)
    : sanitizeSegment(filename.replace(/\.[a-z0-9]{2,4}$/i, ''));
  const suffix = index > 1 ? `-${index}` : '';
  return `${folder}/${base}${suffix}.pdf`;
};

const getDocumentReference = (supabase, bucket, path) =>
  bucket === 'invoices'
    ? `invoice://${path}`
    : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

const upsertInvoiceDocument = async (supabase, result, publicUrl) => {
  if (result.type !== 'invoice' || result.bucket !== 'invoices' || !result.path || !publicUrl) return;

  const payload = {
    document_type: 'fa',
    status: result.status === 'matched' || result.status === 'matched-scan' ? 'matched' : 'unmatched',
    bucket: result.bucket,
    storage_path: result.path,
    public_url: publicUrl,
    file_name: result.filename,
    order_number: result.orderNumber,
    matched_target: result.matchedTarget || null,
    user_sale_id: result.matchedTarget === 'user_sales' ? result.matchedSaleId : null,
    eshop_sale_id: result.eshopSale?.id || (result.matchedTarget === 'eshop_sales' ? result.matchedSaleId : null),
    source: result.source || 'email_import',
    email_subject: result.subject || null,
    email_from: result.from || null,
    extracted_text: result.extractedText || null,
    extracted_total: result.extractedTotal ?? null,
    extracted_product: result.extractedProduct || null,
    extracted_items: result.extractedItems || [],
    extraction_status: result.extractionStatus || 'pending',
    extraction_error: result.extractionError || null,
    content_sha256: result.contentSha256 || null,
    imported_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('invoice_documents')
    .upsert(payload, { onConflict: 'storage_path' });

  if (error) throw error;
};

const saleMatchesOrder = (sale, orderNumber) => {
  if (!sale || !orderNumber) return false;
  const externalId = String(sale?.external_id || '').trim();
  if (!externalId) return false;

  const target = String(orderNumber).trim().toLowerCase();
  const lowerExt = externalId.toLowerCase();
  if (lowerExt === target) return true;

  const normalizedExt = (normalizeOrderNumber(externalId) || '').toLowerCase();
  if (normalizedExt === target) return true;

  if (target.length >= 6 && lowerExt.includes(target)) return true;
  if (lowerExt.length >= 6 && target.includes(lowerExt)) return true;

  return false;
};

const findSaleByOrderNumbers = async (supabase, orderNumbers, extractedTotal = null) => {
  const uniqueOrderNumbers = Array.from(new Set((orderNumbers || []).filter(Boolean)));
  if (!uniqueOrderNumbers.length) return { sale: null, eshopSale: null, targetType: null, orderNumber: null };

  const candidates = Array.from(new Set(uniqueOrderNumbers.flatMap((orderNumber) => [
    orderNumber,
    cleanOrderNumber(orderNumber),
    `inv${orderNumber}`,
    `INV${orderNumber}`,
    `obj${orderNumber}`,
    `OBJ${orderNumber}`,
  ]).filter(Boolean)));

  const { data: userSalesData, error: userError } = await supabase
    .from('user_sales')
    .select('id, external_id, name, price, payout, fa_url, contract_url')
    .in('external_id', candidates)
    .limit(20);

  if (userError) throw userError;

  // Exact matching for user_sales
  for (const orderNumber of uniqueOrderNumbers) {
    const matchedSales = (userSalesData || []).filter((sale) => saleMatchesOrder(sale, orderNumber));
    if (matchedSales.length === 1) {
      return { sale: matchedSales[0], eshopSale: null, targetType: 'user_sales', orderNumber };
    }
    if (matchedSales.length > 1) {
      if (extractedTotal !== null) {
        const priceMatch = matchedSales.find((s) => Math.abs(Number(s.payout || s.price || 0) - extractedTotal) <= 0.05);
        if (priceMatch) return { sale: priceMatch, eshopSale: null, targetType: 'user_sales', orderNumber };
      }
      return { sale: matchedSales[0], eshopSale: null, targetType: 'user_sales', orderNumber };
    }
  }

  // Fuzzy search in user_sales
  for (const orderNumber of uniqueOrderNumbers) {
    if (orderNumber.length < 6) continue;
    const { data: fuzzyData, error: fuzzyError } = await supabase
      .from('user_sales')
      .select('id, external_id, name, price, payout, fa_url, contract_url')
      .ilike('external_id', `%${orderNumber}%`)
      .limit(10);

    if (fuzzyError) throw fuzzyError;
    const fuzzySale = (fuzzyData || []).find((sale) => saleMatchesOrder(sale, orderNumber)) || fuzzyData?.[0];
    if (fuzzySale) return { sale: fuzzySale, eshopSale: null, targetType: 'user_sales', orderNumber };
  }

  // Search in eshop_sales
  const { data: eshopRows, error: eshopError } = await supabase
    .from('eshop_sales')
    .select('id, order_number, original_order_number, product_name, size, sku, price, payout, order_total, fa_url')
    .or(candidates.map((candidate) => `order_number.eq.${candidate},original_order_number.eq.${candidate}`).join(','))
    .limit(20);

  if (eshopError) throw eshopError;

  for (const orderNumber of uniqueOrderNumbers) {
    const eshopCandidates = (eshopRows || []).filter((row) =>
      saleMatchesOrder({ external_id: row.order_number }, orderNumber) ||
      saleMatchesOrder({ external_id: row.original_order_number }, orderNumber)
    );

    for (const eshopSale of eshopCandidates) {
      const linkedOrderNumbers = Array.from(new Set([
        eshopSale.original_order_number,
        eshopSale.order_number,
      ].filter(Boolean)));

      if (!linkedOrderNumbers.length) continue;

      const { data: exactLinkedSales, error: linkedError } = await supabase
        .from('user_sales')
        .select('id, external_id, name, size, sku, price, payout, fa_url, contract_url')
        .in('external_id', linkedOrderNumbers)
        .limit(20);

      if (linkedError) throw linkedError;

      let linkedSales = exactLinkedSales || [];
      if (!linkedSales.length) {
        const { data: fuzzyLinkedSales, error: fuzzyLinkedError } = await supabase
          .from('user_sales')
          .select('id, external_id, name, size, sku, price, payout, fa_url, contract_url')
          .or(linkedOrderNumbers.map((candidate) => `external_id.ilike.%${candidate}%`).join(','))
          .limit(20);

        if (fuzzyLinkedError) throw fuzzyLinkedError;
        linkedSales = fuzzyLinkedSales || [];
      }

      const skuBase = eshopSale.sku?.split('/')[0]?.toLowerCase();
      const linkedSale = linkedSales.find((sale) =>
        sale.external_id === eshopSale.original_order_number &&
        sale.size?.trim() === eshopSale.size?.trim() &&
        skuBase &&
        sale.sku?.split('/')[0]?.toLowerCase() === skuBase
      ) || linkedSales.find((sale) =>
        sale.external_id === eshopSale.original_order_number &&
        sale.size?.trim() === eshopSale.size?.trim()
      ) || linkedSales.find((sale) =>
        sale.size?.trim() === eshopSale.size?.trim() &&
        skuBase &&
        sale.sku?.split('/')[0]?.toLowerCase() === skuBase
      ) || linkedSales.find((sale) =>
        sale.size?.trim() === eshopSale.size?.trim() &&
        sale.name?.toLowerCase() === eshopSale.product_name?.toLowerCase()
      ) || linkedSales.find((sale) =>
        sale.size?.trim() === eshopSale.size?.trim()
      ) || linkedSales?.[0];

      if (linkedSale) return { sale: linkedSale, eshopSale, targetType: 'user_sales', orderNumber };

      return { sale: null, eshopSale, targetType: 'eshop_sales', orderNumber };
    }
  }

  return { sale: null, eshopSale: null, targetType: null, orderNumber: uniqueOrderNumbers[0] || null };
};

const assertAdmin = async (event, supabase) => {
  const authHeader = getHeader(event.headers, 'authorization');
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Unauthorized');

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Unauthorized');

  const { data: adminRow, error: adminError } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!adminRow) throw new Error('Admin access required');
};

const reprocessExistingInvoices = async (supabase, { documentId = null, storagePath = null, limit = 200 } = {}) => {
  let query = supabase
    .from('invoice_documents')
    .select('*')
    .eq('document_type', 'fa')
    .order('imported_at', { ascending: false })
    .limit(limit);

  if (documentId) {
    query = query.eq('id', documentId);
  } else if (storagePath) {
    query = query.eq('storage_path', storagePath);
  }

  const { data: docs, error: queryErr } = await query;
  if (queryErr) throw queryErr;

  const results = [];
  const summary = {
    totalChecked: (docs || []).length,
    totalsUpdated: 0,
    matched: 0,
    unmatched: 0,
    errors: 0,
  };

  for (const doc of docs || []) {
    const docResult = {
      id: doc.id,
      storagePath: doc.storage_path,
      fileName: doc.file_name,
      previousStatus: doc.status,
      previousTotal: doc.extracted_total,
      previousOrderNumber: doc.order_number,
      newTotal: null,
      newOrderNumber: null,
      status: doc.status,
      message: '',
    };

    try {
      let extractedText = doc.extracted_text || '';
      let extraction = null;

      if (doc.storage_path) {
        try {
          const { data: fileBlob, error: dlErr } = await supabase.storage
            .from(doc.bucket || 'invoices')
            .download(doc.storage_path);

          if (!dlErr && fileBlob) {
            const buffer = Buffer.from(await fileBlob.arrayBuffer());
            extraction = await extractPdfDetails(buffer);
            extractedText = extraction.text || extractedText;
          }
        } catch {
          // If storage download fails, fall back to DB text
        }
      }

      if (!extraction) {
        if (extractedText) {
          const items = extractInvoiceItems(extractedText);
          extraction = {
            status: 'extracted',
            text: extractedText,
            total: extractInvoiceTotal(extractedText),
            product: items[0]?.product || null,
            items,
            error: null,
          };
        } else {
          extraction = {
            status: 'empty',
            text: null,
            total: null,
            product: null,
            items: [],
            error: 'No PDF text available',
          };
        }
      }

      const orderCandidates = extractOrderNumbers(
        doc.file_name,
        doc.email_subject,
        doc.order_number,
        extractedText
      );

      const match = await findSaleByOrderNumbers(supabase, orderCandidates, extraction.total);
      const sale = match.sale;
      const eshopSale = match.eshopSale;
      const matchedOrderNumber = match.orderNumber || orderCandidates[0] || doc.order_number || null;
      const isMatched = Boolean(sale || eshopSale);

      docResult.newTotal = extraction.total;
      docResult.newOrderNumber = matchedOrderNumber;
      docResult.status = isMatched ? 'matched' : 'unmatched';

      const publicUrl = getDocumentReference(supabase, doc.bucket || 'invoices', doc.storage_path);

      if (sale) {
        await supabase
          .from('user_sales')
          .update({ fa_url: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', sale.id);
      } else if (eshopSale) {
        await supabase
          .from('eshop_sales')
          .update({ fa_url: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', eshopSale.id);
      }

      const updatePayload = {
        status: isMatched ? 'matched' : 'unmatched',
        order_number: matchedOrderNumber,
        matched_target: match.targetType || null,
        user_sale_id: match.targetType === 'user_sales' ? (sale?.id || null) : null,
        eshop_sale_id: eshopSale?.id || (match.targetType === 'eshop_sales' ? (sale?.id || null) : null),
        extracted_text: extraction.text,
        extracted_total: extraction.total,
        extracted_product: extraction.product,
        extracted_items: extraction.items,
        extraction_status: extraction.status,
        extraction_error: extraction.error,
        updated_at: new Date().toISOString(),
      };

      await supabase
        .from('invoice_documents')
        .update(updatePayload)
        .eq('id', doc.id);

      if (extraction.total !== null && extraction.total !== doc.extracted_total) {
        summary.totalsUpdated += 1;
      }
      if (isMatched) {
        summary.matched += 1;
        docResult.message = `Spárované s ${match.targetType === 'eshop_sales' ? 'eshop objednávkou' : 'predajom'}`;
      } else {
        summary.unmatched += 1;
        docResult.message = 'Nespárované';
      }
    } catch (docErr) {
      summary.errors += 1;
      docResult.status = 'error';
      docResult.message = docErr?.message || 'Chyba pri spracovaní';
    }

    results.push(docResult);
  }

  return { ok: true, action: 'reprocess', summary, results };
};

const runInvoiceImport = async ({ event = {}, body: bodyOverride = null, skipAdmin = false } = {}) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const imapHost = process.env.MAIL_IMAP_HOST;
  const imapPort = Number(process.env.MAIL_IMAP_PORT || 993);
  const imapUser = process.env.MAIL_IMAP_USER;
  const imapPassword = process.env.MAIL_IMAP_PASSWORD;
  const imapFolder = process.env.MAIL_IMAP_FOLDER || 'INBOX';

  const authHeader = getHeader(event.headers, 'authorization');
  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    return json(500, { error: 'Missing Supabase env vars' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: serviceRoleKey ? undefined : { headers: { Authorization: authHeader } },
  });

  try {
    if (!skipAdmin) {
      await assertAdmin(event, supabase);
    }

    const body = bodyOverride || (event.body ? JSON.parse(event.body) : {});

    // Action 1: Reprocess existing invoices in Supabase
    if (body.action === 'reprocess' || body.reprocess === true) {
      const reprocessResult = await reprocessExistingInvoices(supabase, {
        documentId: body.documentId,
        storagePath: body.storagePath,
        limit: Math.min(Math.max(Number(body.limit || 200), 1), 500),
      });
      return json(200, reprocessResult);
    }

    // Action 2: Email mailbox import / scan
    if (!imapHost || !imapUser || !imapPassword) return json(500, { error: 'Missing IMAP env vars' });

    const limit = Math.min(Math.max(Number(body.limit || 20), 1), 100);
    const requestedType = 'invoice';
    const dryRun = Boolean(body.dryRun);
    const forceReparse = Boolean(body.forceReparse);
    const overwrite = true;
    const startedAt = Date.now();
    const maxImportAttachments = dryRun
      ? Number.POSITIVE_INFINITY
      : Math.min(Math.max(Number(body.maxImports || DEFAULT_IMPORT_ATTACHMENTS), 1), 15);

    const client = new ImapFlow({
      host: imapHost,
      port: imapPort,
      secure: String(process.env.MAIL_IMAP_SECURE || 'true') !== 'false',
      auth: { user: imapUser, pass: imapPassword },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 120000,
      logger: false,
    });

    const results = [];
    const summary = {
      messagesChecked: 0,
      attachmentsFound: 0,
      imported: 0,
      matched: 0,
      unmatched: 0,
      skipped: 0,
      errors: 0,
    };

    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IMAP connection timeout')), 12000)),
    ]);
    const lock = await client.getMailboxLock(imapFolder);

    try {
      const exists = client.mailbox?.exists || 0;
      if (!exists) {
        await client.logout();
        return json(200, { ok: true, documentType: requestedType, dryRun, summary, results });
      }

      const from = Math.max(1, exists - limit + 1);
      const range = `${from}:*`;
      const messages = [];

      for await (const msg of client.fetch(range, {
        uid: true,
        envelope: true,
        bodyStructure: true,
      })) {
        messages.push(msg);
      }

      const newestMessages = messages.reverse();

      messageLoop:
      for (const msg of newestMessages) {
        summary.messagesChecked += 1;
        const subject = msg.envelope?.subject || '';
        const fromAddress = msg.envelope?.from?.[0]?.address || '';
        const attachments = collectAttachments(msg.bodyStructure).filter((attachment) => attachment.isPdf);
        const messageText = await readMessageText(client, msg.uid, msg.bodyStructure);
        summary.attachmentsFound += attachments.length;

        let pdfIndex = 0;
        for (const attachment of attachments) {
          pdfIndex += 1;
          const result = {
            uid: msg.uid,
            from: fromAddress,
            subject,
            filename: attachment.filename,
            type: detectDocumentType(subject, attachment.filename, requestedType),
            orderNumber: null,
            orderCandidates: extractOrderNumbers(attachment.filename, subject, messageText),
            matchedSaleId: null,
            bucket: null,
            path: null,
            publicUrl: null,
            status: 'pending',
            message: '',
            extractedText: null,
            extractedTotal: null,
            extractedProduct: null,
            extractedItems: [],
            extractionStatus: dryRun ? 'skipped' : 'pending',
            extractionError: null,
          };

          try {
            if (!dryRun && Date.now() - startedAt > FUNCTION_SOFT_LIMIT_MS) {
              result.status = 'skipped';
              result.message = 'Časový limit funkcie dosiahnutý; spusťte import znova pre zvyšné faktúry';
              summary.skipped += 1;
              results.push(result);
              break messageLoop;
            }

            if (!dryRun && summary.imported >= maxImportAttachments) {
              result.status = 'skipped';
              result.message = 'Dávkový limit dosiahnutý; spusťte import znova pre ďalšiu dávku';
              summary.skipped += 1;
              results.push(result);
              break messageLoop;
            }

            if (!dryRun && attachment.size > MAX_PDF_BYTES) {
              result.status = 'skipped';
              result.message = `PDF súbor je príliš veľký (${Math.round(attachment.size / 1024 / 1024)} MB)`;
              summary.skipped += 1;
              results.push(result);
              continue;
            }

            let content = null;
            if (!dryRun) {
              const download = await client.download(msg.uid, attachment.part, { uid: true });
              content = await streamToBuffer(download.content, DOWNLOAD_TIMEOUT_MS);
              const extraction = await extractPdfDetails(content);

              result.extractedText = extraction.text;
              result.extractedTotal = extraction.total;
              result.extractedProduct = extraction.product;
              result.extractedItems = extraction.items;
              result.extractionStatus = extraction.status;
              result.extractionError = extraction.error;
              result.contentSha256 = createHash('sha256').update(content).digest('hex');
              result.orderCandidates = extractOrderNumbers(attachment.filename, subject, messageText, extraction.text);

              const { data: duplicateDocument, error: duplicateLookupError } = await supabase
                .from('invoice_documents')
                .select('id, storage_path, order_number, status, extracted_total')
                .eq('content_sha256', result.contentSha256)
                .maybeSingle();

              const duplicateColumnMissing = duplicateLookupError &&
                /content_sha256|schema cache|does not exist|not found/i.test(duplicateLookupError.message || '');
              if (duplicateLookupError && !duplicateColumnMissing) throw duplicateLookupError;

              // If duplicate already exists and forceReparse is false and it was already matched with a total:
              if (duplicateDocument && !forceReparse && duplicateDocument.status === 'matched' && duplicateDocument.extracted_total !== null) {
                result.path = duplicateDocument.storage_path;
                result.orderNumber = duplicateDocument.order_number;
                result.status = 'skipped';
                result.message = 'Duplicitné PDF už bolo importované a spárované';
                result.publicUrl = `invoice://${duplicateDocument.storage_path}`;
                summary.skipped += 1;
                results.push(result);
                continue;
              }
            }

            const match = await findSaleByOrderNumbers(supabase, result.orderCandidates, result.extractedTotal);
            const sale = match.sale;
            const eshopSale = match.eshopSale;
            result.orderNumber = match.orderNumber || result.orderCandidates[0] || null;
            result.matchedSaleId = sale?.id || eshopSale?.id || null;
            result.matchedTarget = match.targetType || null;
            const matched = Boolean(sale || eshopSale);
            const bucket = result.type === 'contract' ? 'contracts' : 'invoices';
            const path = makePath({
              type: result.type,
              matched,
              orderNumber: result.orderNumber,
              filename: attachment.filename,
              index: pdfIndex,
            });

            result.bucket = bucket;
            result.path = path;

            if (dryRun) {
              result.status = matched ? 'matched-scan' : 'unmatched-scan';
              result.message = matched
                ? `Náhľad: PDF by sa priradilo k ${match.targetType === 'eshop_sales' ? 'eshop objednávke' : 'predaju'}`
                : 'Náhľad: PDF by sa uložilo ako nespárované';
              if (matched) summary.matched += 1;
              else summary.unmatched += 1;
              results.push(result);
              continue;
            }

            const { error: uploadError } = await supabase.storage
              .from(bucket)
              .upload(path, content, {
                contentType: 'application/pdf',
                upsert: overwrite,
              });

            if (uploadError) {
              if (String(uploadError.message || '').toLowerCase().includes('already exists')) {
                result.status = 'skipped';
                result.message = 'Súbor už existuje v úložisku';
                result.publicUrl = getDocumentReference(supabase, bucket, path);
                summary.skipped += 1;
                results.push(result);
                continue;
              }
              throw uploadError;
            }

            const publicUrl = getDocumentReference(supabase, bucket, path);
            result.publicUrl = publicUrl;

            if (sale) {
              const updatePayload = result.type === 'contract'
                ? { contract_url: publicUrl, updated_at: new Date().toISOString() }
                : { fa_url: publicUrl, updated_at: new Date().toISOString() };

              const { error: updateError } = await supabase
                .from('user_sales')
                .update(updatePayload)
                .eq('id', sale.id);

              if (updateError) throw updateError;
              result.status = 'matched';
              result.message = 'Nahrané a priradené k predaju';
              summary.matched += 1;
            } else if (eshopSale) {
              if (result.type === 'contract') {
                result.status = 'matched';
                result.message = 'Nahrané a spárované s eshop predajom';
                summary.matched += 1;
              } else {
                const { error: updateError } = await supabase
                  .from('eshop_sales')
                  .update({ fa_url: publicUrl, updated_at: new Date().toISOString() })
                  .eq('id', eshopSale.id);

                if (updateError) throw updateError;
                result.status = 'matched';
                result.message = 'Nahrané a priradené k eshop objednávke';
                summary.matched += 1;
              }
            } else {
              result.status = 'unmatched';
              result.message = 'Nahrané do nespárovaných';
              summary.unmatched += 1;
            }

            await upsertInvoiceDocument(supabase, result, publicUrl);
            summary.imported += 1;
          } catch (attachmentError) {
            result.status = 'error';
            result.message = attachmentError?.message || 'Neznáma chyba pri spracovaní prílohy';
            summary.errors += 1;
          }

          results.push(result);
        }
      }
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }

    return json(200, { ok: true, documentType: requestedType, dryRun, summary, results });
  } catch (error) {
    const statusCode = /unauthorized|admin access/i.test(error?.message || '') ? 401 : 500;
    return json(statusCode, { ok: false, error: error?.message || 'Neznáma chyba importu' });
  }
};

exports.runInvoiceImport = runInvoiceImport;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  return runInvoiceImport({ event });
};
