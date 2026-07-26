import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-eshop-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type IncomingItem = {
  productName?: string
  size?: string | null
  price?: number | string | null
  imageUrl?: string | null
  sku?: string | null
  quantity?: number | string | null
  lineItemKey?: string | null
}

type IncomingPayload = {
  orderNumber?: string
  customerEmail?: string | null
  customerName?: string | null
  status?: string | null
  notes?: string | null
  items?: IncomingItem[]
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

const normalizePrice = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return 0

  const normalized = value.replace(/\s/g, "").replace("EUR", "").replace("€", "").replace(",", ".")
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeInteger = (value: unknown, fallback = 1) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value))
  }

  if (typeof value !== "string") return fallback

  const parsed = Number.parseInt(value.replace(/\D/g, ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  try {
    const expectedSecret = Deno.env.get("ESHOP_SALES_SECRET")
    const providedSecret = req.headers.get("x-eshop-secret")

    // Optional shared secret. If configured, requests must include it.
    if (expectedSecret && providedSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, 401)
    }

    const payload = await req.json() as IncomingPayload
    const orderNumber = normalizeText(payload.orderNumber)
    const items = Array.isArray(payload.items) ? payload.items : []

    if (!orderNumber) {
      return json({ error: "orderNumber is required" }, 400)
    }

    if (!items.length) {
      return json({ error: "At least one item is required" }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const customerEmail = normalizeText(payload.customerEmail)
    const customerName = normalizeText(payload.customerName)
    const status = normalizeText(payload.status) ?? "processing"
    const notes = normalizeText(payload.notes)

    const results = []

    for (const item of items) {
      const productName = normalizeText(item.productName)
      if (!productName) continue

      const size = normalizeText(item.size)
      const imageUrl = normalizeText(item.imageUrl)
      const sku = normalizeText(item.sku)
      const price = normalizePrice(item.price)
      const quantity = normalizeInteger(item.quantity, 1)
      const lineItemKey = normalizeText(item.lineItemKey)
        ?? `${productName}::${size ?? ""}::${sku ?? ""}`

      let existingQuery = supabaseAdmin
        .from("eshop_sales")
        .select("id")
        .eq("order_number", orderNumber)
        .eq("line_item_key", lineItemKey)
        .limit(1)

      const { data: existingRows, error: existingError } = await existingQuery

      if (existingError) {
        throw existingError
      }

      const row = {
        order_number: orderNumber,
        product_name: productName,
        size,
        sku,
        price,
        quantity,
        line_item_key: lineItemKey,
        customer_name: customerName,
        customer_email: customerEmail,
        status,
        notes,
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      }

      if (existingRows && existingRows.length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from("eshop_sales")
          .update(row)
          .eq("id", existingRows[0].id)

        if (updateError) {
          throw updateError
        }

        results.push({ action: "updated", orderNumber, productName, size, quantity, lineItemKey })
        continue
      }

      const { error: insertError } = await supabaseAdmin
        .from("eshop_sales")
        .insert(row)

      if (insertError) {
        throw insertError
      }

      results.push({ action: "inserted", orderNumber, productName, size, quantity, lineItemKey })
    }

    return json({
      success: true,
      orderNumber,
      processed: results.length,
      results,
    })
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      400,
    )
  }
})
