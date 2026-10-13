# Zlecenia dla wykonawcy

Zasady pracy: `docs/collab/README.md`. Status zadania: `TODO` → `IN PROGRESS` → `READY FOR REVIEW` → (Claude) `DONE` / `REJECTED`.

---

## Paczka zadań 18–24: zdjęcia (AI vision), scalanie produktów, PWA, reset hasła

STATUS: READY FOR REVIEW (oba punkty z przeglądu naprawione, patrz raport 25 w `REPORTS.md`)

### Przegląd Claude: paczka 18–24 (poprawki: 1 z 2 dozwolonych)

REVIEW: CHANGES REQUESTED, na tej samej gałęzi `task/18-24-photo`

Sprawdzone przeze mnie: `npm test` 188/188, `npm run build` OK, zakres plików zgodny (zmieniony tylko `supabase/functions/ai/*`, bez `_shared`, `migrations`, `save-key`), brak nowych zależności i sekretów, serwer (walidacja obrazu, naprawa pól, brak zgadywania dat, `502` przy złym JSON, obraz i klucz nie wyciekają) przyjęty, zadania 20, 23 i 24 przyjęte. Dwie poprawki, obie w kodzie dodanym w tej paczce:

1. **Błąd w `src/features/fridge/PhotoImport.tsx:104`** (zgubiony znak nowej linii): `if (!file || !dateTarget || readBusy) return    setReadBusy(true)` jest czytane jako `return setReadBusy(true)`. Skutek: przy wczesnym wyjściu `readBusy` zostaje ustawione na `true` i nic go nie zeruje (odczyt dat przestaje działać do przeładowania), a w normalnej ścieżce `readBusy` nigdy nie jest `true` w trakcie odczytu (brak komunikatu "Odczytuję datę", możliwe podwójne wysłanie). Napraw: wczesne `return` w osobnej linii, bez wywołania `setReadBusy`, a `setReadBusy(true)` na początku normalnej ścieżki. Dodaj test: (a) podczas oczekującego `readDate` widać `role="status"` z komunikatem odczytu i drugi wybór pliku nie woła `readDate` ponownie; (b) wybór pliku `undefined` nie blokuje kolejnego odczytu. Przejrzyj plik pod kątem innych sklejonych linii.
2. **Utrata ilości przy scalaniu w `src/features/fridge/useFridge.ts` (`add`)**: `findMergeTarget(items, item)` czyta `items` z domknięcia renderu, a `PhotoImport.addAll` i przenoszenie kupionych z listy zakupów wołają `add` w pętli. Kolejne wywołania widzą tę samą, nieodświeżoną listę, więc (a) dwa identyczne produkty w jednej paczce wstawiają dwa wiersze zamiast jednego, (b) dwa dopiski do istniejącego wiersza obliczają `target.quantity + item.quantity` od tej samej starej wartości i drugi nadpisuje pierwszy (np. 1 + 2 + 2 daje 3 zamiast 5). Napraw: trzymaj aktualną listę w `useRef` (aktualizowaną przy każdym `add` i przy każdym `load`) i licz scalenie na niej, żeby kolejne wywołania w jednej pętli widziały skutki poprzednich. Wyścig między dwiema osobami z domu zostaw (zaakceptowane na tym etapie), opisz go w komentarzu przy `add`. Dodaj test hooka (z zamockowanym `supabase`): trzy kolejne `add` tego samego produktu (1, 2, 2) dają jedno `update` z końcową ilością 5 albo jedno `insert` plus dwa `update` kończące na 5, nigdy dwa wiersze ani 3.

Po poprawkach: `npm test` i `npm run build`, dopisz raport 25 w `REPORTS.md` i ustaw status na `READY FOR REVIEW`.
Gałąź (jedna na całą paczkę): `task/18-24-photo`, utworzona z `main` (commity `a89896c`, `8cb10e1`, `df2afd6`, `f2eef1d`, `c631ebf`, `e8df326`, `c25a076`)

