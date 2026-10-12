# CLAUDE.md


## What this is

UD Pro — an Expo/React Native mobile client for uprzejmiedonosze.net (Polish parking-violation
reporting service). Screens: Dashboard (`/app`), report creation (`/app/new`), list (`/app/list`) and
account (`/app/account`), bottom tabs Start / Nowe / Zgłoszenia / Konto (same icons as the web tab bar).
Everything goes through the JWT REST API (`/api/rest/*`, Firebase Bearer) — never the cookie-based
`/api/app/*` the web uses; both share their implementation in the backend's `src/inc/API.php`.

**Report creation (`NewReportScreen`, 1:1 with the web form).** One scrolling form; the client stays thin,
the domain logic lives in the backend:
**one picker for 2–3 photos** (`usePhotoBatch`, `PhotosSection`): thumbnails show instantly, then the photos go to
`POST /api/rest/vision/candidate` and `suggestSlots` (`src/lib/suggest.ts`, reusing the batch pipeline's
`splitByPlate`/`assignRoles`/`compose`) decides which one is context / car / extra and suggests the category;
the user can swap roles. `POST /app/new` (lazy) → `POST /app/{id}/image` per slot, in the suggested roles (multipart;
server runs ALPR and reads date/GPS from the car photo) → form (reverse geocode `/geo/{lat},{lng}/n`, typed address `/geo/search`,
recydywa `/recydywa/{plate}`, vehicle `/vehicle/{plate}`) → `POST /app/{id}` (server-side validation, 422 + `field`)
→ `POST /app/{id}/finish {send:true}` (confirm + send; same side effects as web `/app/done`) → `ReportDoneScreen`.
Dwa pojazdy na zdjęciach: pytanie „którego dotyczy zgłoszenie?” ma też odpowiedź **„Oba”** (`BOTH_VEHICLES`, tylko przy **trzech zdjęciach**: zdjęcie auta 1, zdjęcie auta 2 i wspólny kontekst – przy dwóch zdjęciach jest wybór jednego pojazdu, ale nie „Oba”):
UI jak dla jednego zgłoszenia, ale powstają **dwa osobne szkice** (dwa numery spraw i statusy). Pierwszy szkic jak zwykle; drugi tworzy dopiero „Dalej”
(`ensureDraft2`), dostaje zdjęcia z etapu „wip” według `firstDraftSlots`/`secondDraftSlots` (`usePhotoBatch.assignSecondDraft`) i tę samą treść – **każdy szkic ma auto + wspólny kontekst i nie dostaje zdjęcia auta drugiego pojazdu**;
`ReportConfirm` potwierdza oba (`appIds`), `ReportDone` pokazuje oba numery. Marka/model pojazdu jest dopisywana po stronie serwera
(`carInfo.vehicle`, parkowanie.info) – komentarz należy do użytkownika; `GET /api/rest/vehicle/{plate}` to tylko podgląd (ostrzeżenie o masie). Brak `plateId2`/`carInfo2` w schemacie.
The draft id is persisted (`useNewReport`, like web `$_SESSION['newAppId']`); "EDYTUJ" on the list opens the same
screen with `editId`. API contract: `../uprzejmiedonosze/API.md`.

> The earlier batch pipeline (multi-photo picker → grouping → vision → pairing → proposals → JSON export, described
> in the sections below) is **kept in the repo for reuse** (`src/lib/{grouping,vision,compose,pairing,trace}.ts`,
> `src/api/vision.ts`, `useSession`, the Picker/Grouping/Analyze/Pairing/Proposals screens) but is **not
> reachable from navigation** — do not delete it.

