# Zlecenia dla wykonawcy

Zasady pracy: `docs/collab/README.md`. Status zadania: `TODO` → `IN PROGRESS` → `READY FOR REVIEW` → (Claude) `DONE` / `REJECTED`.

---

## Paczka zadań 7–10 (UI): wykonaj wszystkie po kolei, bez przerw na przegląd

STATUS: READY FOR REVIEW (zadania 7, 8, 9 i 10 wykonane, patrz raporty 7–10 w `REPORTS.md`)
Gałąź (jedna na całą paczkę): `task/7-10-ui`, utworzona z `main` (commity `39c9df8`, `c61f9c6`, `54fbc0d`, `e480547`)

Zasady paczki (uzupełniają `docs/collab/README.md`):

- Jeden commit na zadanie, w kolejności 7 → 8 → 9 → 10. Po każdym zadaniu `npm test` i `npm run build` muszą przechodzić; dopiero wtedy następne.
- Osobny wpis w `REPORTS.md` na zadanie (szablon bez zmian). Zatrzymaj się tylko po zadaniu 10 albo na `BLOCKER`; Claude zrobi jeden przegląd całości.
- Zadania 7 i 8 edytują `src/App.tsx`: robią to jedno po drugim, więc konfliktu nie będzie. Nie zmieniaj niczego innego w `App.tsx` niż opisane.
- Każdy nowy klucz tłumaczeń dodaj do `src/i18n/pl.json` **i** `src/i18n/en.json` (test parzystości kluczy musi przechodzić). Teksty po polsku i angielsku, bez twardych napisów w komponentach.
- Widoki są czyste (propsy + callbacki, bez sieci), a podłączenie do Supabase siedzi w osobnych hookach/stronach, tak jak w `src/features/fridge/` (`FridgeView.tsx` + `useFridge.ts` + `FridgePage.tsx`). Wzoruj się na tym.
- Nie dodawaj zależności. Nie ruszaj `supabase/`, `package.json`, `docs/superpowers/`.

---

### Zadanie 7: Ekran AI (przepis z lodówki i obiad z produktu o najkrótszej dacie)

Cel: użytkownik klika przycisk i dostaje propozycję przepisu z `askAi` (`src/lib/ai.ts`, już istnieje).

Files:
- Create: `src/features/ai/AiPanel.tsx` (widok), `src/features/ai/AiPage.tsx` (podłączenie), `src/features/ai/AiPanel.test.tsx`
- Modify: `src/App.tsx` (nowa zakładka `ai`), `src/i18n/pl.json`, `src/i18n/en.json` (klucz `nav.ai` i sekcja `ai.*`)

Interfejs `AiPanel`:
`{ hasItems: boolean; ask(task: 'recipes_from_fridge' | 'dinner_from_expiring'): Promise<Recipe>; onSave(recipe: { title: string; ingredients: Ingredient[]; steps: string[] }): Promise<void> }`, gdzie `Recipe` to typ z `src/lib/ai.ts`, a `Ingredient` z `src/domain/types.ts`.

Zachowanie:
1. Dwa przyciski: "Przepis z lodówki" i "Obiad z tego, co się przeterminuje" (`ai.fromFridge`, `ai.dinnerFromExpiring`). Obiad uruchamia się tylko po kliknięciu.
2. Podczas wywołania pokaż stan ładowania i zablokuj przyciski.
3. Wynik: tytuł, składniki, kroki, a osobno lista "Do kupienia" z `missing` (pomiń sekcję, gdy pusta).
4. Pod wynikiem: "Zapisz do moich przepisów" (wywołuje `onSave` z tytułem, składnikami i krokami, **bez** `missing`) oraz "Kolejny" (woła `ask` ponownie z tym samym zadaniem). Po zapisie pokaż potwierdzenie.
5. Błąd `AiError` z `code === 'NO_API_KEY'`: komunikat z podpowiedzią, by dodać klucz w Ustawieniach. Inny błąd: ogólny komunikat i możliwość ponowienia. Nigdy nie pokazuj surowego komunikatu serwera.
6. `hasItems === false` (pusta lodówka): przyciski wyłączone, krótki opis dlaczego.