Zasady paczki jak w poprzednich (jeden commit na zadanie, kolejność 18 → 24, `npm test` i `npm run build` po każdym, osobny wpis w `REPORTS.md` na zadanie, zatrzymaj się po 24 albo na `BLOCKER`, błędy widoczne w UI przez `role="alert"`, brak nowych zależności, brak surowych komunikatów serwera). Wyjątek od reguły "nie ruszaj `supabase/`": zadania 18 i 19 edytują **wyłącznie** `supabase/functions/ai/*` (nie `_shared`, nie `migrations`, nie `save-key`). Wdrożenie funkcji robi Claude po przeglądzie, nie wdrażaj.

### Zadanie 18: Funkcja `ai`, zadanie `recognize_photo`

Files: `supabase/functions/ai/handler.ts`, `prompts.ts`, `index.ts`, `handler.test.ts`.

Kontrakt (rozszerza istniejący; zadania `recipes_from_fridge` i `dinner_from_expiring` bez zmian):
- Żądanie: `{ task: 'recognize_photo', locale: 'pl' | 'en', payload: { image: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp', data: string } } }`, gdzie `data` to czyste base64 bez prefiksu `data:`. Limit: `data.length <= 7_000_000` i tylko znaki base64, inaczej `400 INVALID_REQUEST`.
- Odpowiedź 200: `{ items: { name: string; quantity: number; unit: string; expiresOn: string | null }[] }`, maks. 50 pozycji, nazwy przechodzą to samo czyszczenie znaków sterujących co dziś, długość nazwy ≤ 100, jednostka ≤ 20, `quantity > 0` (brak lub zły → `1`), `unit` brak → `'szt'`, `expiresOn` tylko poprawna data `YYYY-MM-DD` albo `null`.
- Prompt: rozpoznaj tylko produkty spożywcze widoczne na zdjęciu; **nie zgaduj dat**: `expiresOn` wpisz tylko, gdy data jest czytelna na etykiecie, inaczej `null`; odpowiedź w języku `locale`; tylko JSON o podanym kształcie.
- `index.ts`: wywołanie Anthropic z blokiem `{ type: 'image', source: { type: 'base64', media_type, data } }` przed blokiem tekstowym. Obraz nie jest logowany, zapisywany ani zwracany; do `ai_usage` trafia to samo co dziś (bez treści).
- Model, który zwróci nie-JSON lub zły kształt → `502 UPSTREAM_ERROR` (jak dziś). Typ wyniku handlera staje się unią odpowiedzi dla przepisów i dla zdjęć; zadania przepisowe muszą działać identycznie jak przed zmianą.

Testy: poprawne zdjęcie → 200 z pozycjami; zły `mediaType`, zbyt duże `data`, znaki spoza base64, brak `image` → 400 i `callClaude` nie wywołane; data niepoprawna lub niewidoczna → `null`; nazwa z nową linią w jednej linii; ponad 50 pozycji → obcięte do 50 (albo 502; wybierz i opisz w raporcie); klucz i obraz nie występują w odpowiedzi ani w argumentach `recordUsage`; testy dotychczasowych zadań przechodzą bez zmian.

### Zadanie 19: Funkcja `ai`, zadanie `read_label_date`

Files: jak w zadaniu 18.

Żądanie: `{ task: 'read_label_date', locale, payload: { image } }` (ten sam kształt `image` i limity). Odpowiedź 200: `{ expiresOn: string | null }`. Prompt: znajdź na zdjęciu etykiety datę przydatności ("najlepiej spożyć przed", "termin przydatności", "use by", "best before"); gdy jest wiele dat, zwróć tę związaną z terminem przydatności, nie datą produkcji; formaty dd.mm.rrrr, dd/mm/rr, rrrr-mm-dd, "mm.rrrr" (dla samego miesiąca użyj ostatniego dnia miesiąca); gdy nie widać daty, `null`. Walidacja wyniku jak w 18. Testy: data odczytana, `null`, niepoprawna data z modelu → `null`, błędne żądanie → 400.

