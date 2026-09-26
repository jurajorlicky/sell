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

const cleanOrderNumber = (value) =>
  String(value || '')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[_-]\d+$/, '');

const normalizePdfText = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const parseMoney = (value) => {
  const raw = String(value || '').replace(/[^\d,.\s-]/g, '').trim();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, '');
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(/,/g, '');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
};

const extractMoneyValues = (text) => {
  const values = [];
  const amountPattern = /(\d{1,3}(?:[ .]\d{3})*(?:,\d{2}|\.\d{2})|\d+(?:,\d{2}|\.\d{2}))\s*(?:€|EUR|eur)?/gi;
  let match = amountPattern.exec(text);

  while (match?.[1]) {
    const amount = parseMoney(match[1]);
    if (amount !== null) values.push(amount);
    match = amountPattern.exec(text);
  }

  return values;
};

const extractInvoiceTotal = (text) => {
  const normalized = normalizePdfText(text);
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const labelGroups = [
    /(?:celkom k úhrade|celkom k uhrade|celkem k úhradě|celkem k uhrade|total due|grand total)/i,
    /^(?:suma celkom|celkom|celkem|total)(?:\s+s\s+dph|\s+with\s+vat)?\s*[:\-]?/i,
  ];

  for (const labelPattern of labelGroups) {
    for (let index = lines.length - 1; index >= 0; index--) {
      const line = lines[index];
      const labelMatch = line.match(labelPattern);
      if (!labelMatch) continue;

      // Only inspect the value after the total label. This avoids treating an
      // invoice number, VAT rate or an item price elsewhere in the PDF as total.
      const afterLabel = line.slice((labelMatch.index || 0) + labelMatch[0].length);
      const amounts = extractMoneyValues(afterLabel);
      if (amounts.length) return amounts[amounts.length - 1];

      // Some PDF generators put the label and its value on adjacent lines.
      const nextLineAmounts = index + 1 < lines.length ? extractMoneyValues(lines[index + 1]) : [];
      if (nextLineAmounts.length && lines[index + 1].length < 40) {
        return nextLineAmounts[nextLineAmounts.length - 1];
      }
    }
  }

  // No trustworthy total label: keep the amount unknown instead of producing
  // a confident but false mismatch from the largest number in the document.
  return null;
};

const isLikelyProductLine = (line) => {
  const text = line.toLowerCase();
  if (line.length < 5 || line.length > 140) return false;
  if (!/[a-záäčďéíľĺňóôŕšťúýž]/i.test(line)) return false;
  if (/^(faktúra|faktura|invoice|daňový|danovy|doklad|dodávateľ|dodavatel|odberateľ|odberatel|iban|swift|variabil|celkom|total|dph|vat|suma|price|qty|ks|množstvo|mnozstvo)/i.test(text)) return false;
  if (/^\d+[\s.,€eur-]*$/i.test(line)) return false;

  const productHints = [
    'nike', 'jordan', 'adidas', 'yeezy', 'new balance', 'asics', 'salomon', 'hoka',
    'ugg', 'crocs', 'puma', 'converse', 'dunk', 'air ', 'slide', 'mind', 'foam',
    'runner', 'samba', 'gazelle', 'force', 'retro', 'low', 'high', 'black', 'red',
    'grey', 'gray', 'white', 'cream',
  ];

  return productHints.some((hint) => text.includes(hint));
};

