# Wydania do App Store i Google Play

## Wersjonowanie
- **SemVer `X.Y.Z`**, źródłem prawdy o ostatnim wydaniu są **tagi git `vX.Y.Z`** (`scripts/bump-version.sh`). Plik `VERSION` = wersja w przygotowaniu / ostatnio wydana.
- `VERSION` zasila `app.config.js` (→ `expo.version` = iOS `CFBundleShortVersionString`, Android `versionName`). `package.json`, `package-lock.json` i `app.json` (fallback dla Expo Go) synchronizuje `scripts/apply-version.sh`; test `bumpVersion.test.ts` pilnuje spójności.
- **Numer buildu** (iOS `buildNumber`, Android `versionCode`) nadaje EAS (`appVersionSource: remote` + `autoIncrement` w profilach `production` i `shadow`). Ponowny build tej samej wersji (np. po odrzuconym uploadzie) po prostu dostaje następny numer. W appce widać „Wersja X.Y.Z (build N)" na ekranie Konto, a `X-UD-Client` niesie tę samą wersję do backendu.
- Kiedy co: **patch** – poprawki; **minor** – nowa funkcja; **major** – zmiana łamiąca albo istotna zmiana produktu (tylko jawnie, `make release-major`).
- Pierwsze wydanie = `VERSION` z repo (`1.0.0`). Wersję ręcznie podbijasz w `VERSION` tylko wyjątkowo – skrypt weźmie ją dosłownie.

## CHANGELOG.md
Po polsku, **dla użytkownika** (nie lista commitów). Na górze zawsze `## RELEASE-CANDIDATE` – tu dopisujesz zmiany na bieżąco; przy wydaniu zamienia się na `## vX.Y.Z — DATA`, a nad nim powstaje nowy, pusty `RELEASE-CANDIDATE`. Wydanie z pustym `RELEASE-CANDIDATE` jest blokowane. Treść sekcji to „Co nowego" w sklepach (`make release-notes`). Pomoc: `make log-from-last-tag`.

## Procedura wydania
1. Zmiany zmergowane do `main`, drzewo czyste (release z innej gałęzi jest blokowany).
2. Uzupełnij `## RELEASE-CANDIDATE` w `CHANGELOG.md`, zacommituj.
3. `make release-patch` | `release-minor` | `release-major` – sprawdza czystość i gałąź, `release-check` (typecheck, brak `EXPO_PUBLIC_E2E` w `eas.json`, **ostrzeżenie o zmianie `SCHEMA`**), `test-staging`, potem bump, commit `chore: release vX.Y.Z`, tag `vX.Y.Z`, push `main` + tagu. Przerwane w połowie? Uruchom ten sam target ponownie – wznowi się bez podwójnego bumpu.
4. `make build-all` (albo `build-ios` / `build-android`) – tylko na commicie z tagiem bieżącej wersji i czystym drzewie.
5. Przetestuj artefakt z EAS na prawdziwym urządzeniu (iOS: TestFlight, Android: internal).
6. `make submit-ios submit-android` (Play: track `internal`, szkic; promocja w konsoli).
7. `make release-notes` → wklej do „Co nowego".
8. **Po publikacji w sklepach** podbij `latestVersion` (i prawdziwy `storeUrl` iOS) w `../uprzejmiedonosze/src/api/config/app.json` – bez tego miękka zachęta do aktualizacji nigdy się nie pojawi (dziś `1.0.0`, iOS `id0000000000` to placeholder).
9. Jeśli `release-check` ostrzegał o zmianie `SCHEMA`: dopiero teraz wdrażaj backend z podbitym `VISION_SCHEMA` (od tej chwili starsze appki dostają 426). Kolejność: SCHEMA w appce → build w sklepach → publikacja → backend (zob. `docs/NFR.md`).

Profile `staging` i `shadow` (wewnętrzne testy) są poza tym procesem – nie tagujemy ich.

## Staging w Google Play (testy wewnętrzne)
Build z backendem stagingu rozsyłany testerom przez Play (track **internal**, do 100 testerów, bez review Google). Profil EAS `staging-play`
(AAB, `EXPO_PUBLIC_UD_ENV=staging`, `autoIncrement` – licznik `versionCode` wspólny z `production`), submit `staging-play` (internal, draft).
1. Zacommituj zmiany (EAS buduje z gita), potem `make build-staging-play` i pobierz `.aab` z linku EAS.
2. **Pierwszy** upload ręcznie: Play Console → Testing → Internal testing → Create new release → wgraj `.aab` (Play App Signing: zgódź się na podpis Google, kluczem uploadu jest keystore z EAS) → Save → Review → Start rollout.
   Tester → zakładka Testers: lista e-maili (grupa), skopiuj **link opt-in**; tester musi mieć to konto Google na telefonie.
3. Kolejne wersje: `make build-staging-play && make submit-staging-play` (wymaga klucza konta usługi Play: Play Console → Setup → API access → konto usługi z uprawnieniem do wydań,
   JSON wgraj do EAS: `eas credentials -p android` → *Google Service Account Key for Play Store Submissions*; nie commituj go).
4. **Logowanie Google na stagingu:** po pierwszym uploadzie skopiuj SHA-1 *App signing key certificate* (Play Console → Test and release → App integrity) i dodaj klienta OAuth typu Android
   (package `net.uprzejmiedonosze.pro` + to SHA-1) w projekcie Google Cloud/Firebase **stagingu** (`uprzejmiedonosze-1494607701827`); dodaj też SHA-1 uploadu (z `eas credentials`),
   żeby działały buildy instalowane z APK. Bez tego „Zaloguj przez Google” w buildzie z Play zwróci błąd; e-mail-link działa od razu. Passkeye na stagingu są wyłączone (`passkeysAllowed`).
5. Prod i staging mają ten sam `applicationId`, więc w sklepie to jedna aplikacja: build staging w internal nie przeszkadza w przyszłym production (kolejne `versionCode` rosną), ale **nie promuj** go do closed/open/production.

## Przed pierwszym wydaniem (nie zrobione w repo – do ustalenia)
> **Stan: brak konta Apple Developer** – iOS wstrzymany (build, submit, TestFlight, passkeye na iOS, `ascAppId`/`appleTeamId`, plik AASA). Do czasu założenia konta wydawaj tylko Androida: `make build-android`, `make submit-android` (nie `build-all`).

Blokery odrzucenia przez sklepy:
1. **Konto dla recenzentów.** Logowanie to e-mail-link / Google / passkey – recenzent Apple/Google nie odbierze Twojej poczty. Potrzebna ścieżka demo (konto testowe + sposób zalogowania podany w notatkach dla recenzenta), inaczej odrzucenie.
2. ~~Sign in with Apple (wytyczna 4.8)~~ ✅ Google ukryty na iOS (`AccountScreen`), zostają e-mail-link i passkey – własne logowanie, 4.8 nie obowiązuje. Wrócisz do Google na iOS = trzeba dodać Sign in with Apple.
3. **Polityka prywatności (publiczny URL) + Apple Privacy Nutrition Labels + Google Data safety** – inwentarz i ściąga do formularzy: `docs/STORE-PRIVACY.md` (+ zgoda na AI ✅ `lib/aiConsent.ts`, luki w polityce do uzupełnienia na www) (zdjęcia z EXIF/GPS, e-mail, lokalizacja, pisma urzędowe). Usuwanie konta w appce jest (`AccountScreen`) – opisz je też w formularzach.
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