**Pisma z policji/SM (`LetterScreen`, link „Zeskanuj odpowiedź policji/SM” na liście Zgłoszenia – **tylko dla osób z odznaką PRO** (`useAuth.isPatron` z backendu, `letterEntry` w `src/lib/letters.ts`); pozostałe trafiają na `QuotaInfoScreen` z notką o powodzie).** Użytkownik robi zdjęcie aparatem (domyślne źródło, `takePhoto` w `src/lib/gallery.ts`) albo wybiera z galerii **jedno zdjęcie na raz** – analiza startuje od razu, bez przycisku „Odczytaj” i bez wielostronicowości (kolejne pismo = „Dodaj kolejne pismo”) → `POST /api/rest/letters/analyze` (multipart `image`; OCR + ekstrakcja LLM, dopasowanie do zgłoszeń z fuzzy-matchingiem
nr rej./daty/adresu, mapowanie wyniku na status UD) → serwer zwraca `cases[]` z kandydatami i gotową propozycją
`{set:{status, externalId}, append:{privateComment}}` → użytkownik zatwierdza/edytuje → `POST /api/rest/app/{id}/letter/apply`
(jedna blokada po stronie serwera, notatka dopisywana tam). **Cała logika jest w backendzie** (`../uprzejmiedonosze`:
`src/inc/{integrations/LetterVision,LetterMatcher,LetterProposal}.php`); front (`src/api/letters.ts`, `src/lib/letters.ts`) tylko pokazuje
i składa body. Analiza zużywa kredyty analizy zdjęć (1 na zdjęcie; 402 → `PhotoQuotaNotice`), ten sam skan drugi raz jest za darmo.
Fixture'y: `tests/correspondence/` (skan + `.txt` transkrypcja + `expected.json`) – **korzystaj z transkrypcji zamiast ponownie czytać obrazy**.
Kontrakt: `../uprzejmiedonosze/API.md` → „Letters endpoints”.

## Non-functional requirements

`docs/NFR.md` — wymagania niefunkcjonalne i status. Najważniejsze: każde żądanie REST niesie `X-UD-Schema` (wersja kontraktu API = `SCHEMA`)
i `X-UD-Client` (`src/lib/appVersion.ts`), serwer wymusza aktualizację kodem 426, gdy schemat appki < `VISION_SCHEMA` backendu (tylko „w dół”; `useAppUpdate` +
`UpdateRequiredScreen`; decyduje backend, appka tylko reaguje na 426), `authFetch` ma timeouty, w release nie logujemy
treści odpowiedzi, crashe idą do Sentry (`EXPO_PUBLIC_SENTRY_DSN`).

## Commands

```bash
npm i
npm run start          # expo start — scan QR in Expo Go (same Wi-Fi network)
npm run start -- -c    # same, but clears Metro cache (needed after editing .env)
npm run android         # expo start --android
npm run ios             # expo start --ios
npm test                 # jest (ts-jest, tests live in __tests__/)
npm test -- __tests__/grouping.test.ts   # run a single test file
npm run typecheck        # tsc --noEmit
```

Config lives in `.env` (gitignored, copy from `.env.example`). Key vars: `EXPO_PUBLIC_PHOTO_MAX_WIDTH`,
`EXPO_PUBLIC_PHOTO_COMPRESS` (photo downscale before upload — the only "LLM-adjacent" knobs the
app still owns; the key, model and token limits live server-side, see `OPENAI_VISION_*` in
`../uprzejmiedonosze/src/inc/config.php`). All resolved/defaulted centrally in `src/config.ts`
(`uploadConfig`, `udConfig`, `firebaseConfig`). Restart with `-c` after any `.env` change.

## Architecture — the pipeline

The app is a linear five-screen stack (`App.tsx`: Picker → Analyze → Pairs → Proposals, plus
Account for auth), backed by one zustand store (`src/store/useSession.ts`) that accumulates state
as it flows through each stage. All types are centralized in `src/types.ts` and are meant to mirror
the PHP backend's shapes (`alpr.php`, `Geolocation.php`, `API.md`).

Pipeline stages, in order:

1. **Picker** (`src/lib/gallery.ts`) — pick up to 20 photos (`MAX_PHOTOS`), read EXIF.
2. **Grouping without LLM** (`src/lib/grouping.ts`) — port of `grupuj_sesje.py`/GROUPING.md.
   Inventory (EXIF `DateTimeOriginal`, fallback to `PXL_YYYYMMDD_HHMMSS` filename parsed as
   UTC→Europe/Warsaw, drop photos with no usable time) → sessions (5 min time-only gap) →
   single-linkage clusters (link if ≤30m OR ≤30s, so GPS jumps get bridged by time) → manifest
   entries `R001…` (`needs_review` when <2 photos or missing GPS). This intentionally
   over-merges — the vision stage below splits by license plate.
