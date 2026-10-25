# Wydania do App Store i Google Play

> **TYMCZASOWO (od 2026-10-21): profil `production` buduje na backend STAGINGU** – w testach otwartych Play jest aplikacja maksymalnie zbliżona do produkcji (ten sam pakiet, podpis Play, kanał), ale logująca do projektu staging. Patrz „Testy otwarte na stagingu”.

## Testy otwarte na stagingu (przed premierą)
Profil `production` w `eas.json`: `EXPO_PUBLIC_UD_ENV=staging`, `EXPO_PUBLIC_SENTRY_ENV=staging`. Ten sam klucz Play podpisuje też `staging-play` (internal, bez review) – szybki test przed tagiem: `make staging-play`. Passkeye są w appce tylko przy `EXPO_PUBLIC_UD_ENV=prod` (`passkeysAllowed`) – na stagingu przycisk jest ukryty.
Build z Play jest podpisany **kluczem Play App Signing** (Play Console → Test and release → App integrity → *App signing key certificate*: SHA-1 i SHA-256), więc:
- **Google:** klient OAuth typu Android `net.uprzejmiedonosze.pro` + SHA-1 klucza Play App Signing w projekcie **staging** (`uprzejmiedonosze-1494607701827`). Para package + SHA-1 może być tylko w jednym kliencie w całym Google Cloud – jeśli jest w prod, najpierw usuń ją z proda.
- **Passkey:** backend stagingu – `src/.well-known/assetlinks.json` (`delegate_permission/common.get_login_creds`, `net.uprzejmiedonosze.pro`, SHA-256 klucza Play) i env `PASSKEY_ANDROID_KEY_HASHES` (ten SHA-256 w base64url) na `staging.uprzejmiedonosze.net`.

**Przełączenie na produkcję** (przed pierwszym wydaniem na produkcję):
1. `eas.json` → `production.env`: `EXPO_PUBLIC_UD_ENV=prod`, `EXPO_PUBLIC_SENTRY_ENV=prod` (to też włącza passkeye).
2. Klient OAuth Android (SHA-1 klucza Play) przenieś ze stagingu do proda (klient „UD Pro – Google Play”). Usunięta para bywa przez jakiś czas zablokowana – zrób to z zapasem.
3. `assetlinks.json` i `PASSKEY_ANDROID_KEY_HASHES` z kluczem Play na prodzie (staging może je zachować).
4. Nowy tag i build. Konta testerów ze stagingu nie przechodzą na prod – trzeba zalogować się od nowa.

## Wersjonowanie
- **SemVer `X.Y.Z`**, źródłem prawdy o ostatnim wydaniu są **tagi git `vX.Y.Z`** (`scripts/bump-version.sh`). Plik `VERSION` = wersja w przygotowaniu / ostatnio wydana.
- `VERSION` zasila `app.config.js` (→ `expo.version` = iOS `CFBundleShortVersionString`, Android `versionName`). `package.json`, `package-lock.json` i `app.json` (fallback dla Expo Go) synchronizuje `scripts/apply-version.sh`; test `bumpVersion.test.ts` pilnuje spójności.
- **Numer buildu** (iOS `buildNumber`, Android `versionCode`) nadaje EAS (`appVersionSource: remote` + `autoIncrement` w profilach `production` i `shadow`). Ponowny build tej samej wersji (np. po odrzuconym uploadzie) po prostu dostaje następny numer. W appce widać „Wersja X.Y.Z (build N)" na ekranie Konto, a `X-UD-Client` niesie tę samą wersję do backendu.
- Kiedy co: **patch** – poprawki; **minor** – nowa funkcja; **major** – zmiana łamiąca albo istotna zmiana produktu (tylko jawnie, `make release-major`).
- Pierwsze wydanie = `VERSION` z repo (`1.0.0`). Wersję ręcznie podbijasz w `VERSION` tylko wyjątkowo – skrypt weźmie ją dosłownie.