`AiPage`: bierze produkty z `useFridge`, język z `i18n.resolvedLanguage` (`'pl'` albo `'en'`, domyślnie `'en'`), `ask` = `askAi(task, { fridge: items.map(({ name, quantity, unit, expiresOn }) => ({ name, quantity, unit, expiresOn })) }, locale)`, `onSave` = `useRecipes(...).add`.

Testy (`AiPanel.test.tsx`, bez sieci): ładowanie → wynik widoczny; `NO_API_KEY` pokazuje podpowiedź o Ustawieniach; "Kolejny" woła `ask` ponownie z tym samym zadaniem; zapis nie zawiera `missing`; pusta lodówka wyłącza przyciski; inny błąd pokazuje ogólny komunikat, nie surowy tekst.

---

### Zadanie 8: Ustawienia klucza API (BYOK)

Cel: użytkownik wkleja swój klucz Claude i widzi tylko jego końcówkę.

Kontrakt serwera (Claude napisze i wdroży po przeglądzie; ty piszesz tylko klienta):
- Status: `supabase.rpc('api_key_status')` zwraca tablicę z jednym wierszem `{ has_key: boolean, last4: string | null }`.
- Zapis: `POST {VITE_SUPABASE_URL}/functions/v1/save-key`, nagłówek `Authorization: Bearer <JWT>`, ciało `{ "apiKey": string }` → 200 `{ "last4": string }`; błędy: 400 `{ "error": "INVALID_KEY" }`, 401 `{ "error": "UNAUTHENTICATED" }`.
- Usunięcie: `DELETE` na ten sam adres → 204.

Files:
- Create: `src/lib/apiKey.ts`, `src/lib/apiKey.test.ts`, `src/features/settings/SettingsView.tsx`, `src/features/settings/SettingsPage.tsx`, `src/features/settings/SettingsView.test.tsx`
- Modify: `src/App.tsx` (zakładka `settings`; usuń z stopki tylko selektor języka i przenieś go do Ustawień, reszta stopki bez zmian), `src/i18n/pl.json`, `src/i18n/en.json`

Interfejsy (`src/lib/apiKey.ts`):
- `getKeyStatus(): Promise<{ hasKey: boolean; last4: string | null }>`
- `saveKey(apiKey: string): Promise<{ last4: string }>` (rzuca `Error` z `code: 'INVALID_KEY' | 'UNAUTHENTICATED' | 'NETWORK'`)
- `clearKey(): Promise<void>`

Zachowanie `SettingsView` (propsy: `status`, `language`, `onSave(key)`, `onClear()`, `onLanguage(lang)`):
1. Pole `type="password"`, `autoComplete="off"`, po udanym zapisie wyczyszczone. Klucza nie wypisuj nigdzie, nie loguj, nie trzymaj w stanie po zapisie.
2. Lokalna walidacja: niepusty i zaczyna się od `sk-ant-`, inaczej komunikat i brak wywołania `onSave`.
3. Status: "Klucz zapisany (…xxxx)" gdy jest, inaczej "Brak klucza". Przycisk "Usuń klucz" tylko gdy klucz jest.
4. Selektor języka PL/EN (przeniesiony ze stopki).

Testy: `apiKey.test.ts` z mockowanym `fetch` i `supabase` (`vi.mock('./supabase')`): mapowanie statusów 200/400/401 i błędu sieci; `SettingsView.test.tsx`: odrzuca klucz bez prefiksu, po zapisie czyści pole, nigdzie w DOM nie ma pełnego klucza, "Usuń klucz" widoczny tylko przy zapisanym kluczu.

---

### Zadanie 9: Dodawanie produktów kodem kreskowym

