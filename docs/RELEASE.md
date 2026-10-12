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

## Przed pierwszym wydaniem (nie zrobione w repo – do ustalenia)
Blokery odrzucenia przez sklepy:
1. **Konto dla recenzentów.** Logowanie to e-mail-link / Google / passkey – recenzent Apple/Google nie odbierze Twojej poczty. Potrzebna ścieżka demo (konto testowe + sposób zalogowania podany w notatkach dla recenzenta), inaczej odrzucenie.
2. **Sign in with Apple (wytyczna 4.8).** Appka oferuje Google; potwierdź, że e-mail-link/passkey spełnia wymóg równoważnej, prywatnej opcji, albo dodaj Apple.
3. **Polityka prywatności (publiczny URL) + Apple Privacy Nutrition Labels + Google Data safety** (zdjęcia z EXIF/GPS, e-mail, lokalizacja, pisma urzędowe). Usuwanie konta w appce jest (`AccountScreen`) – opisz je też w formularzach.
4. **Google Play – uprawnienia do zdjęć:** `READ_MEDIA_IMAGES` / `ACCESS_MEDIA_LOCATION` wymagają deklaracji (polityka Photo and Video Permissions) albo przejścia wyłącznie na systemowy picker.
5. **Nowe konto deweloperskie Play (osobiste):** zamknięte testy (12 testerów przez 14 dni) przed produkcją – sprawdź typ konta.

Konfiguracja:
6. `ITSAppUsesNonExemptEncryption: false` w `ios.infoPlist` (tylko HTTPS – wyłącza pytanie o export compliance przy każdym buildzie; to deklaracja prawna, potwierdź).
7. `supportsTablet: true` → wymaga zrzutów iPada i testu układu; albo ustaw `false`.
8. `eas.json` → `submit.production.ios` (`ascAppId`, `appleTeamId`) po utworzeniu rekordu w App Store Connect; w backendzie prawdziwy `storeUrl` iOS.
9. Sentry: DSN i `SENTRY_AUTH_TOKEN` w sekretach EAS, release = `net.uprzejmiedonosze.pro@X.Y.Z+build`, upload source map tylko dla `production` (`docs/NFR.md`).
10. Klucz Android (`*.jks` w katalogu projektu, ignorowany): przenieś do EAS credentials i zrób kopię poza repo; Play App Signing włączony.
11. Passkeye: `associatedDomains` i plik AASA na backendzie dla domen prod/shadow.
12. CI: brak `.github/` – GitHub Actions z typecheck + jest na PR (opcjonalnie kontrakt staging z sekretem service account) i `expo-doctor`.

Treści sklepowe (poza repo): nazwa i opisy PL, słowa kluczowe, kategoria, ocena wiekowa, support URL, zrzuty ekranu (telefon, iPad jeśli tablet), feature graphic Play, ikona 1024 bez kanału alfa.
