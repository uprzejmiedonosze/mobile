# Plan: passkeye, publikacja w sklepach, logowanie email-link przez App Links

Stan na 2026-10-07. Obsługiwane metody logowania: Google, email-link, passkey (wszystkie kończą w tym samym `FbSession`).

## 0. Wspólne: rejestracja appek i fingerprinty

Te same dane zasilają passkeye (assetlinks/AASA/hashe) i email-link (App Links na domenie Firebase Auth).

| Projekt Firebase | Android | iOS |
|---|---|---|
| prod (`uprzejmie-donosze`) | `net.uprzejmiedonosze.pro`, SHA-256: klucz EAS (upload) + klucz Play app signing | `net.uprzejmiedonosze.pro` + Team ID Apple |
| staging | `net.uprzejmiedonosze.pro.dev` (dev client) + build `staging`, SHA-256 z `eas credentials` | analogicznie |

- Fingerprinty: `eas credentials` (per profil). Klucz Play app signing widać w Play Console (Integralność aplikacji) dopiero po pierwszym uploadzie.
- Shadow = `udEnv=prod` + host `shadow.uprzejmiedonosze.net`, ale buduje się z profilu `staging` (inny keystore niż prod z Play).
- Zapisać wartości w jednym miejscu (np. menedżer haseł), bo trzeba je wpisać w kilku konfiguracjach.

## 1. Passkeye (kod gotowy: appka `c0d8b74`, backend `c49ef365`)

Brakuje konfiguracji i wdrożenia:
1. Backend: ustawić env `PASSKEY_ANDROID_KEY_HASHES` (hashe base64url SHA-256 certyfikatów, po przecinku) na każdym hoście: prod (klucz Play signing), shadow (klucz EAS internal).
2. `src/.well-known/assetlinks.json` w repo backendu (dziś `[]`): wpisy `delegate_permission/common.get_login_creds` dla `net.uprzejmiedonosze.pro` + fingerprinty SHA-256. Sprawdzić, czy wygrywa plik statyczny, czy trasa PHP (`index.php:212`, `StaticPagesHandler::assetlinks`).
3. iOS: dodać serwowanie `/.well-known/apple-app-site-association` (nginx `location` albo trasa PHP, `Content-Type: application/json`) z `webcredentials.apps = ["<TEAMID>.net.uprzejmiedonosze.pro"]`. Nginx bez rozszerzenia przekaże do PHP, więc potrzebna nowa trasa.
4. Potwierdzić `APP_HOST` na shadow = `shadow.uprzejmiedonosze.net` (inaczej 403 z `requireCurrentHost`).
5. Wdrożyć backend PRZED nowymi buildami appki.
6. Przebudować `production` i `shadow` (natywny moduł `react-native-passkey` + iOS associated domains).
7. Testy PHP dla nowych tras REST i originu `android:apk-key-hash:` (jeszcze nie napisane).

Weryfikacja na shadow (apk): dodaj passkey → wyloguj → zaloguj passkeyem → lista w Koncie i na www shadow. Staging/dev: przyciski passkey niewidoczne. Passkey z prod nie działa na shadow i odwrotnie (osobne RP ID).

## 2. Publikacja w sklepach

Stan: `eas.json` ma `submit.production.android` (track `internal`, `releaseStatus: draft`), `appVersionSource: remote`, `autoIncrement` w profilu production.

### Google Play
1. Pierwszy upload ręcznie lub `eas submit --profile production --platform android` (AAB z `eas build --profile production`). Konto serwisowe do API Play wymagane przez `eas submit`.
2. Po uploadzie pobrać SHA-256 klucza Play app signing → uzupełnić pkt 0 (Firebase), `assetlinks.json`, `PASSKEY_ANDROID_KEY_HASHES` na prod.
3. Wypełnić kartę sklepu: opis PL, zrzuty ekranu, ikona, polityka prywatności (URL), formularz Bezpieczeństwo danych (zdjęcia, lokalizacja, e-mail, identyfikatory), klasyfikacja treści, deklaracja uprawnień (`ACCESS_MEDIA_LOCATION`, `READ_MEDIA_IMAGES`, lokalizacja).
4. Ścieżka: internal → closed/open testing → production. Nowe konta deweloperskie mogą wymagać okresu testów zamkniętych przed produkcją.
5. Przed promocją: sprawdzić 426/`SCHEMA` (nowy build musi być w sklepie PRZED backendem z podbitym `VISION_SCHEMA`).