const extractInvoiceItems = (text) => {
  const lines = normalizePdfText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const items = [];

  for (const line of lines) {
    const amountMatch = line.match(/(\d{1,3}(?:[ .]\d{3})*(?:,\d{2}|\.\d{2})|\d+(?:,\d{2}|\.\d{2}))\s*(?:€|EUR|eur)?\s*$/);
    const amount = amountMatch ? parseMoney(amountMatch[1]) : null;
    const product = amountMatch
      ? line.slice(0, amountMatch.index).replace(/^\d+\s*[x×]?\s*/i, '').replace(/\s{2,}/g, ' ').trim()
      : line;

    if ((amount !== null && /[a-záäčďéíľĺňóôŕšťúýž]/i.test(product) && product.length >= 5) || isLikelyProductLine(product)) {
      items.push({
        product: product.slice(0, 180),
        total: amount,
      });
    }

    if (items.length >= 5) break;
  }

  if (!items.length) {
    const productLine = lines.find(isLikelyProductLine);
    if (productLine) items.push({ product: productLine.slice(0, 180), total: null });
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
  const found = [];
  const patterns = [
    /(?:^|[^0-9])((?:202\d{5})(?:[_-]\d+)?)(?=$|[^0-9])/g,
  ];

  for (const value of values.filter(Boolean)) {
    const text = String(value);
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match = pattern.exec(text);
      while (match?.[1]) {
        const orderNumber = cleanOrderNumber(match[1]);
        if (orderNumber && !found.includes(orderNumber)) found.push(orderNumber);
        match = pattern.exec(text);
      }
    }
  }

  return found;
};

const extractOrderNumber = (...values) => {
  return extractOrderNumbers(...values)[0] || null;
};

const normalizeOrderNumber = (value) => {
  const extracted = extractOrderNumber(value);
  return extracted || null;
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
    : sanitizeSegment(filename.replace(/\.pdf$/i, ''));
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
    // Keep the order-level e-shop link even when the same document is also
    // linked to the corresponding consignment sale.
    eshop_sale_id: result.eshopSale?.id || (result.matchedTarget === 'eshop_sales' ? result.matchedSaleId : null),
    source: 'email_import',
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
  const externalId = String(sale?.external_id || '');
  const normalized = normalizeOrderNumber(externalId);
  return normalized === orderNumber || externalId.toLowerCase().includes(orderNumber.toLowerCase());
};

