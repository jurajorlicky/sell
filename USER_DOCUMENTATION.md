# Dokumentácia pre používateľov

## Obsah
1. [Začíname](#začíname)
2. [Registrácia a prihlásenie](#registrácia-a-prihlásenie)
3. [Pridávanie produktov](#pridávanie-produktov)
4. [Sledovanie predajov](#sledovanie-predajov)
5. [Profil a nastavenia](#profil-a-nastavenia)
6. [Systém cien a výplat](#systém-cien-a-výplat)
7. [Časté otázky (FAQ)](#časté-otázky-faq)

---

## Začíname

Vitajte v systéme pre správu predaja produktov! Táto aplikácia vám umožňuje:
- Pridávať produkty na predaj
- Sledovať stav vašich predajov
- Spravovať svoj profil a údaje
- Porovnávať svoje ceny s trhovými cenami
- Automaticky dostávať informácie o zmene stavu predajov

---

## Registrácia a prihlásenie

### Registrácia nového účtu

1. Na úvodnej stránke kliknite na **"Sign Up"** (Registrácia)
2. Vyplňte požadované údaje:
   - **Email** - váš email (bude použitý na prihlásenie a notifikácie)
   - **Heslo** - minimálne 6 znakov
3. Kliknite na **"Sign Up"**
4. **Dôležité**: Po registrácii vám bude odoslaný email na overenie. Musíte kliknúť na odkaz v emaile, aby ste aktivovali svoj účet.
5. Po overení emailu sa môžete prihlásiť pomocou svojich prihlasovacích údajov

### Prihlásenie

1. Zadajte svoj **email** a **heslo**
2. Kliknite na **"Sign In"** (Prihlásiť sa)
3. Po úspešnom prihlásení budete presmerovaní na váš dashboard

---

## Pridávanie produktov

### Ako pridať nový produkt

1. Po prihlásení kliknite na tlačidlo **"Add Product"** (Pridať produkt) v dashboarde
2. Vyplňte formulár:
   - **Product Name** (Názov produktu) - napr. "Nike Air Max 90"
   - **Size** (Veľkosť) - napr. "42", "M", "One Size"
   - **SKU** (voliteľné) - kód produktu
   - **Price** (Cena) - cena v eurách, za ktorú chcete produkt predať
   - **Image URL** (voliteľné) - odkaz na obrázok produktu
3. Kliknite na **"Add Product"**
4. Produkt sa pridá do vášho katalógu a bude viditeľný v sekcii "My Products"

### Porovnanie cien

Po pridaní produktu systém automaticky:
- Porovná vašu cenu s trhovými cenami
- Zobrazí vám, či máte najnižšiu cenu
- Upozorní vás, ak je vaša cena vyššia ako ceny konkurentov
- Zobrazí vám informácie o eshopových cenách

**Stavy cien:**
- 🟢 **Lowest** - Máte najnižšiu cenu
- 🟡 **Tied for Lowest** - Máte rovnakú cenu ako najnižšia, ale nie ste prví v poradí
- 🔴 **Higher** - Vaša cena je vyššia ako najnižšia trhová cena

### Úprava ceny produktu

1. V sekcii "My Products" kliknite na produkt, ktorý chcete upraviť
2. Kliknite na tlačidlo **"Edit Price"** (Upraviť cenu)
3. Zadajte novú cenu
4. Systém vám okamžite zobrazí porovnanie s trhovými cenami
5. Kliknite na **"Update Price"** (Aktualizovať cenu)

---

## Sledovanie predajov

### Prehľad predajov

V sekcii **"Sales"** (Predaje) nájdete:
- Zoznam všetkých vašich predajov
- Aktuálny stav každého predaja
- Informácie o produktoch (názov, veľkosť, cena, výplata)
- Odkazy na tracking, label a zmluvu (ak sú dostupné)

### Stavy predajov

Systém používa tieto stavy predajov:

1. **Accepted** (Akceptované)
   - Predaj bol akceptovaný
   - Čaká sa na vytvorenie labelu

2. **Label Sent** (Label odoslaný)
   - Label bol vytvorený a odoslaný
   - Produkt sa pripravuje na odoslanie

3. **Shipped** (Odoslané)
   - Produkt bol odoslaný kupujúcemu
   - Tracking link je dostupný (ak bol pridaný)

4. **Delivered** (Doručené)
   - Produkt bol doručený kupujúcemu
   - Čaká sa na výplatu

5. **Completed** (Dokončené)
   - Predaj je dokončený
   - Výplata bola vykonaná

6. **Cancelled** (Zrušené)
   - Predaj bol zrušený

7. **Returned** (Vrátené)
   - Produkt bol vrátený

### Filtrovanie predajov

Môžete filtrovať predaje podľa:
- **Statusu** - zobrazí len predaje s vybraným stavom
- **Dátumu** - od-do dátum
- **Vyhľadávania** - podľa názvu produktu, SKU alebo ID

### Detaily predaja

Kliknutím na predaj sa zobrazí:
- **Timeline** (Časová os) - história zmien stavu
- **Poznámky** - dôležité informácie o predaji
- **Tracking link** - odkaz na sledovanie zásielky
- **Label PDF** - stiahnutie labelu
- **Contract PDF** - stiahnutie zmluvy o kúpe

---

## Profil a nastavenia

### Úprava profilu

1. Kliknite na **"Profile"** (Profil) v navigácii
2. Vyplňte alebo upravte svoje údaje:

   **Osobné údaje:**
   - First Name (Meno)
   - Last Name (Priezvisko)
   - Email (nemôže byť zmenený)
   - Telephone (Telefón)

   **Adresa:**
   - Address (Ulica)
   - Popisné číslo
   - PSČ
   - Mesto
   - Krajina

   **Firemné údaje** (ak máte Business profil):
   - IČO (IČO)
   - Company Name (Názov spoločnosti)

   **Bankové údaje:**
   - IBAN - pre výplaty

3. Kliknite na **"Save Changes"** (Uložiť zmeny)

### Typ profilu

Môžete si vybrať medzi:
- **Personal** (Osobný) - pre fyzické osoby
- **Business** (Obchodný) - pre firmy (vyžaduje IČO)

### Podpis

Pre vytváranie zmlúv je potrebné nahrať váš podpis:
1. V sekcii "Signature" kliknite na **"Upload Signature"**
2. Vyberte obrázok s vaším podpisom (PNG, JPG)
3. Podpis sa automaticky uloží a bude použitý v PDF zmluvách

---

## Systém cien a výplat

### Ako sa počítajú výplaty

Výplata sa počíta podľa vzorca:
```
Výplata = (Cena × (1 - Percentuálna provízia)) - Fixná provízia
```

**Príklad:**
- Cena produktu: 100 €
- Percentuálna provízia: 10% (0.10)
- Fixná provízia: 2 €
- Výplata = (100 × 0.90) - 2 = 88 €

Výplaty sa zaokrúhľujú na najbližšie celé euro (0.50 a viac sa zaokrúhli nahor).

### Kedy dostanem výplatu?

Výplata sa vykoná po dokončení predaja (status "Completed"). Čas výplaty závisí od nastavení administrátora.

---

## Časté otázky (FAQ)

### Ako zmením svoje heslo?

Heslo môžete zmeniť cez email reset. Kontaktujte administrátora alebo použite funkciu "Forgot Password" na prihlasovacej stránke.

### Prečo nevidím svoje produkty v ponukách?

Produkty sa zobrazujú v ponukách len po tom, čo administrátor schváli predaj. Po vytvorení predaja sa produkt odstráni z vašich ponúk.

### Ako funguje porovnanie cien?

Systém automaticky porovnáva vaše ceny s:
- Cenami iných používateľov (konsignátorov)
- Cenami z eshopov (ak sú dostupné)

Porovnanie sa aktualizuje automaticky pri každej zmene ceny.

### Čo znamená "Tied for Lowest"?

Ak máte rovnakú cenu ako najnižšia trhová cena, ale nie ste prví v poradí (podľa dátumu pridania), zobrazí sa vám "Tied for Lowest". V tomto prípade môžete zvážiť zníženie ceny, aby ste boli prví v poradí.

### Ako dostanem informácie o zmene stavu predaja?

Systém automaticky odosiela emaily pri každej zmene stavu predaja. Uistite sa, že máte správny email v profile a že ste overili svoj email po registrácii.

### Čo robiť, ak neprichádzajú emaily?

1. Skontrolujte spam/promotion priečinok
2. Overte, že máte správny email v profile
3. Skontrolujte, či ste overili svoj email po registrácii
4. Kontaktujte administrátora

### Ako stiahnem zmluvu alebo label?

V sekcii "Sales" kliknite na predaj a potom na odkazy:
- **"View Contract"** - zobrazí PDF zmluvu
- **"Download Label"** - stiahne label PDF

### Čo znamená "Manual Sale"?

Manual Sale je predaj vytvorený administrátorom manuálne (nie z ponuky). Tieto predaje majú špeciálne označenie a môžu mať iný dátum faktúry.

### Ako funguje tracking?

Ak administrátor pridá tracking link k predaju, zobrazí sa vám v detaile predaja. Kliknutím na link môžete sledovať zásielku.

### Môžem zrušiť predaj?

Zrušenie predaja musí schváliť administrátor. Kontaktujte ho prosím, ak potrebujete zrušiť predaj.

### Ako zmením typ profilu z Personal na Business?

1. Prejdite do **"Profile"**
2. Zmeňte **"Profile Type"** na "Business"
3. Vyplňte **IČO** (povinné pre Business profil)
4. Kliknite na **"Save Changes"**

---

## Kontakt a podpora

Ak máte akékoľvek otázky alebo problémy:
1. Skontrolujte túto dokumentáciu
2. Kontaktujte administrátora cez email alebo Discord
3. Prehľadajte FAQ sekciu vyššie

---

## Tipy a najlepšie postupy

1. **Pravidelne kontrolujte ceny** - Trhové ceny sa menia, pravidelne kontrolujte a upravujte svoje ceny
2. **Používajte kvalitné obrázky** - Produkty s obrázkami sa predávajú lepšie
3. **Buďte konkurencieschopní** - Sledujte trhové ceny a prispôsobte svoje ceny
4. **Aktualizujte profil** - Uistite sa, že máte správne bankové údaje pre výplaty
5. **Nahrajte podpis** - Pre rýchlejšie vytváranie zmlúv nahrajte svoj podpis
6. **Sledujte emaily** - Dôležité informácie o predajoch prichádzajú cez email

---

**Posledná aktualizácia:** 2024