### Zadanie 20: Klient zdjęć

Files: `src/lib/ai.ts` (dodaj, nie zmieniaj istniejącego), `src/lib/ai.test.ts`, nowe `src/lib/image.ts`, `src/lib/image.test.ts`.

Interfejsy:
- `recognizePhoto(image: PhotoPayload, locale: AiLocale): Promise<DetectedItem[]>` oraz `readLabelDate(image: PhotoPayload, locale: AiLocale): Promise<string | null>`; `PhotoPayload = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }`; `DetectedItem = { name: string; quantity: number; unit: string; expiresOn: string | null }`. Te same `AiError` i mapowanie kodów co `askAi`.
- `image.ts`: `prepareImage(file: Blob, deps?: { decode, encode }): Promise<PhotoPayload>`: zmniejsz dłuższy bok do 1280 px (bez powiększania), zakoduj jako JPEG jakość 0.8, zwróć base64 bez prefiksu. Dekodowanie i kodowanie (canvas/`createImageBitmap`) wstrzykiwane przez `deps`, żeby logikę wymiarów dało się przetestować bez przeglądarki: wyeksportuj czystą `fitWithin(width, height, max): { width: number; height: number }` z testami (pionowe, poziome, mniejsze niż limit, kwadrat, zero).

### Zadanie 21: Dodawanie ze zdjęcia w lodówce

Files: `src/features/fridge/PhotoImport.tsx` + `PhotoImport.test.tsx`, `src/features/fridge/FridgeView.tsx` (renderuj `<PhotoImport … />` obok `BarcodeAdd`), `src/features/fridge/FridgePage.tsx` (wstrzyknij `recognize`/`readDate`), `src/i18n/*.json`.

Zachowanie: `<input type="file" accept="image/*" capture="environment">` ("Dodaj ze zdjęcia"); po wyborze pliku `prepareImage` → `recognize`. Wynik to **edytowalna lista** (nazwa, ilość, jednostka, data, przycisk "usuń z listy"), nic nie trafia do lodówki bez kliknięcia "Dodaj wszystko". Brak rozpoznanych produktów → komunikat i możliwość dodania ręcznego. `NO_API_KEY` → podpowiedź o Ustawieniach, `UNAUTHENTICATED` → sesja wygasła, inne błędy → ogólny komunikat. Stan ładowania w `role="status"`. Dodatkowo w `FridgeView` przy produktach bez daty przycisk "Odczytaj datę ze zdjęcia" (osobny `<input type="file">`): wynik `null` → komunikat "Nie znaleziono daty", sukces → `onUpdate(id, { expiresOn })` po potwierdzeniu użytkownika (pokaż odczytaną datę i przycisk "Zapisz"). Testy z wstrzykniętymi funkcjami: lista edytowalna, "Dodaj wszystko" woła `onAdd` dla każdej pozostałej pozycji, usunięta pozycja nie jest dodana, błędy, brak wyników.

### Zadanie 22: Scalanie powtarzających się produktów

Files: `src/domain/fridge.ts` (dodaj `findMergeTarget`) + test, `src/features/fridge/useFridge.ts`.

Interfejs: `findMergeTarget(items: FridgeItem[], candidate: { name: string; unit: string; expiresOn: string | null }): FridgeItem | null` zwraca produkt o tej samej znormalizowanej nazwie i jednostce **i tej samej dacie ważności** (`null` równa się `null`); brak → `null`. W `useFridge.add`: gdy jest cel scalenia, zwiększ jego ilość (`update`), w przeciwnym razie wstaw nowy wiersz. Testy domenowe: ta sama nazwa różna wielkość liter/spacje, inna jednostka (brak scalenia), inna data (brak scalenia), `null` vs data, pusta lodówka.