## CHANGELOG.md
Po polsku, **dla użytkownika** (nie lista commitów). Na górze zawsze `## RELEASE-CANDIDATE` – tu dopisujesz zmiany na bieżąco; przy wydaniu zamienia się na `## vX.Y.Z — DATA`, a nad nim powstaje nowy, pusty `RELEASE-CANDIDATE`. Wydanie z pustym `RELEASE-CANDIDATE` jest blokowane. Treść sekcji to „Co nowego" w sklepach – w całości, gdy mieści się w limicie Play (500 znaków), inaczej jej streszczenie przez LLM (podgląd: `make release-notes`, dla RC: `make release-notes RC=1`). Pomoc: `make log-from-last-tag`.

## Procedura wydania
1. Zmiany zmergowane do `main`, drzewo czyste (release z innej gałęzi jest blokowany).
2. Uzupełnij `## RELEASE-CANDIDATE` w `CHANGELOG.md`, zacommituj.
3. `make release-patch` | `release-minor` | `release-major` – sprawdza czystość i gałąź, `release-check` (typecheck, brak `EXPO_PUBLIC_E2E` w `eas.json`, **ostrzeżenie o zmianie `SCHEMA`**), `test-staging`, potem bump, „Co nowego” do `play-notes/vX.Y.Z.txt` (streszczenie przez `claude -p` – CLI Claude Code musi być zainstalowany i zalogowany; tekst jest wypisywany), commit `chore: release vX.Y.Z`, tag `vX.Y.Z`, push `main` + tagu. Przerwane w połowie? Uruchom ten sam target ponownie – wznowi się bez podwójnego bumpu.
4. **Push tagu sam uruchamia GitHub Actions „Wydanie Android”** (`.github/workflows/release-android.yml`): `eas build --local` profilu `production` na runnerze GitHuba (AAB, `versionCode` z EAS) → submit do Google Play, **testy otwarte** (track `beta`), szkic → nazwa „X.Y.Z (versionCode)” i „Co nowego” z `play-notes/vX.Y.Z.txt`. AAB zostaje też jako artefakt runu (14 dni). Postęp: `make workflow-runs` albo GitHub → Actions. Nie ruszył albo padł? `make release-android-run` (ten sam workflow na bieżącym tagu).
5. Przetestuj build na prawdziwym urządzeniu (np. staging z internal z tego samego commitu albo szkic na testach otwartych po wypuszczeniu).
6. Wypuszczenie szkicu na testach otwartych i później promocja do produkcji – ręcznie w Play Console. Gdy przejdziemy z testów otwartych na produkcję, zmień `submit.production.android.track` w `eas.json` na `production` i `--track` w jobie `play_notes`. iOS: patrz „iOS – checklista do pierwszego wydania”.
7. „Co nowego” ustawia workflow (`scripts/play-notes.js`). Limit Play: 500 znaków. Sekcja, która się mieści, idzie w całości (punkty `•`); dłuższą streszcza lokalnie `claude -p` (sonnet, bez narzędzi, cel ≤400 znaków; za długa odpowiedź → ponowienie z prośbą o skrócenie, do 3 prób). Streszczenie powstaje na Twoim komputerze, bo na runnerze GitHuba nie ma Claude Code: przy wydaniu w `apply-version.sh` (plik `play-notes/vX.Y.Z.txt` w commicie wydania – chcesz poprawić tekst, popraw plik i `git commit --amend` przed pushem tagu albo później `make play-notes`), dla stagingu w `make staging-play` (input `notes` workflowu). Bez `claude` albo gdy wszystkie próby zawiodą – ostrzeżenie i stary algorytm (kolejne punkty, ile się zmieści, + „…i więcej zmian.”). Ręczna poprawka w Play: `make play-notes` (CODE=N dla konkretnego buildu).
   Build release ma włączony R8 (`enableMinifyInReleaseBuilds` w `app.json`). Plik deobfuskacji jest w AAB (`BUNDLE-METADATA/…/proguard.map`) i Play bierze go sam – nie wysyłamy go osobno (API odrzuca to dla już wgranego bundla). Kopia `mapping.txt` jest w artefakcie joba.
