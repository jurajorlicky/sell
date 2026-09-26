# Email Edge Function - Debugging Guide

## Kontrola Edge Function na Supabase

### 1. Skontrolujte, či je Edge Function nasadená

1. Otvorte Supabase Dashboard
2. Prejdite na **Edge Functions** v ľavom menu
3. Skontrolujte, či existuje funkcia `send-sale-email-ts`
4. Ak neexistuje, musíte ju nasadiť

### 2. Skontrolujte Environment Variables

Edge Function potrebuje tieto environment variables:

- `RESEND_API_KEY` - API kľúč z Resend.com
- `RESEND_FROM_EMAIL` - Email adresa, z ktorej sa posielajú emaily (napr. `consign@airkicks.eu`)

**Ako nastaviť:**
1. V Supabase Dashboard > Edge Functions > `send-sale-email-ts`
2. Kliknite na **Settings** alebo **Environment Variables**
3. Pridajte:
   - `RESEND_API_KEY` = váš Resend API kľúč
   - `RESEND_FROM_EMAIL` = `consign@airkicks.eu` (alebo vaša email adresa)

### 3. Skontrolujte Logy Edge Function

1. V Supabase Dashboard > Edge Functions > `send-sale-email-ts`
2. Kliknite na **Logs**
3. Skontrolujte, či sú tam nejaké chyby

### 4. Testovanie Edge Function

Môžete otestovať Edge Function priamo v Supabase Dashboard:

1. Prejdite na **Edge Functions** > `send-sale-email-ts`
2. Kliknite na **Invoke**
3. Použite tento test payload:

```json
{
  "type": "new_sale",
  "email": "test@example.com",
  "productName": "Test Product",
  "size": "42",
  "price": 100,
  "payout": 75,
  "external_id": "TEST123",
  "sku": "SKU123"
}
```

### 5. Bežné problémy

#### Problém: Edge Function vracia 404
**Riešenie:** Edge Function nie je nasadená. Musíte ju nasadiť.

#### Problém: Edge Function vracia 500 s "Failed to send email"
**Riešenie:** 
- Skontrolujte `RESEND_API_KEY` - musí byť platný
- Skontrolujte `RESEND_FROM_EMAIL` - musí byť overená email adresa v Resend
- Skontrolujte Resend Dashboard, či máte dostatok kreditu

#### Problém: Edge Function vracia 400 s "Missing required fields"
**Riešenie:** Skontrolujte, či sa posielajú všetky požadované polia (`email`, `type`)

### 6. Nasadenie Edge Function

Ak Edge Function nie je nasadená alebo potrebuje aktualizáciu, musíte ju nasadiť:

1. Uistite sa, že máte Supabase CLI nainštalované
2. Skopírujte obsah z `EDGE_FUNCTION_EMAIL_EXAMPLE.ts` do `supabase/functions/send-sale-email-ts/index.ts`
3. **DÔLEŽITÉ:** Uistite sa, že CORS hlavičky obsahujú `apikey`:
   ```
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
   ```
4. Nasajte funkciu:
   ```bash
   supabase functions deploy send-sale-email-ts
   ```

### 7. Oprava CORS chyby

Ak vidíte CORS chybu v konzole:
```
Access-Control-Allow-Headers in preflight response
```

**Riešenie:**
1. Otvorte `supabase/functions/send-sale-email-ts/index.ts` na Supabase
2. Uistite sa, že všetky Response objekty majú správne CORS hlavičky:
   ```typescript
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
   ```
3. Redeploy funkciu

### 7. Kontrola v kóde

V aplikácii sa chyby logujú do konzoly. Otvorte Developer Tools (F12) a skontrolujte Console, či sú tam nejaké chyby pri posielaní emailov.

