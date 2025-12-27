// Supabase Edge Function Example for Email Notifications
// Place this file in: supabase/functions/send-sale-email-ts/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'consign@airkicks.eu';

interface EmailRequest {
  type: 'new_sale' | 'status_change' | 'tracking';
  email: string;
  // New sale fields
  productName?: string;
  size?: string;
  price?: number;
  payout?: number;
  external_id?: string;
  image_url?: string;
  sku?: string;
  // Status change fields
  saleId?: string;
  oldStatus?: string;
  newStatus?: string;
  // Tracking fields
  trackingNumber?: string;
  carrier?: string;
  trackingUrl?: string;
  // Common fields
  notes?: string;
}

const statusLabels: Record<string, string> = {
  'accepted': 'Prijatý',
  'processing': 'Spracováva sa',
  'shipped': 'Odoslaný',
  'delivered': 'Doručený',
  'completed': 'Dokončený',
  'cancelled': 'Zrušený',
  'returned': 'Vrátený'
};

const carrierLabels: Record<string, string> = {
  'slovenska-posta': 'Slovenská pošta',
  'gls': 'GLS',
  'dpd': 'DPD',
  'packeta': 'Packeta',
  'zasilkovna': 'Zásilkovna',
  'ppl': 'PPL',
  'inpost': 'InPost',
  'other': 'Iný'
};

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type',
        },
      });
    }

    const data: EmailRequest = await req.json();
    const { type, email } = data;

    if (!email || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let subject = '';
    let htmlContent = '';

    switch (type) {
      case 'new_sale': {
        const { productName, size, price, payout, external_id, image_url, sku } = data;
        subject = `Vaša ponuka bola prijatá - ${productName || 'Produkt'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Vaša ponuka bola prijatá!</h2>
            <p>Dobrý deň,</p>
            <p>Vaša ponuka bola úspešne prijatá a vytvorili sme z nej predaj.</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Detaily predaja:</h3>
              ${productName ? `<p><strong>Produkt:</strong> ${productName}</p>` : ''}
              ${size ? `<p><strong>Veľkosť:</strong> ${size}</p>` : ''}
              ${sku ? `<p><strong>SKU:</strong> ${sku}</p>` : ''}
              ${price ? `<p><strong>Cena:</strong> ${price} €</p>` : ''}
              ${payout ? `<p><strong>Váš výplata:</strong> ${payout.toFixed(2)} €</p>` : ''}
              ${external_id ? `<p><strong>Číslo objednávky:</strong> ${external_id}</p>` : ''}
            </div>
            ${image_url ? `<img src="${image_url}" alt="${productName}" style="max-width: 100%; border-radius: 8px; margin: 20px 0;" />` : ''}
            <p>Ďalšie informácie o stave vášho predaja nájdete vo vašom profile.</p>
            <p>S pozdravom,<br>Tím AirKicks</p>
          </div>
        `;
        break;
      }

      case 'status_change': {
        const { productName, oldStatus, newStatus, notes } = data;
        subject = `Zmena statusu predaja - ${productName || 'Váš predaj'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Zmena statusu predaja</h2>
            <p>Dobrý deň,</p>
            <p>Status vášho predaja sa zmenil.</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Detaily:</h3>
              ${productName ? `<p><strong>Produkt:</strong> ${productName}</p>` : ''}
              <p><strong>Predchádzajúci status:</strong> ${statusLabels[oldStatus || ''] || oldStatus || 'Neznámy'}</p>
              <p><strong>Nový status:</strong> ${statusLabels[newStatus || ''] || newStatus || 'Neznámy'}</p>
              ${notes ? `<p><strong>Poznámka:</strong> ${notes}</p>` : ''}
            </div>
            <p>Ďalšie informácie nájdete vo vašom profile.</p>
            <p>S pozdravom,<br>Tím AirKicks</p>
          </div>
        `;
        break;
      }

      case 'tracking': {
        const { productName, trackingNumber, carrier, trackingUrl, notes } = data;
        subject = `Tracking informácie - ${productName || 'Váš predaj'}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Tracking informácie</h2>
            <p>Dobrý deň,</p>
            <p>Pridali sme tracking informácie k vášmu predaju.</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Tracking detaily:</h3>
              ${productName ? `<p><strong>Produkt:</strong> ${productName}</p>` : ''}
              ${trackingNumber ? `<p><strong>Tracking číslo:</strong> ${trackingNumber}</p>` : ''}
              ${carrier ? `<p><strong>Dopravca:</strong> ${carrierLabels[carrier] || carrier}</p>` : ''}
              ${trackingUrl ? `<p><strong>Tracking link:</strong> <a href="${trackingUrl}" style="color: #0066cc;">${trackingUrl}</a></p>` : ''}
              ${notes ? `<p><strong>Poznámka:</strong> ${notes}</p>` : ''}
            </div>
            ${trackingUrl ? `<p style="text-align: center; margin: 20px 0;"><a href="${trackingUrl}" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Sledovať zásielku</a></p>` : ''}
            <p>Ďalšie informácie nájdete vo vašom profile.</p>
            <p>S pozdravom,<br>Tím AirKicks</p>
          </div>
        `;
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid email type' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const { data: emailData, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject,
      html: htmlContent,
    });

    if (error) {
      console.error('Resend error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: emailData }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});