### Zadanie 23: PWA (instalacja na telefonie) i język dokumentu

Files: `public/manifest.webmanifest`, `public/icon.svg`, `index.html` (tylko `<link rel="manifest">`, `<meta name="theme-color">`, `<link rel="icon">`), `src/i18n/index.ts` (zmiana `document.documentElement.lang` przy `languageChanged`) + test `src/i18n/lang.test.ts`.

Manifest: `name: "Fridgely"`, `short_name`, `start_url: "/"`, `display: "standalone"`, `background_color`/`theme_color`, ikona `icon.svg` (`sizes: "any"`, `purpose: "any maskable"`), prosta własna grafika (np. zaokrąglony kwadrat z literą F). Bez service workera, bez cache'owania. Test: zmiana języka ustawia `document.documentElement.lang` na `pl`/`en`.

### Zadanie 24: Reset hasła

Files: `src/features/auth/AuthGate.tsx` (+ rozszerz `AuthGate.test.tsx`), `src/i18n/*.json`.

W formularzu logowania link "Nie pamiętam hasła" → wywołuje `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })`, potwierdzenie `auth.resetSent` w `role="status"` (bez ujawniania, czy konto istnieje: ten sam komunikat dla każdego poprawnego e-maila), puste pole e-mail → komunikat walidacji. Obsługa zdarzenia `PASSWORD_RECOVERY` z `onAuthStateChange`: pokaż formularz nowego hasła (min. 6 znaków, dwa pola zgodne) wołający `supabase.auth.updateUser({ password })`, po sukcesie komunikat i normalne wejście do aplikacji. Testy z zamockowanym klientem: wysłanie resetu, walidacja pustego e-maila, formularz po `PASSWORD_RECOVERY`, niezgodne hasła nie wołają `updateUser`.

---

## Paczka zadań 11–17: poprawki, braki funkcjonalne, testy i dokumentacja

STATUS: DONE (przegląd: ACCEPTED z drobnymi uwagami, scalone do main w bb4a9c2)

Przegląd Claude: `npm test` 138/138, `npm run build` OK, brak zmian w `supabase/` i `package.json`, brak sekretów w README, wszystkie punkty z przeglądu 7–10 naprawione. Drobne, bez blokady: (a) przycisk "Dodaj braki" po sukcesie jest aktywny, więc podwójne kliknięcie duplikuje pozycje listy; (b) przenoszenie kupionych do lodówki nie łączy z istniejącym produktem o tej samej nazwie i jednostce (zadanie 22); (c) zmiana w `AuthGate.tsx` (lokalny komunikat zamiast surowego błędu serwera) jest zgodna z zasadą "nie pokazuj surowych komunikatów", zaakceptowana. Poprawek wykonawcy: 0 z 2.
Gałąź (jedna na całą paczkę): `task/11-17-polish`, utworzona z `main` (commity `951b280`, `e6da7e7`, `3442e6f`, `f7c394d`, `571d19b`, `f6d200f`, `2dddf70`)

Zasady paczki są takie same jak w paczce 7–10 (jeden commit na zadanie, kolejność 11 → 17, po każdym `npm test` i `npm run build`, osobny wpis w `REPORTS.md` na zadanie, zatrzymaj się po zadaniu 17 lub na `BLOCKER`). Dodatkowo:

- Nie zmieniaj `supabase/` ani `package.json`. Nowe klucze tłumaczeń zawsze w `pl.json` i `en.json`.
- Błąd operacji użytkownika ma zawsze być widoczny w interfejsie (krótki komunikat z `role="alert"`), a nie kończyć się nieobsłużonym odrzuceniem Promise. Stany ładowania i potwierdzenia: `role="status"`.
- Nigdy nie pokazuj surowych komunikatów serwera ani klucza.

### Zadanie 11: Obsługa błędów (poprawki z przeglądu)

