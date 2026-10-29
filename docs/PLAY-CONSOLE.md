# Google Play Console – co i gdzie przed wydaniem na produkcję

Aplikacja `net.uprzejmiedonosze.pro`. Stan na 2026-10-29: tory internal, closed (alpha) i open (beta) z buildem 17, brak wydania produkcyjnego.
Dane do formularzy prywatności: `docs/STORE-PRIVACY.md`. Proces wydania: `docs/RELEASE.md`.

## 1. Dostęp do produkcji
✅ Jest (2026-10-29: Test and release → Production → aktywny „Create new release”), więc wniosek nie jest potrzebny. Tag `vX.Y.Z` wysyła build jako szkic na tor `production` (`eas.json` → `submit.production.android.track`).

## 2. App content (Treść aplikacji)
**Gdzie:** Policy and programs → **App content** (Zasady i programy → Treść aplikacji). Każdą pozycję trzeba zamknąć, inaczej wydanie zostanie zablokowane.

| Pozycja | Co wpisać |
|---|---|
| Privacy policy | `https://uprzejmiedonosze.net/polityka-prywatnosci.html` |
| App access (Dostęp do aplikacji) | „All or some functionality is restricted” → Add instructions. Tekst poniżej („Instrukcja dla recenzenta”). Bez tego aplikacja zostanie odrzucona. |
| Ads | Nie zawiera reklam. |
| Advertising ID | Nie używa (`AD_ID` jest zablokowany w `app.json`). |
| Content rating | Kwestionariusz IARC, kategoria „Utility / Productivity / Other”. Brak przemocy, hazardu i treści dla dorosłych. Użytkownicy nie wymieniają między sobą treści ani nie komunikują się w appce: zgłoszenie trafia do urzędu, nie do innych użytkowników. Udostępnianie lokalizacji: lokalizacja nie jest pokazywana innym użytkownikom. |
| Target audience | 18+ (zgłaszający podaje dane osobowe). Bez „Teacher Approved” i bez Families. |
| News apps | Nie. |
| Government apps | **Nie** – aplikacja nie jest tworzona przez organ publiczny ani w jego imieniu. Policja i SM są tylko adresatami zgłoszeń. |
| Financial features / Health | Brak. |
| Data safety | Patrz punkt 3. |
| Photo and video permissions | Patrz punkt 4. |

### Instrukcja dla recenzenta (App access)
Name: `Demo account`. Username: `szymon+review@uprzejmiedonosze.net`. Password: kod `DEMO_LOGIN_CODE` z `services/.env.staging` (backend). Any other information:
> Sign-in uses a one-time link sent by e-mail, so this demo account signs in with a code instead:
> 1. Tap the red button "Zaloguj przez e-mail".
> 2. Enter the username above and tap "Wyślij link logowania". The app restarts in a test environment.
> 3. Enter the code (password above) in the field "kod" and tap "Zaloguj".
> Photos without GPS data from Poland: after adding photos, set the location on the map (e.g. any street in Warsaw) – the address is required before "Dalej".
> Reports created with this account are NOT sent to the police or municipal guards. Logging out returns the app to the production environment.

Przed wysłaniem do recenzji: backend z `POST /api/rest/demo-login` wdrożony na staging i prod (env z `services/.env.staging` / `.env.prod`), konto demo istnieje na stagingu z wypełnionym profilem i zaakceptowanym regulaminem (limit analiz zdjęć na stagingu nie wyczerpany; odznaka PRO, jeśli recenzent ma zobaczyć skanowanie pism), a ścieżkę sprawdziłeś na buildzie prod. Gdyby ktoś przez pomyłkę wpisał e-mail demo, link „Wróć do zwykłego logowania” przywraca prod.

## 3. Data safety (Bezpieczeństwo danych)
**Gdzie:** App content → Data safety → Start. Treść: `docs/STORE-PRIVACY.md`, sekcja 3. W skrócie:
- Collects data: **Yes**. Shares data: **No**. Dostawcy działający w naszym imieniu (OpenAI, Plate Recognizer, Mapbox, Mailgun, Sentry, Firebase) to „service providers”, nie „sharing”. Wysyłka zgłoszenia do SM/Policji na żądanie użytkownika też nie jest „sharing”.
- Encrypted in transit: **Yes**. Users can request deletion: **Yes**, Data deletion URL = `https://uprzejmiedonosze.net/polityka-prywatnosci.html#usuwanie-konta`.
- Typy danych, wszystkie: collected, required, purpose „App functionality” (Crash logs: „Analytics” nie, tylko „App functionality”):
  - Personal info: Name, Email address, User IDs, Address, Phone number (optional);
  - Location: Precise location;
  - Photos and videos: Photos;
  - App activity: Other user-generated content (treść zgłoszeń, komentarze, pisma);
  - App info and performance: Crash logs.

