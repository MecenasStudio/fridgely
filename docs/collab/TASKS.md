# Zlecenia dla wykonawcy

Zasady pracy: `docs/collab/README.md`. Status zadania: `TODO` → `IN PROGRESS` → `READY FOR REVIEW` → (Claude) `DONE` / `REJECTED`.

---

## Zadanie 6: Funkcja AI z kluczem użytkownika (BYOK) — część kodowa

STATUS: READY FOR REVIEW
Gałąź: `task/6-ai-function` (commit `cd0acbd`)

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
