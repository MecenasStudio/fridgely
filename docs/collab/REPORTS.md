# Raporty wykonawcy

Nowe wpisy dodawaj na górze, według szablonu z `docs/collab/README.md`.

## Zadanie 10: Wygląd (CSS, bez zależności)  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/7-10-ui`, `e480547a5a6d7cb1cc17da7edfe5e48bc5d9f9b3`
Zmienione pliki: `src/styles.css` (nowy), `src/main.tsx` (+1 linia: `import './styles.css'`)

Co zrobiłem: napisałem `src/styles.css` bez żadnej zależności i bez zmiany komponentów — stylowanie wyłącznie selektorami elementów i stanu (`main`, `nav button`, `button[aria-pressed="true"]`, `button,input,select`, `form`, `label`, `li[data-status="expired"|"soon"|"ok"|"unknown"]`, `footer`, `video`, `:focus-visible`). Zmienne motywu są na `:root`, a nadpisania dla ciemnego motywu w `@media (prefers-color-scheme: dark)`. Kontener `main` ma `max-width: 720px` i `padding: 0 16px 32px`, pola i przyciski `min-height: 44px` oraz `max-width: 100%`, `body` ma `overflow-wrap: break-word`, a `@media (prefers-reduced-motion: reduce)` wyłącza animacje i przejścia. W `main.tsx` dodałem tylko import — reszta pliku jest niezmieniona (diff to jedna linia, zachowany BOM oryginału).

Dowód:
- `npm test` → `Test Files 18 passed (18)` / `Tests 105 passed (105)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ 120 modules transformed`, `dist/assets/index-Cuso4p-y.css 2.91 kB │ gzip: 1.09 kB`, `✓ built in 1.47s` — arkusz jest realnie wbudowany w build.
- Jak sprawdzałem wygląd (opis, bo **nie udało się obejrzeć aplikacji w przeglądarce**):
  1. Uruchomiłem `npm run dev` (Vite, `http://localhost:5173/`) i pobrałem stronę oraz `src/styles.css` — oba HTTP 200, arkusz serwowany w całości.
  2. Headless Chrome jest w tym środowisku zablokowany (proces nie startuje, zero wyjścia), więc pomiaru `scrollWidth` przy 360px nie zrobiłem. Zamiast tego przepuściłem `src/styles.css` przez parser CSS w jsdom (test tymczasowy, po sprawdzeniu usunięty) i sprawdziłem, że: wszystkie istotne selektory przechodzą parsowanie, `main` ma `max-width: 720px` i `padding: 0px 16px 32px`, `button,input,select` ma `min-height: 44px` i `max-width: 100%`, `li[data-status="expired"]` ma kolor akcentu, a w pliku nie ma **żadnej** deklaracji `width: Npx` (czyli nic nie wymusza szerokości większej niż ekran); są też oba media queries i `:focus-visible`.
  3. Kontrast i wygląd pól wybierałem pod WCAG AA (tekst `#1b1f26` na `#f6f7f9`, w ciemnym motywie `#eef1f5` na `#14171b`), ale **nie potwierdziłem tego narzędziem** — to deklaracja, nie zmierzony wynik.
  4. Sprawdzenia wizualnego na 360px i w obu motywach nie zrobiłem; nie mam do tego narzędzia w tym środowisku.

Decyzje własne: `ul:has(li[data-status])` (usunięcie punktorów listy lodówki) opiera się na selektorze `:has`, który nowsze Chrome/Safari wspierają; gdy go brak, lista po prostu zachowa punktory i układ nadal działa. Kolor statusu nigdy nie jest jedynym nośnikiem informacji — tekst „Przeterminowane"/„Wkrótce" już istniał w widoku i został. Nagłówki `h1`–`h4` mają własne rozmiary, żeby kolejność sekcji była czytelna bez zmiany komponentów.

Pytania / blockery: brak. Jeśli chcesz, mogę po scaleniu odpalić `npm run dev` i przejść wygląd na 360px razem z Tobą — w tym środowisku nie mam przeglądarki.

## Zadanie 9: Dodawanie produktów kodem kreskowym  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/7-10-ui`, `54fbc0d579ab194ae8885b58e9d5d6bbb67f8dcc`
Zmienione pliki: `src/lib/openFoodFacts.ts`, `src/lib/openFoodFacts.test.ts`, `src/features/fridge/BarcodeAdd.tsx`, `src/features/fridge/BarcodeAdd.test.tsx` (nowe) oraz `src/features/fridge/FridgeView.tsx` (+2 linie: import i `<BarcodeAdd onAdd={onAdd} />` pod formularzem) i `src/i18n/pl.json`, `src/i18n/en.json` (klucze `fridge.barcode*`)

