# Testy automatyczne

| Warstwa | Komenda | Backend | Sieć |
|---|---|---|---|
| Jednostkowe (logika, `__tests__/`) | `npm test` | – | nie |
| Kontraktowe (kształt odpowiedzi API) | `npm run test:contract:local` / `:staging` | docker / staging | tak |
| E2E na telefonie (Maestro, `.maestro/`) | `npm run e2e:local` / `e2e:staging` | docker / staging | tak |

## Sesja testowa (`e2e/session.mjs`)
Bez logowania e-mail-link. Skrypt zwraca token ID + refresh token:
- **local** – Firebase Auth Emulator z dockera (`:9099`), konto zakładane przez `accounts:signUp`; backend mapuje każde konto emulatora na jedną tożsamość fixture.
- **staging** – custom token podpisany kluczem service account (`../uprzejmiedonosze/staging.uprzejmiedonosze.net-firebase-adminsdk.json`, nie commitować), wymieniony na sesję. Konto `E2E_STAGING_EMAIL` (domyślnie `e@nieradka.net`) **musi istnieć na stagingu**; `E2E_STAGING_UID` pomija lookup.

## Kontraktowe
Tylko odczyty (user, dashboard, apps, categories, geo, quota, verify-token, 426) – bezpieczne na stagingu. Sprawdzają kształt pól, z których korzysta appka, i że `SCHEMA` appki (`src/lib/vision.ts`) nie jest odrzucany (426). Lokalnie wymagają aktualnego buildu backendu (`make export` w `../uprzejmiedonosze`; nieaktualny `export/` daje 404/500).

## E2E (Maestro) na prawdziwym telefonie
Bez symulatorów. **Android przez USB** (Maestro nie steruje prawdziwym iPhonem). Wymaga: `brew install maestro` (Java 17+),
`brew install android-platform-tools` (arm64 adb; `~/bin/adb` jest binarką i386 i nie działa), telefonu z włączonym debugowaniem USB
(`adb devices` musi go widzieć) i dev clienta z `eas build --profile development` (APK `net.uprzejmiedonosze.pro.dev`; dev build
dopuszcza HTTP, release nie – do lokalnego dockera nie nada się build staging/prod).
Telefon i Mac w jednej sieci Wi-Fi: `e2e/run.sh` bierze adres LAN Maca (`E2E_HOST` nadpisuje), ustawia `EXPO_PUBLIC_E2E=1`, startuje Metro
(local: `EXPO_PUBLIC_UD_BASE=http://<LAN>`, `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=http://<LAN>:9099`), wstrzykuje sesję deep linkiem
`udpro-dev://e2e-login?...` (`src/lib/e2eLogin.ts`, aktywny tylko z tą flagą – profile EAS jej nie ustawiają) i odpala flowy.
Pojedynczy flow: `e2e/run.sh local .maestro/01-smoke.yaml`.

Nie pokryte (do dodania): wybór zdjęć z natywnego pickera i pełna ścieżka „zgłoszenie → wysłanie” (potrzebne fixture'y w galerii telefonu: `adb push tests/images/*.jpg /sdcard/DCIM/` + skan mediów, a na stagingu zużywa kredyty analizy i tworzy dane).
