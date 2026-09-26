# Mazanie používateľov

## Aktuálny stav

Mazanie používateľa z admin rozhrania momentálne:
- ✅ Vymaže profil z `profiles` tabuľky
- ✅ Vymaže všetky predaje (`user_sales`)
- ✅ Vymaže všetky produkty (`user_products`)
- ✅ Vymaže súvisiace súbory (signatures, labels, contracts)
- ❌ **Nevymaže používateľa z `auth.users` tabuľky**

## Prečo sa nevymaže z auth.users?

Tabuľka `auth.users` je v Supabase špeciálna tabuľka, ktorá:
- Je v `auth` schema, nie v `public` schema
- Vyžaduje `service_role` prístup alebo Admin API na mazanie
- Nemôže byť vymazaná priamo cez normálne SQL príkazy s `anon` key

## Riešenia

### Riešenie 1: Manuálne mazanie v Supabase Dashboard (najjednoduchšie)

Po vymazaní profilu v aplikácii:
1. Otvorte Supabase Dashboard
2. Prejdite na Authentication > Users
3. Nájdite používateľa podľa emailu
4. Vymazajte používateľa

### Riešenie 2: Edge Function s service_role (odporúčané pre produkciu)

Vytvorte Edge Function, ktorá bude mať service_role prístup:

```typescript
// supabase/functions/delete-user/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { userId } = await req.json()
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    
    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
})
```

Potom v `UsersPage.tsx` po vymazaní profilu zavolajte:

```typescript
const { error } = await supabase.functions.invoke('delete-user', {
  body: { userId }
})
```

### Riešenie 3: Nastavenie ON DELETE CASCADE (nie odporúčané)

Ak by ste chceli, aby sa profil automaticky vymazal pri vymazaní z auth.users, potrebujete zmeniť foreign key constraint:

```sql
ALTER TABLE profiles 
DROP CONSTRAINT profiles_id_fkey;

ALTER TABLE profiles
ADD CONSTRAINT profiles_id_fkey 
FOREIGN KEY (id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;
```

**POZOR**: Toto znamená, že ak sa vymaže používateľ z auth.users (napr. manuálne v Dashboarde), profil sa automaticky vymaže. Ale naopak to nefunguje - ak sa vymaže profil, používateľ zostáva v auth.users.

## Aktuálne správanie

Pri vymazaní používateľa v aplikácii:
1. Vymaže sa profil z `profiles`
2. Vymažu sa všetky súvisiace dáta
3. Používateľ zostáva v `auth.users` (ale nemôže sa prihlásiť, pretože profil neexistuje)

Toto je bezpečné správanie - používateľ sa nemôže prihlásiť, ale jeho ID zostáva v auth.users pre audit alebo históriu.

## Odporúčanie

Pre produkciu použite **Riešenie 2** (Edge Function), pretože:
- Je automatizované
- Bezpečné (service_role key nie je v klientovi)
- Kompletne vymaže používateľa