8. **Po publikacji w sklepach** podbij `latestVersion` (i prawdziwy `storeUrl` iOS) w `../uprzejmiedonosze/src/api/config/app.json` – bez tego miękka zachęta do aktualizacji nigdy się nie pojawi (dziś `1.0.0`, iOS `id0000000000` to placeholder).
9. Jeśli `release-check` ostrzegał o zmianie `SCHEMA`: dopiero teraz wdrażaj backend z podbitym `VISION_SCHEMA` (od tej chwili starsze appki dostają 426). Kolejność: SCHEMA w appce → build w sklepach → publikacja → backend (zob. `docs/NFR.md`).

Profile `staging` i `shadow` (wewnętrzne testy) są poza tym procesem – nie tagujemy ich.

## GitHub Actions (automatyzacja wydań)
Plan **Free** EAS daje 15 buildów Androida w miesiącu i 60 minut EAS Workflows. Dlatego buildy idą wyłącznie przez **`eas build --local` na runnerze GitHuba**: nie wliczają się do limitu, a repo jest publiczne, więc minuty Actions są bez limitu. Z EAS dalej korzystamy przez `EXPO_TOKEN`: keystore uploadu (EAS credentials), licznik `versionCode` (`appVersionSource: remote`), zmienne środowiska `production` i EAS Submit (nie wlicza się do limitu buildów).
- Plik `.github/workflows/release-android.yml`. Trigger: push tagu `v*` (profil `production` → beta, szkic) albo ręcznie z wyborem profilu (`make staging-play` → `staging-play` z `main` → internal; `make release-android-run` → `production` na tagu). Production spoza tagu bieżącej wersji jest blokowany. Wejście `notes` (staging) = gotowe „Co nowego” z `make staging-play`.
- **Sekrety repo** (GitHub → Settings → Secrets and variables → Actions, jednorazowo):
  - `EXPO_TOKEN` – token z expo.dev → Account settings → Access tokens (najlepiej robot użytkownika z dostępem do projektu).
  - `SENTRY_AUTH_TOKEN` – ten sam co w EAS. Zmienne EAS z `--visibility secret` nie są dostępne poza serwerami EAS, więc lokalny build ich nie dostanie. Bez tokenu upload source map wywala build production (staging ma `SENTRY_DISABLE_AUTO_UPLOAD`).
  - `PLAY_SERVICE_ACCOUNT_JSON` – **treść** klucza konta usługi Play (`gh secret set PLAY_SERVICE_ACCOUNT_JSON < secrets/<klucz>.json`), dla `scripts/play-notes.js`.
- Klucz konta usługi Google Play musi być też w EAS credentials (patrz „Staging w Google Play”, pkt 3) – korzysta z niego EAS Submit.
- Nie dokładaj triggera na push do `main` bez potrzeby: każdy staging zużywa `versionCode` i podmienia build testerom.

### Tory w Play
- **internal** = staging (`staging-play`, wydawany testerom od razu, `releaseStatus: completed`), **beta (testy otwarte)** = wydania z tagu (szkic). Nie mieszaj – production na internal podmieniłby testerom staging.

## Staging w Google Play (testy wewnętrzne)
Build z backendem stagingu rozsyłany testerom przez Play (track **internal**, do 100 testerów, bez review Google). Profil EAS `staging-play`
(AAB, `EXPO_PUBLIC_UD_ENV=staging`, `autoIncrement` – licznik `versionCode` wspólny z `production`), submit `staging-play` (internal, draft).
1. Wypchnij commity i uruchom `make staging-play`; `.aab` pobierzesz z artefaktów runu w GitHub Actions.
2. **Pierwszy** upload ręcznie: Play Console → Testing → Internal testing → Create new release → wgraj `.aab` (Play App Signing: zgódź się na podpis Google, kluczem uploadu jest keystore z EAS) → Save → Review → Start rollout.
   Tester → zakładka Testers: lista e-maili (grupa), skopiuj **link opt-in**; tester musi mieć to konto Google na telefonie.
