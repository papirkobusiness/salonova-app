# Salonova – kalendar i virtualna recepcija

Ovaj ZIP sadrži cijeli Vite/React projekt za postojeću Salonova aplikaciju.

## Što vide klijenti

Na javnom linku `/rezervacija/SLUG-SALONA` klijent vidi samo:
- kalendar s danima u kojima postoji barem jedan slobodan termin;
- slobodne termine koje može odabrati;
- zauzete ili nedostupne termine koji se ne mogu odabrati;
- unos imena i prezimena te broja telefona za potvrdu rezervacije;
- chat s ponuđenim pitanjima za rezervaciju, cijene i radno vrijeme te poljem za vlastito pitanje.

Administratorski dio ostaje odvojen iza prijave vlasnika. Klijentska stranica ne prikazuje uređivanje usluga, zaposlenika, postavki ni pregled rezervacija.

## Važno o chatu

Ova verzija ima osnovni automatizirani chat s prepoznavanjem poznatih namjera i podataka iz salona. To još nije puni AI asistent koji razumije svaku slobodno napisanu rečenicu. Za takav razgovor kasnije treba dodati sigurnu serversku AI funkciju; tajni AI ključ ne smije biti u pregledniku.

## Postavljanje na postojeći projekt

1. Raspakirajte ZIP.
2. U postojeći GitHub repozitorij aplikacije `salonova-app` prenesite sadržaj ZIP-a (ne sam ZIP kao jednu datoteku) i potvrdite promjene na grani `main`.
3. Na Netlifyju otvorite postojeći projekt aplikacije `salonovahr` i pričekajte novi deploy. Nemojte mijenjati marketinšku web-stranicu.
4. Zadržite postojeće Netlify varijable `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`.
5. U postojećem Supabase projektu otvorite SQL Editor i izvršite samo novu migraciju `supabase/migrations/0004_calendar_availability.sql` ako ta migracija još nije izvršena.

Nemojte ponovno izvršavati početne migracije `0001`–`0003` na postojećoj bazi bez prethodne provjere jer je aplikacija već spojena na postojeći Supabase projekt.

## Nova evidencija profila klijenata (migracija 0006)

Ova verzija dodaje privatne interne bilješke i oznaku „Stalni klijent” na kartici klijenta. Podaci su odvojeni po salonu i zaštićeni RLS pravilima.

Prije korištenja nove funkcije u postojećem Supabase projektu otvorite **SQL Editor** i izvršite sadržaj datoteke `supabase/migrations/0006_client_profiles.sql`. Nemojte ponovno pokretati stare migracije. Ako migracija nije izvršena, prikazat će se poruka da nedostaje tablica profila klijenata.

## Provjera nakon objave

Otvorite javni link salona: `https://DOMENA-APLIKACIJE/rezervacija/SLUG-SALONA`.
Provjerite prikazuju li se usluge, slobodni dani, termini i chat. Za rezervaciju je potrebna barem jedna aktivna usluga s cijenom i trajanjem te uneseno radno vrijeme.

## Tehničke napomene

- Build: `npm run build`
- Publish folder: `dist`
- Netlify SPA fallback je postavljen u `netlify.toml`.
- Javne funkcije vraćaju podatke o salonu i slobodnim terminima; ne vraćaju imena ni telefonske brojeve drugih klijenata.
- Potvrda rezervacije provjerava dostupnost na serveru i koristi transakcijsko zaključavanje po salonu i datumu kako bi se spriječile istodobne dvostruke rezervacije.
- WhatsApp potvrde nisu uključene u ovoj verziji.


## E-mail podsjetnici (novi modul)

- Online obrazac sada traži e-mail klijenta.
- Migracija `0007_email_reminders.sql` dodaje privatni red čekanja i raspoređuje podsjetnik 24 sata prije termina.
- Edge Function nalazi se u `supabase/functions/send-reminders/index.ts` i šalje poruke preko Resend API-ja.
- Za stvarno slanje potrebno je deployati Edge Function i postaviti server secrets: `RESEND_API_KEY` i `REMINDER_FROM_EMAIL` (adresa na verificiranoj Resend domeni). Supabase automatski daje `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` u Edge Function okruženju.
- Primjer rasporeda pozivanja svakih 15 minuta je `0008_schedule_email_reminders.sql.example`; prije pokretanja treba pohraniti `project_url` i `service_role_key` u Supabase Vault te uključiti `pg_cron`, `pg_net` i Vault.
- Ova verzija automatski pokriva online rezervacije; postojeće i ručno unesene rezervacije bez e-mail adrese neće dobiti podsjetnik.
