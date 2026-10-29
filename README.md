# UD Pro (Expo MVP) – do etapu propozycji, bez wysyłki do UD

Cross-platform, testowane najpierw na Androidzie przez Expo Go.

## Scope (ten etap)
1. Wybór do 20 zdjęć z galerii
2. Analiza metadanych EXIF (data, GPS jak `Geolocation.php::exifGps()`, normalizacja do 4 miejsc)
3. Etap 2 – wizja (ANALYSIS.md): 1 request na kandydata do backendu UD (`POST /api/rest/vision/candidate`, patrz `../uprzejmiedonosze/src/inc/integrations/Vision.php`) – rozpoznanie roli/tablicy/markerów, retry-crop nieczytelnej tablicy i weryfikacja bbox dzieją się po stronie serwera (klucz i model LLM appka nie zna, limit per użytkownik). Po stronie appki zostaje tylko deterministyczny ogon: bramki walidacji już zrobione przez backend, split po tablicy (R014→R014-1/2/3), kompozycja 2-3 zdjęć, pożyczony kontekst (reguła B), kategoria z deterministycznej reguły markerów (model tylko doradza). Cache `analysis.json` + SCHEMA. Kolory: zielony=auto, czerwony=tablica zweryfikowana, pomarańczowy przerywany=niepotwierdzona.
4. Grupowanie w pary kontekst + zbliżenie (draft_order z etapu 2; GPS brane ze zdjęcia auta, nie z centroidu)
5. Info o pojeździe: `GET https://parkowanie.zbiorkom.live/{PLATE}` (bez auth, non-fatal)
6. Lista propozycji: podgląd pary, edycja tablicy, adres z `GET /api/rest/geo/{lat},{lng}/n` + ręczna poprawka, select kategorii z `GET /api/config/categories.json` (statyczny, publiczny), świadek. Eksport JSON. KONIEC – brak `POST /api/rest/app/*`, brak `create_report_draft`.

## Uruchomienie na Androidzie
```bash
npm i
npm run start
# zeskanuj QR w Expo Go na telefonie (ta sama sieć Wi-Fi)
npm test
npm run typecheck
```

## Grupowanie wstępne BEZ LLM (pierwszy ekran)
Port `grupuj_sesje.py` / GROUPING.md w `src/lib/grouping.ts`: inwentaryzacja (EXIF, fallback `PXL_YYYYMMDD_HHMMSS` UTC→Warszawa, drop bez czasu) → sesje (przerwa 5 min, tylko czas) → klastry single-linkage (30 m LUB 30 s, most na skoki GPS) → manifest `R001…` (`needs_review` gdy <2 zdjęć lub brak GPS). Nad-scalanie zamierzone – późniejsza wizja dzieli po tablicy. Miniaturki 1600px robi krok wizji przed wysyłką do backendu.

## Logowanie (Konto)
Bramka aktywna: bez sesji apka pokazuje TYLKO ekran Konto (jak web wymaga loginu do zgłoszeń), po zalogowaniu przełącza się na stos główny (`App.tsx`). Ten sam mechanizm co web: Firebase email-link (`EMAIL_LINK_SIGN_IN_METHOD`) + `POST /api/verify-token`, potem Bearer do `/api/rest/*` (geo, kategorie). Refresh token w SecureStore.

Domyślnie logowanie idzie wobec **stagingu** (`https://staging.uprzejmiedonosze.net`, osobny projekt Firebase/baza niż prod z `../uprzejmiedonosze`) – patrz `EXPO_PUBLIC_UD_ENV` niżej. Konto z produkcji **nie istnieje** na stagingu (osobna pula użytkowników); świeże konto Firebase bez wiersza w bazie stagingu dostanie 404/403 z `/api/rest/*` dopóki nie przejdzie rejestracji przez web/`PATCH /api/rest/user/`.

## Konfig (.env)
Flow: Konto → e-mail → Wyślij link → skopiować link z maila (**nie otwierać go w przeglądarce** – kod jednorazowy) i wkleić → Zaloguj. Gdy projekt Firebase ma zarejestrowaną appkę Android (SHA-256), mail dostaje link do appki i wystarczy go kliknąć na telefonie (Android App Link, `src/lib/emailLinkLogin.ts`); ekran logowania pokazuje wtedy tę instrukcję. Bez zalogowania adresy/kategorie zwracają 403 i trzeba je wpisać ręcznie.
Google/passkey: po stronie mobilnej w kolejnym etapie (whitelist redirectu / dev-build).
```bash
cp .env.example .env   # .env jest w .gitignore
npm run start -- -c    # po zmianie .env restart z czyszczeniem cache
```
Zmienne: `EXPO_PUBLIC_PHOTO_MAX_WIDTH`/`EXPO_PUBLIC_PHOTO_COMPRESS` (skalowanie zdjęć przed uploadem do backendu), `EXPO_PUBLIC_UD_ENV` (`staging` domyślnie, `prod` dla produkcji – przełącza razem backend UD i projekt Firebase). Centralka w `src/config.ts`. Klucz i model LLM appka nie zna – żyją tylko po stronie backendu (`OPENAI_VISION_*` w `../uprzejmiedonosze/src/inc/config.php`).
- Uprawnienie galerii nadawane w runtime; limit 20 wymuszany w `gallery.ts:MAX_PHOTOS`.

## Struktura
`src/types.ts, lib/gallery|plate|pairing|vision, api/vision|vehicle|geo|recydywa, store/useSession, screens/Picker|Analyze|Pairing|Proposals`

## Następny etap (poza scopem)
Podpięcie `POST /api/rest/app/new`, upload `carImage/contextImage`, `PATCH send` lub MCP `create_report_draft`.