3. Kolejne wersje: `make staging-play` (GitHub Actions: build + submit z `origin/main` + nazwa „X.Y.Z (N) staging” i „Co nowego” = streszczenie lokalnego RELEASE-CANDIDATE; build trafia do testerów od razu – najpierw wypchnij commity). EAS Submit wymaga klucza konta usługi Play (Play Console → Setup → API access → konto usługi z uprawnieniem do wydań,
   JSON wgraj do EAS: `eas credentials -p android` → *Google Service Account Key for Play Store Submissions*; nie commituj go).
4. **Logowanie Google na stagingu nie działa w buildach `net.uprzejmiedonosze.pro`** (staging APK, `staging-play`) – testerzy logują się e-mail-linkiem. Para package + SHA-1 może być tylko w jednym kliencie OAuth w całym Google Cloud, a obie pary pakietu `.pro` (klucz Play i keystore EAS) są w projekcie **prod** – patrz „Logowanie Google: projekty i klienci OAuth”. Passkeye poza prod są wyłączone (`passkeysAllowed`).
5. Prod i staging mają ten sam `applicationId`, więc w sklepie to jedna aplikacja: build staging w internal nie przeszkadza w przyszłym production (kolejne `versionCode` rosną), ale **nie promuj** go do closed/open/production.

## Logowanie Google: projekty i klienci OAuth
Natywne logowanie Google na Androidzie wymaga klienta OAuth typu **Android** (package + SHA-1 certyfikatu podpisu) w **tym samym** projekcie Google Cloud co web client ID z `src/config.ts`. Google przyjmuje daną parę package + SHA-1 tylko w jednym kliencie w całym Google Cloud – stąd podział:

| Build (profil EAS) | Package | Podpis | Projekt / backend | Google login |
|---|---|---|---|---|
| Expo Go (`npm start`) | Expo Go | – | staging | nie (moduł natywny); e-mail-link tak |
| `development` | `net.uprzejmiedonosze.pro.dev` | keystore EAS (`.dev`) | staging `uprzejmiedonosze-1494607701827` | tak – klient „Uprzejmie Donoszę Pro” w stagingu (`.dev`) |
| `staging`, `staging-play` | `net.uprzejmiedonosze.pro` | keystore EAS / klucz Play | staging | **nie** (pary są w prodzie) |
| `shadow` | `net.uprzejmiedonosze.pro` | keystore EAS | prod `uprzejmie-donosze` | tak – klient „UD Pro – EAS” |
| `production` | `net.uprzejmiedonosze.pro` | klucz Play (App signing) | prod `uprzejmie-donosze` (**tymczasowo staging** – „Testy otwarte na stagingu”) | tak – klient „UD Pro – Google Play” (tymczasowo w projekcie staging) |

- SHA-1 klucza Play: Play Console → Protected with Play → Play Store protection → Play app signing → *App signing key certificate* (nie *Upload key*). SHA-1 keystore'a EAS: `eas credentials -p android` → profil.
- Weryfikacja własności aplikacji przy kliencie Android i ostrzeżenie o limicie 100 logowań dla scope'ów wrażliwych nie dotyczą logowania (używamy tylko `openid`/`email`/`profile`).
- Dodawanie SHA-1 pakietu `.pro` do projektu stagingu zablokuje (albo zepsuje) logowanie w produkcji – nie rób tego. Potrzeba Google na stagingu w Play → osobny `applicationId` (np. `.pro.staging`) i osobna aplikacja w Play Console.
- Wysyłka do Play z EAS: konto usługi `eas-play-submit@uprzejmie-donosze.iam.gserviceaccount.com` (projekt prod, Google Play Android Developer API włączone), uprawnienie „Release apps to testing tracks” w Play Console, klucz JSON w EAS credentials (poza repo).

