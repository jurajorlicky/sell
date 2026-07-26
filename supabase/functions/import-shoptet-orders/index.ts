import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.3.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type XmlValue = string | number | boolean | null | undefined
type XmlRecord = Record<string, unknown>

type ProductMatch = {
  id: string
  name: string
  sku: string | null
  image_url: string | null
}

type ImportItem = {
  orderNumber: string
  shoptetOrderId: string | null
  shoptetStatus: string
  status: string
  orderCreatedAt: string | null
  currency: string
  orderTotal: number
  orderProductTotal: number
  orderExtraTotal: number
  orderItemCount: number
  amountPaid: number | null
  customerName: string | null
  customerEmail: string | null
  sourceName: string | null
  salesChannelName: string | null
  shopRemark: string | null
  originalOrderNumber: string | null
  productName: string
  rawSku: string | null
  baseSku: string | null
  size: string | null
  quantity: number
  price: number
  lineItemKey: string
  product: ProductMatch | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

const text = (value: XmlValue): string => {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

const emptyToNull = (value: XmlValue): string | null => {
  const normalized = text(value)
  return normalized ? normalized : null
}

const ensureArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === null || value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

const toMoney = (value: XmlValue): number => {
  const normalized = text(value)
    .replace(/\s/g, "")
    .replace("EUR", "")
    .replace("€", "")
    .replace(",", ".")
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

const toInteger = (value: XmlValue, fallback = 1): number => {
  const parsed = Number.parseInt(text(value).replace(/[^\d-]/g, ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const normalizeKey = (value: string | null | undefined): string =>
  (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const extractBaseSku = (code: string | null): string | null => {
  if (!code) return null
  const base = code.split("/")[0]?.replace(/\.$/, "").trim()
  return base || null
}

const extractSize = (variantName: string | null, rawCode: string | null): string | null => {
  const fromVariant = variantName?.match(/(?:Veľkosť|Velkost|Size)\s*:\s*(.+)$/i)?.[1]?.trim()
  if (fromVariant) return fromVariant

  const fromCode = rawCode?.split("/").slice(1).join("/").replace(/\.$/, "").trim()
  return fromCode || null
}

const extractOriginalOrderNumber = (remark: string | null, currentOrderNumber: string): string | null => {
  if (!remark) return null

  const matches = remark.match(/\b(?:20\d{6}|FA-[A-Z0-9-]+|\d{6,})\b/gi) || []
  const normalizedCurrent = currentOrderNumber.trim().toLowerCase()
  const match = matches.find(value => value.trim().toLowerCase() !== normalizedCurrent)

  return match?.trim() || null
}

const mapStatus = (status: string): string => {
  const normalized = normalizeKey(status)
  if (normalized.includes("storno") || normalized.includes("zrus")) return "cancelled"
  if (normalized.includes("vrat")) return "returned"
  if (normalized.includes("vybavena") || normalized.includes("vybaven")) return "completed"
  if (normalized.includes("odoslana") || normalized.includes("odoslan")) return "shipped"
  return "processing"
}

const isProductItem = (item: XmlRecord): boolean => {
  const type = normalizeKey(text(item.TYPE as XmlValue))
  const code = text(item.CODE as XmlValue).toUpperCase()
  const name = normalizeKey(text(item.NAME as XmlValue))

  if (type && type !== "product") return false
  if (code.startsWith("SHIPPING") || code.startsWith("BILLING")) return false
  if (name.includes("doprava") || name.includes("platba")) return false

  return Boolean(text(item.NAME as XmlValue))
}

const getItemPrice = (item: XmlRecord): number => {
  const itemTotal = item.TOTAL_PRICE as XmlRecord | undefined
  const itemUnit = item.UNIT_PRICE as XmlRecord | undefined
  return toMoney(itemTotal?.WITH_VAT as XmlValue) || toMoney(itemUnit?.WITH_VAT as XmlValue)
}

const parseOrderDate = (value: string | null): string | null => {
  if (!value) return null
  const isoLike = value.replace(" ", "T")
  const parsed = new Date(isoLike)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

async function assertAuthorized(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const expectedSecret = Deno.env.get("SHOPTET_IMPORT_SECRET")
  const providedSecret = req.headers.get("x-import-secret")
  if (expectedSecret && providedSecret === expectedSecret) return

  const authHeader = req.headers.get("authorization")
  const token = authHeader?.replace(/^Bearer\s+/i, "")
  if (!token) throw new Error("Unauthorized")

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData.user) throw new Error("Unauthorized")

  const { data: adminRow, error: adminError } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("id", userData.user.id)
    .maybeSingle()

  if (adminError) throw adminError
  if (!adminRow) throw new Error("Admin access required")
}

async function fetchTextWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    })

    if (!response.ok) {
      throw new Error(`Shoptet XML failed: ${response.status} ${response.statusText}`)
    }

    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

async function loadProducts(supabaseAdmin: ReturnType<typeof createClient>) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, image_url")

  if (error) throw error

  const bySku = new Map<string, ProductMatch>()
  const byId = new Map<string, ProductMatch>()
  const byName = new Map<string, ProductMatch>()

  for (const product of data || []) {
    const row = {
      id: String(product.id),
      name: String(product.name || ""),
      sku: product.sku ? String(product.sku) : null,
      image_url: product.image_url ? String(product.image_url) : null,
    }

    if (row.sku) bySku.set(row.sku.toLowerCase(), row)
    byId.set(row.id, row)
    byName.set(normalizeKey(row.name), row)
  }

  return { bySku, byId, byName }
}

function matchProduct(
  maps: Awaited<ReturnType<typeof loadProducts>>,
  productName: string,
  baseSku: string | null,
): ProductMatch | null {
  if (baseSku) {
    const skuMatch = maps.bySku.get(baseSku.toLowerCase())
    if (skuMatch) return skuMatch

    const idMatch = maps.byId.get(baseSku)
    if (idMatch) return idMatch
  }

  return maps.byName.get(normalizeKey(productName)) ?? null
}

function parseOrders(xmlText: string, products: Awaited<ReturnType<typeof loadProducts>>): ImportItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    ignoreDeclaration: true,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: true,
    isArray: (_name, path) => [
      "ORDERS.ORDER",
      "ORDERS.ORDER.ORDER_ITEMS.ITEM",
    ].includes(path),
  })

  const parsed = parser.parse(xmlText.replace(/^\uFEFF/, ""))
  const orders = ensureArray(parsed?.ORDERS?.ORDER as XmlRecord | XmlRecord[] | undefined)
  const rows: ImportItem[] = []

  for (const order of orders) {
    const orderNumber = text(order.CODE as XmlValue)
    if (!orderNumber) continue

    const shoptetOrderId = emptyToNull(order.ORDER_ID as XmlValue)
    const shoptetStatus = text(order.STATUS as XmlValue)
    const status = mapStatus(shoptetStatus)
    const orderCreatedAt = parseOrderDate(emptyToNull(order.DATE as XmlValue))
    const currency = text((order.CURRENCY as XmlRecord | undefined)?.CODE as XmlValue) || "EUR"
    const totalPrice = order.TOTAL_PRICE as XmlRecord | undefined
    const orderTotal = toMoney(totalPrice?.PRICE_TO_PAY as XmlValue)
    const amountPaidRaw = emptyToNull(totalPrice?.AMOUNT_PAID as XmlValue)
    const amountPaid = amountPaidRaw === null ? null : toMoney(amountPaidRaw)
    const customer = order.CUSTOMER as XmlRecord | undefined
    const billing = customer?.BILLING_ADDRESS as XmlRecord | undefined
    const customerEmail = emptyToNull(customer?.EMAIL as XmlValue)
    const customerName = emptyToNull(billing?.NAME as XmlValue) ?? emptyToNull(billing?.COMPANY as XmlValue)
    const sourceName = emptyToNull(order.SOURCE_NAME as XmlValue)
    const salesChannelName = emptyToNull(order.SALES_CHANNEL_NAME as XmlValue)
    const shopRemark = emptyToNull(order.SHOP_REMARK as XmlValue)
    const originalOrderNumber = extractOriginalOrderNumber(shopRemark, orderNumber)
    const items = ensureArray((order.ORDER_ITEMS as XmlRecord | undefined)?.ITEM as XmlRecord | XmlRecord[] | undefined)
    const productItems = items.filter(isProductItem)
    const orderProductTotal = Math.round(productItems.reduce((sum, item) => sum + getItemPrice(item), 0) * 100) / 100
    const orderExtraTotal = Math.round((orderTotal - orderProductTotal) * 100) / 100
    const orderItemCount = productItems.length

    let productLineIndex = 0
    for (const item of productItems) {
      const productName = text(item.NAME as XmlValue)
      const rawSku = emptyToNull(item.CODE as XmlValue)
      const baseSku = extractBaseSku(rawSku)
      const size = extractSize(emptyToNull(item.VARIANT_NAME as XmlValue), rawSku)
      const quantity = toInteger(item.AMOUNT as XmlValue, 1)
      const price = getItemPrice(item)
      const product = matchProduct(products, productName, baseSku)
      const lineItemKey = `${orderNumber}:${rawSku || "no-code"}:${size || "no-size"}:${productLineIndex}`
      productLineIndex++

      rows.push({
        orderNumber,
        shoptetOrderId,
        shoptetStatus,
        status,
        orderCreatedAt,
        currency,
        orderTotal,
        orderProductTotal,
        orderExtraTotal,
        orderItemCount,
        amountPaid,
        customerName,
        customerEmail,
        sourceName,
        salesChannelName,
        shopRemark,
        originalOrderNumber,
        productName,
        rawSku,
        baseSku,
        size,
        quantity,
        price,
        lineItemKey,
        product,
      })
    }
  }

  return rows
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const sourceUrl = Deno.env.get("SHOPTET_ORDERS_XML_URL")

    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    if (!sourceUrl) throw new Error("Missing SHOPTET_ORDERS_XML_URL")

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    await assertAuthorized(req, supabaseAdmin)

    const payload = await req.json().catch(() => ({})) as { dryRun?: boolean; dateFrom?: string; dateUntil?: string }
    const url = new URL(sourceUrl)
    if (payload.dateFrom) url.searchParams.set("dateFrom", payload.dateFrom)
    if (payload.dateUntil) url.searchParams.set("dateUntil", payload.dateUntil)

    const xmlText = await fetchTextWithTimeout(url.toString(), 30000)
    const productMaps = await loadProducts(supabaseAdmin)
    const rows = parseOrders(xmlText, productMaps)
    const matched = rows.filter(row => row.product).length
    const unmatched = rows.length - matched

    if (payload.dryRun) {
      return json({
        success: true,
        dryRun: true,
        parsed: rows.length,
        matched,
        unmatched,
        sample: rows.slice(0, 10).map(row => ({
          orderNumber: row.orderNumber,
          productName: row.productName,
          sku: row.rawSku,
          size: row.size,
          price: row.price,
          orderTotal: row.orderTotal,
          orderProductTotal: row.orderProductTotal,
          orderExtraTotal: row.orderExtraTotal,
          orderItemCount: row.orderItemCount,
          status: row.status,
          shopRemark: row.shopRemark,
          originalOrderNumber: row.originalOrderNumber,
          matchedProductId: row.product?.id ?? null,
        })),
      })
    }

    let inserted = 0
    let updated = 0
    const errors: Array<{ orderNumber: string; lineItemKey: string; error: string }> = []

    for (const row of rows) {
      const dbRow = {
        order_number: row.orderNumber,
        line_item_key: row.lineItemKey,
        shoptet_order_id: row.shoptetOrderId,
        shoptet_status: row.shoptetStatus,
        status: row.status,
        order_created_at: row.orderCreatedAt,
        created_at: row.orderCreatedAt ?? undefined,
        updated_at: new Date().toISOString(),
        imported_at: new Date().toISOString(),
        currency: row.currency,
        order_total: row.orderTotal,
        order_product_total: row.orderProductTotal,
        order_extra_total: row.orderExtraTotal,
        order_item_count: row.orderItemCount,
        amount_paid: row.amountPaid,
        customer_name: row.customerName,
        customer_email: row.customerEmail,
        source_name: row.sourceName,
        sales_channel_name: row.salesChannelName,
        shop_remark: row.shopRemark,
        original_order_number: row.originalOrderNumber,
        product_name: row.productName,
        product_id: row.product?.id ?? null,
        sku: row.rawSku,
        size: row.size,
        quantity: row.quantity,
        price: row.price,
        image_url: row.product?.image_url ?? null,
        notes: [
          row.shopRemark,
          row.product ? null : `No product match for Shoptet code ${row.rawSku || "-"}`,
        ].filter(Boolean).join("\n") || null,
      }

      const { data: existing, error: findError } = await supabaseAdmin
        .from("eshop_sales")
        .select("id")
        .eq("order_number", row.orderNumber)
        .eq("line_item_key", row.lineItemKey)
        .maybeSingle()

      if (findError) {
        errors.push({ orderNumber: row.orderNumber, lineItemKey: row.lineItemKey, error: findError.message })
        continue
      }

      if (existing) {
        const { error } = await supabaseAdmin
          .from("eshop_sales")
          .update(dbRow)
          .eq("id", existing.id)

        if (error) {
          errors.push({ orderNumber: row.orderNumber, lineItemKey: row.lineItemKey, error: error.message })
        } else {
          updated++
        }
        continue
      }

      const { error } = await supabaseAdmin
        .from("eshop_sales")
        .insert(dbRow)

      if (error) {
        errors.push({ orderNumber: row.orderNumber, lineItemKey: row.lineItemKey, error: error.message })
      } else {
        inserted++
      }
    }

    return json({
      success: errors.length === 0,
      parsed: rows.length,
      inserted,
      updated,
      matched,
      unmatched,
      errors,
    }, errors.length ? 207 : 200)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 400)
  }
})
