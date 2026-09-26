# PDF Zmluva (Purchase Agreement) - Nastavenie

## Prehľad

Systém teraz podporuje:
1. **Generovanie PDF zmlúv** - Admin môže vygenerovať PDF purchase agreement pre každý predaj
2. **Manuálne vytvorenie predaja** - Admin môže manuálne vytvoriť predaj pre používateľa cez tlačidlo "+" v SalesPage

## Nastavenie

### 1. SQL Migrácia

Spustite `DB_MIGRATION_CONTRACT_URL.sql` v Supabase SQL Editori:
```sql
-- Pridá stĺpec contract_url do user_sales tabuľky
ALTER TABLE user_sales 
ADD COLUMN IF NOT EXISTS contract_url TEXT;
```

### 2. Storage Bucket

Vytvorte storage bucket pre PDF zmluvy:

1. Otvorte Supabase Dashboard
2. Prejdite na **Storage**
3. Kliknite na **Create Bucket**
4. Nastavenia:
   - **Názov**: `contracts`
   - **Public bucket**: `Yes` (odporúčané) alebo `No` (s RLS policies)
   - **File size limit**: `5MB`
   - **Allowed MIME types**: `application/pdf`

### 3. RLS Policies (ak bucket NIE JE public)

Ak ste nastavili bucket ako **NOT public**, spustite `DB_STORAGE_BUCKET_CONTRACTS.sql` v Supabase SQL Editori.

## Použitie

### Generovanie PDF Zmluvy

1. Otvorte detail predaja (kliknite na kartu predaja)
2. V modale nájdite sekciu **"PDF Zmluva (Purchase Agreement)"**
3. Kliknite na tlačidlo **"Vygenerovať PDF zmluvu"**
4. PDF sa vygeneruje a nahraje do storage bucketu `contracts`
5. URL sa uloží do `user_sales.contract_url`
6. PDF môžete otvoriť kliknutím na link

### Manuálne Vytvorenie Predaja

1. V admin rozhraní prejdite na **Predaje** (SalesPage)
2. Kliknite na tlačidlo **"+"** (Nový predaj) v hlavičke
3. Vyplňte formulár:
   - **Používateľ** * (vyberte z rozbaľovacieho zoznamu)
   - **Názov produktu** *
   - **Veľkosť** *
   - **Cena** * (€)
   - **Výplata** * (€)
   - **SKU** (voliteľné)
   - **Externé ID** (voliteľné)
   - **URL obrázka** (voliteľné)
4. Kliknite na **"Vytvoriť predaj"**
5. Predaj sa vytvorí so statusom `accepted`
6. Používateľ dostane email notifikáciu (ak má email)

## Štruktúra PDF Zmluvy

PDF zmluva obsahuje:
- **Informácie o predaji**: ID predaja, Externé ID, SKU, Dátum, Status
- **Informácie o produkte**: Názov, Veľkosť, Cena, Výplata
- **Informácie o predávajúcom**: Email (ak je dostupný)
- **Dátum generovania**: Automaticky sa pridá do pätičky

## Customizácia PDF

PDF zmluvu môžete prispôsobiť v `src/lib/pdfGenerator.ts`:

- Pridať vlastné polia cez `ContractData` interface
- Upraviť layout a formátovanie
- Pridať logo spoločnosti
- Pridať obchodné podmienky
- Pridať kontaktné informácie spoločnosti

Príklad:
```typescript
const pdfBlob = await generatePurchaseAgreement({
  saleId: saleId,
  productName: 'Nike Air Max 90',
  size: '42',
  price: 100.00,
  payout: 80.00,
  companyName: 'Vaša Spoločnosť',
  companyAddress: 'Adresa 123',
  companyPhone: '+421 123 456 789',
  companyEmail: 'info@spolocnost.sk',
  terms: 'Vaše obchodné podmienky...'
});
```

## Technické Detaily

### Súbory
- `src/lib/pdfGenerator.ts` - Funkcia na generovanie PDF
- `src/components/AdminSalesStatusManager.tsx` - UI pre generovanie PDF
- `src/components/CreateSaleModal.tsx` - Modal na vytvorenie predaja
- `src/pages/SalesPage.tsx` - Hlavná stránka s tlačidlom "+"

### Závislosti
- `jspdf` - Knižnica na generovanie PDF

### Storage
- Bucket: `contracts`
- Cesta: `contracts/{saleId}-{timestamp}.pdf`
- MIME type: `application/pdf`
- Max veľkosť: 5MB

## Poznámky

- PDF sa generuje automaticky pri kliknutí na tlačidlo
- Staré PDF sa prepíše, ak sa vygeneruje nové pre ten istý predaj
- PDF je dostupné pre admina aj používateľa (ak má bucket správne RLS policies)
- Email notifikácia sa pošle automaticky pri vytvorení predaja