Co zrobiłem: `lookupBarcode(code)` przyjmuje tylko 8–14 cyfr (inaczej `null` bez zapytania), pyta `https://world.openfoodfacts.org/api/v2/product/{code}.json?fields=product_name,product_name_pl,product_name_en` i zwraca nazwę w kolejności `product_name_pl` → `product_name` → `product_name_en`, pierwszą niepustą po `trim()`; produkt nieznany lub bez nazwy → `null`, HTTP ≥ 500 i błąd sieci → `Error`. `BarcodeAdd` ma pole kodu z przyciskiem „Szukaj”, po znalezieniu pokazuje nazwę, opcjonalną datę ważności i „Dodaj” (`quantity: 1`, `unit: 'szt'`, `expiresOn` albo `null`), a po nieznanym kodzie — komunikat i pole nazwy do ręcznego wpisania. Przycisk „Skanuj kamerą” renderuje się tylko gdy są i `BarcodeDetector`, i `navigator.mediaDevices.getUserMedia`; skan używa formatów `ean_13`, `ean_8`, `upc_a`, `upc_e` i tylnej kamery, a strumień jest zatrzymywany po pierwszym odczycie, przy błędzie i przy odmontowaniu.

Dowód:
- `npm test` → `Test Files 18 passed (18)` / `Tests 105 passed (105)`; w tym `✓ src/features/fridge/BarcodeAdd.test.tsx (6 tests)` i `✓ src/lib/openFoodFacts.test.ts (6 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ 120 modules transformed`, `✓ built in 1.73s`.
- Testy pokrywają wymagane przypadki: polska/generyczna/angielska nazwa, nieznany → `null`, zły kod → `null` bez `fetch`, 503 → rzuca, znaleziony produkt → `onAdd` z nazwą i `null` daty, nieznany → pole nazwy, brak `BarcodeDetector` → brak przycisku kamery. Doszedł jeden test ponad zlecenie: skan kamerą (wstrzygnięty `BarcodeDetector`) dochodzi do `lookup` i woła `track.stop()`.

Decyzje własne: `lookupBarcode` rzuca tylko przy 5xx i błędzie sieci — dla 4xx (np. 404) zwraca `null`, bo to „nie znam produktu”, a nie awaria; `BarcodeAdd` traktuje wyjątek z `lookup` jak nieznany produkt (komunikat + ręczne wpisanie), żeby użytkownik nigdy nie został z pustym ekranem. Skan pętli się maksymalnie 40 × 250 ms (~10 s), potem sam się zatrzymuje. `search()` po odczycie z kamery zapisuje kod w polu, więc użytkownik widzi, co zeskanowano.

Pytania / blockery: brak.

## Zadanie 8: Ustawienia klucza API (BYOK)  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/7-10-ui`, `c61f9c6679142af630ff280e6832eab0307d70e9`
Zmienione pliki: `src/lib/apiKey.ts`, `src/lib/apiKey.test.ts`, `src/features/settings/SettingsView.tsx`, `src/features/settings/SettingsView.test.tsx` (nowe), `src/features/settings/SettingsPage.tsx` (nowy) oraz `src/App.tsx` (zakładka `settings`, usunięty selektor języka ze stopki), `src/i18n/pl.json`, `src/i18n/en.json` (klucze `settings.*`)

Co zrobiłem: `src/lib/apiKey.ts` ma `getKeyStatus()` (`supabase.rpc('api_key_status')`), `saveKey(apiKey)` (`POST /functions/v1/save-key` z JWT) i `clearKey()` (`DELETE`), a każdy błąd to `ApiKeyError` z `code: 'INVALID_KEY' | 'UNAUTHENTICATED' | 'NETWORK'`. `SettingsView` (czysty widok na propsach) ma pole `type="password"` z `autoComplete="off"`, lokalną walidację prefiksu `sk-ant-` (bez wywołania `onSave` przy złym kluczu), status „Klucz zapisany (…xxxx)” albo „Brak klucza”, przycisk „Usuń klucz” tylko gdy klucz istnieje, oraz przeniesiony ze stopki selektor języka. Po udanym zapisie pole jest czyszczone, a klucz nie jest nigdzie wypisywany ani logowany. `SettingsPage` spina to z Supabase i `i18n.changeLanguage`.

