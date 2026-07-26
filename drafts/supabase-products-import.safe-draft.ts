import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.3.1';

type XmlValue = string | number | boolean | Record<string, unknown> | undefined | null;

type ProductRow = {
  id: number;
  name: string;
  sku: string | null;
  image_url: string | null;
};

type VariantRow = {
  product_id: number;
  size: string;
  original_price: number;
  price: number | null;
  status: string;
  name: string;
  sku: string;
};

type ExistingVariantRow = {
  product_id: number;
  size: string;
  original_price: number | null;
  status: string | null;
  name: string | null;
  sku: string | null;
};

type ImportPayload = {
  products: ProductRow[];
  variants: VariantRow[];
};

type VariantImportStats = {
  priceImported: number;
  priceSkippedExpress: number;
  pricePreserved: number;
  staleVariantsDeleted: number;
  staleVariantsDeactivated: number;
  staleVariantsSkippedExpress: number;
  updatedVariants: VariantChange[];
  removedVariants: VariantChange[];
  deactivatedVariants: VariantChange[];
  skippedExpressVariants: VariantChange[];
};

type VariantChange = {
  product_id: number;
  size: string;
  sku: string;
  name: string;
  from_price?: number | null;
  to_price?: number | null;
  from_status?: string | null;
  to_status?: string | null;
  reason?: string;
};

const BATCH_SIZE = 100;
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

function toText(value: XmlValue): string {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
}

