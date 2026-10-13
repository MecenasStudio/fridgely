# Raporty wykonawcy

Nowe wpisy dodawaj na górze, według szablonu z `docs/collab/README.md`.

## Zadanie 24: Reset hasła  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/18-24-photo`, `c25a0768420d27f1d7b4e4e726280ac5b465d9c5`
Zmienione pliki: `src/features/auth/AuthGate.tsx`, `src/features/auth/AuthGate.test.tsx`, `src/i18n/pl.json`, `src/i18n/en.json`

Co zrobiłem: w formularzu logowania jest link `auth.forgotPassword`, który woła `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })`. Pusty e-mail daje walidację `auth.resetNeedsEmail` i **nie** woła serwera, a każda inna odpowiedź (także błąd) kończy się tym samym komunikatem `auth.resetSent` w `role="status"` — ekran nie zdradza, czy konto istnieje. Nowy hook `usePasswordRecovery` nasłuchuje `PASSWORD_RECOVERY` z `onAuthStateChange` i pokazuje `PasswordResetForm` (dwa pola, min. 6 znaków, zgodność haseł) wołający `supabase.auth.updateUser({ password })`; po sukcesie widać `auth.passwordSaved` i użytkownik wchodzi do aplikacji, a błąd daje `auth.passwordFailed` bez surowego tekstu serwera. Walidacja dzieje się przed `updateUser`.

Dowód:
- `npm test` → `Test Files 24 passed (24)` / `Tests 188 passed (188)` (przed tym zadaniem 183/24); `✓ src/features/auth/AuthGate.test.tsx (9 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 2.10s`.
- Testy (zamockowany klient, `vi.hoisted` + `vi.mock`): wysłanie resetu z `redirectTo: window.location.origin`, walidacja pustego e-maila (bez wywołania `resetPasswordForEmail`), formularz po `PASSWORD_RECOVERY` i zapis nowego hasła, niezgodne hasła i za krótkie hasło nie wołają `updateUser`, nieudana zmiana pokazuje komunikat ogólny (`weak password rejected` nieobecne w DOM). Zdarzenia auth wysyłam w `act(...)`, żeby nie było ostrzeżeń Reacta.
- Dotychczasowe testy `AuthGate` (brak renderu przy nieznanej sesji, formularz bez sesji, dzieci z sesją, reakcja na `SIGNED_IN`) zostały i przechodzą.

Decyzje własne: po zmianie hasła pokazuję potwierdzenie nad aplikacją (`AuthGate` renderuje dzieci w fragmencie), zamiast osobnego ekranu „gotowe" z przyciskiem. `PasswordResetForm` eksportuję z `AuthGate.tsx`, żeby dało się go testować bez kombinowania z sesją. Formularz resetu nie ma przycisku „wyloguj" ani powrotu — Supabase kończy tryb odzyskiwania sam po zmianie hasła. Nie zmieniałem `main.tsx` ani `App.tsx`; nowe klucze tylko w `pl.json` i `en.json`.

Pytania / blockery: brak.

## Zadanie 23: PWA (instalacja na telefonie) i język dokumentu  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/18-24-photo`, `e8df32634aca3f17e5cb735f85bee836f8706f42`
Zmienione pliki: `public/manifest.webmanifest` (nowy), `public/icon.svg` (nowy), `index.html` (3 linie w `<head>`), `src/i18n/index.ts`, `src/i18n/lang.test.ts` (nowy)

Co zrobiłem: manifest ma `name`/`short_name` „Fridgely", `start_url` i `scope` `/`, `display: "standalone"`, `background_color` `#f6f7f9`, `theme_color` `#1f6f4a` oraz ikonę `icon.svg` z `sizes: "any"` i `purpose: "any maskable"`. Ikona to zaokrąglony kwadrat z literą F, narysowany ręcznie w SVG. W `index.html` dodałem tylko `<link rel="manifest">`, `<meta name="theme-color">` i `<link rel="icon">`. W `src/i18n/index.ts` doszła funkcja `applyDocumentLanguage`, która ustawia `document.documentElement.lang` na `pl` dla tagów zaczynających się od `pl` i na `en` dla reszty — wołana raz przy starcie i przy każdym `languageChanged`.

Dowód:
- `npm test` → `Test Files 24 passed (24)` / `Tests 183 passed (183)` (przed tym zadaniem 181/23); `✓ src/i18n/lang.test.ts (2 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 352ms`; w `dist/` są `manifest.webmanifest` (439 B) i `icon.svg` (288 B), a `dist/index.html` zawiera wszystkie trzy nowe elementy — czyli pliki faktycznie trafiają do builda, nie tylko leżą w repo.
- Test języka: `pl` → `lang="pl"`, `en` → `lang="en"`, `pl-PL` → `pl`, `de` → `en`.