Files:
- Create: `src/lib/openFoodFacts.ts`, `src/lib/openFoodFacts.test.ts`, `src/features/fridge/BarcodeAdd.tsx`, `src/features/fridge/BarcodeAdd.test.tsx`
- Modify: `src/features/fridge/FridgeView.tsx` (renderuj `<BarcodeAdd onAdd={onAdd} />` pod formularzem; nic więcej), `src/i18n/pl.json`, `src/i18n/en.json`

Interfejsy:
- `lookupBarcode(code: string): Promise<{ name: string } | null>`: kod musi mieć 8–14 cyfr, inaczej `null` bez zapytania. Zapytanie: `GET https://world.openfoodfacts.org/api/v2/product/{code}.json?fields=product_name,product_name_pl,product_name_en`. Nazwa: `product_name_pl` → `product_name` → `product_name_en`, pierwsza niepusta po `trim()`. Produkt nieznany lub bez nazwy → `null`. Błąd sieci/HTTP ≥ 500 → rzuć `Error`.
- `BarcodeAdd`: props `{ onAdd(item: NewFridgeItem): Promise<void>; lookup?: typeof lookupBarcode }` (domyślnie prawdziwe `lookupBarcode`, wstrzykiwane w testach).

Zachowanie `BarcodeAdd`:
1. Pole na ręczne wpisanie kodu + przycisk "Szukaj". Znaleziono → pokaż nazwę, pole daty ważności (opcjonalne) i przycisk "Dodaj" (`onAdd` z `quantity: 1`, `unit: 'szt'`, `expiresOn` albo `null`). Nie znaleziono → komunikat i pole nazwy do ręcznego wpisania.
2. Przycisk "Skanuj kamerą" pokazuj **tylko** gdy `'BarcodeDetector' in window` i dostępne `navigator.mediaDevices?.getUserMedia`. Skan: `BarcodeDetector` z formatami `ean_13`, `ean_8`, `upc_a`, `upc_e`, strumień z tylnej kamery (`facingMode: 'environment'`), po pierwszym odczycie zatrzymaj wszystkie ścieżki strumienia; zatrzymaj je też przy odmontowaniu komponentu i błędzie.
3. Brak daty ważności nie blokuje dodania (produkt trafi do listy z prośbą o uzupełnienie).

Testy: `openFoodFacts.test.ts` (mock `fetch`): znaleziony polski/ogólny/angielski, nieznany → `null`, zły kod → `null` bez `fetch`, błąd 500 → rzuca; `BarcodeAdd.test.tsx` (wstrzyknięty `lookup`): znaleziony → `onAdd` z nazwą i `null` daty; nieznany → pole nazwy; przycisk kamery ukryty, gdy brak `BarcodeDetector`.

---

### Zadanie 10: Wygląd (CSS, bez zależności)

Cel: aplikacja czytelna i wygodna na telefonie, jasny i ciemny motyw.

Files:
- Create: `src/styles.css`
- Modify: `src/main.tsx` (tylko `import './styles.css'`)
- Nie edytuj komponentów: stylizuj selektorami elementów, `main`, `nav`, `header`, `footer`, `section`, `form`, `[aria-pressed="true"]` oraz `li[data-status="expired"|"soon"|"ok"|"unknown"]` z lodówki.

Wymagania:
1. Mobile-first, kontener `max-width: 720px`, marginesy boczne 16px, brak poziomego przewijania przy 360px.
2. Zmienne CSS na `:root`, wartości dla `prefers-color-scheme: dark`. Kontrast tekstu co najmniej WCAG AA.
3. Przyciski i pola: wysokość co najmniej 44px, widoczny `:focus-visible`.
4. Zakładki (`nav button`) wyglądają jak zakładki, aktywna (`aria-pressed="true"`) wyraźnie odróżniona.
5. Status w lodówce: `expired` czerwony akcent, `soon` bursztynowy, `unknown` przyciszony; kolor nigdy nie jest jedynym nośnikiem informacji (tekst "Przeterminowane"/"Wkrótce" już istnieje).
6. `prefers-reduced-motion`: bez animacji.