const findSaleByOrderNumbers = async (supabase, orderNumbers) => {
  const uniqueOrderNumbers = Array.from(new Set((orderNumbers || []).filter(Boolean)));
  if (!uniqueOrderNumbers.length) return { sale: null, eshopSale: null, targetType: null, orderNumber: null };

  const candidates = Array.from(new Set(uniqueOrderNumbers.flatMap((orderNumber) => [
    orderNumber,
    orderNumber.replace(/[_-]\d+$/, ''),
    `inv${orderNumber}`,
    `INV${orderNumber}`,
  ]).filter(Boolean)));

  const { data, error } = await supabase
    .from('user_sales')
    .select('id, external_id, name, fa_url, contract_url')
    .in('external_id', candidates)
    .limit(20);

  if (error) throw error;
  for (const orderNumber of uniqueOrderNumbers) {
    const exactSale = (data || []).find((sale) => saleMatchesOrder(sale, orderNumber));
    if (exactSale) return { sale: exactSale, eshopSale: null, targetType: 'user_sales', orderNumber };
  }

  for (const orderNumber of uniqueOrderNumbers) {
    const { data: fuzzyData, error: fuzzyError } = await supabase
      .from('user_sales')
      .select('id, external_id, name, fa_url, contract_url')
      .ilike('external_id', `%${orderNumber}%`)
      .limit(10);

    if (fuzzyError) throw fuzzyError;
    const fuzzySale = (fuzzyData || []).find((sale) => saleMatchesOrder(sale, orderNumber)) || fuzzyData?.[0];
    if (fuzzySale) return { sale: fuzzySale, eshopSale: null, targetType: 'user_sales', orderNumber };
  }

  const { data: eshopRows, error: eshopError } = await supabase
    .from('eshop_sales')
    .select('id, order_number, original_order_number, product_name, size, sku, price, fa_url')
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
        .select('id, external_id, name, size, sku, price, fa_url, contract_url')
        .in('external_id', linkedOrderNumbers)
        .limit(20);

      if (linkedError) throw linkedError;

      let linkedSales = exactLinkedSales || [];
      if (!linkedSales.length) {
        const { data: fuzzyLinkedSales, error: fuzzyLinkedError } = await supabase
          .from('user_sales')
          .select('id, external_id, name, size, sku, price, fa_url, contract_url')
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
  if (!imapHost || !imapUser || !imapPassword) return json(500, { error: 'Missing IMAP env vars' });

  const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: serviceRoleKey ? undefined : { headers: { Authorization: authHeader } },
  });

  try {
    if (!skipAdmin) {
      await assertAdmin(event, supabase);
    }

    const body = bodyOverride || (event.body ? JSON.parse(event.body) : {});
    const limit = Math.min(Math.max(Number(body.limit || 20), 1), 100);
    const requestedType = 'invoice';
    const dryRun = Boolean(body.dryRun);
    const overwrite = true;
    const startedAt = Date.now();
    const maxImportAttachments = dryRun
      ? Number.POSITIVE_INFINITY
      : Math.min(Math.max(Number(body.maxImports || DEFAULT_IMPORT_ATTACHMENTS), 1), 10);

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
              result.message = 'Import time limit reached; run Import again for remaining PDFs';
              summary.skipped += 1;
              results.push(result);
              break messageLoop;
            }

            if (!dryRun && summary.imported >= maxImportAttachments) {
              result.status = 'skipped';
              result.message = 'Fast batch limit reached; run Import again for remaining PDFs';
              summary.skipped += 1;
              results.push(result);
              break messageLoop;
            }

            if (!dryRun && attachment.size > MAX_PDF_BYTES) {
              result.status = 'skipped';
              result.message = `PDF is too large for fast import (${Math.round(attachment.size / 1024 / 1024)} MB)`;
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
                .select('storage_path, order_number, status')
                .eq('content_sha256', result.contentSha256)
                .maybeSingle();
              const duplicateColumnMissing = duplicateLookupError &&
                /content_sha256|schema cache|does not exist|not found/i.test(duplicateLookupError.message || '');
              if (duplicateLookupError && !duplicateColumnMissing) throw duplicateLookupError;
              if (duplicateDocument) {
                result.path = duplicateDocument.storage_path;
                result.orderNumber = duplicateDocument.order_number;
                result.status = 'skipped';
                result.message = 'Duplicate PDF already imported';
                result.publicUrl = `invoice://${duplicateDocument.storage_path}`;
                summary.skipped += 1;
                results.push(result);
                continue;
              }
            }

            const match = await findSaleByOrderNumbers(supabase, result.orderCandidates);
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
                ? `Scan only: would overwrite PDF and attach it to ${match.targetType === 'eshop_sales' ? 'eshop sale' : 'sale'}`
                : 'Scan only: would upload PDF to unmatched';
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
                result.message = 'File already exists';
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
              result.message = 'Uploaded and attached to sale';
              summary.matched += 1;
            } else if (eshopSale) {
              if (result.type === 'contract') {
                result.status = 'matched';
                result.message = 'Uploaded and matched to eshop sale';
                summary.matched += 1;
              } else {
                const { error: updateError } = await supabase
                  .from('eshop_sales')
                  .update({ fa_url: publicUrl, updated_at: new Date().toISOString() })
                  .eq('id', eshopSale.id);

                if (updateError) throw updateError;
                result.status = 'matched';
                result.message = 'Uploaded and attached to eshop sale';
                summary.matched += 1;
              }
            } else {
              result.status = 'unmatched';
              result.message = 'Uploaded to unmatched';
              summary.unmatched += 1;
            }

            await upsertInvoiceDocument(supabase, result, publicUrl);

            summary.imported += 1;
          } catch (attachmentError) {
            result.status = 'error';
            result.message = attachmentError?.message || 'Unknown attachment error';
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
    return json(statusCode, { ok: false, error: error?.message || 'Unknown import error' });
  }
};

exports.runInvoiceImport = runInvoiceImport;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  return runInvoiceImport({ event });
};