3. **Vision analysis** (`src/api/vision.ts`, `src/lib/vision.ts`, ANALYSIS.md) — one REST call per
   candidate to the UD backend (`POST /api/rest/vision/candidate`; see
   `../uprzejmiedonosze/src/inc/integrations/Vision.php` + `VisionSchema.php`, the source of truth
   for the prompt/validation/normalization — the app no longer has a local copy). The server does
   the LLM call (role: context/car/third/unusable, markers, bbox in 0–1000 space), validation, a
   retry-crop for unreadable plates, and a bbox re-verification, all internally, and returns the
   final `photos[]`, including every ALPR detection per photo (`alpr_all`, SCHEMA 8). Roles
   (context/car/third) are re-assigned client-side from those detections (`assignRoles` in
   `compose.ts`: car = photo where that plate's vehicle is largest, context = the widest other
   shot), because the model's cross-photo role choices proved unreliable. Splits a cluster by plate (`R014` → `R014-1/2/3`), composes 2–3 photos
   (`src/lib/compose.ts`), and allows "borrowed context" between siblings (rule B) — this
   deterministic tail is the only part still run client-side. Report category comes from a
   deterministic marker rule (`ruleCategory` in `src/lib/vision.ts`) — the model only advises.
   Results are cached to `analysis.json` per the documented SCHEMA, which must match the
   backend's `VISION_SCHEMA`. Verification color coding: green = auto, red = plate verified via
   crop, dashed orange = unconfirmed.
4. **Pairing** (`src/lib/pairing.ts`) — turns `draft_order` from the vision stage into
   context+closeup `PhotoPair`s; GPS for a pair comes from the car photo, not a cluster centroid.
5. **Vehicle/proposals** (`src/api/vehicle.ts`, `src/api/geo.ts`, `src/api/recydywa.ts`,
   `src/screens/ProposalsScreen.tsx`) — enrich with vehicle info
   (`GET https://parkowanie.zbiorkom.live/{PLATE}`, no auth, non-fatal), reverse-geocode via
   `GET /api/rest/geo/{lat},{lng}/n` (editable), category list via the static, public
   `GET /api/config/categories.json`,
   let the user edit plate/address/category/witness, then export JSON. This is the terminal step.

## Auth

Same mechanism as the web app: Firebase email-link sign-in (`src/api/firebaseAuth.ts`,
`src/store/useAuth.ts`), provider `EMAIL_LINK_SIGN_IN_METHOD`. After verifying via
`POST /api/verify-token`, subsequent `/api/rest/*` calls (geo, categories) use the resulting
Bearer token; refresh token persisted in SecureStore. Flow: Account screen → enter email → send
link → copy the one-time `oobCode` from the email (**do not click the link**) → paste to log in.
Without auth, geo/category endpoints return 403 and must be filled in by hand.

The auth gate in `App.tsx` is **active**: with no session, the app shows only the Account screen
(no back button, no tab bar — see `src/screens/AccountScreen.tsx`); once `useAuth` status is
`logged`, it switches to the full stack starting at `Picker`. A splash screen covers the initial
`hydrate()` call while the stored refresh token (if any) is checked.

### Environment: staging vs prod

`uprzejmiedonosze.net` (this app's backend) and its Firebase project are **two entirely separate
environments**, each with its own Firebase project, user pool and database — staging and prod
tokens are not interchangeable (a prod ID token gets a 403 against staging and vice versa). This
mirrors `../uprzejmiedonosze/src/js/lib/firebaseConfig.js` on web, which picks a config block by
sniffing `location.hostname`; Expo has no such hostname, so it uses `EXPO_PUBLIC_UD_ENV` instead
(`src/config.ts`, `udEnv` export). Default is `staging` — safe for local dev, since a production
account does not exist there. Set `EXPO_PUBLIC_UD_ENV=prod` for production. Individual
`EXPO_PUBLIC_UD_BASE` / `EXPO_PUBLIC_FIREBASE_*` vars still override single fields, but must be
changed together (mixing e.g. a prod API key with a staging authDomain breaks auth). The active
environment is shown in the Account screen and logged at startup.

## Notes

- All in-app comments/docs and most domain terms are in Polish, matching the backend's naming.
- `src/lib/log.ts` installs global handlers so on-device logs also stream to the Metro terminal.