Files: `src/features/ai/AiPanel.tsx` (+ test), `src/features/settings/SettingsView.tsx` (+ test), `src/features/fridge/BarcodeAdd.tsx` (+ test), `src/i18n/*.json`.

1. `AiPanel.save`: gdy `onSave` rzuci, pokaż komunikat `ai.saveFailed`, zostaw wynik na ekranie (użytkownik może ponowić), bez nieobsłużonego odrzucenia.
2. `SettingsView`: `onClear` w `try/catch` z komunikatem `settings.clearFailed`; `onSave` rzucające `ApiKeyError` z `code === 'INVALID_KEY'` pokazuje `settings.keyRejected` ("Claude nie przyjął tego klucza"), inny błąd `settings.saveFailed`. Widok nie importuje nic z sieci: błąd rozpoznaj przez `error.code`.
3. `BarcodeAdd.add` i `ManualName`: błąd `onAdd` pokazuje `fridge.addFailed`, pole pozostaje wypełnione.
4. `AiPanel`: `AiError` z `code === 'UNAUTHENTICATED'` pokazuje `ai.sessionExpired` ("Sesja wygasła, zaloguj się ponownie"), a nie komunikat o braku klucza.
5. Komunikaty ładowania w `role="status"`, błędy w `role="alert"`.

Testy: po jednym na punkty 1–4 (komponenty z wstrzykniętymi, rzucającymi callbackami, bez sieci).

### Zadanie 12: Widoczne kroki przepisu

Files: `src/features/recipes/RecipesView.tsx` (+ test `RecipesView.test.tsx`), `src/i18n/*.json`.

Lista przepisów pokazuje dziś tylko składniki. Każdy przepis ma pokazywać kroki jako listę numerowaną w elemencie `<details>` ("Pokaż kroki" / `recipes.showSteps`), a przy braku kroków nic nie renderować. Dodaj potwierdzenie przed usunięciem (`window.confirm`-free: dwuetapowy przycisk "Usuń" → "Na pewno?" `recipes.confirmDelete`, drugie kliknięcie wywołuje `onDelete`, utrata fokusu/Escape anuluje). Testy: kroki widoczne w `details`, jedno kliknięcie nie wywołuje `onDelete`, drugie wywołuje.

### Zadanie 13: Braki z przepisu AI na listę zakupów

Files: `src/features/ai/AiPanel.tsx`, `src/features/ai/AiPage.tsx`, `src/features/shopping/useShopping.ts` (dodaj `addMany(list: Ingredient[]): Promise<void>`, wstawia wiersze bez kasowania istniejących), testy w `AiPanel.test.tsx`, `src/i18n/*.json`.

W wyniku AI, gdy `missing.length > 0`, przycisk "Dodaj braki do listy zakupów" (`ai.addMissing`). Nowy opcjonalny prop `onAddMissing(names: string[]): Promise<void>`; po sukcesie potwierdzenie `ai.missingAdded`, błąd `ai.addMissingFailed`. `AiPage` mapuje nazwy na `{ name, quantity: 1, unit: 'szt' }`. Testy: przycisk ukryty przy pustym `missing`, wywołanie z poprawną listą, obsługa błędu.

### Zadanie 14: Edycja produktu w lodówce

Files: `src/features/fridge/FridgeView.tsx` (+ rozszerz `FridgeView.test.tsx`), `src/i18n/*.json`.

Przy każdym produkcie: pole liczbowe z ilością (zapis `onUpdate(id, { quantity })` po `blur`/Enter, tylko gdy wartość `> 0` i zmieniona, w przeciwnym razie przywróć poprzednią) oraz pole daty ważności także dla produktów z datą (zmiana wywołuje `onUpdate(id, { expiresOn })`, wyczyszczenie daty daje `null`). Dostępne etykiety (`aria-label`) z nazwą produktu. Testy: zmiana ilości, odrzucenie `0` i ujemnej, zmiana i wyczyszczenie daty.

### Zadanie 15: Kupione z listy do lodówki

