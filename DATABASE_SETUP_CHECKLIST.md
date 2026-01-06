# Kontrolný zoznam nastavenia databázy

Tento dokument obsahuje kontrolný zoznam pre správne nastavenie databázy v Supabase.

## ✅ Základné tabuľky

### 1. `profiles` - Profily používateľov
- [ ] Tabuľka existuje
- [ ] RLS (Row Level Security) je zapnuté
- [ ] Policies pre SELECT (users can read own profile)
- [ ] Policies pre UPDATE (users can update own profile)
- [ ] Policies pre INSERT (users can insert own profile)
- [ ] Policies pre admins (admins can read all profiles)

**Kontrola:**
```sql
SELECT * FROM profiles LIMIT 1;
```

### 2. `products` - Katalóg produktov
- [ ] Tabuľka existuje
- [ ] RLS je zapnuté
- [ ] Policies pre SELECT (all authenticated users can read)
- [ ] Policies pre admins (admins can manage all)

**Kontrola:**
```sql
SELECT * FROM products LIMIT 1;
```

### 3. `user_products` - Produkty používateľov (ponuky)
- [ ] Tabuľka existuje
- [ ] RLS je zapnuté
- [ ] Policies pre SELECT (users can read own products)
- [ ] Policies pre INSERT (users can insert own products)
- [ ] Policies pre UPDATE (users can update own products)
- [ ] Policies pre DELETE (users can delete own products)
- [ ] Policies pre admins (admins can manage all)
- [ ] Stĺpec `expires_at` existuje (pre expiráciu ponúk)

**Kontrola:**
```sql
SELECT * FROM user_products LIMIT 1;
```

### 4. `user_sales` - Predaje
- [ ] Tabuľka existuje
- [ ] RLS je zapnuté
- [ ] Policies pre SELECT (users can read own sales)
- [ ] Policies pre admins (admins can read/update all sales)
- [ ] Stĺpec `invoice_date` existuje (migrácia `add_invoice_date_column.sql`)
- [ ] Stĺpec `label_url` existuje (pre PDF labels)
- [ ] Stĺpec `contract_url` existuje (pre PDF zmluvy)
- [ ] Stĺpec `tracking_url` existuje
- [ ] Stĺpec `external_id` existuje
- [ ] Stĺpec `status_notes` existuje
- [ ] Stĺpec `is_manual` existuje
- [ ] Index na `invoice_date` existuje
- [ ] Index na `user_id` existuje
- [ ] Index na `status` existuje

**Kontrola:**
```sql
-- Skontrolovať stĺpce
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_sales' 
ORDER BY ordinal_position;

-- Skontrolovať indexy
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'user_sales';
```

### 5. `admin_users` - Administrátori
- [ ] Tabuľka existuje
- [ ] RLS je zapnuté
- [ ] Policies pre SELECT (admins can read admin_users)
- [ ] Váš user ID je v tabuľke

**Kontrola:**
```sql
SELECT * FROM admin_users;
```

### 6. `admin_settings` - Nastavenia administrátora
- [ ] Tabuľka existuje
- [ ] RLS je zapnuté
- [ ] Policies pre admins (admins can read/update)
- [ ] Záznamy pre `fee_percent` a `fee_fixed` existujú

**Kontrola:**
```sql
SELECT * FROM admin_settings;
```

### 7. `sales_status_history` - História zmien stavov predajov
- [ ] Tabuľka existuje (ak sa používa)
- [ ] RLS je zapnuté
- [ ] Policies pre SELECT (users can read own sales history)
- [ ] Policies pre admins (admins can read all)

**Kontrola:**
```sql
SELECT * FROM sales_status_history LIMIT 1;
```

### 8. `product_price_view` - View pre trhové ceny
- [ ] View existuje (alebo tabuľka)
- [ ] RLS je zapnuté (ak je to tabuľka)
- [ ] Policies pre SELECT (all authenticated users can read)