### App Store (iOS)
1. Konto Apple Developer, App ID `net.uprzejmiedonosze.pro` z capability Associated Domains, rekord w App Store Connect.
2. `eas build --profile production --platform ios`, `eas submit --platform ios` (dodać sekcję `submit.production.ios` z `ascAppId`).
3. Karta sklepu: zrzuty, opis, prywatność (nutrition labels), uzasadnienia uprawnień (zdjęcia, lokalizacja), dane testowe konta do review (logowanie e-mail-link/passkey bywa kłopotliwe dla recenzenta: rozważyć konto demo).
4. TestFlight → review → wydanie.

### Wspólne
- Wersjonowanie: `version` w `app.json` + `autoIncrement` (remote).
- Sentry: `EXPO_PUBLIC_SENTRY_DSN` ustawiony w buildach production.
- Nazwa wyświetlana: „Uprzejmie Donoszę PRO”.

## 3. Logowanie email-link przez App Links (zamiast kopiowania kodu)

Dlaczego dziś kopiujemy `oobCode`: Dynamic Links wyłączono 25.08.2025, appka nie przechwytuje linku. Obecnie Firebase kieruje link na domenę Hosting (u nas `auth.uprzejmiedonosze.net/__/auth/links?link=…`), którą appka może przejąć przez Android App Links / iOS Universal Links.

Krok 0 (rejestracja appek w Firebase, tabela wyżej) jest warunkiem: Hosting serwuje wtedy `assetlinks.json` i AASA dla domeny auth automatycznie.

Zmiany w appce:
1. `app.config.js`: `android.intentFilters` z `autoVerify: true`, `scheme: https`, `host` = host auth danego środowiska (z `ENVS[udEnv].authDomain`), `pathPrefix: /__/auth/links`; iOS associated domains `applinks:<host auth>` (poza wariantem dev, jeśli nie rejestrujemy).
2. `expo-linking`: nasłuch `getInitialURL()` + `addEventListener('url')`; wyciągnąć zagnieżdżony parametr `link`, zdekodować, odczytać `oobCode`.
3. `src/api/firebaseAuth.ts`: reuse `signInWithCode(email, codeOrLink)` (e-mail z SecureStore, zapisywany przy `sendEmailLink`); dopasować regex do zdekodowanego URL.
4. `useAuth`: akcja `completeEmailLink(url)` (wzór `verifyCode`: sesja → `verifySession` → `logged`).
5. Ekran logowania: tekst „Kliknij link w mailu na tym telefonie”; wklejanie kodu zostaje jako fallback (mail na innym urządzeniu, klient poczty z własną przeglądarką).
6. Opcjonalnie `linkDomain` w `sendOobCode` (REST nie ma tego pola; użyć domyślnej domeny projektu lub zweryfikować zachowanie custom domain).

Ograniczenia: wymaga nowego buildu natywnego; weryfikacja App Links bywa kapryśna; mail musi być otwarty na tym samym urządzeniu; bez appki link działa jak dziś przez www (`continueUrl` → `/login.html`).

Weryfikacja: build `staging`/dev client → „Wyślij link” → klik w mailu na telefonie → appka otwiera się i loguje bez kodu; powtórzyć dla prod/shadow; sprawdzić `adb shell pm get-app-links <package>` (status `verified`).

## Kolejność
1. Rejestracja appek i zebranie fingerprintów (pkt 0).
2. Backend: assetlinks/AASA, hashe, wdrożenie.
3. Appka: email-link App Links + build staging/dev → test.
4. Builds production/shadow z passkeyami → test na shadow.
5. Pierwszy upload do Play (internal) → uzupełnić klucz Play signing → ponowny deploy `assetlinks.json`/hashy.
6. Karty sklepów, testy, promocja.