## 4. Deklaracja uprawnień do zdjęć
**Gdzie:** App content → **Photo and video permissions**. Pojawi się po wgraniu builda z `READ_MEDIA_IMAGES`.
- Uprawnienie: `READ_MEDIA_IMAGES` (oraz `ACCESS_MEDIA_LOCATION`).
- Uzasadnienie, kategoria „core functionality”. Proponowany tekst:
  > Aplikacja służy do zgłaszania wykroczeń parkingowych na podstawie zdjęć z galerii. Do zgłoszenia potrzebna jest data wykonania zdjęcia i jego lokalizacja GPS z metadanych EXIF – to one stanowią dowód, gdzie i kiedy doszło do wykroczenia. Systemowy Photo Picker usuwa lokalizację z metadanych, dlatego aplikacja ma własną galerię opartą na MediaStore (z `ACCESS_MEDIA_LOCATION`), w której użytkownik wybiera 2–3 zdjęcia do zgłoszenia. Do serwera trafiają wyłącznie wybrane zdjęcia; pozostałe są tylko wyświetlane jako miniatury na urządzeniu. Na Androidzie 14+ użytkownik może udzielić dostępu tylko do wybranych zdjęć.
- Dołącz krótkie nagranie ekranu: wybór zdjęć → data i adres uzupełnione automatycznie.

## 5. Strona sklepu
**Gdzie:** Grow users → Store presence → **Main store listing** (Rozwój → Obecność w sklepie → Główna strona aplikacji).
- Nazwa (≤30 zn.): „Uprzejmie Donoszę PRO”. Opis krótki (≤80 zn.) i pełny (≤4000 zn.) po polsku.
- **W opisie napisz wprost, że to aplikacja niezależna, a nie aplikacja Policji ani straży miejskiej.** Polityka Play dotycząca podszywania się i wprowadzania w błąd sprawdza to przy aplikacjach, które wspominają organy państwowe.
- Grafiki: ikona 512×512 PNG (32-bit, bez przezroczystych rogów), grafika funkcji 1024×500, co najmniej 2 zrzuty ekranu z telefonu (9:16, 1080×1920 albo większe; bez danych prawdziwych osób i tablic). Zrzuty tabletu są opcjonalne.
- **Gdzie:** Store presence → **Store settings**: kategoria „Auto i pojazdy” (albo „Narzędzia”), e-mail kontaktowy (`szymon+app@uprzejmiedonosze.net`), strona `https://uprzejmiedonosze.net`.

## 6. Wydanie
1. `make release-patch` (lub minor) → GitHub Actions → szkic na torze `production` (z `eas.json`).
2. **Gdzie:** Test and release → **Production** → szkic → „Edit release”: sprawdź nazwę i „Co nowego” → Next. Ostrzeżenia o deobfuskacji można pominąć: `mapping.txt` wgrywa workflow.
3. **Przed wdrożeniem przetestuj ten build.** Szkicu z toru produkcyjnego nie da się zainstalować ze sklepu. Zamiast tego: Test and release → **App bundle explorer** → ten `versionCode` → Downloads → *Signed, universal APK*. Zainstaluj go na telefonie z aplikacją ze sklepu: podpis jest ten sam, więc APK nadpisze aplikację. Sprawdź logowanie Google, passkeyem i linkiem z maila oraz szkic zgłoszenia, bez wysyłania.
4. Rozpocznij wdrażanie (Start rollout). Proponuję stopniowe: 20% → 100% po kilku dniach bez crashy w Sentry.
5. Pierwsza recenzja produkcyjna trwa zwykle od kilku godzin do kilku dni. Status widać w Publishing overview.

## 7. Testerzy ze stagingu
**Odcięcie (SCHEMA 10, 2026-10-29):** backend stagingu z `VISION_SCHEMA = 10` zwraca 426 buildom ≤ 1.1.7 (SCHEMA 9), które pokazują ekran „Zaktualizuj” z linkiem do Play. Testerzy mają tę blokadę do czasu wydania prod 1.2.0 (SCHEMA 10). **Nie uruchamiaj w tym czasie `make staging-play`:** nowy build staging ma SCHEMA 10, więc przywróciłby testerom działającą wersję testową.

Build produkcyjny łączy się z innym projektem Firebase niż staging. Po aktualizacji appka nie odnowi starej sesji i pokaże ekran logowania. Szkic ze stagingu sam znika, bo na prodzie go nie ma. Trzeba zalogować się kontem produkcyjnym, tym samym co na uprzejmiedonosze.net. Zgłoszenia ze stagingu nie przechodzą. Uprzedź testerów przed publikacją.

Play daje każdemu użytkownikowi build o najwyższym `versionCode` ze wszystkich ścieżek, do których należy. `staging-play` i `production` mają wspólny licznik. Build prod (18+) jest wyższy niż build 17 ze stagingu, który jest dziś na alpha i beta, więc testerzy tych ścieżek dostaną prod automatycznie. Ryzyko jest jedno:
- **internal:** każdy `make staging-play` po wydaniu prod dostanie wyższy `versionCode` i przeniesie testerów internal z powrotem na staging. Zostaw na liście internal tylko siebie albo przestań wysyłać staging do Play.