Decyzje własne: nie ma service workera ani cache'owania (zgodnie ze zleceniem), więc instalacja działa, ale offline nie. Nie dodawałem plików PNG w różnych rozmiarach — jeden SVG z `sizes: "any"` i `purpose: "any maskable"` obsługuje oba przypadki, a grafika jest wektorowa. `orientation: "portrait-primary"` i `lang: "en"` w manifeście to wartości domyślne; `lang` dokumentu i tak ustawia i18n. Tła motywu wziąłem z `src/styles.css`, żeby pasek systemowy nie odcinał się od aplikacji.

Pytania / blockery: nie mogę potwierdzić instalacji na prawdziwym telefonie — headless Chrome w tym środowisku nie startuje. Sprawdziłem tylko, że manifest i ikona są poprawnie serwowane w buildzie.

## Zadanie 22: Scalanie powtarzających się produktów  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/18-24-photo`, `c631ebfdb10d8206806f6003cd834f9a6ff77f44`
Zmienione pliki: `src/domain/fridge.ts` (+ `MergeCandidate`, `findMergeTarget`), `src/domain/fridge.test.ts`, `src/features/fridge/useFridge.ts`

Co zrobiłem: `findMergeTarget(items, candidate)` zwraca produkt o tej samej znormalizowanej nazwie, tej samej jednostce **i tej samej dacie** (`null` równa się tylko `null`), albo `null`. `useFridge.add` najpierw szuka celu scalenia: jeśli jest, robi `update` z `quantity = istniejąca + dodawana`, w przeciwnym razie wstawia nowy wiersz. Dzięki temu „Dodaj wszystko" ze zdjęcia, kod kreskowy i zwykły formularz nie tworzą duplikatów.

Dowód:
- `npm test` → `Test Files 23 passed (23)` / `Tests 181 passed (181)` (przed tym zadaniem 177/23); `✓ src/domain/fridge.test.ts (7 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 338ms`.
- Testy domenowe: ta sama nazwa z inną wielkością liter i dodatkowymi spacjami, `null` vs data w obie strony, inna jednostka → brak scalenia, inna data → brak scalenia, pusta lodówka → `null`.

Decyzje własne: data jest częścią tożsamości produktu, bo „mleko bez daty" i „mleko do piątku" to dla planowania dwa różne zapasy — opisałem to w komentarzu przy funkcji. Dodatkowo znormalizowałem `quantity` przez `Number(...)` przy scalaniu, bo Supabase potrafi zwrócić `numeric` jako string. Świadomie nie zmieniałem `useShopping.addMany` ani przenoszenia kupionych: one też korzystają z `useFridge.add`, więc scalanie działa tam automatycznie (to domyka uwagę (b) z przeglądu 11–17).

Pytania / blockery: brak.

## Zadanie 21: Dodawanie ze zdjęcia w lodówce  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/18-24-photo`, `f2eef1d9e58247cf3219ff31067201fdb140dc3d`
Zmienione pliki: `src/features/fridge/PhotoImport.tsx` + `PhotoImport.test.tsx` (nowe), `src/features/fridge/FridgeView.tsx`, `FridgeView.test.tsx`, `src/features/fridge/FridgePage.tsx`, `src/i18n/pl.json`, `src/i18n/en.json`

Co zrobiłem: `PhotoImport` ma pole `<input type="file" accept="image/*" capture="environment">` („Dodaj ze zdjęcia"); po wyborze pliku robi `prepare` → `recognize` i pokazuje **edytowalną listę** (nazwa, ilość, jednostka, data, „usuń z listy"). Nic nie trafia do lodówki bez kliknięcia „Dodaj wszystko", które woła `onAdd` dla każdego pozostałego wiersza. Brak rozpoznanych produktów → komunikat `photo.empty` i możliwość dodania ręcznego (formularz i kod kreskowy są obok), `NO_API_KEY` → `photo.noKey`, `UNAUTHENTICATED` → `photo.sessionExpired`, inne błędy → `photo.failed`, ładowanie w `role="status"`, błędy w `role="alert"`. Osobny przycisk `ReadDateButton` przy każdym produkcie otwiera drugie pole pliku: wynik `null` → `photo.noDate`, sukces → pokazuje odczytaną datę i zapisuje ją dopiero po kliknięciu „Zapisz datę" (`onUpdateDate`). `FridgePage` wstrzykuje prawdziwe `recognizePhoto`/`readLabelDate` i język; `prepare` domyślnie woła `prepareImage` (dynamiczny import, żeby testy nie potrzebowały canvasu).

