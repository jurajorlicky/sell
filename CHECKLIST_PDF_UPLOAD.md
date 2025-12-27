# Checklist: PDF Upload Funkcionalita

## ✅ Implementované

### 1. Database
- [x] `label_url` stĺpec v `user_sales` tabuľke (`DB_MIGRATION_LABEL_URL.sql`)
- [x] RLS policies pre `label_url` (read own, admin read all, admin update all)

### 2. Storage
- [x] Inštrukcie pre vytvorenie bucketu `labels` (`DB_STORAGE_BUCKET_LABELS.sql`)
- [x] Bucket nastavenia:
  - Názov: `labels`
  - Public: `true` (odporúčané)
  - File size limit: `10MB`
  - Allowed MIME types: `application/pdf`

### 3. Frontend Komponenty

#### AdminSalesStatusManager.tsx
- [x] `handleFileUpload` - nahrávanie PDF súborov
- [x] `handleDeleteLabel` - mazanie PDF súborov
- [x] Validácia: len PDF súbory, max 10MB
- [x] Error handling s detailnými správami
- [x] Extrakcia cesty z URL (podporuje rôzne formáty)
- [x] `upsert: true` - umožňuje prepísanie existujúceho súboru
- [x] UI pre drag & drop nahrávanie
- [x] Zobrazenie nahraného PDF s linkom
- [x] Tlačidlo na mazanie PDF

#### SalesPage.tsx (Admin)
- [x] `label_url` v `Sale` interface
- [x] Načítanie `label_url` z databázy
- [x] Zobrazenie `label_url` v sales kartách
- [x] Pridanie `label_url` do `AdminSalesStatusManager` props

#### UserSales.tsx (Consigner)
- [x] `label_url` v `UserSale` interface
- [x] Načítanie `label_url` z databázy
- [x] Zobrazenie `label_url` v sales kartách
- [x] Zobrazenie `label_url` v detail modale

### 4. Email Notifikácie
- [x] `label_url` pridaný do `sendTrackingEmail` interface
- [x] `label_url` sa posiela v tracking emailoch (ak existuje)

### 5. Error Handling
- [x] Špecifické chybové správy pre:
  - Bucket neexistuje
  - RLS policy chyba
  - Database update chyba
  - File upload chyba

## ⚠️ Potrebné Nastavenia v Supabase

### Krok 1: Vytvorenie Storage Bucketu
1. Otvorte Supabase Dashboard
2. Prejdite na **Storage**
3. Kliknite na **Create Bucket**
4. Nastavenia:
   - **Názov**: `labels`
   - **Public**: `true` (odporúčané)
   - **File size limit**: `10MB`
   - **Allowed MIME types**: `application/pdf`

### Krok 2: (Voliteľné) RLS Policies
Ak bucket nie je public, nastavte policies v **Storage > labels > Policies**:

**INSERT Policy:**
- Name: "Admins can upload labels"
- Target roles: `authenticated`
- USING: `EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())`
- WITH CHECK: `EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())`

**SELECT Policy:**
- Name: "Authenticated users can read labels"
- Target roles: `authenticated`
- USING: `true`

**DELETE Policy:**
- Name: "Admins can delete labels"
- Target roles: `authenticated`
- USING: `EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())`

### Krok 3: Spustenie Migrácie
Spustite `DB_MIGRATION_LABEL_URL.sql` v Supabase SQL Editori.

## 🧪 Testovanie

1. **Nahrávanie PDF:**
   - Otvorte admin predaj
   - Kliknite na "Nahrať PDF" alebo presuňte PDF súbor
   - Overte, že sa súbor nahral a zobrazí sa link

2. **Mazanie PDF:**
   - Kliknite na tlačidlo mazania
   - Overte, že sa súbor vymazal z storage aj databázy

3. **Zobrazenie PDF:**
   - Overte, že PDF sa zobrazuje v admin aj user view
   - Kliknite na link a overte, že sa PDF otvorí

4. **Error Handling:**
   - Skúste nahrať neplatný súbor (nie PDF)
   - Skúste nahrať príliš veľký súbor (>10MB)
   - Overte, že sa zobrazujú správne chybové správy

## 📝 Poznámky

- PDF súbory sa ukladajú do `sales/{saleId}-{timestamp}.pdf`
- Public URL sa generuje automaticky
- Staré súbory sa automaticky mazajú pri nahratí nového
- Email notifikácie obsahujú `label_url` ak existuje tracking


