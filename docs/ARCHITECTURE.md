# Architektura Fridgely

Dokument dla kolejnej osoby pracującej nad kodem: jak projekt jest ułożony, gdzie są granice
zaufania i jak dodać nową funkcję bez psucia istniejących zasad. Opis dotyczy wersji z gałęzi
`task/18-24-photo` (zadania 18–38).

## Warstwy

```
src/domain   czysta logika: typy, lodówka, lista zakupów, plan, scalanie, zużycie, wyszukiwanie
src/lib      klienci i narzędzia: Supabase, AI, klucz API, zdjęcia, daty, motyw
src/features ekrany i hooki: fridge, recipes, plan, shopping, ai, settings, auth, household
supabase     migracje SQL, test RLS, funkcje Edge (ai, save-key, _shared)
```

Zasada, która trzyma całość w kupie: **`domain` nie zna sieci, Reacta ani przeglądarki.**
Wszystko, co da się policzyć bez I/O — sortowanie po dacie, odejmowanie lodówki od listy
zakupów, scalanie produktów, FEFO przy gotowaniu, dopasowanie tekstu — siedzi w `domain`
i jest testowane bez mocków. `lib` to jedyne miejsce, które dotyka `fetch`, `supabase`,
`localStorage`, canvasu czy `Intl`. `features` składa jedno i drugie.

## Przepływ danych: hook → strona → widok

Każdy ekran ma trzy pliki o jednym schemacie:

| Plik | Odpowiedzialność |
|---|---|
| `useX.ts` | dane i zapis: Supabase, Realtime, stany `loading`/`error`, funkcje `add`/`update`/`remove` |
| `XPage.tsx` | podłączenie: hook(i) + język + nawigacja, przekazanie propsów, zero logiki domenowej |
| `XView.tsx` | czysty widok na propsach i callbackach: renderowanie, formularze, komunikaty, testy bez sieci |

Przykład: `FridgePage` bierze `useFridge` (dane) plus `recognizePhoto`/`readLabelDate` (klient AI)
i wstrzykuje je do `FridgeView`, które nie importuje niczego z sieci. Dzięki temu test widoku
podaje `vi.fn()` w miejsce callbacku i nie potrzebuje ani Supabase, ani klucza.

Wyjątki od schematu, świadome:

- `AuthGate.tsx` trzyma razem hook sesji, hook trybu odzyskiwania hasła i dwa formularze, bo cała
  ta logika należy do jednego ekranu wejścia.
- `features/common/LoadError.tsx` to wspólny, mały komponent błędu wczytywania używany przez
  cztery widoki.

## Realtime i stan

Hooki danych subskrybują zmiany przez `supabase.channel(...).on('postgres_changes', ...)`
i po każdym zdarzeniu wołają ten sam `load`, który wykonuje się na starcie. Konsekwencje, o których
warto wiedzieć:

- `load` jest źródłem prawdy. Po zapisie nie trzeba łatać stanu lokalnie, żeby zobaczyć zmianę —
  przyjdzie z Realtime. Wyjątki, gdzie i tak aktualizujemy lokalnie, to `useFridge.add`
  (żeby pętla dodawań widziała własne wcześniejsze wywołania) oraz `useShopping` (żeby wiersz
  znikał natychmiast po skasowaniu).
- Każdy hook zwraca `loading` (prawda do pierwszego zakończonego `load`) i `error` (prawda, gdy
  ostatni `load` się nie udał) oraz `reload()`. Widok przy `loading` pokazuje „Ładowanie…”
  w `role="status"` **zamiast** stanu pustego, a przy `error` — alert z przyciskiem „Spróbuj
  ponownie”, nie kasując tego, co już było na ekranie.
- `useFridge` trzyma dodatkowo `useRef` z najnowszą listą (`current`), bo `add` musi widzieć skutki
  poprzednich wywołań w tej samej pętli (import ze zdjęcia, przenoszenie kupionych). Świadomie
  zaakceptowana luka: dwie osoby z jednego domu dodające produkt w tej samej milisekundzie mogą
  się nadpisać; Realtime wyrównuje stan chwilę później.

## Granice zaufania i sekrety

Trzy poziomy, od najsłabszego:

1. **Przeglądarka** zna tylko `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`. To nie są sekrety
   w sensie uprawnień: rola `anon`/`authenticated` podlega RLS, więc klient widzi wyłącznie dane
   swojego domu. Klucza Anthropic użytkownika **nigdy** tu nie ma.