Dowód:
- `npm test` → `Test Files 23 passed (23)` / `Tests 177 passed (177)` (przed tym zadaniem 168/22); `✓ src/features/fridge/PhotoImport.test.tsx (9 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 2.11s`.
- Testy (wszystko wstrzyknięte, bez sieci): lista edytowalna + „Dodaj wszystko" woła `onAdd` dla każdej pozycji z poprawioną nazwą, usunięta pozycja nie jest dodana, pusty wynik → komunikat bez przycisku, mapowanie trzech klas błędów (z surowym tekstem nieobecnym w DOM), nieudane dodanie zostawia listę, odczyt daty zapisuje się dopiero po potwierdzeniu, brak daty i nieudany zapis, stan ładowania, obecność pól wiersza.

Decyzje własne: po nieudanym dodaniu zostawiam listę i pola bez zmian (ponowienie to jedno kliknięcie) — spójne z zasadą z poprzedniej paczki. Wybór produktu do odczytu daty trzyma `FridgeView` (`dateTarget`), bo przycisk jest przy wierszu, a panel z polem pliku jeden. Po zapisaniu daty czyszczę odczytany stan. Do `FridgeView.test.tsx` doszedłem tylko z mockiem `lib/supabase` — `PhotoImport` importuje `lib/ai.ts`, które bez zmiennych środowiskowych rzuca przy imporcie; to ten sam wzorzec, co w pozostałych testach widoków.

Pytania / blockery: brak.

## Zadanie 20: Klient zdjęć  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/18-24-photo`, `df2afd67438e0624a54867157917f83bcb2ea0a4`
Zmienione pliki: `src/lib/ai.ts` (rozszerzony), `src/lib/ai.test.ts`, `src/lib/image.ts` (nowy), `src/lib/image.test.ts` (nowy)

Co zrobiłem: `recognizePhoto(image, locale)` i `readLabelDate(image, locale)` w `src/lib/ai.ts` używają tego samego transportu co `askAi` (wydzieliłem prywatne `callAi`, więc mapowanie kodów, brak sesji i błędy sieci są wspólne) i tego samego `AiError`. `AiTask` rozszerzyłem o dwa zadania zdjęciowe, dodałem `PhotoPayload`, `ImageMediaType` i `DetectedItem`. `image.ts` eksportuje czystą `fitWithin(width, height, max)` (bez powiększania, proporcje zachowane, zaokrąglenie do pełnych pikseli, zero dla złych wymiarów) oraz `prepareImage(file, deps)`, która dekoduje (domyślnie `createImageBitmap`), skaluje do 1280 px dłuższego boku, koduje JPEG 0.8 przez canvas i zwraca base64 bez prefiksu `data:`.

Dowód:
- `npm test` → `Test Files 22 passed (22)` / `Tests 168 passed (168)` (przed tym zadaniem 151/21); `✓ src/lib/image.test.ts (10 tests)`, `✓ src/lib/ai.test.ts (20 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 336ms`.
- Testy `fitWithin`: poziome, pionowe, mniejsze niż limit (bez powiększania), kwadrat, zero/NaN, cienki obraz (nie zapada się do 0 px). Testy `prepareImage`: dekodowanie → skala → JPEG z jakością 0.8 i base64 bez prefiksu (bajty sprawdzone przez `atob`), obraz mieszczący się bez zmian, zerowy rozmiar → błąd bez kodowania. Testy klienta: kształt żądania dla obu zadań, zwrot listy/daty, `null` z etykiety, odrzucenie uszkodzonej listy i złego ciała, mapowanie `NO_API_KEY`/`INVALID_REQUEST`.

Decyzje własne: `prepareImage` przyjmuje `deps` (`decode`/`encode`) jako drugi argument, a `PhotoImport` dostaje `prepare` w propsach — dzięki temu testy widoku nie potrzebują canvasu ani `createImageBitmap`. Rozdzielenie na `image.ts` trzyma `ai.ts` bez zależności od DOM. Base64 koduję porcjami po 8192 bajty, żeby nie przekroczyć limitu argumentów `String.fromCharCode`. Nie dodawałem żadnej zależności do kodowania obrazów.

Pytania / blockery: brak.