**Kontrola:**
```sql
SELECT * FROM product_price_view LIMIT 1;
```

---

## ✅ Migrácie

### Potrebné migrácie v `supabase/migrations/`:

1. **`add_invoice_date_column.sql`** ✅
   - [ ] Spustená v Supabase
   - [ ] Stĺpec `invoice_date` existuje
   - [ ] Index `idx_user_sales_invoice_date` existuje

2. **`add_sale_type_column.sql`** ⚠️ (DEPRECATED - už sa nepoužíva)
   - [ ] Stĺpec `sale_type` môže byť odstránený (používa sa len `invoice_date`)

3. **`update_status_display_text_to_english.sql`** ✅
   - [ ] Funkcia `get_sales_status_display_text` existuje
   - [ ] Vracia anglické texty

**Kontrola migrácií:**
```sql
-- Skontrolovať invoice_date
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'user_sales' AND column_name = 'invoice_date';

-- Skontrolovať funkciu
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'get_sales_status_display_text';
```

---

## ✅ Storage Buckets

### 1. `signatures` - Podpisy používateľov
- [ ] Bucket existuje
- [ ] Public: `true` (alebo RLS policies)
- [ ] File size limit: 5MB
- [ ] Allowed MIME types: `image/png, image/jpeg, image/jpg`
- [ ] Policies pre upload (users can upload own signatures)
- [ ] Policies pre read (users can read own signatures, admins can read all)

**Kontrola:**
```sql
-- V Supabase Dashboard > Storage > Buckets
-- Skontrolovať, či bucket 'signatures' existuje
```

### 2. `labels` - PDF labels
- [ ] Bucket existuje
- [ ] Public: `true` (alebo RLS policies)
- [ ] File size limit: 10MB
- [ ] Allowed MIME types: `application/pdf`
- [ ] Policies pre upload (admins can upload)
- [ ] Policies pre read (users can read own labels, admins can read all)

**Kontrola:**
```sql
-- V Supabase Dashboard > Storage > Buckets
-- Skontrolovať, či bucket 'labels' existuje
```

### 3. `contracts` - PDF zmluvy
- [ ] Bucket existuje
- [ ] Public: `true` (alebo RLS policies)
- [ ] File size limit: 10MB
- [ ] Allowed MIME types: `application/pdf`
- [ ] Policies pre upload (system/admins can upload)
- [ ] Policies pre read (users can read own contracts, admins can read all)

**Kontrola:**
```sql
-- V Supabase Dashboard > Storage > Buckets
-- Skontrolovať, či bucket 'contracts' existuje
```

---

## ✅ Edge Functions

### 1. `send-sale-email-ts` - Email notifikácie
- [ ] Edge Function existuje
- [ ] Environment variables nastavené:
  - [ ] `RESEND_API_KEY`
  - [ ] `FROM_EMAIL`
- [ ] CORS headers správne nastavené (vrátane `apikey`)
- [ ] Funkcia je deploynutá

**Kontrola:**
- V Supabase Dashboard > Edge Functions
- Skontrolovať, či funkcia existuje a je deploynutá

---

## ✅ RLS Policies - Detailný prehľad

### `profiles`
```sql
-- Users can read own profile
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Users can update own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- Users can insert own profile
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
```

### `user_products`
```sql
-- Users can read own products
CREATE POLICY "Users can read own products" ON user_products
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert own products
CREATE POLICY "Users can insert own products" ON user_products
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update own products
CREATE POLICY "Users can update own products" ON user_products
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete own products
CREATE POLICY "Users can delete own products" ON user_products
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all user_products
CREATE POLICY "Admins can read all user_products" ON user_products
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Admins can manage all user_products
CREATE POLICY "Admins can manage all user_products" ON user_products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
```

### `user_sales`
```sql
-- Users can read own sales
CREATE POLICY "Users can read own sales" ON user_sales
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all user_sales
CREATE POLICY "Admins can read all user_sales" ON user_sales
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Admins can update all user_sales
CREATE POLICY "Admins can update all user_sales" ON user_sales
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Admins can insert user_sales
CREATE POLICY "Admins can insert user_sales" ON user_sales
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
```

