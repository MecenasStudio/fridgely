# Zlecenia dla wykonawcy

Zasady pracy: `docs/collab/README.md`. Status zadania: `TODO` → `IN PROGRESS` → `READY FOR REVIEW` → (Claude) `DONE` / `REJECTED`.

---

## Zadanie 6: Funkcja AI z kluczem użytkownika (BYOK) — część kodowa

STATUS: READY FOR REVIEW (poprawki po przeglądzie 1 wykonane, zob. raport 2 w `REPORTS.md`)
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
STATUS: TODO (tylko poprawki poniżej, na tej samej gałęzi)

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