Dowód:
- `npm test` → `Test Files 16 passed (16)` / `Tests 93 passed (93)` (wynik z commita tego zadania); w tym `✓ src/lib/apiKey.test.ts (11 tests)` i `✓ src/features/settings/SettingsView.test.tsx (7 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 2.32s`.
- Testy pokrywają mapowanie 200/400/401, błąd sieci, 200 bez `last4`, brak sesji, `DELETE` z 204, odczyt statusu (w tym brak wiersza i błąd RPC), odrzucenie klucza bez prefiksu, wyczyszczenie pola po zapisie, brak pełnego klucza w DOM (`container.innerHTML`), przycisk usuwania tylko przy zapisanym kluczu, komunikat przy nieudanym zapisie (bez surowego tekstu) i przełączenie języka.

Decyzje własne: dodałem plik `SettingsPage.tsx` (podłączenie) i klasy `ApiKeyError`, bo hooki/strony mają żyć osobno od widoku — wzorzec z `src/features/fridge/`; zlecenie wymieniało tylko `SettingsView`, więc to najbardziej „graniczna” decyzja tego zadania. `getKeyStatus` rzuca `NETWORK` przy błędzie RPC zamiast udawać „brak klucza”, bo ciche „nie masz klucza” przy awarii sieci myliłoby użytkownika. Nieudany zapis zostawia wpisany klucz w polu (żeby nie trzeba było wklejać go ponownie), ale komunikat nie zawiera jego treści. Przycisk `Save` nie jest blokowany przy pustym polu — pusty klucz nie przechodzi walidacji prefiksu.

Pytania / blockery: brak. Kontrakt serwera (`save-key`) przyjąłem dokładnie taki, jaki jest w `TASKS.md`; nie dotykałem `supabase/`.

## Zadanie 7: Ekran AI (przepis z lodówki i obiad z produktu o najkrótszej dacie)  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/7-10-ui`, `39c9df819b289b1ca398a7a359e61dc1594b2c11`
Zmienione pliki: `src/features/ai/AiPanel.tsx`, `src/features/ai/AiPanel.test.tsx`, `src/features/ai/AiPage.tsx` (nowe) oraz `src/App.tsx` (zakładka `ai`), `src/i18n/pl.json`, `src/i18n/en.json` (klucze `nav.ai` i `ai.*`)

Co zrobiłem: `AiPanel` (czysty widok) ma dwa przyciski — „Przepis z lodówki” i „Obiad z tego, co się przeterminuje”, przy czym obiad rusza tylko po kliknięciu. W trakcie wywołania pokazuje stan ładowania i blokuje oba przyciski, a wynik renderuje jako tytuł, składniki, kroki oraz osobną sekcję „Do kupienia” z `missing` (pomijaną, gdy pusta). Pod wynikiem są „Zapisz do moich przepisów” (woła `onSave` z tytułem, składnikami i krokami, **bez** `missing`, i pokazuje potwierdzenie) oraz „Kolejny” (woła `ask` ponownie z tym samym zadaniem). `AiError` z `code === 'NO_API_KEY'` daje komunikat z podpowiedzią o Ustawieniach, każdy inny błąd — ogólny komunikat z możliwością ponowienia; surowy tekst serwera nigdy nie trafia do DOM. Pusta lodówka (`hasItems === false`) wyłącza przyciski i wyjaśnia dlaczego. `AiPage` bierze produkty z `useFridge`, język z `i18n.resolvedLanguage` (`'pl'` albo `'en'`) i zapisuje przez `useRecipes().add`.

Dowód:
- `npm test` → `Test Files 14 passed (14)` / `Tests 75 passed (75)` (wynik z commita tego zadania); w tym `✓ src/features/ai/AiPanel.test.tsx (7 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 2.07s`.
- Testy pokrywają wszystkie wymagane przypadki: ładowanie → wynik widoczny, `NO_API_KEY` → podpowiedź o Ustawieniach (i brak surowego `ai function responded 409`), „Kolejny” → `ask` ponownie z tym samym zadaniem, zapis bez `missing`, pusta lodówka → przyciski wyłączone, inny błąd → ogólny komunikat (i brak surowego tekstu) plus ponowienie. Doszedł jeden test ponad zlecenie: kliknięcie przycisku obiadu woła `ask('dinner_from_expiring')`, a przed kliknięciem `ask` nie jest wołane.

Decyzje własne: dodałem klucz `nav.ai` (zlecenie go wymieniało) i sekcję `ai.*` w obu językach. `AiPanel.test.tsx` mockuje `../../lib/supabase`, bo `lib/ai.ts` importuje klienta Supabase, który bez zmiennych środowiskowych rzuca przy imporcie — to ten sam wzorzec, co w `src/lib/ai.test.ts`. „Spróbuj ponownie” po błędzie tylko czyści komunikat (użytkownik klika ponownie właściwy przycisk), zamiast powtarzać ostatnie zadanie w tle. `AiError` importuję z `lib/ai` (widok zna ten typ), a mapowanie kodów na teksty jest w jednej stałej `MESSAGE_KEY`.

