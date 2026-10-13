# Fridgely

Planer posiłków, który zaczyna od tego, co już masz w domu.
A meal planner that starts from what you already have at home.

- [Polski](#polski)
- [English](#english)

---

## Polski

### Czym jest Fridgely

Wspólna (dla 1–2 osób) aplikacja webowa, która zastępuje improwizację i marnowanie jedzenia: plan tygodnia, lista zakupów, stan lodówki z datami ważności i przepisy układane z tego, co jest w domu. Interfejs jest po polsku i angielsku.

### Funkcje

- **Lodówka**: dodawanie ręczne, kodem kreskowym (Open Food Facts) lub ze zdjęcia (lista rozpoznanych produktów jest edytowalna, nic nie trafia do lodówki bez zatwierdzenia), odczyt daty ważności z etykiety na zdjęciu, edycja ilości i daty, szukanie po nazwie, sortowanie od najbliższej daty, produkty bez daty na końcu z prośbą o uzupełnienie. Ten sam produkt (nazwa, jednostka, data) dopisuje się do istniejącego wiersza, a nie tworzy duplikatu.
- **Przepisy**: własna lista, kroki ukryte w „Pokaż kroki”, edycja, usuwanie z potwierdzeniem, szukanie po tytule (bez rozróżniania wielkości liter i polskich znaków) oraz filtr „Tylko to, co mogę ugotować teraz” na podstawie lodówki.
- **Plan tygodnia**: losowanie z istniejących przepisów, ręczne przypisywanie (przeciąganie), przechodzenie między tygodniami, informacja „Wszystko jest” albo „Brakuje: N” przy każdym dniu oraz „Ugotowane” — podgląd, co zniknie z lodówki, i zatwierdzenie, które odejmuje składniki (od najbliższej daty).
- **Lista zakupów**: generowana z planu i pomniejszona o lodówkę, ręczne dodawanie i usuwanie pozycji, odhaczanie w sklepie (odhaczone schodzą na dół), „Wyczyść odhaczone”, „Przenieś kupione do lodówki” i kopiowanie/udostępnianie listy jako tekst.
- **AI (BYOK)**: „Przepis z lodówki” i „Obiad z tego, co się przeterminuje” (tylko po kliknięciu), rozpoznawanie zdjęcia lodówki i odczyt daty z etykiety oraz dodanie braków z przepisu do listy zakupów. Każdy użytkownik używa własnego klucza Claude.
- **Ustawienia**: zapis/usuń własny klucz Claude (widać tylko końcówkę), przełącznik języka PL/EN, motyw (jasny, ciemny, systemowy), dane domu z kodem zaproszenia do skopiowania i liczbą osób.
- **Konto i dom**: logowanie e-mailem z hasłem, magic link, reset hasła linkiem, jedna wspólna przestrzeń z kodem zaproszenia i zmianami widocznymi na żywo u obu osób.
- **Na telefonie**: aplikację można dodać do ekranu głównego (manifest PWA); bez trybu offline.

### Stack

Vite + React 18 + TypeScript, i18next (PL/EN), Vitest + Testing Library, `@supabase/supabase-js` (Auth, Postgres z RLS, Realtime, Edge Functions), `@dnd-kit/core`, Supabase Edge Functions w Deno, Open Food Facts, API Anthropic (Claude).

### Wymagania

- Node.js 20+ i npm.
- Konto/projekt Supabase (darmowy wystarczy) z włączonym Auth.
- Do funkcji AI: własny klucz API Anthropic.

### Uruchomienie lokalne

```bash
npm install
```

Utwórz `.env.local` w katalogu głównym (ten plik jest ignorowany przez git):

```
VITE_SUPABASE_URL=https://<twoj-projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=<twoj-anon-key>
```

Tylko te dwie zmienne są potrzebne w przeglądarce. Klucza Anthropic **nie** wpisujesz do `.env.local` — każdy użytkownik wkleja go w Ustawieniach, a on trafia wyłącznie do funkcji `save-key`.

```bash
npm run dev      # serwer deweloperski Vite
npm test         # wszystkie testy (Vitest, bez sieci)
npm run build    # tsc --noEmit + vite build
```

### Struktura katalogów

- `src/domain` — czysta logika (lodówka, lista zakupów, plan), bez sieci i bez Reacta.
- `src/features` — ekrany i hooki: `fridge`, `recipes`, `plan`, `shopping`, `ai`, `settings`, `auth`, `household`. Widok (`*View.tsx`/`*Panel.tsx`) dostaje propsy, a podłączenie do Supabase siedzi w hooku i `*Page.tsx`.
- `src/lib` — klienci: `supabase.ts`, `ai.ts`, `apiKey.ts`, `openFoodFacts.ts`.
- `src/i18n` — `pl.json`, `en.json` (te same klucze w obu plikach) i konfiguracja i18next.
- `supabase/migrations` — schemat i RLS.
- `supabase/functions` — funkcje Edge (`ai`, `save-key`) plus testy czystej logiki.

### Baza danych

Migracje leżą w `supabase/migrations` i stosuje się je po kolei (`0001_init.sql`, `0002_invite_code_entropy.sql`) w SQL editorze albo przez Supabase CLI. Schemat zawiera tabele `households`, `members`, `recipes`, `fridge_items`, `meal_plan`, `shopping_items`, `user_secrets` i `ai_usage`; wszystkie mają włączone RLS z politykami po członkostwie domu, a `user_secrets` nie ma żadnych uprawnień dla ról klienckich.

Izolację między domami sprawdza `supabase/tests/rls.sql` — uruchom go w SQL editorze. Test celowo kończy się `ERROR P0001: RLS_TEST_OK` (transakcja jest wycofywana), a każdy inny błąd oznacza wyciek danych.

### Funkcje Edge

Obie funkcje używają roli service i wymagają sekretów ustawionych po stronie Supabase (`supabase secrets set`), nigdy w repo:

- `KEY_ENCRYPTION_SECRET` — sekret do szyfrowania kluczy użytkowników (AES-GCM).
- `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` — dostęp do bazy z pominięciem RLS (Supabase dostarcza je automatycznie w środowisku funkcji).

| Funkcja | Wywołanie | Rola |
|---|---|---|
| `ai` | `POST /functions/v1/ai` z `Authorization: Bearer <JWT>` | Sprawdza użytkownika, czyta i deszyfruje jego klucz, woła Claude, zapisuje zużycie tokenów do `ai_usage` i zwraca przepis w JSON. Kody błędów: `401 UNAUTHENTICATED`, `400 INVALID_REQUEST`, `409 NO_API_KEY`, `502 UPSTREAM_ERROR`. |
| `save-key` | `POST /functions/v1/save-key` (albo `DELETE`) z `Authorization: Bearer <JWT>` | Zapisuje klucz użytkownika zaszyfrowany w `user_secrets` (i tylko końcówkę do wyświetlenia) albo go usuwa. |

### Model BYOK

1. Użytkownik wkleja swój klucz Claude w Ustawieniach. Klucz idzie jednym żądaniem do `save-key`, jest tam szyfrowany i zapisany w `user_secrets`.
2. Do przeglądarki wraca wyłącznie końcówka klucza (`key_last4`); pełny klucz nie jest nigdzie zapisywany po stronie klienta, nie trafia do logów ani do odpowiedzi funkcji.
3. Każde zapytanie do Claude przechodzi przez funkcję `ai`, która sama odczytuje i deszyfruje klucz. W wersji 1 klucz jest zawsze kluczem użytkownika — aplikacja nie ma własnego klucza.

### Eksport danych i prywatność

W Ustawieniach jest przycisk **Pobierz moje dane**: zapisuje przepisy, lodówkę, listę zakupów i plan tygodnia jako plik `fridgely-RRRR-MM-DD.json`. W pliku nie ma nic poza danymi domu — żadnego klucza API, jego końcówki, adresu e-mail ani identyfikatorów użytkowników. Krótka sekcja „Prywatność" w Ustawieniach opisuje to, co aplikacja faktycznie robi:

- dane domu (przepisy, lodówka, lista zakupów, plan) są w bazie Supabase i widoczne dla członków domu;
- klucz Claude jest przechowywany zaszyfrowany po stronie serwera i nigdy nie wraca do przeglądarki w całości — widać tylko jego końcówkę;
- zdjęcia są najpierw zmniejszane w przeglądarce, a potem wysyłane przez funkcję serwerową do Anthropic razem z kluczem użytkownika; Fridgely ich nie zapisuje;
- kody kreskowe są sprawdzane w Open Food Facts, żeby odczytać nazwę produktu.

Historia zmian jest w `CHANGELOG.md`, a układ kodu i granice zaufania w `docs/ARCHITECTURE.md`.

### Współpraca

Zasady pracy i podział ról opisuje `docs/collab/README.md`, zlecenia `docs/collab/TASKS.md`, a raporty `docs/collab/REPORTS.md`. Specyfikacja i plan projektu są w `docs/superpowers/`.

---

## English

### What Fridgely is

A shared web app (for 1–2 people) that replaces improvising and wasting food: a week plan, a shopping list, a fridge with expiry dates, and recipes built from what you already have. The interface is available in Polish and English.

### Features

- **Fridge**: add items by hand, by barcode (Open Food Facts) or from a photo (the recognised products appear in an editable list and nothing is saved until you confirm), read an expiry date off a label in a photo, edit quantity and date, search by name, sorted by the nearest date, undated products last with a prompt to fill the date in. The same product (name, unit, date) tops up the existing row instead of creating a duplicate.
- **Recipes**: your own list, steps tucked into "Show steps", edit, delete behind a confirmation, search by title (case- and diacritic-insensitive) and a "Only what I can cook now" filter driven by the fridge.
- **Week plan**: randomize from existing recipes, assign by hand (drag and drop), move between weeks, "Everything is in" or "Missing: N" for each day, and "Cooked" — a preview of what will leave the fridge, then a confirmation that subtracts the ingredients (soonest expiry first).
- **Shopping list**: built from the plan and reduced by the fridge, add and remove items by hand, tick them off in the shop (checked items sink to the bottom), "Clear checked", "Move bought items to the fridge" and copy/share the list as text.
- **AI (BYOK)**: "Recipe from my fridge" and "Dinner from what expires next" (on click only), fridge-photo recognition, label-date reading, plus sending the recipe's missing items to the shopping list. Every user brings their own Claude key.
- **Settings**: save/remove your own Claude key (only the last characters are shown), PL/EN language switch, theme (light, dark, system) and the household details with a copyable invite code and the number of people.
- **Account and household**: e-mail and password sign-in, magic link, password reset by e-mail, one shared space with an invite code and live updates for both people.
- **On a phone**: the app can be added to the home screen (PWA manifest); no offline mode.

### Stack

Vite + React 18 + TypeScript, i18next (PL/EN), Vitest + Testing Library, `@supabase/supabase-js` (Auth, Postgres with RLS, Realtime, Edge Functions), `@dnd-kit/core`, Supabase Edge Functions on Deno, Open Food Facts, the Anthropic API (Claude).

### Requirements

- Node.js 20+ and npm.
- A Supabase account/project (the free tier is enough) with Auth enabled.
- For the AI features: your own Anthropic API key.

### Local setup

```bash
npm install
```

Create `.env.local` in the project root (it is git-ignored):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Those two variables are all the browser needs. Do **not** put an Anthropic key in `.env.local` — each user pastes their own key in Settings and it only ever reaches the `save-key` function.

```bash
npm run dev      # Vite dev server
npm test         # all tests (Vitest, offline)
npm run build    # tsc --noEmit + vite build
```

### Directory layout

- `src/domain` — pure logic (fridge, shopping list, week plan), no network, no React.
- `src/features` — screens and hooks: `fridge`, `recipes`, `plan`, `shopping`, `ai`, `settings`, `auth`, `household`. The view (`*View.tsx`/`*Panel.tsx`) takes props, while the Supabase wiring lives in a hook and a `*Page.tsx`.
- `src/lib` — clients: `supabase.ts`, `ai.ts`, `apiKey.ts`, `openFoodFacts.ts`.
- `src/i18n` — `pl.json`, `en.json` (identical key sets) and the i18next setup.
- `supabase/migrations` — schema and RLS.
- `supabase/functions` — the Edge Functions (`ai`, `save-key`) plus tests for their pure logic.

### Database

The migrations live in `supabase/migrations` and are applied in order (`0001_init.sql`, `0002_invite_code_entropy.sql`) in the SQL editor or via the Supabase CLI. The schema holds `households`, `members`, `recipes`, `fridge_items`, `meal_plan`, `shopping_items`, `user_secrets` and `ai_usage`; all of them have RLS enabled with policies based on household membership, and `user_secrets` grants nothing to the client roles.

Cross-household isolation is checked by `supabase/tests/rls.sql` — run it in the SQL editor. A passing run ends with `ERROR P0001: RLS_TEST_OK` (the transaction is rolled back on purpose); any other error means data leaked.

### Edge Functions

Both functions use the service role and need secrets set on the Supabase side (`supabase secrets set`), never in the repository:

- `KEY_ENCRYPTION_SECRET` — the secret used to encrypt user keys (AES-GCM).
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — database access that bypasses RLS (Supabase provides these to the function environment automatically).

| Function | Call | Purpose |
|---|---|---|
| `ai` | `POST /functions/v1/ai` with `Authorization: Bearer <JWT>` | Checks the user, reads and decrypts their key, calls Claude, records token usage in `ai_usage` and returns the recipe as JSON. Error codes: `401 UNAUTHENTICATED`, `400 INVALID_REQUEST`, `409 NO_API_KEY`, `502 UPSTREAM_ERROR`. |
| `save-key` | `POST /functions/v1/save-key` (or `DELETE`) with `Authorization: Bearer <JWT>` | Stores the user's key encrypted in `user_secrets` (plus the last characters for display) or removes it. |

### The BYOK model

1. The user pastes their Claude key in Settings. It travels in a single request to `save-key`, where it is encrypted and stored in `user_secrets`.
2. Only the tail of the key (`key_last4`) comes back to the browser; the full key is never kept client-side, never logged and never returned by a function.
3. Every Claude request goes through the `ai` function, which reads and decrypts the key itself. In version 1 the key is always the user's own — the app ships no key of its own.

### Data export and privacy

Settings has a **Download my data** button: it saves your recipes, fridge, shopping list and week plan as a `fridgely-YYYY-MM-DD.json` file. The file holds nothing but the household data — no API key, no key tail, no e-mail address and no user ids. A short "Privacy" section in Settings describes what the app actually does:

- household data (recipes, fridge, shopping list, plan) lives in a Supabase database and is visible to the members of the household;
- the Claude key is stored encrypted on the server and never comes back to the browser in full — only its last characters are shown;
- photos are downscaled in the browser first and then sent through a server function to Anthropic together with your key; Fridgely does not store them;
- barcodes are looked up in Open Food Facts to read the product name.

The change history is in `CHANGELOG.md`, and the code layout plus trust boundaries in `docs/ARCHITECTURE.md`.

### Collaboration

The working agreement and role split live in `docs/collab/README.md`, the task list in `docs/collab/TASKS.md` and the reports in `docs/collab/REPORTS.md`. The specification and plan are in `docs/superpowers/`.
