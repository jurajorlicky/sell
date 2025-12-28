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
  label_url?: string;
  contract_url?: string;
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
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    }

    const data: EmailRequest = await req.json();
    const { type, email } = data;

    if (!email || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, type' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          } 
        }
      );
    }

    let subject = '';
    let htmlContent = '';

    switch (type) {
      case 'new_sale': {
        const { productName, size, price, payout, external_id, image_url, sku } = data;
        subject = `Vaša ponuka bola prijatá - ${productName || 'Produkt'}`;
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 40px 20px; text-align: center;">
                  <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Vaša ponuka bola prijatá!</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 30px 20px;">
                        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">Dobrý deň,</p>
                        <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.6;">Vaša ponuka bola úspešne prijatá a vytvorili sme z nej predaj.</p>
                        
                        ${image_url ? `
                        <!-- Product Image -->
                        <div style="text-align: center; margin: 0 0 30px 0;">
                          <img src="${image_url}" alt="${productName || 'Produkt'}" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);" />
                        </div>
                        ` : ''}
                        
                        <!-- Product Details -->
                        <div style="background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); padding: 25px; border-radius: 12px; margin: 0 0 30px 0;">
                          ${productName ? `
                          <h2 style="margin: 0 0 20px 0; color: #1a202c; font-size: 20px; font-weight: 700; text-align: center;">${productName}</h2>
                          ` : ''}
                          
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            ${size ? `
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 15px; font-weight: 600;">Veľkosť:</td>
                              <td style="padding: 10px 0; color: #1a202c; font-size: 15px; text-align: right;">${size}</td>
                            </tr>
                            ` : ''}
                            ${sku ? `
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 15px; font-weight: 600;">SKU:</td>
                              <td style="padding: 10px 0; color: #1a202c; font-size: 15px; text-align: right; font-family: monospace;">${sku}</td>
                            </tr>
                            ` : ''}
                            ${price ? `
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 15px; font-weight: 600;">Cena:</td>
                              <td style="padding: 10px 0; color: #1a202c; font-size: 15px; text-align: right; font-weight: 700;">${price.toFixed(2)} €</td>
                            </tr>
                            ` : ''}
                            ${payout ? `
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 15px; font-weight: 600;">Váš výplata:</td>
                              <td style="padding: 10px 0; color: #48bb78; font-size: 15px; text-align: right; font-weight: 700;">${payout.toFixed(2)} €</td>
                            </tr>
                            ` : ''}
                            ${external_id ? `
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 15px; font-weight: 600;">Číslo objednávky:</td>
                              <td style="padding: 10px 0; color: #1a202c; font-size: 15px; text-align: right; font-family: monospace;">${external_id}</td>
                            </tr>
                            ` : ''}
                          </table>
                        </div>
                        
                        <p style="margin: 0 0 20px 0; color: #666666; font-size: 14px; line-height: 1.6; text-align: center;">Ďalšie informácie o stave vášho predaja nájdete vo vašom profile.</p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0; color: #718096; font-size: 14px;">S pozdravom,<br><strong style="color: #1a202c;">Tím AirKicks</strong></p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;
        break;
      }

      case 'status_change': {
        const { productName, oldStatus, newStatus, notes, size, sku, image_url, price, payout, external_id, trackingUrl, label_url, contract_url } = data;
        const statusColor = newStatus === 'completed' ? '#48bb78' : newStatus === 'delivered' ? '#4299e1' : newStatus === 'shipped' ? '#ed8936' : '#718096';
        subject = `Zmena statusu predaja - ${productName || 'Váš predaj'}`;
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 40px 20px; text-align: center;">
                  <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, ${statusColor} 0%, ${statusColor}dd 100%); padding: 30px 20px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Zmena statusu predaja</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 30px 20px;">
                        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">Dobrý deň,</p>
                        <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.6;">Status vášho predaja sa zmenil.</p>
                        
                        ${image_url ? `
                        <!-- Product Image -->
                        <div style="text-align: center; margin: 0 0 30px 0;">
                          <img src="${image_url}" alt="${productName || 'Produkt'}" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);" />
                        </div>
                        ` : ''}
                        
                        <!-- Product Info -->
                        ${productName || size || sku ? `
                        <div style="background: #f7fafc; padding: 20px; border-radius: 12px; margin: 0 0 20px 0;">
                          ${productName ? `<h2 style="margin: 0 0 15px 0; color: #1a202c; font-size: 18px; font-weight: 700; text-align: center;">${productName}</h2>` : ''}
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            ${size ? `
                            <tr>
                              <td style="padding: 8px 0; color: #4a5568; font-size: 14px;">Veľkosť:</td>
                              <td style="padding: 8px 0; color: #1a202c; font-size: 14px; text-align: right; font-weight: 600;">${size}</td>
                            </tr>
                            ` : ''}
                            ${sku ? `
                            <tr>
                              <td style="padding: 8px 0; color: #4a5568; font-size: 14px;">SKU:</td>
                              <td style="padding: 8px 0; color: #1a202c; font-size: 14px; text-align: right; font-family: monospace;">${sku}</td>
                            </tr>
                            ` : ''}
                            ${external_id ? `
                            <tr>
                              <td style="padding: 8px 0; color: #4a5568; font-size: 14px;">Číslo objednávky:</td>
                              <td style="padding: 8px 0; color: #1a202c; font-size: 14px; text-align: right; font-family: monospace;">${external_id}</td>
                            </tr>
                            ` : ''}
                          </table>
                        </div>
                        ` : ''}
                        
                        <!-- Status Change -->
                        <div style="background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); padding: 25px; border-radius: 12px; margin: 0 0 20px 0;">
                          <div style="text-align: center; margin: 0 0 20px 0;">
                            <div style="display: inline-block; background-color: ${statusColor}; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-size: 18px; font-weight: 700;">
                              ${statusLabels[newStatus || ''] || newStatus || 'Neznámy'}
                            </div>
                          </div>
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 14px;">Predchádzajúci status:</td>
                              <td style="padding: 10px 0; color: #718096; font-size: 14px; text-align: right;">${statusLabels[oldStatus || ''] || oldStatus || 'Neznámy'}</td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 14px; font-weight: 600;">Nový status:</td>
                              <td style="padding: 10px 0; color: ${statusColor}; font-size: 14px; text-align: right; font-weight: 700;">${statusLabels[newStatus || ''] || newStatus || 'Neznámy'}</td>
                            </tr>
                          </table>
                        </div>
                        
                        ${notes ? `
                        <!-- Notes -->
                        <div style="background: #fff5e6; border-left: 4px solid #ed8936; padding: 15px; border-radius: 8px; margin: 0 0 20px 0;">
                          <p style="margin: 0; color: #744210; font-size: 14px; line-height: 1.6;"><strong>Poznámka:</strong> ${notes}</p>
                        </div>
                        ` : ''}
                        
                        ${trackingUrl ? `
                        <!-- Tracking -->
                        <div style="background: #e6fffa; border-left: 4px solid #38b2ac; padding: 15px; border-radius: 8px; margin: 0 0 20px 0;">
                          <p style="margin: 0 0 10px 0; color: #234e52; font-size: 14px; font-weight: 600;">📦 Tracking informácie:</p>
                          <p style="margin: 0; text-align: center;">
                            <a href="${trackingUrl}" style="display: inline-block; background-color: #38b2ac; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Sledovať zásielku</a>
                          </p>
                        </div>
                        ` : ''}
                        
                        ${label_url ? `
                        <!-- Label PDF -->
                        <div style="background: #f0fff4; border-left: 4px solid #48bb78; padding: 15px; border-radius: 8px; margin: 0 0 20px 0;">
                          <p style="margin: 0 0 10px 0; color: #22543d; font-size: 14px; font-weight: 600;">🏷️ Štítok na zásielku:</p>
                          <p style="margin: 0; text-align: center;">
                            <a href="${label_url}" style="display: inline-block; background-color: #48bb78; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Stiahnuť štítok (PDF)</a>
                          </p>
                        </div>
                        ` : ''}
                        
                        ${contract_url ? `
                        <!-- Contract PDF -->
                        <div style="background: #fef5e7; border-left: 4px solid #f6ad55; padding: 15px; border-radius: 8px; margin: 0 0 20px 0;">
                          <p style="margin: 0 0 10px 0; color: #7c2d12; font-size: 14px; font-weight: 600;">📄 Zmluva o kúpe:</p>
                          <p style="margin: 0; text-align: center;">
                            <a href="${contract_url}" style="display: inline-block; background-color: #f6ad55; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Stiahnuť zmluvu (PDF)</a>
                          </p>
                        </div>
                        ` : ''}
                        
                        ${price || payout ? `
                        <!-- Financial Info -->
                        <div style="background: #f7fafc; padding: 20px; border-radius: 12px; margin: 0 0 20px 0;">
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            ${price ? `
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 15px; font-weight: 600;">Cena:</td>
                              <td style="padding: 10px 0; color: #1a202c; font-size: 15px; text-align: right; font-weight: 700;">${price.toFixed(2)} €</td>
                            </tr>
                            ` : ''}
                            ${payout ? `
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 15px; font-weight: 600;">Váš výplata:</td>
                              <td style="padding: 10px 0; color: #48bb78; font-size: 15px; text-align: right; font-weight: 700;">${payout.toFixed(2)} €</td>
                            </tr>
                            ` : ''}
                          </table>
                        </div>
                        ` : ''}
                        
                        <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6; text-align: center;">Ďalšie informácie nájdete vo vašom profile.</p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0; color: #718096; font-size: 14px;">S pozdravom,<br><strong style="color: #1a202c;">Tím AirKicks</strong></p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;
        break;
      }

      case 'tracking': {
        const { productName, trackingNumber, carrier, trackingUrl, notes, size, sku, image_url, price, payout, external_id, label_url, contract_url } = data;
        subject = `Tracking informácie - ${productName || 'Váš predaj'}`;
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 40px 20px; text-align: center;">
                  <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%); padding: 30px 20px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">📦 Tracking informácie</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 30px 20px;">
                        <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">Dobrý deň,</p>
                        <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.6;">Pridali sme tracking informácie k vášmu predaju.</p>
                        
                        ${image_url ? `
                        <!-- Product Image -->
                        <div style="text-align: center; margin: 0 0 30px 0;">
                          <img src="${image_url}" alt="${productName || 'Produkt'}" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);" />
                        </div>
                        ` : ''}
                        
                        <!-- Product Info -->
                        ${productName || size || sku ? `
                        <div style="background: #f7fafc; padding: 20px; border-radius: 12px; margin: 0 0 20px 0;">
                          ${productName ? `<h2 style="margin: 0 0 15px 0; color: #1a202c; font-size: 18px; font-weight: 700; text-align: center;">${productName}</h2>` : ''}
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            ${size ? `
                            <tr>
                              <td style="padding: 8px 0; color: #4a5568; font-size: 14px;">Veľkosť:</td>
                              <td style="padding: 8px 0; color: #1a202c; font-size: 14px; text-align: right; font-weight: 600;">${size}</td>
                            </tr>
                            ` : ''}
                            ${sku ? `
                            <tr>
                              <td style="padding: 8px 0; color: #4a5568; font-size: 14px;">SKU:</td>
                              <td style="padding: 8px 0; color: #1a202c; font-size: 14px; text-align: right; font-family: monospace;">${sku}</td>
                            </tr>
                            ` : ''}
                            ${external_id ? `
                            <tr>
                              <td style="padding: 8px 0; color: #4a5568; font-size: 14px;">Číslo objednávky:</td>
                              <td style="padding: 8px 0; color: #1a202c; font-size: 14px; text-align: right; font-family: monospace;">${external_id}</td>
                            </tr>
                            ` : ''}
                          </table>
                        </div>
                        ` : ''}
                        
                        <!-- Tracking Info -->
                        <div style="background: linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%); padding: 25px; border-radius: 12px; margin: 0 0 20px 0; border-left: 4px solid #38b2ac;">
                          <h3 style="margin: 0 0 20px 0; color: #234e52; font-size: 18px; font-weight: 700; text-align: center;">🚚 Tracking detaily</h3>
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            ${trackingNumber ? `
                            <tr>
                              <td style="padding: 10px 0; color: #234e52; font-size: 15px; font-weight: 600;">Tracking číslo:</td>
                              <td style="padding: 10px 0; color: #1a202c; font-size: 15px; text-align: right; font-family: monospace; font-weight: 700;">${trackingNumber}</td>
                            </tr>
                            ` : ''}
                            ${carrier ? `
                            <tr>
                              <td style="padding: 10px 0; color: #234e52; font-size: 15px; font-weight: 600;">Dopravca:</td>
                              <td style="padding: 10px 0; color: #1a202c; font-size: 15px; text-align: right; font-weight: 600;">${carrierLabels[carrier] || carrier}</td>
                            </tr>
                            ` : ''}
                          </table>
                          ${trackingUrl ? `
                          <div style="text-align: center; margin: 20px 0 0 0;">
                            <a href="${trackingUrl}" style="display: inline-block; background-color: #38b2ac; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">Sledovať zásielku</a>
                          </div>
                          ` : ''}
                        </div>
                        
                        ${notes ? `
                        <!-- Notes -->
                        <div style="background: #fff5e6; border-left: 4px solid #ed8936; padding: 15px; border-radius: 8px; margin: 0 0 20px 0;">
                          <p style="margin: 0; color: #744210; font-size: 14px; line-height: 1.6;"><strong>Poznámka:</strong> ${notes}</p>
                        </div>
                        ` : ''}
                        
                        ${label_url ? `
                        <!-- Label PDF -->
                        <div style="background: #f0fff4; border-left: 4px solid #48bb78; padding: 15px; border-radius: 8px; margin: 0 0 20px 0;">
                          <p style="margin: 0 0 10px 0; color: #22543d; font-size: 14px; font-weight: 600;">🏷️ Štítok na zásielku:</p>
                          <p style="margin: 0; text-align: center;">
                            <a href="${label_url}" style="display: inline-block; background-color: #48bb78; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Stiahnuť štítok (PDF)</a>
                          </p>
                        </div>
                        ` : ''}
                        
                        ${contract_url ? `
                        <!-- Contract PDF -->
                        <div style="background: #fef5e7; border-left: 4px solid #f6ad55; padding: 15px; border-radius: 8px; margin: 0 0 20px 0;">
                          <p style="margin: 0 0 10px 0; color: #7c2d12; font-size: 14px; font-weight: 600;">📄 Zmluva o kúpe:</p>
                          <p style="margin: 0; text-align: center;">
                            <a href="${contract_url}" style="display: inline-block; background-color: #f6ad55; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Stiahnuť zmluvu (PDF)</a>
                          </p>
                        </div>
                        ` : ''}
                        
                        ${price || payout ? `
                        <!-- Financial Info -->
                        <div style="background: #f7fafc; padding: 20px; border-radius: 12px; margin: 0 0 20px 0;">
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            ${price ? `
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 15px; font-weight: 600;">Cena:</td>
                              <td style="padding: 10px 0; color: #1a202c; font-size: 15px; text-align: right; font-weight: 700;">${price.toFixed(2)} €</td>
                            </tr>
                            ` : ''}
                            ${payout ? `
                            <tr>
                              <td style="padding: 10px 0; color: #4a5568; font-size: 15px; font-weight: 600;">Váš výplata:</td>
                              <td style="padding: 10px 0; color: #48bb78; font-size: 15px; text-align: right; font-weight: 700;">${payout.toFixed(2)} €</td>
                            </tr>
                            ` : ''}
                          </table>
                        </div>
                        ` : ''}
                        
                        <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6; text-align: center;">Ďalšie informácie nájdete vo vašom profile.</p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0; color: #718096; font-size: 14px;">S pozdravom,<br><strong style="color: #1a202c;">Tím AirKicks</strong></p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid email type' }),
          { 
            status: 400, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            } 
          }
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
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          } 
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: emailData }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        } 
      }
    );
  }
});