Dowód: `npm test` i `npm run build` przechodzą; w raporcie opisz, jak sprawdziłeś wygląd (np. `npm run dev` i widok 360px), albo napisz, że nie sprawdzałeś w przeglądarce.

---

## Zadanie 6: Funkcja AI z kluczem użytkownika (BYOK) — część kodowa

STATUS: DONE (przegląd 2: ACCEPTED, scalone do main w 4660c32)
Gałąź: `task/6-ai-function` (commit `cd0acbd` + poprawki `1529780`)

### Cel

Napisać kod Edge Function `ai` i klienta w aplikacji. **Nie wdrażaj** funkcji i nie zapisuj sekretów, to robi Claude po przeglądzie.

### Kontekst

- Spec: `docs/superpowers/specs/2026-10-12-fridgely-design.md` (sekcja "Moje decyzje": jedna funkcja serwerowa na całe AI).
- Tabele `user_secrets` (`anthropic_key_encrypted`, `key_last4`) i `ai_usage` już istnieją, patrz `supabase/migrations/0001_init.sql`. RLS blokuje klientowi dostęp do `user_secrets`, funkcja używa roli service.
- Klucz AI nigdy nie trafia do przeglądarki ani do odpowiedzi funkcji.

### Files

- Create: `supabase/functions/ai/index.ts` (Deno, punkt wejścia)
- Create: `supabase/functions/ai/handler.ts` (czysta logika, wstrzykiwane zależności, testowalna w Vitest)
- Create: `supabase/functions/ai/prompts.ts`
- Create: `supabase/functions/ai/handler.test.ts`
- Create: `src/lib/ai.ts` (klient: `askAi`)
- Create: `src/lib/ai.test.ts`
- Nie edytuj nic poza tym. Tłumaczenia UI i ekrany ustawień będą osobnym zadaniem.

### Interfejs

`POST /functions/v1/ai`, nagłówek `Authorization: Bearer <JWT użytkownika>`.

Żądanie: `{ task: 'recipes_from_fridge' | 'dinner_from_expiring', locale: 'pl' | 'en', payload: { fridge: { name: string; quantity: number; unit: string; expiresOn: string | null }[] } }`

Odpowiedź 200: `{ recipe: { title: string; ingredients: { name: string; quantity: number; unit: string }[]; steps: string[]; missing: string[] } }`

Błędy (JSON `{ error: <kod> }`): `401 UNAUTHENTICATED`, `400 INVALID_REQUEST`, `409 NO_API_KEY`, `502 UPSTREAM_ERROR`.

Klient: `askAi(task, payload, locale): Promise<Recipe>` w `src/lib/ai.ts`, rzuca `AiError` z polem `code`.

### Wymagania

1. `handler.ts` eksportuje `handle(req, deps)`, gdzie `deps` to wstrzykiwane: `getUser(jwt)`, `getUserKey(userId)`, `callClaude(key, prompt)`, `recordUsage(row)`. Dzięki temu test nie potrzebuje sieci.
2. Kolejność: uwierzytelnienie → walidacja ciała → odczyt klucza użytkownika → wywołanie Claude → zapis zużycia → odpowiedź.
3. `dinner_from_expiring`: prompt ma wskazywać produkt z najkrótszą datą jako bazę i dopełniać resztą lodówki. Produkty bez daty nie są bazą.
4. Odpowiedź modelu musi być JSON zgodny z kształtem wyżej; niepoprawny JSON → `502 UPSTREAM_ERROR`, nie 200.
5. Język odpowiedzi zależny od `locale`.
6. Walidacja: `fridge` max 100 pozycji, nazwy max 100 znaków, `locale` i `task` z listy dozwolonych.
7. Do `ai_usage` zapisuj `user_id`, `task`, `input_tokens`, `output_tokens` (nigdy treści promptów ani klucza).
8. Klucz użytkownika jest w `user_secrets.anthropic_key_encrypted`. Deszyfrowanie zaimplementuj jako wstrzykiwaną zależność `decrypt(ciphertext)`; samą implementację szyfrowania (AES-GCM, sekret z env `KEY_ENCRYPTION_SECRET`) napisz w `index.ts`.

