# Fridgely: dokument projektu

Data: 2026-10-12. Status: do zatwierdzenia przez Dawida.

## Po co

Dawid (i może jedna druga osoba) dziś decyduje o posiłkach "na bieżąco i byle co". Skutek: improwizacja i marnowanie jedzenia. Fridgely ma to zastąpić jedną wspólną aplikacją: plan tygodnia, lista zakupów, stan lodówki z datami ważności oraz przepisy układane z tego, co już jest w domu.

Docelowo aplikacja ma być wypuszczona globalnie, więc od początku jest projektowana pod wielu użytkowników i dwa języki.

## Cele

1. Jedna wspólna przestrzeń ("dom") dla 1–2 osób: te same przepisy, lista zakupów, lodówka i plan tygodnia, zmiany widoczne na żywo u obu osób.
2. Planowanie tygodnia: losowanie z istniejących przepisów, ręczne układanie (przeciąganie na dni), możliwość powtórzenia losowania.
3. Lista zakupów generowana z wybranych przepisów, pomniejszona o to, co jest w lodówce, z odhaczaniem w sklepie.
4. Lodówka: dodawanie przez kod kreskowy lub zdjęcie, ręczna poprawka wszystkiego, data ważności na każdym produkcie, lista posortowana od najbliższej daty.
5. Przepisy z zawartości lodówki: propozycja z zaznaczonymi brakami, akceptacja / zmiana / kolejna propozycja, zapis do własnej listy.
6. "Obiad z tego, co się przeterminuje": produkt z najkrótszą datą jest bazą przepisu, reszta lodówki dopełnia.
7. Interfejs po polsku i angielsku, język domyślnie z przeglądarki, przełączany w ustawieniach.

## Poza zakresem (wersja 1)

- Płatności, plany abonamentowe, Stripe (zaprojektowane miejsce, ale niezbudowane; patrz niżej).
- Aplikacje natywne iOS/Android (tylko przeglądarka, responsywnie).
- Automatyczne generowanie obiadu każdego dnia (tylko po kliknięciu).
- Wartości odżywcze, kalorie, diety, alergeny.
- Więcej niż jeden dom na konto, role i uprawnienia poza "członek domu".

## Anty-cele (porażka, nawet jeśli działa)

- Czyjkolwiek klucz API AI, w tym Dawida, nie może być użyty przez obcych użytkowników bez limitu.
- Klucz AI nigdy nie trafia do przeglądarki ani do repozytorium.
- Aplikacja nie może po cichu zgadywać dat ważności: brak daty = prośba o uzupełnienie.
- Błędnie rozpoznany produkt ze zdjęcia nie może wejść do lodówki bez możliwości poprawy.

## Ograniczenia i założenia

- Przeglądarka: nowoczesny Chrome/Safari na telefonie i komputerze.
- Stack (moja decyzja): Vite + React + TypeScript, Supabase (Auth, Postgres, Realtime, Edge Functions), i18n przez bibliotekę typu i18next.
- Wspólna baza w chmurze, każdy użytkownik ma własne konto; dostęp do danych domu przez Row Level Security.
- Rozpoznawanie ze zdjęcia, odczyt dat z etykiet i generowanie przepisów używają Claude (API Anthropic).
- Kody kreskowe: skaner w przeglądarce (BarcodeDetector, z biblioteką jako zapasem), dane produktu z Open Food Facts (bez klucza, HTTPS, CORS). Open Food Facts nie daje dat ważności, więc data zawsze pochodzi od użytkownika lub z odczytu etykiety.
- Projekt (stan na 2026-10-12): katalog `D:\Planer` jest pusty, brak repo git, brak `gh` CLI, brak skonfigurowanej tożsamości git.

## Decyzje podjęte przez Dawida

- Nazwa: **Fridgely**.
- Użytkownicy: Dawid i może jedna osoba; potem wydanie globalne.
- Zakres: wszystkie sześć funkcji z raportu mają być w aplikacji.
- Język: polski i angielski.
- Model kosztów AI: **BYOK** na start, każdy użytkownik wkleja własny klucz Claude. Klucza Dawida w aplikacji nie ma. Płatny plan AI dołożony przed wydaniem globalnym.
- Obiad z przeterminowującego się produktu: tylko po kliknięciu (wcześniej otwarte pytanie z raportu).
- Całość ma być w git i wypchnięta na GitHub (Dawid poda URL pustego repo).

## Moje decyzje (do sprawdzenia)

- **Jedna funkcja serwerowa na całe AI.** Każde zapytanie do Claude przechodzi przez jedną Edge Function. Ona (a) sprawdza użytkownika, (b) wybiera klucz, (c) zapisuje zużycie na użytkownika, (d) egzekwuje limity. W wersji 1 klucz zawsze jest kluczem użytkownika. Płatny plan to później tylko nowa gałąź wyboru klucza plus Stripe, bez przebudowy.
- **Przechowywanie kluczy użytkowników:** po stronie serwera, zaszyfrowane (Supabase Vault lub szyfrowanie sekretem funkcji), nigdy zwracane do klienta w całości (UI pokazuje tylko końcówkę).
- **Dom jako jednostka współdzielenia:** tabela `households` + `members`; wszystkie dane (przepisy, lodówka, lista, plan) należą do domu. Zaproszenie drugiej osoby przez kod/link.
- **Schemat danych (szkic):** `households`, `members`, `recipes` (+ składniki), `fridge_items` (nazwa, ilość, jednostka, `expires_on`, źródło: barcode/foto/ręcznie), `meal_plan` (data, przepis), `shopping_items` (z odhaczeniem), `ai_usage` (użytkownik, funkcja, tokeny, czas).
- **Sortowanie lodówki** po `expires_on` rosnąco; produkty bez daty na końcu z wyraźnym wezwaniem do uzupełnienia.
- **Losowanie tygodnia** preferuje przepisy wykorzystujące produkty o najkrótszej dacie, ale zawsze z istniejących przepisów domu.
- **Treści wygenerowane przez AI** są zapisywane w języku interfejsu użytkownika.
- **Logowanie:** e-mail + hasło lub magic link Supabase Auth (bez zewnętrznych dostawców w wersji 1).

## Zostawione wykonawcy

- Wybór biblioteki UI, układ ekranów, przeciąganie dni (np. dnd-kit).
- Dokładna struktura promptów i formatu odpowiedzi AI (zalecane: ustrukturyzowany JSON).
- Szczegóły szyfrowania klucza w Supabase.
- Strategia deduplikacji i normalizacji nazw produktów (np. "mleko 2%" vs "Mleko").
- Testy: logika list zakupów (odjęcie lodówki), sortowania i RLS powinny mieć testy automatyczne.

## Kolejność dostawy

1. Szkielet: projekt, Supabase, logowanie, dom, i18n PL/EN.
2. Przepisy, lodówka (ręcznie), sortowanie po dacie.
3. Plan tygodnia i lista zakupów.
4. Funkcja AI + BYOK, przepisy z lodówki, obiad z produktu o najkrótszej dacie.
5. Skan kodów kreskowych i zdjęcie lodówki.
6. Git, GitHub, wdrożenie.
