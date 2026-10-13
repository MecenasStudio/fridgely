# Raporty wykonawcy

Nowe wpisy dodawaj na górze, według szablonu z `docs/collab/README.md`.

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
