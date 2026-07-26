import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { XMLBuilder, XMLParser } from 'https://esm.sh/fast-xml-parser@4.3.1';

type XmlVariantRef = Record<string, unknown>;

type FeedVariant = {
  variantRef: XmlVariantRef;
  priceCents: number | null;
  status: string;
};

type ViewVariant = {
  priceCents: number | null;
  status: string;
  owner: string | null;
};

type UpdatedVariant = {
  productId: string;
  size: string;
  oldPrice: number | null;
  newPrice: number | null;
  oldStatus: string;
  newStatus: string;
  changed: {
    price: boolean;
    status: boolean;
  };
};

type UpdatedFlag = {
  productId: string;
  from: string;
  to: string;
};

const PAGE_SIZE = 1000;
const UPDATED_VARIANTS_LIMIT = 500;
const UPDATED_FLAGS_LIMIT = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePriceToCents(value: unknown): number | null {
  const raw = normalizeText(value);
  if (!raw) return null;

  const amount = Number(raw.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function centsToFeedString(cents: number): string {
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function shouldPatchStatus(feedStatus: string, viewStatus: string, owner: string | null): boolean {
  const oldStatus = normalizeText(feedStatus);
  const newStatus = normalizeText(viewStatus);

  if (oldStatus === newStatus) return false;

  const isConsignerExpress = newStatus === 'Skladom Expres' && Boolean(owner);
  if (isConsignerExpress) return true;

  if (!oldStatus && newStatus === 'Skladom') return false;

  return true;
}

function getVariantSize(variant: Record<string, unknown>): string {
  const parametersContainer = variant.PARAMETERS as Record<string, unknown> | undefined;
  const parameters = ensureArray(parametersContainer?.PARAMETER as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const sizeParameter = parameters.find((parameter) => {
    const name = normalizeText(parameter.NAME).toLowerCase();
    return name.includes('velkost') || name.includes('veľkosť') || name.includes('size');
  });

  return sizeParameter ? normalizeText(sizeParameter.VALUE) : '';
}

async function fetchTextWithTimeout(url: string, timeoutMs = 30000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`XML fetch failed: ${response.status} ${response.statusText} | ${body.slice(0, 250)}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function mapFeedVariants(items: Record<string, unknown>[]): {
  feedMap: Map<string, Map<string, FeedVariant>>;
  productIdsInXml: Set<string>;
} {
  const feedMap = new Map<string, Map<string, FeedVariant>>();
  const productIdsInXml = new Set<string>();

  for (const item of items) {
    const productId = normalizeText(item['@_id'] ?? item.id);
    if (!productId) continue;

    productIdsInXml.add(productId);
    const variantsContainer = item.VARIANTS as Record<string, unknown> | undefined;
    const variants = ensureArray(variantsContainer?.VARIANT as Record<string, unknown> | Record<string, unknown>[] | undefined);

    for (const variant of variants) {
      const size = getVariantSize(variant);
      if (!size) continue;

      const priceCents = parsePriceToCents(variant.PRICE_VAT ?? variant['@_price']);
      const status = normalizeText(variant.AVAILABILITY_OUT_OF_STOCK ?? variant.AVAILABILITY ?? variant.STATUS);

      if (!feedMap.has(productId)) feedMap.set(productId, new Map());
      feedMap.get(productId)?.set(size, {
        variantRef: variant,
        priceCents,
        status,
      });
    }
  }

  return { feedMap, productIdsInXml };
}

async function loadViewVariants(
  supabase: ReturnType<typeof createClient>,
  productIdsInXml: Set<string>,
): Promise<Map<string, Map<string, ViewVariant>>> {
  const viewMap = new Map<string, Map<string, ViewVariant>>();
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('product_price_view')
      .select('product_id, size, final_price, final_status, owner')
      .order('product_id', { ascending: true })
      .range(from, to);

    if (error) throw error;

    for (const row of data ?? []) {
      const productId = normalizeText(row.product_id);
      if (!productId || !productIdsInXml.has(productId)) continue;

      const size = normalizeText(row.size);
      if (!size) continue;

      if (!viewMap.has(productId)) viewMap.set(productId, new Map());
      viewMap.get(productId)?.set(size, {
        priceCents: parsePriceToCents(row.final_price),
        status: normalizeText(row.final_status),
        owner: row.owner ? String(row.owner) : null,
      });
    }

    if ((data?.length ?? 0) < PAGE_SIZE) break;
    page++;
  }

  return viewMap;
}

function patchFeedVariants(
  feedMap: Map<string, Map<string, FeedVariant>>,
  viewMap: Map<string, Map<string, ViewVariant>>,
): {
  skipped: number;
  updatedCount: number;
  priceUpdatedCount: number;
  statusUpdatedCount: number;
  updatedProductIds: Set<string>;
  updatedVariants: UpdatedVariant[];
} {
  let skipped = 0;
  let updatedCount = 0;
  let priceUpdatedCount = 0;
  let statusUpdatedCount = 0;
  const updatedProductIds = new Set<string>();
  const updatedVariants: UpdatedVariant[] = [];

  for (const [productId, feedBySize] of feedMap) {
    for (const [size, feedRow] of feedBySize) {
      const viewRow = viewMap.get(productId)?.get(size);

      if (!viewRow) {
        skipped++;
        continue;
      }

      const isConsignerExpress = normalizeText(viewRow.status) === 'Skladom Expres' && Boolean(viewRow.owner);
      const canPatchPrice = isConsignerExpress;
      const priceChanged = canPatchPrice && feedRow.priceCents !== null && viewRow.priceCents !== null && feedRow.priceCents !== viewRow.priceCents;
      const statusChanged = shouldPatchStatus(feedRow.status, viewRow.status, viewRow.owner);

      if (!priceChanged && !statusChanged) continue;

      if (priceChanged) {
        feedRow.variantRef.PRICE_VAT = centsToFeedString(viewRow.priceCents!);
        priceUpdatedCount++;
      }

      if (statusChanged) {
        if (feedRow.variantRef.AVAILABILITY_OUT_OF_STOCK !== undefined) {
          feedRow.variantRef.AVAILABILITY_OUT_OF_STOCK = viewRow.status;
        } else if (feedRow.variantRef.AVAILABILITY !== undefined) {
          feedRow.variantRef.AVAILABILITY = viewRow.status;
        } else if (feedRow.variantRef.STATUS !== undefined) {
          feedRow.variantRef.STATUS = viewRow.status;
        } else {
          feedRow.variantRef.AVAILABILITY_OUT_OF_STOCK = viewRow.status;
        }
        statusUpdatedCount++;
      }

      updatedCount++;
      updatedProductIds.add(productId);

      if (updatedVariants.length < UPDATED_VARIANTS_LIMIT) {
        updatedVariants.push({
          productId,
          size,
          oldPrice: feedRow.priceCents === null ? null : feedRow.priceCents / 100,
          newPrice: viewRow.priceCents === null ? null : viewRow.priceCents / 100,
          oldStatus: feedRow.status,
          newStatus: viewRow.status,
          changed: {
            price: priceChanged,
            status: statusChanged,
          },
        });
      }
    }
  }

  return { skipped, updatedCount, priceUpdatedCount, statusUpdatedCount, updatedProductIds, updatedVariants };
}

function patchExpressFlags(
  items: Record<string, unknown>[],
  viewMap: Map<string, Map<string, ViewVariant>>,
): {
  flagUpdatedCount: number;
  updatedFlags: UpdatedFlag[];
} {
  let flagUpdatedCount = 0;
  const updatedFlags: UpdatedFlag[] = [];

  for (const item of items) {
    const productId = normalizeText(item['@_id'] ?? item.id);
    const variants = productId ? viewMap.get(productId) : null;
    if (!productId || !variants) continue;

    const hasConsignerExpress = [...variants.values()].some((variant) =>
      normalizeText(variant.status) === 'Skladom Expres' && Boolean(variant.owner)
    );

    if (!item.FLAGS) item.FLAGS = {};
    const flagsContainer = item.FLAGS as Record<string, unknown>;
    flagsContainer.FLAG = ensureArray(flagsContainer.FLAG as Record<string, unknown> | Record<string, unknown>[] | undefined);

    const flags = flagsContainer.FLAG as Record<string, unknown>[];
    const existing = flags.find((flag) => normalizeText(flag.CODE) === 'expresne-odoslanie');
    const neededValue = hasConsignerExpress ? '1' : '0';

    if (existing) {
      const currentValue = normalizeText(existing.ACTIVE || '0');
      if (currentValue !== neededValue) {
        existing.ACTIVE = neededValue;
        flagUpdatedCount++;
        if (updatedFlags.length < UPDATED_FLAGS_LIMIT) updatedFlags.push({ productId, from: currentValue, to: neededValue });
      }
    } else if (hasConsignerExpress) {
      flags.push({ CODE: 'expresne-odoslanie', ACTIVE: '1' });
      flagUpdatedCount++;
      if (updatedFlags.length < UPDATED_FLAGS_LIMIT) updatedFlags.push({ productId, from: '0', to: '1' });
    }
  }

  return { flagUpdatedCount, updatedFlags };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const log: string[] = [];

  try {
    const url = new URL(req.url);
    const shouldCommit = url.searchParams.get('dryRun') !== '1';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const sourceFeedUrl = Deno.env.get('PRODUCTS_XML_URL') ?? Deno.env.get('PRODUCTS_FEED_URL');
    const outputBucket = Deno.env.get('FEED_OUTPUT_BUCKET') ?? 'feed';
    const outputPath = Deno.env.get('FEED_OUTPUT_PATH') ?? 'updated_feed.xml';

    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env variable');
    if (!sourceFeedUrl) throw new Error('Missing PRODUCTS_XML_URL or PRODUCTS_FEED_URL env variable');

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const xmlTextRaw = await fetchTextWithTimeout(sourceFeedUrl, 30000);
    const xmlText = xmlTextRaw.replace(/^\uFEFF/, '');

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      isArray: (_name, path) => [
        'SHOP.SHOPITEM',
        'SHOP.SHOPITEM.FLAGS.FLAG',
        'SHOP.SHOPITEM.VARIANTS.VARIANT',
        'SHOP.SHOPITEM.VARIANTS.VARIANT.PARAMETERS.PARAMETER',
        'SHOP.SHOPITEM.IMAGES.IMAGE',
        'SHOP.SHOPITEM.CATEGORIES.CATEGORY',
        'SHOP.SHOPITEM.TEXT_PROPERTIES.TEXT_PROPERTY',
      ].includes(path),
    });

    const parsed = parser.parse(xmlText);
    delete parsed['?xml'];
    delete parsed['?XML'];

    const items = ensureArray(parsed?.SHOP?.SHOPITEM as Record<string, unknown> | Record<string, unknown>[] | undefined);
    log.push(`XML loaded: ${items.length} SHOPITEM nodes`);

    const { feedMap, productIdsInXml } = mapFeedVariants(items);
    log.push(`XML mapped: ${feedMap.size} products with variants`);

    const viewMap = await loadViewVariants(supabase, productIdsInXml);
    log.push(`VIEW mapped: ${viewMap.size} products filtered to XML ids`);

    const variantPatch = patchFeedVariants(feedMap, viewMap);
    log.push(
      `Patched variants: ${variantPatch.updatedCount} (prices: ${variantPatch.priceUpdatedCount}, statuses: ${variantPatch.statusUpdatedCount})`,
    );

    const flagPatch = patchExpressFlags(items, viewMap);
    log.push(`Patched express flags: ${flagPatch.flagUpdatedCount}`);

    parsed.SHOP = parsed.SHOP ?? {};
    parsed.SHOP.SHOPITEM = items;

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      suppressEmptyNode: true,
      declaration: {
        version: '1.0',
        encoding: 'utf-8',
      },
    });

    const updatedXml = builder.build(parsed).replace(/^\uFEFF/, '').trimStart();

    if (!shouldCommit) {
      return jsonResponse({
        success: true,
        dryRun: true,
        message: 'Dry run only. Remove ?dryRun=1 to upload the XML.',
        updated: variantPatch.updatedCount,
        priceUpdated: variantPatch.priceUpdatedCount,
        statusUpdated: variantPatch.statusUpdatedCount,
        updatedProducts: variantPatch.updatedProductIds.size,
        flagUpdated: flagPatch.flagUpdatedCount,
        skipped: variantPatch.skipped,
        updatedVariants: variantPatch.updatedVariants,
        updatedFlags: flagPatch.updatedFlags,
        output: { bucket: outputBucket, path: outputPath },
        log,
      });
    }

    const body = new Blob([updatedXml], { type: 'application/xml; charset=utf-8' });
    const { error: uploadError } = await supabase.storage
      .from(outputBucket)
      .upload(outputPath, body, {
        contentType: 'application/xml; charset=utf-8',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    return jsonResponse({
      success: true,
      dryRun: false,
      updated: variantPatch.updatedCount,
      priceUpdated: variantPatch.priceUpdatedCount,
      statusUpdated: variantPatch.statusUpdatedCount,
      updatedProducts: variantPatch.updatedProductIds.size,
      flagUpdated: flagPatch.flagUpdatedCount,
      skipped: variantPatch.skipped,
      updatedVariants: variantPatch.updatedVariants,
      updatedFlags: flagPatch.updatedFlags,
      output: { bucket: outputBucket, path: outputPath },
      log,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push(`ERROR: ${message}`);

    return jsonResponse(
      {
        success: false,
        error: message,
        log,
      },
      { status: 500 },
    );
  }
});