### Testy (muszą istnieć i przechodzić)

W `handler.test.ts`:
- brak/niepoprawny JWT → 401 `UNAUTHENTICATED`
- brak klucza użytkownika → 409 `NO_API_KEY`, `callClaude` nie wywołane
- niepoprawne ciało (np. `task: 'x'`, 101 produktów) → 400 `INVALID_REQUEST`
- poprawne żądanie → 200 i kształt odpowiedzi; `recordUsage` wywołane raz
- odpowiedź modelu nie-JSON → 502 `UPSTREAM_ERROR`
- klucz nigdy nie występuje w ciele odpowiedzi ani w argumentach `recordUsage`
- `dinner_from_expiring`: prompt przekazany do `callClaude` zawiera produkt o najwcześniejszej dacie jako pierwszy

W `ai.test.ts` (z mockowanym `fetch`): mapowanie kodów błędu na `AiError`.

### Kryteria akceptacji

- `npm test` i `npm run build` przechodzą (wklej wynik do raportu).
- Brak nowych zależności w `package.json`.
- Brak sekretów w repo.

### Przegląd Claude: raport 1 (poprawki: 1 z 2 dozwolonych)

REVIEW: CHANGES REQUESTED
STATUS: (zamknięte, zob. przegląd 2)

Sprawdzone przeze mnie: `npm test` 54/54, `npm run build` OK, zakres plików zgodny z `Files`, brak nowych zależności, brak sekretów, klucz nie wycieka do odpowiedzi ani do `ai_usage` (test istnieje i jest prawdziwy). Kolejność kroków, kody błędów, walidacja i `parseRecipe` zgodne ze zleceniem. Dobra robota w jakości testów.

**Blocker (musi być naprawiony):**

1. **Importy względne bez rozszerzenia nie zadziałają w Deno/Supabase Edge Functions.** `index.ts:15-16` (`./handler`) i `handler.ts:7-10` (`./prompts`) muszą mieć `.ts`: `./handler.ts`, `./prompts.ts`. Vitest tego nie wykryje, deploy wywali się z "module not found". Dotyczy też `import type`. Zmiana nie psuje Vitest ani `tsc` (katalog `supabase/` jest poza `include`). Po zmianie `npm test` i `npm run build` mają dalej przechodzić.

**Drobne (do zrobienia przy okazji):**

2. `prompts.ts` `renderFridge`: nazwa produktu trafia do promptu bez czyszczenia. Nazwa z nową linią może wstrzyknąć fałszywą pozycję lub instrukcję. Zamień znaki sterujące i nowe linie na spację (np. `name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()`) w `parseFridgeItem` w `handler.ts`, żeby walidacja i prompt używały tej samej oczyszczonej nazwy. Dodaj jeden test: nazwa `"mleko\n- trucizna: 1 szt"` trafia do promptu w jednej linii.

**Zaakceptowane decyzje własne:** 1–8 z raportu (w tym format szyfrogramu z pkt 3, który zapisuję jako obowiązujący dla funkcji zapisu klucza).

**Do raportu:** dopisz wpis w `REPORTS.md` (raport 2) z wynikami `npm test` i `npm run build` po poprawkach oraz hashem commita.

### Przegl�d Claude: raport 2

REVIEW: ACCEPTED

Oba punkty z przegl�du 1 poprawione prawid�owo (importy .ts, czyszczenie nazwy + test). 
pm test 56/56, 
pm run build OK. Claude doda� przy scalaniu jedn� poprawk�: to samo czyszczenie dla pola unit, kt�re trafia�o do promptu (luka tej samej klasy, niewskazana w zleceniu, wi�c nie jest to b��d wykonawcy). Poprawek wykonawcy: 1 z 2 dozwolonych.