2. **Funkcje Edge** (`supabase/functions`) działają na roli service i omijają RLS, więc są jedynym
   miejscem, które czyta `user_secrets` i `ai_usage`. `save-key` szyfruje klucz użytkownika
   (AES-GCM, sekret z `KEY_ENCRYPTION_SECRET`) i zapisuje wyłącznie szyfrogram oraz `key_last4`;
   `ai` odczytuje i deszyfruje klucz, woła Claude i zapisuje do `ai_usage` tylko `user_id`, `task`
   i liczbę tokenów — nigdy treści promptu, obrazu ani klucza.
3. **Baza** pilnuje izolacji domów politykami RLS po `members.user_id = auth.uid()`; `user_secrets`
   nie ma żadnych uprawnień dla ról klienckich, a zmiany członkostwa przechodzą przez RPC.

Praktyczne reguły, których się trzymamy:

- Klucz API, token sesji i zawartość `user_secrets` nie trafiają do odpowiedzi funkcji, do
  `ai_usage`, do logów ani do błędów pokazywanych użytkownikowi.
- Komunikaty z serwera nie są pokazywane w interfejsie. Widok mapuje **kody** (`NO_API_KEY`,
  `UNAUTHENTICATED`, `INVALID_KEY`, `UPSTREAM_ERROR`) na własne teksty z `i18n`.
- Dat ważności nigdy nie zgadujemy: brak odczytanej daty to `null` i prośba o uzupełnienie.

## Jak działa warstwa AI

Całe AI przechodzi przez jedną funkcję `ai` (BYOK), która:

1. sprawdza JWT użytkownika (rola service, `supabase.auth.getUser`),
2. waliduje ciało żądania w zależności od `task` (przepisy: `payload.fridge`; zdjęcia: `payload.image`
   z czystym base64, max 7 000 000 znaków),
3. czyta i deszyfruje klucz użytkownika z `user_secrets`,
4. woła Claude (`callClaude`; dla zdjęć dokłada blok `{ type: 'image', source: { type: 'base64', ... } }`
   przed blokiem tekstowym),
5. parsuje odpowiedź modelu i **odrzuca wszystko, co nie pasuje do kontraktu** (`502`),
6. zapisuje zużycie i zwraca JSON.

Podział plików w funkcji `ai` jest celowy: `handler.ts` to czysta logika z wstrzykiwanymi
zależnościami (`getUser`, `getUserKey`, `decrypt`, `callClaude`, `recordUsage`), `prompts.ts`
buduje teksty, a `index.ts` dotyka Deno, Supabase i Anthropic. Testy (`handler.test.ts`) nie
potrzebują ani sieci, ani Deno.

### Dodanie nowego zadania AI

1. **Typy i prompt**: w `supabase/functions/ai/prompts.ts` dodaj nazwę zadania do `AiTask` i gałąź
   w `buildPrompt` (albo `imagePrompt` dla zdjęć). Opisz dokładny kształt JSON-a, bo ten sam kształt
   waliduje handler.
2. **Żądanie i wynik**: w `handler.ts` rozszerz unię `AiRequest` (nowy kształt `payload`) i `AiResponse`,
   dopisz walidację żądania w `parseRequest` oraz **oszczędny** parser wyniku (jak `parseRecipe`,
   `parseDetectedItems`, `parseLabelDate`). Zła data ma zostać `null`, a nie wyjątkiem; brak pola
   ma dostać wartość domyślną.
3. **Wywołanie**: jeśli zadanie używa zdjęcia, upewnij się, że `callClaude` dostaje `image`
   (blok obrazu składa `index.ts`).
4. **Testy**: w `handler.test.ts` dodaj przypadek szczęśliwy, 400 na każde złe żądanie (i sprawdź,
   że `callClaude` nie zostało wywołane), 502 na nie-JSON oraz test, że obraz i klucz nie występują
   w odpowiedzi ani w argumencie `recordUsage`.
5. **Klient**: w `src/lib/ai.ts` dodaj cienką funkcję korzystającą z prywatnego `callAi`
   (mapowanie kodów na `AiError` jest wtedy wspólne) i przetestuj ją w `src/lib/ai.test.ts`
   z zamockowanym `fetch`.