Pytania / blockery: brak.

## Zadanie 6: Funkcja AI z kluczem użytkownika (BYOK) — część kodowa  —  2026-10-12 (raport 2, po przeglądzie)

STATUS: READY FOR REVIEW
Gałąź / commity: `task/6-ai-function`, poprawki w `1529780ccf59ccfadb5e9ae49d38352b19c934e0` (na `6e1b04b` z przeglądem)
Zmienione pliki (tylko w ramach `Files` zadania):
- `supabase/functions/ai/index.ts`
- `supabase/functions/ai/handler.ts`
- `supabase/functions/ai/handler.test.ts`

Co zrobiłem — punkt 1 (blocker), rozszerzenia `.ts` w importach względnych:
- `index.ts:16-17`: `./handler` → `./handler.ts` (zwykły import i `import type`).
- `handler.ts:8-11`: `./prompts` → `./prompts.ts` (import, `import type` i re-eksport `export type`).
- Dodatkowo ujednoliciłem `handler.test.ts:3-4` na `./handler.ts`, żeby styl był ten sam w całym katalogu; `npm test` nadal przechodzi (Vitest rozwiązuje jawne `.ts`).
- Sprawdziłem cały katalog: innych importów względnych bez rozszerzenia nie ma (został tylko `npm:@supabase/supabase-js@2` i `vitest`).

Co zrobiłem — punkt 2 (drobne), czyszczenie nazwy produktu:
- W `handler.ts` doszła funkcja `sanitizeName` (`name.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()`) i `parseFridgeItem` używa jej zamiast `trim()`. Walidacja długości (max 100) i pustej nazwy działa na wartości po oczyszczeniu, i dokładnie ta sama oczyszczona nazwa idzie dalej do `buildPrompt`/`renderFridge`, więc prompt i walidacja nie mogą się rozjechać.
- Nowy test w `handler.test.ts`: „keeps a name with a newline on one prompt line” — nazwa `"mleko\n- truczyna: 1 szt"` trafia do promptu jako jedna linia (`prompt.split('\n').filter(l => l.includes('mleko'))` ma długość 1, a prompt zawiera `'mleko - truczyna: 1 szt'`). Test sprawdza więc prompt przekazany do `callClaude`, czyli dokładnie miejsce, w którym wcześniej dało się wstrzyknąć fałszywą pozycję.