Files: `src/domain/shopping.ts` (dodaj `purchasedToFridge`) + test `shopping.test.ts`, `src/features/shopping/ShoppingView.tsx` (+ test), `ShoppingPage.tsx`, `useShopping.ts` (dodaj `deleteByIds(ids: string[])`), `src/i18n/*.json`.

Interfejs: `purchasedToFridge(items: { name: string; quantity: number; unit: string; checked: boolean }[]): { name: string; quantity: number; unit: string; expiresOn: null }[]` (tylko `checked`, nazwa przez `normalizeName`, kolejność zachowana).
`ShoppingView`: nowy prop `onMoveChecked(): Promise<void>`; przycisk "Przenieś kupione do lodówki" (`shopping.moveChecked`) widoczny tylko gdy coś jest odhaczone. `ShoppingPage`: najpierw dodaj **wszystkie** produkty do lodówki (`useFridge.add`), a dopiero po sukcesie wszystkich usuń odhaczone wiersze listy; przy błędzie niczego nie usuwaj i pokaż `shopping.moveFailed` (brak utraty danych). Testy: funkcja domenowa (tylko odhaczone, normalizacja, pusta lista), przycisk ukryty/widoczny.

### Zadanie 16: Testy integracyjne powłoki aplikacji

Files: `src/App.test.tsx`, `src/features/auth/AuthGate.test.tsx` (nowe; bez zmian w kodzie produkcyjnym, chyba że test ujawni błąd: wtedy opisz w raporcie i popraw minimalnie).

Z `vi.mock('./lib/supabase')` (klient z `auth.getSession`, `onAuthStateChange`, `from(...)`, `rpc`, `channel`): (a) niezalogowany użytkownik widzi formularz logowania, błąd logowania wyświetla komunikat; (b) zalogowany bez domu widzi ekran tworzenia/dołączania; (c) zalogowany z domem widzi 6 zakładek i przełączanie zakładek renderuje właściwe sekcje (Lodówka, Przepisy, Plan, Zakupy, AI, Ustawienia); (d) wylogowanie woła `auth.signOut`. Bez sieci.

### Zadanie 17: README

Files: `README.md` (nowy).

Po polsku i angielsku (dwie sekcje): czym jest Fridgely, funkcje, stack, wymagania, uruchomienie lokalne (`npm install`, `.env.local` z `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`, `npm run dev`, `npm test`, `npm run build`), struktura katalogów (`src/domain`, `src/features`, `src/lib`, `supabase/migrations`, `supabase/functions`), baza (migracje i test RLS `supabase/tests/rls.sql`), funkcje Edge `ai` i `save-key` (wymagane sekrety: `KEY_ENCRYPTION_SECRET`; bez wartości!), model BYOK (klucz użytkownika trafia tylko do `save-key`, zapisany zaszyfrowany, nigdy do przeglądarki), konwencje współpracy z `docs/collab/`. Bez sekretów, bez prawdziwych adresów projektu i kluczy.

---

## Paczka zadań 7–10 (UI): wykonaj wszystkie po kolei, bez przerw na przegląd

STATUS: DONE (przegląd: ACCEPTED z uwagami, scalone do main w c28d506; uwagi przeniesione do zadania 11)

Przegląd Claude: `npm test` 105/105, `npm run build` OK, zakres plików zgodny, brak nowych zależności, sekretów i logowania klucza. Raport uczciwie przyznaje brak weryfikacji wizualnej. Uwagi (naprawia zadanie 11): (a) błędy zapisu są połykane lub kończą się nieobsłużonym odrzuceniem w `AiPanel.save`, `SettingsView` (usuwanie klucza), `BarcodeAdd.add`; (b) odrzucony przez serwer klucz (`INVALID_KEY`) pokazuje to samo co błąd sieci; (c) `UNAUTHENTICATED` w panelu AI pokazuje komunikat o braku klucza. Poprawek wykonawcy: 0 z 2.
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

