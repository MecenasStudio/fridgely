# Zmiany w Fridgely

Wersja `0.1.0` — 2026-10-12. Historia w skrócie, wypunktowana; szczegóły decyzji są w
`docs/collab/REPORTS.md`, a układ kodu w `docs/ARCHITECTURE.md`.

## Dodano

**Szkielet i dane**

- Projekt Vite + React + TypeScript, i18n PL/EN z językiem z przeglądarki, ekran logowania (hasło i magic link), reset hasła linkiem.
- Baza Supabase: `households`, `members`, `recipes`, `fridge_items`, `meal_plan`, `shopping_items`, `user_secrets`, `ai_usage`, wszystkie z RLS po domu; test izolacji `supabase/tests/rls.sql`.
- Dom jako wspólna przestrzeń z kodem zaproszenia i zmianami widocznymi na żywo (Realtime).

**Lodówka**

- Dodawanie ręcznie, kodem kreskowym (Open Food Facts ze skanerem `BarcodeDetector` i zapasem w ręcznym wpisaniu) oraz ze zdjęcia — rozpoznane produkty trafiają na edytowalną listę i nic nie jest zapisywane bez zatwierdzenia.
- Odczyt daty ważności z etykiety na zdjęciu, edycja ilości i daty, sortowanie od najbliższej daty, produkty bez daty na końcu z prośbą o uzupełnienie.
- Scalanie tego samego produktu (nazwa, jednostka, data) do jednego wiersza.
- Wyszukiwanie po nazwie, bez rozróżniania wielkości liter i polskich znaków.

**Przepisy i plan**

- Własna lista przepisów, kroki w „Pokaż kroki", edycja, usuwanie z potwierdzeniem, szukanie i filtr „Tylko to, co mogę ugotować teraz".
- Plan tygodnia: losowanie, przeciąganie, przechodzenie między tygodniami, informacja „Wszystko jest" / „Brakuje: N" przy każdym dniu.
- „Ugotowane": podgląd, co zniknie z lodówki, i odejmowanie składników od najbliższej daty ważności (FEFO).

**Lista zakupów**

- Generowanie z planu z pomniejszeniem o lodówkę, ręczne dodawanie i usuwanie, odhaczanie w sklepie (odhaczone na dole), czyszczenie odhaczonych, przenoszenie kupionych do lodówki i kopiowanie/udostępnianie listy jako tekst.

**AI (BYOK)**

- Jedna funkcja serwerowa `ai`: przepis z lodówki, obiad z tego, co się przeterminuje, rozpoznanie zdjęcia lodówki i odczyt daty z etykiety.
- Funkcja `save-key` zapisuje klucz użytkownika zaszyfrowany (AES-GCM) i zwraca tylko jego końcówkę; funkcja `ai` używa klucza użytkownika i zapisuje w `ai_usage` wyłącznie identyfikator, zadanie i liczbę tokenów.
- Dodawanie braków z przepisu AI do listy zakupów.

**Ustawienia i reszta**

- Ustawienia: klucz Claude (zapis, usunięcie, końcówka), język PL/EN, motyw (jasny, ciemny, systemowy), dane domu z kopiowaniem kodu zaproszenia i liczbą osób, eksport danych domu do JSON, krótka informacja o prywatności.
- Instalacja na telefonie (manifest PWA, ikona) i język dokumentu zgodny z językiem interfejsu.
- Stan ładowania i błąd wczytywania danych z ponowieniem; granica błędów, która nie pozwala jednej zepsutej zakładce wywalić całej aplikacji; pasek „brak połączenia" i wyłączone przyciski AI offline; link „Przejdź do treści" i `aria-current` na aktywnej zakładce.

## Zmieniono

- Cała subskrypcja Realtime przeszła do jednego miejsca (`src/lib/realtime.ts`) i jest dławiona, żeby seria zmian nie odświeżała widoku wielokrotnie.
- Walidacja produktów jest wspólna (`src/domain/validate.ts`), a stałe w jednym pliku (`src/domain/limits.ts`); formularze lodówki, kod kreskowy i import ze zdjęcia korzystają z tych samych reguł co serwer.
- Daty w interfejsie są formatowane w języku użytkownika (`src/lib/format.ts`), wartości w polach i w bazie zostają w ISO.
- `npm test` obejmuje teraz także testy własności logiki domenowej (500 losowych przypadków na własność) i testy powłoki aplikacji.

## Naprawiono

- Filtr Realtime lodówki nie odświeżał listy po zmianach.
- „Ugotowane" mogło odjąć te same składniki dwa razy po częściowym błędzie zapisu; teraz błąd zamyka podgląd, przeładowuje lodówkę i pokazuje komunikat, a podgląd jest liczony z migawki i przerywany, gdy lodówka zmieni się w trakcie.
- Operacje na wierszu dodanym w tej sesji (z identyfikatorem zastępczym) kończyły się błędem zapytania; teraz wiersz jest najpierw odnajdywany po nazwie, jednostce i dacie.
- Nazwa produktu z nową linią mogła wstrzyknąć fałszywą pozycję do promptu AI; nazwy i jednostki są czyszczone w jednym miejscu.
- Błędy zapisu w panelu AI, w ustawieniach klucza i przy dodawaniu produktu były połykane albo kończyły się nieobsłużonym odrzuceniem; teraz każdy jest widoczny w interfejsie.
- Nieudane wczytanie danych wyglądało jak pusta lista; teraz pokazuje komunikat z ponowieniem i nie kasuje danych, które już były na ekranie.
- W komunikacie o błędzie „Ugotowane" alert pojawiał się przy wszystkich siedmiu dniach zamiast przy jednym.
