# UD Pro (Expo MVP) – do etapu propozycji, bez wysyłki do UD

Cross-platform, testowane najpierw na Androidzie przez Expo Go.

## Scope (ten etap)
1. Wybór do 20 zdjęć z galerii
2. Analiza metadanych EXIF (data, GPS jak `Geolocation.php::exifGps()`, normalizacja do 4 miejsc)
3. Etap 2 – wizja (ANALYSIS.md): 1 call na kandydata (role context/car/third/unusable, tablice, markery, bbox 0-1000), bramki walidacji w kodzie, crop-weryfikacja bbox z oryginału (car+10%), split po tablicy (R014→R014-1/2/3), kompozycja 2-3 zdjęć, pożyczony kontekst (reguła B), kategoria z deterministycznej reguły markerów (model tylko doradza). Cache `analysis.json` + SCHEMA. Kolory: zielony=auto, czerwony=tablica zweryfikowana, pomarańczowy przerywany=niepotwierdzona. Klucz `sk-or-v1-…` wklejasz na ekranie analizy. Free limity: ~20/min, ~50/dzień.
4. Grupowanie w pary kontekst + zbliżenie (draft_order z etapu 2; GPS brane ze zdjęcia auta, nie z centroidu)
5. Info o pojeździe: `GET https://parkowanie.zbiorkom.live/{PLATE}` (bez auth, non-fatal)
6. Lista propozycji: podgląd pary, edycja tablicy, adres z `GET /api/rest/geo/{lat},{lng}/n` + ręczna poprawka, select kategorii z `GET /api/rest/config/categories`, świadek. Eksport JSON. KONIEC – brak `POST /api/rest/app/*`, brak `create_report_draft`.

## Uruchomienie na Androidzie
```bash
npm i
npm run start
# zeskanuj QR w Expo Go na telefonie (ta sama sieć Wi-Fi)
npm test
npm run typecheck
```

## Grupowanie wstępne BEZ LLM (pierwszy ekran)
Port `grupuj_sesje.py` / GROUPING.md w `src/lib/grouping.ts`: inwentaryzacja (EXIF, fallback `PXL_YYYYMMDD_HHMMSS` UTC→Warszawa, drop bez czasu) → sesje (przerwa 5 min, tylko czas) → klastry single-linkage (30 m LUB 30 s, most na skoki GPS) → manifest `R001…` (`needs_review` gdy <2 zdjęć lub brak GPS). Nad-scalanie zamierzone – późniejsza wizja dzieli po tablicy. Miniaturki 1600px robi krok wizji przed wysyłką do LLM.

## Logowanie (Konto)
Ten sam mechanizm co web: Firebase email-link (projekt z `src/js/lib/firebaseConfig.js`, provider `EMAIL_LINK_SIGN_IN_METHOD`) + `POST /api/verify-token`, potem Bearer do `/api/rest/*` (geo, kategorie). Refresh token w SecureStore.

## Konfig (.env)
Flow: Konto → e-mail → Wyślij link → skopiuj `oobCode` z maila (**linku nie klikaj**, kod jednorazowy) → Zaloguj. Bez zalogowania adresy/kategorie zwracają 403 i trzeba je wpisać ręcznie.
Google/passkey: po stronie mobilnej w kolejnym etapie (whitelist redirectu / dev-build).
```bash
cp .env.example .env   # .env jest w .gitignore, nie commituj klucza
# uzupełnij EXPO_PUBLIC_OPENROUTER_KEY, reszta ma sensowne defaulty
npm run start -- -c    # po zmianie .env restart z czyszczeniem cache
```
Zmienne: `EXPO_PUBLIC_LLM_MODEL` (default `meta/muse-spark-1.3`), `EXPO_PUBLIC_LLM_BASE_URL`, `EXPO_PUBLIC_OPENROUTER_KEY` (tylko prefill UI, docelowo klucz na własnym proxy), `EXPO_PUBLIC_LLM_TIMEOUT_MS`, `EXPO_PUBLIC_LLM_MAX_TOKENS`, `EXPO_PUBLIC_PHOTO_MAX_WIDTH`, `EXPO_PUBLIC_PHOTO_COMPRESS`. Centralka w `src/config.ts`; UI pozwala nadpisać model/klucz bez rebuildu.
- Uprawnienie galerii nadawane w runtime; limit 20 wymuszany w `gallery.ts:MAX_PHOTOS`.

## Struktura
`src/types.ts, lib/gallery|plate|pairing, api/alpr|vehicle|geo, store/useSession, screens/Picker|Analyze|Pairing|Proposals`

## Następny etap (poza scopem)
Podpięcie `POST /api/rest/app/new`, upload `carImage/contextImage`, `PATCH send` lub MCP `create_report_draft`.