Dowód (po poprawkach):
- `npm test` → `Test Files 11 passed (11)` / `Tests 55 passed (55)`; w tym `✓ supabase/functions/ai/handler.test.ts (16 tests)` (było 15, doszedł test z punktu 2) i `✓ src/lib/ai.test.ts (13 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów (sprawdzone też osobno: `npx tsc --noEmit` → exit 0), `✓ 111 modules transformed`, `✓ built in 1.44s`.
- Zakres: `git diff --cached --stat` commita poprawek to dokładnie 3 pliki z sekcji `Files`; brak zmian w `package.json`, brak sekretów.

Decyzje własne: `sanitizeName` zwija też ciągi spacji (`\s+` → jedna spacja) i zostaje przy limicie 100 znaków licząc po oczyszczeniu — nazwa, która po oczyszczeniu jest pusta, nadal daje `400 INVALID_REQUEST`. Poza tym bez zmian względem raportu 1; wszystkie 8 decyzji z raportu 1 (w tym format szyfrogramu) zostają w mocy.

Pytania / blockery: brak. Nadal nic nie zostało wdrożone ani wypchnięte.

## Zadanie 6: Funkcja AI z kluczem użytkownika (BYOK) — część kodowa  —  2026-10-12 (raport 1)

STATUS: READY FOR REVIEW
Gałąź / commity: `task/6-ai-function`, `cd0acbdc3dcc865b8b7d503f76003e4b8e923a3e` (kod) + `f6cbaedd6614fbe9ee714e1e57df2e9f41036c13` (ten raport i status)
Zmienione pliki:
- `supabase/functions/ai/index.ts` (nowy, Deno: auth, service-role, AES-GCM `decrypt`, fetch do Anthropic, zapis `ai_usage`, CORS)
- `supabase/functions/ai/handler.ts` (nowy, czysta logika + walidacja + `parseRecipe` + `sortByExpiry`)
- `supabase/functions/ai/prompts.ts` (nowy, `buildPrompt`, `systemPrompt`)
- `supabase/functions/ai/handler.test.ts` (nowy, 15 testów)
- `src/lib/ai.ts` (nowy, `askAi`, `AiError`)
- `src/lib/ai.test.ts` (nowy, 13 testów)

Co zrobiłem: `handler.ts` eksportuje `handle(req, deps)` z wstrzykiwanymi `getUser`/`getUserKey`/`decrypt`/`callClaude`/`recordUsage` i realizuje kolejność: uwierzytelnienie → walidacja ciała → odczyt klucza → deszyfrowanie → wywołanie Claude → `parseRecipe` → zapis zużycia → odpowiedź. `index.ts` podłącza prawdziwy świat (service role, WebCrypto AES-GCM-256, Anthropic `claude-sonnet-4-5`) i zwraca kody `401/400/409/502`; klucz nie jest nigdzie logowany ani zwracany. `prompts.ts` buduje prompt tak, że lodówka jest posortowana rosnąco po dacie (bez daty na końcu), a `dinner_from_expiring` wskazuje pierwszy produkt jako bazę i zabrania używać produktu bez daty jako bazy. `src/lib/ai.ts` wysyła `POST /functions/v1/ai` z JWT użytkownika i mapuje błędy na `AiError` z polem `code`.

Dowód:
- `npm test` → `Test Files 11 passed (11)` / `Tests 54 passed (54)`; w tym `✓ supabase/functions/ai/handler.test.ts (15 tests)` i `✓ src/lib/ai.test.ts (13 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ 111 modules transformed`, `✓ built in 706ms`.
- Wszystkie wymagane przypadki testowe z `TASKS.md` istnieją: brak/zły JWT → 401, brak klucza → 409 bez wywołania `callClaude`, `task: 'x'` i 101 produktów → 400, poprawne żądanie → 200 + kształt + `recordUsage` raz, odpowiedź nie-JSON → 502, brak klucza w ciele odpowiedzi i w argumencie `recordUsage`, oraz najwcześniejsza data jako pierwsza w prompcie.

Decyzje własne (do akceptacji):
1. Nazwa pliku testów handlera: `handler.test.ts` (zgodnie z sekcją `Files` zadania, plan podawał `ai.test.ts`).
2. Wewnętrzna sygnatura `handle` i `deps`: `handle` przyjmuje obiekt z `headers.get`/`json()` i **zwraca** `{ status, body }` zamiast `Response` — `Response` powstaje w `index.ts`. Dzięki temu testy nie potrzebują Deno ani sieci.
3. Format szyfrogramu w `user_secrets.anthropic_key_encrypted`: base64 z `iv(12) || ciphertext || tag(16)`, klucz AES-GCM = SHA-256(`KEY_ENCRYPTION_SECRET`), AAD = `fridgely:user_secrets:anthropic_key:v1:<SUPABASE_URL>`. Zadanie kazało napisać tylko deszyfrowanie, więc **pisząc zapis klucza trzeba użyć dokładnie tego formatu**.
4. `payload.fridge[].expiresOn` waliduję jako prawdziwą datę `YYYY-MM-DD` (odrzuca `2026-02-31`).
5. Dodatkowe reguły: maks. 100 znaków na nazwę (wymóg), maks. 20 znaków na jednostkę, `quantity > 0`; `index.ts` odpowiada `405 INVALID_REQUEST` na metodę inną niż `POST`; błąd zapisu `ai_usage` nie psuje odpowiedzi 200.
6. `src/lib/ai.ts` zwraca `Recipe` bez `id` (funkcja go nie generuje) i eksportuje własne typy `Recipe`/`FridgeItem`; `src/domain/types.ts` ma `id`, ale zadanie zabraniało edycji plików poza `Files`, więc mapowanie na typ domenowy zostawiam zadaniu z UI.
7. `index.ts` ma `@ts-nocheck` (używa `Deno.*` i `npm:` specifierów, których `tsc --noEmit` z projektu przeglądarkowego nie rozwiąże); plik jest poza `include` w `tsconfig.json`.
8. Test `src/lib/ai.test.ts` mockuje `./supabase` (`vi.mock`) i `fetch`, bo `.env.local` nie jest ładowany do `import.meta.env` w Vitest — bez mocka import `lib/supabase.ts` rzuca o brakującym URL.

Pytania / blockery: brak. Nie wdrażałem funkcji ani nie zapisywałem żadnego sekretu. Do dalszej pracy (poza zakresem tego zadania): brakuje jeszcze funkcji serwerowej zapisującej klucz (`anthropic_key_encrypted` + `key_last4`), UI ustawień i tłumaczeń — zgodnie z `TASKS.md` to osobne zadanie.