## iOS – checklista do pierwszego wydania
Gotowe w repo: Info.plist bez generycznych angielskich tekstów (wyłączone `NSLocationAlways*`, `NSMotionUsageDescription`, `NSFaceIDUsageDescription` – appka nie używa lokalizacji w tle ani biometrii SecureStore; jeden polski tekst galerii dla `expo-image-picker` i `expo-media-library`), `NSLocalNetworkUsageDescription`/`_expo._tcp` z dev clienta usuwa w buildzie release faza `expo-dev-launcher`, manifesty prywatności (`PrivacyInfo.xcprivacy`) dostarczają pody RN/Expo. Na iOS nie wołamy `GoogleSignin.configure` (brak `iosClientId`, przycisk ukryty), a passkeye działają tylko na prod (i shadow) – iOS ma `webcredentials` wyłącznie dla tych domen. Podgląd wynikowego Info.plist: `npx expo prebuild -p ios --no-install` w kopii repo (nie commituj `ios/`).

Po założeniu konta Apple Developer:
1. **Team ID** (developer.apple.com → Membership). Konto organizacji wymaga D-U-N-S; konto osobiste pokaże w sklepie imię i nazwisko jako sprzedawcę.
2. **App Store Connect** → nowa aplikacja: bundle `net.uprzejmiedonosze.pro`, język główny polski, SKU. `ascAppId` (Apple ID aplikacji) i `appleTeamId` → `eas.json` `submit.production.ios`.
3. **Certyfikat i profil** – `eas credentials -p ios`; EAS sam włącza capability *Associated Domains* dla `associatedDomains` z `app.config.js`.
4. **AASA dla passkeyów** – `https://uprzejmiedonosze.net/.well-known/apple-app-site-association` (i na shadow): `{"webcredentials":{"apps":["<TEAM_ID>.net.uprzejmiedonosze.pro"]}}`, `Content-Type: application/json`, bez przekierowań. Bez tego przycisk passkey na iOS kończy się błędem.
5. **Build** – job iOS w GitHub Actions na runnerze macOS (`eas build --local -p ios`, analogicznie do Androida; do dopisania w `release-android.yml` albo osobnym workflowie).
6. **TestFlight** – `eas submit -p ios --path <ipa>` w tym samym jobie. Profil `production` jest dziś na stagingu (patrz wyżej): na TestFlight to w porządku, ale przed wysłaniem do recenzji App Store przełącz środowisko (lista „Przełączenie na produkcję” dotyczy też iOS) – konto demo musi istnieć na tym backendzie, na który wskazuje build.
7. **Test na iPhonie przed recenzją**: data i GPS ze zdjęć (iOS idzie ścieżką systemowego pickera + `MediaLibrary.getAssetInfoAsync`; sprawdź też wybór „Ograniczony dostęp” do zdjęć i zdjęcia HEIC), aparat w `LetterScreen`, mapa i „moja lokalizacja”, logowanie e-mail-linkiem i passkeyem, usuwanie konta.
8. **Formularze sklepowe** – App Privacy z `docs/STORE-PRIVACY.md` (sekcja 2), zrzuty iPhone 6,9" (1320×2868; iPad niepotrzebny, `supportsTablet: false`), opis, słowa kluczowe, support URL, ocena wiekowa, notatki dla recenzenta z kontem demo.
9. Po publikacji – prawdziwy `storeUrl` iOS w backendzie (pkt 8 „Procedury wydania”).

Ryzyka recenzji: brak ścieżki logowania dla recenzenta (pkt 1 niżej – **bloker**, wytyczna 2.1) oraz zgoda na przekazanie zdjęć do AI (wytyczna 5.1.2(i) – decyzja z 2026-10-15, `docs/STORE-PRIVACY.md`).

