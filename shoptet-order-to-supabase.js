(() => {
  const SUPABASE_FUNCTION_URL = "https://ddzmuxcavpgbzhirzlqt.supabase.co/functions/v1/record";
  const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
  const OPTIONAL_SECRET = "";

  const normalizeText = (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const parsePrice = (value) => {
    if (!value) return 0;
    const normalized = String(value)
      .replace(/\s/g, "")
      .replace("EUR", "")
      .replace("€", "")
      .replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const toAbsoluteUrl = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return null;

    try {
      return new URL(normalized, window.location.origin).toString();
    } catch {
      return normalized;
    }
  };

  const parseSrcset = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return null;

    const firstCandidate = normalized.split(",")[0]?.trim().split(/\s+/)[0];
    return toAbsoluteUrl(firstCandidate);
  };

  const getBestImageUrl = (img) => {
    if (!img) return null;

    return (
      toAbsoluteUrl(img.currentSrc) ||
      toAbsoluteUrl(img.getAttribute("src")) ||
      toAbsoluteUrl(img.getAttribute("data-src")) ||
      parseSrcset(img.getAttribute("srcset")) ||
      parseSrcset(img.getAttribute("data-srcset")) ||
      null
    );
  };

  const getCustomerDataFromGtagScript = () => {
    const scripts = Array.from(document.querySelectorAll("script"));

    for (const script of scripts) {
      const text = script.textContent || "";
      if (!text.includes("'transaction_id'") || !text.includes("'user_data'")) continue;

      const email = text.match(/'email':\s*'([^']+)'/)?.[1] || null;
      const firstName = text.match(/'first_name':\s*'([^']+)'/)?.[1] || "";
      const lastName = text.match(/'last_name':\s*'([^']+)'/)?.[1] || "";
      const customerName = normalizeText(`${firstName} ${lastName}`);

      return {
        customerEmail: normalizeText(email),
        customerName,
      };
    }

    return {
      customerEmail: null,
      customerName: null,
    };
  };

  const collectOrderData = () => {
    const orderNumber = normalizeText(
      document.querySelector('[data-testid="orderNumber"]')?.textContent
    );

    const items = Array.from(document.querySelectorAll('[data-testid="recapItem"]'))
      .map((row, index) => {
        const productName = normalizeText(
          row.querySelector('[data-testid="recapItemName"]')?.textContent
        );

        const sizeText = normalizeText(row.querySelector(".p-name")?.textContent);
        const size = sizeText?.match(/Veľkosť:\s*([^\n]+)/)?.[1]?.trim() || null;
        const quantityText = row.querySelector(".p-quantity")?.textContent || "";
        const quantity = Number(quantityText.match(/\d+/)?.[0] || 1);
        const price = parsePrice(
          row.querySelector('[data-testid="recapItemPrice"]')?.textContent
        );
        const imageUrl = getBestImageUrl(row.querySelector("img"));
        const lineItemKey = [index, productName || "", size || ""].join("::");

        return {
          productName,
          size,
          quantity,
          price,
          imageUrl,
          lineItemKey,
        };
      })
      .filter((item) => item.productName);

    const { customerEmail, customerName } = getCustomerDataFromGtagScript();

    return {
      orderNumber,
      customerEmail,
      customerName,
      status: "processing",
      notes: "Imported from Shoptet thank-you page",
      items,
    };
  };

  const sendOrderToSupabase = async () => {
    if (!location.pathname.includes("/objednavka/dakujeme")) return;

    const payload = collectOrderData();
    if (!payload.orderNumber || !payload.items.length) return;

    const storageKey = `eshop-sale-sent:${payload.orderNumber}`;
    if (localStorage.getItem(storageKey)) return;

    const headers = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };

    if (OPTIONAL_SECRET) {
      headers["x-eshop-secret"] = OPTIONAL_SECRET;
    }

    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("Failed to write eshop sale to Supabase", await response.text());
      return;
    }

    localStorage.setItem(storageKey, new Date().toISOString());
    console.log("Eshop sale synced to Supabase:", payload.orderNumber);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sendOrderToSupabase, { once: true });
  } else {
    sendOrderToSupabase();
  }
})();