### `admin_users`
```sql
-- Admins can read admin_users
CREATE POLICY "Admins can read admin_users" ON admin_users
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
```

### `admin_settings`
```sql
-- Admins can read admin_settings
CREATE POLICY "Admins can read admin_settings" ON admin_settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Admins can update admin_settings
CREATE POLICY "Admins can update admin_settings" ON admin_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
```

---

## ✅ Indexy pre výkon

### `user_sales`
```sql
-- Index na invoice_date (pre invoices page)
CREATE INDEX IF NOT EXISTS idx_user_sales_invoice_date ON user_sales(invoice_date);

-- Index na user_id (pre rýchle vyhľadávanie predajov používateľa)
CREATE INDEX IF NOT EXISTS idx_user_sales_user_id ON user_sales(user_id);

-- Index na status (pre filtrovanie)
CREATE INDEX IF NOT EXISTS idx_user_sales_status ON user_sales(status);

-- Index na created_at (pre zoradenie)
CREATE INDEX IF NOT EXISTS idx_user_sales_created_at ON user_sales(created_at DESC);

-- Composite index pre user_id + status (pre rýchlejšie dotazy)
CREATE INDEX IF NOT EXISTS idx_user_sales_user_status ON user_sales(user_id, status);
```

### `user_products`
```sql
-- Index na user_id
CREATE INDEX IF NOT EXISTS idx_user_products_user_id ON user_products(user_id);

-- Index na product_id + size (pre price comparison)
CREATE INDEX IF NOT EXISTS idx_user_products_product_size ON user_products(product_id, size);

-- Index na expires_at (pre expiraciu ponúk)
CREATE INDEX IF NOT EXISTS idx_user_products_expires_at ON user_products(expires_at);
```

---

## ✅ Constraints a validácie

### `user_sales.status`
```sql
-- Skontrolovať CHECK constraint
SELECT constraint_name, check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%status%';
```

Očakávané hodnoty: `'accepted'`, `'processing'`, `'shipped'`, `'delivered'`, `'completed'`, `'cancelled'`, `'returned'`

### `profiles.profile_type`
```sql
-- Skontrolovať CHECK constraint
SELECT constraint_name, check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%profile_type%';
```

Očakávané hodnoty: `'Personal'`, `'Business'`

---

## ✅ Funkcie a Views

### `get_sales_status_display_text(status_code text)`
- [ ] Funkcia existuje
- [ ] Vracia anglické texty pre statusy
- [ ] Správne spracováva všetky statusy

**Kontrola:**
```sql
SELECT get_sales_status_display_text('accepted'); -- Should return 'Accepted'
SELECT get_sales_status_display_text('delivered'); -- Should return 'Delivered'
```

---

## 🔍 Rýchla kontrola všetkého

Spustite tento SQL dotaz pre rýchlu kontrolu:

```sql
-- Kontrola tabuliek
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Kontrola RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Kontrola policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;

-- Kontrola indexov
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;
```

---

## ⚠️ Časté problémy

1. **Chýbajúce RLS policies** - Používatelia nemôžu čítať/upravovať svoje dáta
2. **Chýbajúce indexy** - Pomalé dotazy
3. **Nesprávne storage policies** - Nemožno nahrať/stiahnuť súbory
4. **Chýbajúce Edge Function** - Emaily nefungujú
5. **Nesprávne environment variables** - Edge Functions nefungujú

---

## 📝 Poznámky

- Všetky migrácie by mali byť idempotentné (môžu sa spustiť viackrát bez chyby)
- Používajte `IF NOT EXISTS` a `DO $$ ... END $$` pre bezpečné migrácie
- Vždy testujte migrácie na testovacom prostredí pred produkciou

---

**Posledná aktualizácia:** 2024

