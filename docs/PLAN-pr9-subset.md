# Plan: wybrane funkcje z PR #9

Źródło: https://github.com/uprzejmiedonosze/mobile/pull/9 (head `51f68e9`). Baza: `origin/main` (`ac86a4b`), nowa gałąź.
Przenosimy ręcznie, bez cherry-picka. Lokalna gałąź `pr9` nie nadaje się na bazę (zawiera migrację na expo-router).

## Decyzje

- Bez expo-routera. Zostaje `App.tsx`, React Navigation i dolne menu `UdTabs`.
- Nagłówki natywne z native-stack, na wszystkich ekranach.
- Hero wbudowany w aplikację, z `../uprzejmiedonosze/src/img/hero.jpg`. Przyciski logowania bez zmian.
- Deep-linki: Start, Nowe, Lista, Poczekalnia, Konto, Aparat.
- Brak nowych zależności.

## Zakres

### 1. Nagłówki
- `App.tsx`: włączyć nagłówek native-stack z tytułami; usunąć `UdHeader` z osiągalnych ekranów. Stare ekrany pipeline'u bez zmian.
- Kolory jak dziś (zielone tło, białe napisy). Na iOS duży tytuł na ekranach zakładek, mały na ekranach procesu.
- Ekrany zakładek (Start, Nowe, Zgłoszenia, Poczekalnia, Konto): bez przycisku i gestu „wstecz”; przełączanie zakładek nie dokłada ekranów na stos. Sprawdzić parametr `filter` listy i otwieranie edycji (`editId`).
- Start: logo (z „PRO”) jako tytuł. Logowanie i splash bez nagłówka.
- Zachować działanie przycisków: „popraw” na potwierdzeniu, wylogowanie na rejestracji, historia WebView na stronie, brak powrotu na ekranie po wysłaniu.
- Dopasować `StatusBar` do koloru nagłówka.
- Sprawdzić zwijanie dużego tytułu i odstęp klawiatury (`KeyboardAvoidingView`) na iOS.

### 2. Lista i szczegóły
- Dotknięcie karty otwiera arkusz od dołu (`presentation: 'formSheet'`), zamiast rozwijania. Wzór: `ReportSheet`, `useReportSheet`.
- Wygląd karty, teksty, filtry i link do pism bez zmian.
- Wyszukiwarka w nagłówku (`headerSearchBarOptions`) zamiast pola nad listą.
- Toasty widoczne nad arkuszem.
- Przejście z arkusza (edycja, strona, konto) najpierw go zamyka.
- Android: sprawdzić przewijanie i klawiaturę w arkuszu; w razie problemów zwykły ekran modalny.

### 3. Logowanie
- Zdjęcie zmniejszyć przed wbudowaniem (oryginał 1200×903, 511 KB) i dopasować `HERO_ASPECT`.
- `LoginHero`: samo zdjęcie od krawędzi do krawędzi (także pod paskiem statusu), bez nakładek, gradientu i animacji.
- Przyciski, formularz i teksty bez zmian.

### 4. Konto
- Alert „Usunąć passkey?” przed usunięciem.
- Zapis aktywny dopiero po faktycznej zmianie (porównanie z ostatnio wczytanym lub zapisanym stanem).

### 5. Walidacja
- `ProfileFields`: błąd formatu po wyjściu z pola.
- `profileMissing` z testami: podpowiedź przy rejestracji i w koncie.
- Nowe zgłoszenie: pod „Dalej” informacja, czego brakuje.
- Bez nowych etykiet, pól i układu.

### 6. Start
- Główny przycisk „Zrób zdjęcia”; pod nim Poczekalnia (licznik tylko > 0) i „Nowe zgłoszenie”.
- Bez poczekalni główny zostaje „Nowe zgłoszenie”.

### 7. Klawiatura
- `KeyboardDoneBar` (iOS) przy polach wielowierszowych: komentarz, uwagi w arkuszu, notatka z pisma.
- Przechodzenie „Dalej” między polami danych konta.
- Autouzupełnianie i typ przycisku Return: e-mail logowania i dane konta. Adres zgłoszenia bez autouzupełniania (to miejsce wykroczenia).

### 8. Deep-linki
- Własna lista adresów (`src/lib/deepLink.ts`, `useDeepLinks`) zamiast `linking`, schematy `udpro` i `udpro-dev`:
  `/app`, `/app/new`, `/app/list`, `/app/waiting`, `/app/account`, `/app/camera`.
- Poczekalnia i aparat tylko przy `waitingRoomEnabled`. Bez sesji link nic nie otwiera.
- Inne linki (`e2e-login`, logowanie z maila) nie są na liście, więc przechodzą obok.
- Start na zimno: adres czeka, aż sprawdzi się sesja i stanie właściwy stos.
- Bez `/page` i ekranów procesu.

## Kolejność

Nagłówki → lista z arkuszem → logowanie i Konto → walidacja, Start, klawiatura → deep-linki.
Osobny commit na każdy etap.

## Weryfikacja

- Gałąź od `origin/main` przed pierwszym commitem.
- Przed edycją symbolu GitNexus `impact`, przed commitem `detect_changes`; commity przez `/commit`.
- `npm run typecheck`, `npm test`.
- Przejście ekranów w symulatorze iOS i na Androidzie; scenariusze `e2e/` (mogą zależeć od tekstów nagłówka).
- Każdy deep-link: zalogowany, wylogowany, start na zimno.
- `CHANGELOG.md` i `AGENTS.md` opisują tylko przeniesiony zakres.

## Poza zakresem

expo-router, `NativeTabs`, pływający „+”, widget iOS, `@expo/ui`, nowy wygląd kart i filtrów (B, C), pozostałe zmiany
Startu, potwierdzenia, ekranu po wysłaniu, rejestracji, limitów i poczekalni (F–K), animacje sekcji i przycisków (M).