6. **UI**: nowy widok dostaje wstrzykniętą funkcję klienta (jak `PhotoImport`), nigdy import
   z `lib/ai` w widoku — inaczej test widoku ciągnie za sobą klienta Supabase.

Wdrożenie funkcji (`supabase functions deploy`) i ustawienie sekretów są po stronie osoby
nadzorującej projekt, nie wykonawcy.

## Tłumaczenia

- Wszystkie teksty w `src/i18n/pl.json` i `src/i18n/en.json`; klucze muszą być identyczne w obu
  plikach (pilnuje tego `src/i18n/i18n.test.ts`).
- W komponentach wyłącznie `t('klucz')`; żadnych twardych napisów, żadnych tekstów składanych
  w JS.
- Liczby mnogie przez formy i18next: `klucz_one`, `klucz_few`, `klucz_many`, `klucz_other`
  (polski potrzebuje wszystkich czterech), wołane jako `t('klucz', { count })`.
- `document.documentElement.lang` ustawia `src/i18n/index.ts` przy starcie i przy każdej zmianie
  języka; daty w interfejsie formatuje `src/lib/format.ts` (`Intl.DateTimeFormat`, strefa UTC),
  a wartości w polach `type="date"` i w bazie zostają w ISO.

## Konwencje interfejsu

- Błąd operacji użytkownika: krótki komunikat w `role="alert"` — nigdy nieobsłużone odrzucenie
  Promise i nigdy surowy tekst serwera.
- Ładowanie i potwierdzenie: `role="status"`.
- Operacje destrukcyjne, które trudno cofnąć (usunięcie przepisu, ugotowanie z lodówki), mają
  potwierdzenie w miejscu: dwuetapowy przycisk albo podgląd zmian przed zapisem.
- Widoki są dostępne z klawiatury: etykiety `aria-label` zawierają nazwę elementu, którego dotyczą
  (`Quantity: Mleko`), żeby dało się je rozróżnić w testach i w czytniku ekranu.

## Testy

```bash
npm test         # vitest run: całe drzewo, bez sieci
npm run build    # tsc --noEmit + vite build
```

- `src/domain/*.test.ts` — czysta logika, bez mocków.
- `src/features/**/*.test.tsx` — widoki z wstrzykniętymi callbackami.
- `src/features/**/use*.test.ts` — hooki z zamockowanym `supabase` (łańcuch `select/eq/update/...`).
- `src/lib/*.test.ts` — klienci z zamockowanym `fetch`, narzędzia bez mocków.
- `supabase/functions/ai/handler.test.ts` — kontrakt funkcji AI.
- `src/App.test.tsx`, `src/features/auth/AuthGate.test.tsx` — powłoka aplikacji na jednym mocku
  klienta Supabase (`vi.hoisted` + `vi.mock`).

Uwaga o mockach: `src/lib/supabase.ts` rzuca przy imporcie, gdy brakuje `VITE_SUPABASE_URL`
i `VITE_SUPABASE_ANON_KEY` (w testach `.env.local` nie jest ładowany), więc każdy test, który
pośrednio importuje klienta, musi go zamockować — także testy widoków, które tylko importują
`AiError` z `lib/ai`.

## Gdzie czego szukać

| Temat | Plik |
|---|---|
| Schemat bazy i RLS | `supabase/migrations/0001_init.sql`, `0002_invite_code_entropy.sql` |
| Test izolacji domów | `supabase/tests/rls.sql` (udany przebieg kończy się `ERROR P0001: RLS_TEST_OK`) |
| Szyfrowanie klucza | `supabase/functions/_shared/keycrypto.ts` |
| Funkcja `ai` | `supabase/functions/ai/{index,handler,prompts}.ts` |
| Funkcja `save-key` | `supabase/functions/save-key/{index,handler}.ts` |
| Sortowanie i statusy dat | `src/domain/fridge.ts` |
| Lista zakupów i przenoszenie kupionych | `src/domain/shopping.ts` |
| Plan tygodnia, braki, przesuwanie tygodni | `src/domain/plan.ts` |
| Zużycie lodówki (FEFO) | `src/domain/consume.ts` |
| Wyszukiwanie tekstu | `src/domain/search.ts` |
| Motyw | `src/lib/theme.ts`, `src/styles.css` |
| Zasady współpracy | `docs/collab/README.md` |
