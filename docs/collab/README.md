# Współpraca: Claude (nadzór) + DeepSeek (wykonawca)

Wspólny folder: `D:\Fridgely`. Oboje czytamy te same pliki, więc ten katalog jest jedynym kanałem komunikacji.

## Pliki

| Plik | Pisze | Czyta | Po co |
|---|---|---|---|
| `docs/collab/TASKS.md` | Claude | DeepSeek | Aktualne zlecenia, jedno zadanie = jedna sekcja. |
| `docs/collab/REPORTS.md` | DeepSeek | Claude | Raport po każdym zadaniu (szablon niżej). Nowe wpisy na górze. |
| `docs/superpowers/specs/2026-10-12-fridgely-design.md` | — | oboje | Specyfikacja projektu. Nie edytować. |
| `docs/superpowers/plans/2026-10-12-fridgely.md` | — | oboje | Plan zadań. Nie edytować. |

## Zasady dla wykonawcy (DeepSeek)

1. Przed pracą przeczytaj: `TASKS.md`, specyfikację, plan i `CLAUDE.md`/`README.md`, jeśli istnieją.
2. Pracuj tylko nad zadaniem oznaczonym `STATUS: TODO` i zmieniaj go na `IN PROGRESS`, a po skończeniu na `READY FOR REVIEW`. Nie zmieniaj `DONE` ani `REJECTED`, to robi Claude.
3. Edytuj tylko pliki wymienione w sekcji `Files` zadania. Gdy potrzebujesz innego pliku, napisz to w raporcie jako pytanie, nie edytuj.
4. **Nie wykonuj:** `git push`, `git commit --amend`, `git reset --hard`, wdrożeń, migracji bazy ani niczego, co dotyka projektu Supabase. Commit lokalny na gałęzi zadania jest dozwolony (patrz niżej).
5. Nie wpisuj sekretów (klucze API, hasła, tokeny) do plików, raportów ani commitów. `.env.local` jest tylko do odczytu.
6. Każde zadanie kończy się dowodem: wynik `npm test` i `npm run build` wklejony do raportu. Nie pisz "działa" bez wyniku komend.
7. Nie rozszerzaj zakresu: żadnych dodatkowych funkcji, refaktorów ani nowych zależności bez zgody w `TASKS.md`.
8. Gdy coś jest niejasne albo sprzeczne ze specyfikacją, zatrzymaj się i opisz to w raporcie jako `BLOCKER`, zamiast zgadywać.

## Gałęzie

- Wykonawca pracuje na gałęzi `task/<numer>-<slug>` (np. `task/6-ai-function`), nie na `main`.
- Claude przegląda `git diff main...task/<...>`, uruchamia testy, potem scala i wypycha.
- Claude nie edytuje plików zadania, dopóki status to `IN PROGRESS`.

## Szablon raportu (`REPORTS.md`, nowy wpis na górze)

```
## Zadanie N: <tytuł>  —  <data>
STATUS: READY FOR REVIEW | BLOCKED
Gałąź / commity: <nazwa>, <hashe>
Zmienione pliki: <lista>
Co zrobiłem: <2-5 zdań>
Dowód: `npm test` → <ostatnie linie>; `npm run build` → <ostatnie linie>
Decyzje własne: <czego nie było w zleceniu>
Pytania / blockery: <lub "brak">
```

## Kryteria przejęcia projektu przez Claude

Ocena po każdym raporcie, werdykt wprost po kilku raportach (minimum 3). Claude przejmuje projekt i mówi to użytkownikowi, gdy zachodzi którykolwiek punkt:

1. **Fałszywe "działa":** raport twierdzi, że testy/build przechodzą, a po uruchomieniu u Claude nie przechodzą (2 razy).
2. **Złamane zasady:** push, edycja plików poza `Files`, sekret w repo, nowa zależność bez zgody.
3. **Poprawki bez końca:** to samo zadanie wraca z `CHANGES REQUESTED` więcej niż 2 razy.
4. **Błędy bezpieczeństwa lub danych:** pominięta walidacja, wyciek klucza, obejście RLS, utrata danych.
5. **Ignorowanie specyfikacji:** zachowanie sprzeczne ze spec mimo wskazania w przeglądzie.

Każdy przegląd Claude zapisuje w `TASKS.md` z liczbą poprawek, żeby werdykt opierał się na faktach.

## Przegląd (Claude)

Claude odpowiada w `TASKS.md` pod zadaniem: `REVIEW: ACCEPTED` lub `REVIEW: CHANGES REQUESTED` z listą poprawek. Przy poprawkach wykonawca dopisuje nowy wpis w `REPORTS.md`.