## Zadanie 19: Funkcja `ai`, zadanie `read_label_date`  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/18-24-photo`, `8cb10e1c9f864dc566147dae73c185af755a73cd`
Zmienione pliki: `supabase/functions/ai/handler.test.ts` (walidacja i prompt zadania pochodzą z commita zadania 18, patrz „Decyzje własne")

Co zrobiłem: `read_label_date` przyjmuje ten sam kształt `image` i te same limity co `recognize_photo`, a zwraca `{ expiresOn: string | null }`. Prompt (`imagePrompt`) każe szukać „najlepiej spożyć przed", „termin przydatności do spożycia", „use by", „best before"; gdy dat jest kilka — wybrać datę przydatności, nigdy daty produkcji; akceptuje `dd.mm.rrrr`, `dd/mm/rr`, `rrrr-mm-dd` i `mm.rrrr` (dla miesiąca bez dnia: ostatni dzień miesiąca); bez czytelnej daty → `null`, bez zgadywania. Wynik przechodzi przez `parseLabelDate`, który przyjmuje tylko prawdziwą datę `YYYY-MM-DD` albo `null` — data niepoprawna z modelu (np. `2026-02-31`, `30.11.2026`, pusty string) staje się `null`, a nie błędem ani zgadywaniem. Nie-JSON → `502`.

Dowód:
- `npm test` → `Test Files 21 passed (21)` / `Tests 151 passed (151)` (przed tym zadaniem 145/21); `✓ supabase/functions/ai/handler.test.ts (30 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 2.35s`.
- Testy: odczytana data → 200 + `recordUsage` z `task: 'read_label_date'`, `null` i brak pola → 200 `{ expiresOn: null }`, trzy warianty niepoprawnej daty → `null`, odpowiedź tekstowa → 502, trzy błędne żądania (brak `image`, zły `mediaType`, spacja w base64) → 400 **bez** wywołania `claude`, oraz kontrola treści promptu (frazy o dacie przydatności i formatach) i obecność obrazu w wywołaniu.

Decyzje własne: parser, prompty i obsługa obu zadań zdjęciowych powstały w zadaniu 18, bo handler i prompty są wspólne dla obu — zadanie 19 dostarczyło więc walidację zachowania (i poprawki, jeśli testy coś wykryły; nie wykryły). Data z modelu w formacie `30.11.2026` celowo daje `null`, a nie konwersję: prompt wymaga `YYYY-MM-DD`, a przepisywanie formatów po stronie serwera byłoby zgadywaniem, którego specyfikacja zabrania. `expiresOn` spoza typu string (np. liczba) jest traktowane jak brak daty.

Pytania / blockery: brak.

## Zadanie 18: Funkcja `ai`, zadanie `recognize_photo`  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/18-24-photo`, `a89896c3d1984209ecb7fa5eba6a5dac48eb9d30`
Zmienione pliki: `supabase/functions/ai/handler.ts`, `prompts.ts`, `index.ts`, `handler.test.ts`

Co zrobiłem: handler rozpoznaje cztery zadania (`AiRequest` i `AiResponse` to teraz unie), a `recognize_photo` przyjmuje `payload.image` = `{ mediaType: 'image/jpeg'|'image/png'|'image/webp', data }` z czystym base64: długość ≤ 7 000 000 znaków, poprawność base64 sprawdzana porcjami po 8192 znaki (jeden regex na 7 MB potrafi wybuchnąć), zły `mediaType`, prefiks `data:`, znaki spoza base64 i brak `image` → `400 INVALID_REQUEST` bez wywołania Claude. Wynik przechodzi przez `parseDetectedItems`: brak/ujemna ilość → `1`, brak jednostki → `szt`, data nieczytelna lub niepoprawna → `null`, nazwa czyszczona tym samym `sanitizeName` co dziś i przycinana do 100 znaków, jednostka do 20, a ponad 50 pozycji jest **obcinane do 50** (wybór opisany niżej). `index.ts` wysyła obraz jako pierwszy blok `{ type: 'image', source: { type: 'base64', media_type, data } }`, potem tekst; obraz nie jest logowany, zapisywany ani zwracany, a `ai_usage` dostaje tylko `user_id`, `task` i tokeny.

Dowód:
- `npm test` → `Test Files 21 passed (21)` / `Tests 145 passed (145)` (przed tym zadaniem 138/21); `✓ supabase/functions/ai/handler.test.ts (24 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 4.01s`.
- Testy: poprawne zdjęcie → 200 z pozycjami i `recordUsage` z `task: 'recognize_photo'`, sześć błędnych `image` → 400 bez wywołania Claude, naprawianie niechlujnych pól (nazwa z nową linią i spacjami, `quantity: -3`/`"duzo"`, pusty i za długi `unit`, `2026-02-31`), `60` pozycji → `50`, trzy kształty nie-JSON → 502, obraz i klucz nieobecne w odpowiedzi i w argumencie `recordUsage`. Wszystkie testy zadań przepisowych przechodzą bez zmian.

Decyzje własne: przy ponad 50 pozycjach **obcinam do 50** zamiast zwracać 502 — model zwykle nie przekracza limitu, a gdy to zrobi, lista 50 produktów jest dla użytkownika użyteczna, a nie jest to błąd modelu. Nazwa dłuższa niż 100 znaków jest przycinana (a nie odrzucana), bo to wynik modelu, nie dane użytkownika; surowe odrzucenie psułoby całe zdjęcie z powodu jednego długiego napisu. Wartości `expiresOn` spoza `YYYY-MM-DD` stają się `null` — nigdy nie zgadujemy dat. Walidacja żądania (twarde limity) i naprawianie wyniku (miękkie) to celowo dwa różne tryby.

Pytania / blockery: brak.

## Zadanie 17: README  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/11-17-polish`, `2dddf70cab64315f18645ee99d2988944875ddd2`
Zmienione pliki: `README.md` (nowy, 179 linii)

Co zrobiłem: napisałem `README.md` w dwóch sekcjach językowych (najpierw „Polski”, potem „English”) z linkami-spisem treści na górze. Każda sekcja opisuje: czym jest Fridgely, listę funkcji (lodówka, przepisy, plan, zakupy, AI/BYOK, ustawienia, dom), stack, wymagania, uruchomienie lokalne (`npm install`, `.env.local` z `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`, `npm run dev`, `npm test`, `npm run build`), strukturę katalogów (`src/domain`, `src/features`, `src/lib`, `supabase/migrations`, `supabase/functions`), bazę (migracje po kolei i test RLS `supabase/tests/rls.sql` z wyjaśnieniem, że udany przebieg kończy się `ERROR P0001: RLS_TEST_OK`), obie funkcje Edge w tabeli z kodami błędów, wymagane sekrety funkcji (`KEY_ENCRYPTION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — bez żadnych wartości) oraz model BYOK w trzech krokach. Na końcu odsyłacz do `docs/collab/`.

Dowód:
- `npm test` → `Test Files 21 passed (21)` / `Tests 138 passed (138)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 2.63s`.
- `Select-String README.md -Pattern 'sk-ant-|eyJ|supabase\.co/[a-z]|KEY_ENCRYPTION_SECRET='` → 0 trafień: w README nie ma klucza, tokenu ani prawdziwego adresu projektu (występuje tylko placeholder `https://<your-project>.supabase.co`).
- Zakres: jedyny zmieniony plik to `README.md` — dokładnie jak w `Files`.

Decyzje własne: sekcje PL i EN są pełne, ale nie są dosłownym tłumaczeniem jeden do jednego (EN czyta się jako samodzielny dokument). Wymieniłem `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` obok `KEY_ENCRYPTION_SECRET`, bo bez nich funkcje nie wystartują, a w `TASKS.md` jako obowiązkowy był podany tylko pierwszy — napisałem, że Supabase dostarcza te dwie automatycznie.

Pytania / blockery: brak.

## Zadanie 16: Testy integracyjne powłoki aplikacji  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/11-17-polish`, `f6d200fd67a6aa301adc11e686f7ba7f4481d090`
Zmienione pliki: `src/App.test.tsx` (nowy, 5 testów), `src/features/auth/AuthGate.test.tsx` (nowy, 4 testy) oraz — zobacz „Decyzje własne” — `src/features/auth/AuthGate.tsx` i `src/i18n/pl.json`, `src/i18n/en.json`

Co zrobiłem: w obu plikach zamockowałem `lib/supabase` przez `vi.mock` + `vi.hoisted` (jedno miejsce trzyma stan sesji, wiersz `members`, wiersz `households` oraz łańcuch zapytań `select/eq/in/order/limit/maybeSingle/single`, `rpc`, `channel`), więc testy działają bez sieci. `App.test.tsx` pokrywa cztery punkty zlecenia: (a) niezalogowany widzi formularz logowania, a nieudane logowanie daje komunikat, (b) zalogowany bez domu widzi ekran tworzenia/dołączania, (c) zalogowany z domem widzi wszystkie sześć zakładek i przełączanie renderuje właściwe sekcje (sprawdzane po nagłówku `h2`, plus obecność selektora języka w Ustawieniach), (d) „Wyloguj” woła `auth.signOut`. `AuthGate.test.tsx` dodaje to, czego nie widać z `App`: brak renderu, dopóki sesja jest nieznana, formularz bez sesji, dzieci z sesją oraz reakcję na `onAuthStateChange`.

Dowód:
- `npm test` → `Test Files 21 passed (21)` / `Tests 138 passed (138)` (przed tym zadaniem 129/19); w tym `✓ src/App.test.tsx (5 tests)` i `✓ src/features/auth/AuthGate.test.tsx (4 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 505ms`.
- Zakres: kod produkcyjny zmieniony tylko w `AuthGate.tsx` (patrz niżej); reszta to pliki testowe z `Files`.

Decyzje własne (minimalna poprawka kodu, o której zlecenie mówi „wtedy opisz w raporcie i popraw minimalnie”):
1. **Test ujawnił brakujący klucz tłumaczenia.** Zakładka AI renderowała się jako `nav.ai` (dosłowny klucz), bo `nav.ai` nigdy nie został dodany do `pl.json`/`en.json` — test parzystości kluczy tego nie łapie, bo brakuje go w obu plikach. Dodałem `nav.ai` = „AI” w obu językach. To naprawia widoczną wadę interfejsu z zadania 7.
2. **`AuthGate` pokazywał surowy komunikat Supabase** (`error.message`, np. „Invalid login credentials”), co łamie zasadę batcha „nigdy nie pokazuj surowych komunikatów serwera”. Dodałem klucz `auth.failed` („Nie udało się zalogować…” / „Could not sign you in…”) i `role="alert"`; surowy tekst nie trafia już do DOM (test to sprawdza).
3. W teście zakresu zakładek szukam przycisków wewnątrz elementu `nav`, bo przyciski „AI” i „Ustawienia” mają tę samą nazwę dostępną co nagłówki sekcji — inaczej `getByRole` zwracałoby dwa elementy.
4. `AuthGate.test.tsx` używa `new Promise(() => {})` do sprawdzenia stanu „sesja nieznana”, więc ten test celowo nie czeka na rozstrzygnięcie.

Pytania / blockery: brak.

## Zadanie 15: Kupione z listy do lodówki  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/11-17-polish`, `571d19bb23d7757e610d673277238acd344a0f90`
Zmienione pliki: `src/domain/shopping.ts` (+ `NewFridgeRow`, `purchasedToFridge`), `src/domain/shopping.test.ts`, `src/features/shopping/ShoppingView.tsx`, `ShoppingView.test.tsx`, `ShoppingPage.tsx`, `useShopping.ts` (+ `deleteByIds`), `src/i18n/pl.json`, `src/i18n/en.json`

Co zrobiłem: `purchasedToFridge(items)` zwraca tylko wiersze z `checked: true`, w kolejności wejściowej, z nazwą przez `normalizeName` i `expiresOn: null` (typ `NewFridgeRow` to `Omit<FridgeItem, 'id'>` ze `expiresOn: null`, więc wynik wchodzi w `useFridge.add` bez rzutowania). `useShopping` ma `deleteByIds(ids)` (`delete().in('id', ids)`, nic nie robi dla pustej listy). `ShoppingView` dostał `onMoveChecked()` i pokazuje „Przenieś kupione do lodówki” tylko gdy coś jest odhaczone, z potwierdzeniem `shopping.moved` (`role="status"`) i błędem `shopping.moveFailed` (`role="alert"`). `ShoppingPage.moveChecked` najpierw dodaje **wszystkie** produkty do lodówki, a dopiero po sukcesie wszystkich usuwa odhaczone wiersze; przy błędzie nic nie jest usuwane.

Dowód:
- `npm test` → `Test Files 19 passed (19)` / `Tests 129 passed (129)` (przed tym zadaniem 124/19); w tym `✓ src/domain/shopping.test.ts (6 tests)` i `✓ src/features/shopping/ShoppingView.test.tsx (5 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 451ms`.
- Testy domenowe: tylko odhaczone, kolejność zachowana, `Mleko ` → `mleko`, pusta lista i lista bez odhaczonych → `[]`. Testy widoku: przycisk ukryty bez odhaczeń / widoczny z odhaczeniem, wywołanie i potwierdzenie, alert przy błędzie z zachowaną listą i przyciskiem.

Decyzje własne: dodałem typ `NewFridgeRow`, żeby `expiresOn: null` było widoczne w typie wyniku. Świadomie nie dodaję `id` do wiersza lodówki i nie scalam duplikatów: jeśli ten sam produkt jest już w lodówce, po przeniesieniu będą dwa wiersze (kolejność i dane użytkownika nie giną, a scalanie nazw to osobna decyzja projektowa). „Przenieś kupione” nie jest blokowane, gdy lista jest pusta — przycisk wtedy nie istnieje, a funkcja i tak kończy się natychmiast.

Pytania / blockery: brak.

## Zadanie 14: Edycja produktu w lodówce  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/11-17-polish`, `f7c394dd9da5de9f0781ddccb23c48521593cd8a`
Zmienione pliki: `src/features/fridge/FridgeView.tsx`, `src/features/fridge/FridgeView.test.tsx`, `src/i18n/pl.json`, `src/i18n/en.json`

Co zrobiłem: każdy wiersz lodówki ma teraz pole liczbowe z ilością i pole daty ważności. Ilość zapisuje się na `blur` albo Enter, tylko gdy wartość jest liczbą `> 0` i różni się od zapisanej — inaczej pole wraca do wartości z bazy (bez wywołania `onUpdate`); przecinek dziesiętny jest akceptowany. Data jest edytowalna także dla produktów, które już ją mają, a wyczyszczenie pola zapisuje `null`. Oba pola mają `aria-label` z nazwą produktu (`Quantity: Mleko`, `Expiry date: Mleko`), więc wiersze są rozróżnialne. Każdy zapis idzie przez jedną lokalną funkcję `update`, która przy błędzie pokazuje `fridge.updateFailed` w `role="alert"` przy tym wierszu.

Dowód:
- `npm test` → `Test Files 19 passed (19)` / `Tests 124 passed (124)` (przed tym zadaniem 119/19); `✓ src/features/fridge/FridgeView.test.tsx (9 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 2.51s`.
- Testy: zapis nowej ilości na blur i na Enter, odrzucenie `0` i `-5` z przywróceniem wartości, brak zapisu przy niezmienionej wartości, zmiana daty i jej wyczyszczenie do `null`, komunikat przy nieudanym zapisie. Stare testy widoku (sortowanie, „Expired”, „Add expiry date”, pusty stan, dodawanie) nadal przechodzą bez zmian.

Decyzje własne: wspólny przycisk „×” do usuwania zostawiłem po staremu (bez potwierdzenia) — potwierdzenie usuwania było wymagane tylko dla przepisów w zadaniu 12. Data bez statusu „unknown” nie ma już osobnej etykiety „Uzupełnij datę ważności”, ale sama prośba o datę nadal się pokazuje dla produktów bez daty, więc wymóg z zadania 12 (i spec) jest spełniony. Pole daty pokazuje wartość z bazy, a nie lokalny stan, więc po zapisie widać wynik z serwera.

Pytania / blockery: brak.

## Zadanie 13: Braki z przepisu AI na listę zakupów  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/11-17-polish`, `3442e6fa509fb6bcfe8ded2f95d8c439a7cc61d5`
Zmienione pliki: `src/features/ai/AiPanel.tsx`, `src/features/ai/AiPanel.test.tsx`, `src/features/ai/AiPage.tsx`, `src/features/shopping/useShopping.ts`, `src/i18n/pl.json`, `src/i18n/en.json`

Co zrobiłem: `AiPanel` ma nowy opcjonalny prop `onAddMissing(names: string[])`. Gdy w wyniku AI jest niepuste `missing`, pod listą „Do kupienia” pojawia się przycisk `ai.addMissing`; po sukcesie pokazuje `ai.missingAdded` (`role="status"`), a przy błędzie `ai.addMissingFailed` (`role="alert"`) i przycisk zostaje, więc ponowienie to jedno kliknięcie. `useShopping` dostał `addMany(list: Ingredient[])`, który wstawia wiersze bez kasowania istniejących (w przeciwieństwie do `replaceAll`), a `AiPage` mapuje nazwy na `{ name, quantity: 1, unit: 'szt' }`.

Dowód:
- `npm test` → `Test Files 19 passed (19)` / `Tests 119 passed (119)` (przed tym zadaniem 116/19); `✓ src/features/ai/AiPanel.test.tsx (12 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 371ms`.
- Testy: przycisk ukryty przy pustym `missing` (i `onAddMissing` niewołane), wywołanie z `['masło']` plus potwierdzenie, alert przy błędzie z surowym tekstem nieobecnym w DOM i przyciskiem nadal na ekranie.

Decyzje własne: `onAddMissing` jest opcjonalny (zgodnie ze zleceniem „nowy opcjonalny prop”), więc `AiPanel` bez niego — np. w starszych testach — po prostu nie pokazuje przycisku. Dodałem `addMany` do `useShopping` zamiast nowego hooka, bo lista zakupów jest już jego odpowiedzialnością; nie zmieniałem `replaceAll` ani generowania listy z planu. Nazwy idą do listy w takiej postaci, w jakiej zwrócił je model (bez normalizacji) — normalizacja jest w `buildShoppingList`, a tu użytkownik widzi dokładnie to, co wygenerowało AI.

Pytania / blockery: brak.

## Zadanie 12: Widoczne kroki przepisu  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/11-17-polish`, `e6da7e73863c1ef264d4771ac71782f186c6c9f8`
Zmienione pliki: `src/features/recipes/RecipesView.tsx`, `src/features/recipes/RecipesView.test.tsx` (nowy), `src/i18n/pl.json`, `src/i18n/en.json`

Co zrobiłem: każdy przepis z niepustą listą kroków pokazuje `<details>` z podsumowaniem `recipes.showSteps` („Pokaż kroki” / „Show steps”) i numerowaną listą kroków; przepis bez kroków nie renderuje niczego dodatkowego. Usuwanie to teraz dwa kliknięcia w ten sam przycisk: pierwsze uzbraja go i zmienia etykietę na `recipes.confirmDelete` („Na pewno?” / „Really delete?”), drugie wywołuje `onDelete`. Utrata fokusu (`blur`) i Escape rozbrajają przycisk. Dodałem też komunikaty `recipes.addFailed` i `recipes.deleteFailed` w `role="alert"`, bo oba zapisy szły wcześniej bez obsługi błędu.

Dowód:
- `npm test` → `Test Files 19 passed (19)` / `Tests 116 passed (116)` (przed tym zadaniem 111/18); `✓ src/features/recipes/RecipesView.test.tsx (5 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 340ms`.
- Testy: kroki widoczne wewnątrz `details` w kolejności, brak `details` przy pustych krokach, jedno kliknięcie nie woła `onDelete` a drugie woła (`r1`), anulowanie Escape i `blur`, komunikaty przy nieudanym usunięciu i dodaniu.

Decyzje własne: zamiast osobnego przycisku „Tak, usuń” użyłem tego samego przycisku z nową etykietą i `aria-label`, bo wymóg mówił „dwuetapowy przycisk”. `window.confirm` nie jest używany. Recepta bez kroków nie dostaje pustego `details` (zgodnie ze zleceniem). Komunikaty błędów dodałem w tym samym zadaniu, bo dotyczy on tego pliku, a zasada batcha wymaga widocznego błędu zamiast nieobsłużonego odrzucenia.

Pytania / blockery: brak.

## Zadanie 11: Obsługa błędów (poprawki z przeglądu)  —  2026-10-12

STATUS: READY FOR REVIEW
Gałąź / commity: `task/11-17-polish`, `951b280bf0f115162d4b40b5df396c4bf7d6ffaf`
Zmienione pliki: `src/features/ai/AiPanel.tsx`, `AiPanel.test.tsx`, `src/features/settings/SettingsView.tsx`, `SettingsView.test.tsx`, `src/features/fridge/BarcodeAdd.tsx`, `BarcodeAdd.test.tsx`, `src/i18n/pl.json`, `src/i18n/en.json`

Co zrobiłem — po kolei punkty przeglądu:
1. `AiPanel.save` ma `try/catch`: przy błędzie `onSave` pokazuje `ai.saveFailed` w `role="alert"`, **zostawia przepis na ekranie** (ponowienie to jedno kliknięcie) i nie kończy się nieobsłużonym odrzuceniem.
2. `SettingsView.onClear` jest w `try/catch` z `settings.clearFailed`; `onSave` rozróżnia błędy po polu `code` (`errorCodeOf`, bez importu czegokolwiek z sieci): `INVALID_KEY` → `settings.keyRejected`, każdy inny → `settings.saveFailed`. Dodałem też `settings.saving` w `role="status"`.
3. `BarcodeAdd.add` przy błędzie `onAdd` pokazuje `fridge.addFailed`, nie czyści kodu ani daty i **przekazuje błąd dalej** (`throw`), żeby `ManualName` też zachował wpisaną nazwę; oba przyciski mają swój komunikat, a `ManualName` ma własny stan `failed`.
4. `AiPanel` mapuje teraz `NO_API_KEY` → `ai.noKey`, a `UNAUTHENTICATED` → `ai.sessionExpired` („Sesja wygasła. Zaloguj się ponownie.”).
5. Komunikaty ładowania/potwierdzenia są w `role="status"` (`ai.loading`, `ai.saved`, `fridge.barcodeSearching`, `settings.saving`), a wszystkie błędy w `role="alert"`. W `BarcodeAdd` przycisk „Szukaj” nadal pokazuje `fridge.barcodeSearching`, ale stan ładowania ma teraz osobny akapit ze statusem, więc informacja jest dostępna także dla czytnika ekranu.

Dowód:
- `npm test` → `Test Files 18 passed (18)` / `Tests 111 passed (111)` (przed tym zadaniem 105/18); w tym `✓ src/features/ai/AiPanel.test.tsx (9 tests)`, `✓ src/features/settings/SettingsView.test.tsx (9 tests)`, `✓ src/features/fridge/BarcodeAdd.test.tsx (8 tests)`.
- `npm run build` → `tsc --noEmit` bez błędów, `✓ built in 2.41s`.
- Nowe testy pokrywają po jednym na punkty 1–4 (komponenty z wstrzykniętymi, rzucającymi callbackami, bez sieci): zapis przepisu, usuwanie klucza i klucz odrzucony przez serwer, dodanie produktu (znaleziony kod i ręczna nazwa), `UNAUTHENTICATED`. W dwóch testach sprawdzam, że surowy komunikat (`insert failed: permission denied`, `delete denied`, `network down`) nie występuje w DOM.

Decyzje własne: `SettingsView.test.tsx` mockuje `../../lib/supabase` i używa prawdziwego `ApiKeyError`, żeby dowieść, że o komunikacie decyduje pole `code` — sam widok nadal nie importuje niczego z sieci. `BarcodeAdd.add` rzuca dalej po ustawieniu alertu; przy przycisku „Dodaj” dla znalezionego kodu wołanie jest opakowane w `.catch(() => {})`, więc nie ma nieobsłużonego odrzucenia. Komunikat `fridge.barcodeScanError` też przeniosłem do `role="alert"`.

Pytania / blockery: brak.

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
