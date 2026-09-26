# Deployment na Netlify

## Rýchly spôsob (Netlify Dashboard)

1. **Prihlásenie do Netlify**
   - Choďte na [netlify.com](https://www.netlify.com)
   - Prihláste sa pomocou GitHub účtu (alebo inej podporovanej služby)

2. **Nová stránka z Git repozitára**
   - Kliknite na "Add new site" > "Import an existing project"
   - Vyberte svoj Git poskytovateľa (GitHub, GitLab, Bitbucket)
   - Vyberte repozitár s týmto projektom

3. **Nastavenia buildu** (Netlify by mal automaticky detekovať nastavenia z `netlify.toml`):
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Node version**: 18.x alebo novšia (Netlify použije najnovšiu LTS verziu)

4. **Premenné prostredia**
   - Choďte na Site settings > Environment variables
   - Pridajte nasledujúce premenné:
     - `VITE_SUPABASE_URL` = vaša Supabase URL
     - `VITE_SUPABASE_ANON_KEY` = váš Supabase anon key
   
   **Dôležité**: Nezabudnite pridať `VITE_` prefix, aby boli premenné dostupné vo Vite aplikácii!

5. **Deploy**
   - Kliknite na "Deploy site"
   - Počkajte na dokončenie buildu

## CLI spôsob (Netlify CLI)

1. **Inštalácia Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Prihlásenie**
   ```bash
   netlify login
   ```

3. **Build projektu lokálne**
   ```bash
   npm run build
   ```

4. **Deploy**
   ```bash
   # Prvý deploy
   netlify deploy --prod
   
   # Alebo pre draft deploy
   netlify deploy
   ```

5. **Nastavenie premenných prostredia cez CLI**
   ```bash
   netlify env:set VITE_SUPABASE_URL "https://your-project.supabase.co"
   netlify env:set VITE_SUPABASE_ANON_KEY "your-anon-key"
   ```

## Súbory potrebné pre deployment

### `netlify.toml`
Tento súbor už existuje v projekte a obsahuje:
- Build command
- Publish directory
- Redirect pravidlá pre SPA (Single Page Application)

### `_redirects` (voliteľné)
Tento súbor je už vytvorený a zabezpečuje, že všetky cesty smerujú na `index.html` (potrebné pre React Router).

## Nastavenia v Netlify Dashboard

### Build & deploy settings:
- **Base directory**: (nechajte prázdne)
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Node version**: 18.x alebo vyššia

### Environment variables:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Continuous Deployment

Netlify automaticky nasadí novú verziu pri každom push do hlavnej vetvy (alebo inej nastavenej branch).

- Push do `main` branch → automatický deploy na produkciu
- Pull requesty → vytvorí sa preview deploy

## Riešenie problémov

### Build zlyhá
- Skontrolujte, či sú všetky závislosti v `package.json`
- Skontrolujte Node verziu (malo by byť 18+)
- Pozrite si build logy v Netlify Dashboard

### Aplikácia nefunguje po deploy
- Skontrolujte, či sú nastavené environment variables
- Skontrolujte konzolu v prehliadači kvôli chybám
- Skontrolujte, či `_redirects` súbor je v `dist` adresári

### 404 errors pri navigácii
- Skontrolujte, či `_redirects` súbor existuje v `dist` adresári
- Skontrolujte nastavenia redirect v `netlify.toml`

## Poznámky

- Netlify automaticky spracuje `netlify.toml` súbor
- `_redirects` súbor je kópia redirect pravidiel pre istotu
- Premenné prostredia MUSIA mať `VITE_` prefix, aby boli dostupné vo Vite aplikácii
- Edge Functions (v `supabase/functions/`) NIE SÚ nasadené na Netlify - tie musia byť nasadené samostatne na Supabase