function toMoney(value: XmlValue): number | null {
  const normalized = toText(value).replace(',', '.');
  if (!normalized) return null;

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function extractFirstImage(item: Record<string, unknown>): string | null {
  const images = ensureArray(item.IMAGES && (item.IMAGES as Record<string, unknown>).IMAGE);
  if (images.length === 0) return null;

  const image = images[0];
  const imageUrl = typeof image === 'object' && image !== null ? (image as Record<string, unknown>)['#text'] : image;

  return toText(imageUrl as XmlValue) || null;
}

function getTextProperty(item: Record<string, unknown>, propertyName: string): string | null {
  const textPropertiesContainer = item.TEXT_PROPERTIES as Record<string, unknown> | undefined;
  const textProperties = ensureArray(textPropertiesContainer?.TEXT_PROPERTY as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const property = textProperties.find((entry) => toText(entry.NAME as XmlValue) === propertyName);

  return property ? toText(property.VALUE as XmlValue) || null : null;
}

function getVariantSize(variant: Record<string, unknown>): string {
  const parametersContainer = variant.PARAMETERS as Record<string, unknown> | undefined;
  const parameters = ensureArray(parametersContainer?.PARAMETER as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const sizeParameter = parameters.find((entry) => toText(entry.NAME as XmlValue) === 'Velkost' || toText(entry.NAME as XmlValue) === 'Veľkosť');

  return sizeParameter ? toText(sizeParameter.VALUE as XmlValue) : '';
}

function parseProductsFromXml(xmlText: string): ImportPayload {
  const parser = new XMLParser({
    ignoreAttributes: false,
    ignoreDeclaration: true,
    parseTagValue: true,
    trimValues: true,
    attributeNamePrefix: '@_',
  });

  const parsed = parser.parse(xmlText);
  const rawItems = ensureArray(parsed.SHOP?.SHOPITEM as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const products: ProductRow[] = [];
  const variants: VariantRow[] = [];
  const seenVariants = new Set<string>();

  for (const item of rawItems) {
    const id = Number.parseInt(toText(item['@_id'] as XmlValue), 10);
    if (!Number.isFinite(id)) {
      console.warn('Skipping product without valid id');
      continue;
    }

    const name = toText(item.NAME as XmlValue);
    if (!name) {
      console.warn('Skipping product without name', { id });
      continue;
    }

    const productSku = getTextProperty(item, 'SKU');
    const defaultOriginalPrice = toMoney(item.PRICE_VAT as XmlValue);

    products.push({
      id,
      name,
      sku: productSku,
      image_url: extractFirstImage(item),
    });

    const rawVariants = ensureArray(
      (item.VARIANTS as Record<string, unknown> | undefined)?.VARIANT as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );

    if (rawVariants.length === 0 && defaultOriginalPrice) {
      const size = 'ONE SIZE';
      const key = `${id}:${size}`;

      if (!seenVariants.has(key)) {
        seenVariants.add(key);
        variants.push({
          product_id: id,
          size,
          original_price: defaultOriginalPrice,
          price: null,
          status: 'Skladom',
          name,
          sku: productSku ?? '',
        });
      }
    }

    for (const variant of rawVariants) {
      const originalPrice = toMoney(variant.PRICE_VAT as XmlValue) ?? defaultOriginalPrice;
      if (!originalPrice) {
        console.warn('Skipping variant without valid original price', { id });
        continue;
      }

      const size = getVariantSize(variant);
      if (!size) {
        console.warn('Skipping variant without size', { id });
        continue;
      }

      const key = `${id}:${size}`;
      if (seenVariants.has(key)) continue;
      seenVariants.add(key);

      variants.push({
        product_id: id,
        size,
        original_price: originalPrice,
        price: null,
        status: toText(variant.AVAILABILITY_OUT_OF_STOCK as XmlValue) || 'Skladom',
        name,
        sku: toText(variant.SKU as XmlValue) || productSku || '',
      });
    }
  }

  return { products, variants };
}

async function fetchXmlFeed(): Promise<string> {
  const feedUrl = Deno.env.get('PRODUCTS_FEED_URL');
  if (!feedUrl) {
    throw new Error('Missing PRODUCTS_FEED_URL env variable');
  }

  const response = await fetch(feedUrl, {
    headers: {
      Accept: 'application/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`XML feed failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function buildVariantKey(variant: Pick<VariantRow, 'product_id' | 'size'>): string {
  return `${variant.product_id}:${variant.size}`;
}

function buildVariantChange(
  variant: Pick<VariantRow, 'product_id' | 'size'> & Partial<Pick<VariantRow, 'sku' | 'name'>>,
  productsById: Map<number, ProductRow>,
  extra: Omit<VariantChange, 'product_id' | 'size' | 'sku' | 'name'> = {},
): VariantChange {
  const product = productsById.get(Number(variant.product_id));

  return {
    product_id: Number(variant.product_id),
    size: String(variant.size),
    sku: toText((variant.sku ?? product?.sku ?? '') as XmlValue),
    name: toText((variant.name ?? product?.name ?? '') as XmlValue),
    ...extra,
  };
}

async function loadExistingVariants(
  supabase: ReturnType<typeof createClient>,
  productIds: number[],
): Promise<Map<string, ExistingVariantRow>> {
  const existing = new Map<string, ExistingVariantRow>();

  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const idChunk = productIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('product_sizes')
      .select('product_id, size, original_price, status, name, sku')
      .in('product_id', idChunk);

    if (error) throw error;

    for (const row of (data ?? []) as ExistingVariantRow[]) {
      existing.set(buildVariantKey(row), row);
    }
  }

  return existing;
}

async function upsertProducts(supabase: ReturnType<typeof createClient>, products: ProductRow[]): Promise<void> {
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('products').upsert(chunk, {
      onConflict: 'id',
    });

    if (error) throw error;
  }
}

async function upsertVariantsWithFeedPrices(
  supabase: ReturnType<typeof createClient>,
  importedProducts: ProductRow[],
  importedVariants: VariantRow[],
  options: { importPricesFromFeed?: boolean } = {},
): Promise<VariantImportStats> {
  const productIds = [...new Set(importedProducts.map((product) => product.id))];
  const productsById = new Map(importedProducts.map((product) => [product.id, product]));
  const existingVariants = await loadExistingVariants(supabase, productIds);
  const stats: VariantImportStats = {
    priceImported: 0,
    priceSkippedExpress: 0,
    pricePreserved: 0,
    staleVariantsDeleted: 0,
    staleVariantsDeactivated: 0,
    staleVariantsSkippedExpress: 0,
    updatedVariants: [],
    removedVariants: [],
    deactivatedVariants: [],
    skippedExpressVariants: [],
  };

  const safeVariants = importedVariants.map((variant) => {
    const existing = existingVariants.get(buildVariantKey(variant));
    const existingStatus = toText(existing?.status as XmlValue);
    const importedStatus = toText(variant.status);
    const isExpress = existingStatus === 'Skladom Expres' || importedStatus === 'Skladom Expres';
    const shouldPreserveExpressPrice = options.importPricesFromFeed === true && isExpress && existing?.original_price !== null && existing?.original_price !== undefined;

    if (options.importPricesFromFeed === true) {
      if (isExpress) {
        stats.priceSkippedExpress++;
        if (stats.skippedExpressVariants.length < 50) {
          stats.skippedExpressVariants.push(buildVariantChange(variant, productsById, {
            from_price: existing?.original_price ?? null,
            to_price: existing?.original_price ?? variant.original_price,
            from_status: existing?.status ?? null,
            to_status: importedStatus || null,
            reason: 'Skladom Expres price protected',
          }));
        }
      } else if (existing?.original_price !== variant.original_price) {
        stats.priceImported++;
      } else {
        stats.pricePreserved++;
      }
    }

    const nextOriginalPrice = shouldPreserveExpressPrice && existing ? Number(existing.original_price) : variant.original_price;
    const priceChanged = existing !== undefined && existing.original_price !== nextOriginalPrice;
    const statusChanged = existing !== undefined && toText(existing.status as XmlValue) !== importedStatus;

    if ((priceChanged || statusChanged) && stats.updatedVariants.length < 50) {
      stats.updatedVariants.push(buildVariantChange(variant, productsById, {
        from_price: existing?.original_price ?? null,
        to_price: nextOriginalPrice,
        from_status: existing?.status ?? null,
        to_status: importedStatus || null,
      }));
    }

    return {
      ...variant,
      original_price: nextOriginalPrice,
      price: null,
    };
  });

  for (let i = 0; i < safeVariants.length; i += BATCH_SIZE) {
    const chunk = safeVariants.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('product_sizes').upsert(chunk, {
      onConflict: 'product_id,size',
    });

    if (error) throw error;
  }

  const importedVariantKeys = new Set(importedVariants.map(buildVariantKey));
  const staleVariants = [...existingVariants.values()].filter((variant) => !importedVariantKeys.has(buildVariantKey(variant)));

  for (const staleVariant of staleVariants) {
    const staleStatus = toText(staleVariant.status as XmlValue);
    const staleChange = buildVariantChange(staleVariant, productsById, {
      from_price: staleVariant.original_price,
      from_status: staleVariant.status,
      reason: 'Size is no longer present in feed',
    });

    if (staleStatus === 'Skladom Expres') {
      stats.staleVariantsSkippedExpress++;
      if (stats.skippedExpressVariants.length < 50) {
        stats.skippedExpressVariants.push({
          ...staleChange,
          reason: 'Skladom Expres stale size protected',
        });
      }
      continue;
    }

    const { error: deleteError } = await supabase
      .from('product_sizes')
      .delete()
      .eq('product_id', staleVariant.product_id)
      .eq('size', staleVariant.size);

    if (!deleteError) {
      stats.staleVariantsDeleted++;
      if (stats.removedVariants.length < 50) stats.removedVariants.push(staleChange);
      continue;
    }

    console.warn('Could not delete stale product size, deactivating instead', {
      product_id: staleVariant.product_id,
      size: staleVariant.size,
      error: deleteError.message,
    });

    const { error: updateError } = await supabase
      .from('product_sizes')
      .update({
        original_price: null,
        price: null,
        status: 'Nedostupné',
      })
      .eq('product_id', staleVariant.product_id)
      .eq('size', staleVariant.size);

    if (updateError) throw updateError;
    stats.staleVariantsDeactivated++;
    if (stats.deactivatedVariants.length < 50) {
      stats.deactivatedVariants.push({
        ...staleChange,
        to_price: null,
        to_status: 'Nedostupné',
      });
    }
  }

  return stats;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const shouldCommit = url.searchParams.get('commit') === '1' || Deno.env.get('IMPORT_DRY_RUN') === 'false';
    const importPricesFromFeed = url.searchParams.get('importPrices') === '1';
    const xmlText = await fetchXmlFeed();
    const payload = parseProductsFromXml(xmlText);

    console.log('Parsed feed', {
      products: payload.products.length,
      variants: payload.variants.length,
      importPricesFromFeed,
      dryRun: !shouldCommit,
    });

    if (!shouldCommit) {
      return jsonResponse({
        ok: true,
        dryRun: true,
        message: 'Dry run only. Add ?commit=1 or set IMPORT_DRY_RUN=false to write to Supabase.',
        products: payload.products.length,
        variants: payload.variants.length,
        importPricesFromFeed,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env variable');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    });

    await upsertProducts(supabase, payload.products);
    const variantImportStats = await upsertVariantsWithFeedPrices(supabase, payload.products, payload.variants, {
      importPricesFromFeed,
    });

    return jsonResponse({
      ok: true,
      dryRun: false,
      products: payload.products.length,
      variants: payload.variants.length,
      importPricesFromFeed,
      ...variantImportStats,
      pricingRule: importPricesFromFeed
        ? 'Imported feed prices into product_sizes.original_price, cleared product_sizes.price, and removed stale sizes. Skladom Expres keeps its existing feed price.'
        : 'Imported products and original prices, cleared product_sizes.price, and removed stale sizes.',
    });
  } catch (error) {
    console.error('Import failed', error);

    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});