## Przed pierwszym wydaniem (nie zrobione w repo – do ustalenia)
> **Stan: brak konta Apple Developer** – iOS wstrzymany (build, submit, TestFlight, passkeye na iOS, `ascAppId`/`appleTeamId`, plik AASA). Do czasu założenia konta wydajemy tylko Androida (GitHub Actions).

Blokery odrzucenia przez sklepy:
1. **Konto dla recenzentów.** Logowanie to e-mail-link / Google / passkey – recenzent Apple/Google nie odbierze Twojej poczty. Potrzebna ścieżka demo (konto testowe + sposób zalogowania podany w notatkach dla recenzenta), inaczej odrzucenie.
2. ~~Sign in with Apple (wytyczna 4.8)~~ ✅ Google ukryty na iOS (`AccountScreen`), zostają e-mail-link i passkey – własne logowanie, 4.8 nie obowiązuje. Wrócisz do Google na iOS = trzeba dodać Sign in with Apple.
3. **Polityka prywatności (publiczny URL) + Apple Privacy Nutrition Labels + Google Data safety** – inwentarz i ściąga do formularzy: `docs/STORE-PRIVACY.md` (przekazanie zdjęć do AI opisane tylko w polityce prywatności – bez okna zgody w appce, decyzja z 2026-10-15; luki w polityce do uzupełnienia na www) (zdjęcia z EXIF/GPS, e-mail, lokalizacja, pisma urzędowe). Usuwanie konta w appce jest (`AccountScreen`) – opisz je też w formularzach.
4. **Google Play – uprawnienia do zdjęć:** `READ_MEDIA_IMAGES` / `ACCESS_MEDIA_LOCATION` wymagają deklaracji (polityka Photo and Video Permissions) albo przejścia wyłącznie na systemowy picker.
5. **Nowe konto deweloperskie Play (osobiste):** zamknięte testy (12 testerów przez 14 dni) przed produkcją – sprawdź typ konta.

Konfiguracja:
6. ✅ `ITSAppUsesNonExemptEncryption: false` w `ios.infoPlist` (tylko HTTPS – wyłącza pytanie o export compliance przy każdym buildzie; to deklaracja prawna, potwierdź).
7. ✅ `supportsTablet: false` (iPad w trybie iPhone'a, bez zrzutów iPada).
8. `eas.json` → `submit.production.ios` (`ascAppId`, `appleTeamId`) po utworzeniu rekordu w App Store Connect; w backendzie prawdziwy `storeUrl` iOS.
9. Sentry (region UE, `https://de.sentry.io`): w EAS (środowisko `production`) muszą być `SENTRY_AUTH_TOKEN` (secret), `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL=https://de.sentry.io`
   i `EXPO_PUBLIC_SENTRY_DSN`; bez nich upload source map wywala build. Ustawianie: `eas env:create --environment production --name SENTRY_ORG --value <org> --visibility plaintext`
   (analogicznie pozostałe; token z `--visibility secret`), podgląd: `eas env:list production`. Release = `net.uprzejmiedonosze.pro@X.Y.Z+build`.
10. Klucz Android (`*.jks` w katalogu projektu, ignorowany): przenieś do EAS credentials i zrób kopię poza repo; Play App Signing włączony.
11. Passkeye: `associatedDomains` i plik AASA na backendzie dla domen prod/shadow.
12. ✅ CI: `.github/workflows/ci.yml` (typecheck + jest na PR/main, `expo-doctor` nieblokujący). Kontrakt staging i e2e poza CI (sekrety/telefon).

Treści sklepowe (poza repo): nazwa i opisy PL, słowa kluczowe, kategoria, ocena wiekowa, support URL, zrzuty ekranu (telefon, iPad jeśli tablet), feature graphic Play, ikona 1024 bez kanału alfa.
