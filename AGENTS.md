# CLAUDE.md


## What this is

UD Pro — an Expo/React Native mobile client for uprzejmiedonosze.net (Polish parking-violation
reporting service). This repo covers only the **draft-proposal stage**: pick photos → group into
candidate reports → run vision analysis (LLM) → pair context+closeup shots → build a proposal
list with address/category/plate → export JSON. It deliberately stops short of submitting to the
backend (no `POST /api/rest/app/*`, no `create_report_draft`).

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

Config lives in `.env` (gitignored, copy from `.env.example`). Key vars: `EXPO_PUBLIC_LLM_MODEL`,
`EXPO_PUBLIC_LLM_BASE_URL`, `EXPO_PUBLIC_OPENROUTER_KEY` (UI prefill only), `EXPO_PUBLIC_LLM_TIMEOUT_MS`,
`EXPO_PUBLIC_PHOTO_MAX_WIDTH`, `EXPO_PUBLIC_PHOTO_COMPRESS`. All resolved/defaulted centrally in
`src/config.ts` (`llmConfig`, `udConfig`, `firebaseConfig`); the Analyze screen also lets the user
override model/key at runtime without a rebuild. Restart with `-c` after any `.env` change.

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
3. **Vision analysis** (`src/lib/vision.ts`, `src/api/vision.ts`, ANALYSIS.md) — one LLM call per
   candidate (role: context/car/third/unusable, arrays, markers, bbox in 0–1000 space), gated by
   in-code validation, then a crop-based bbox re-verification against the original image
   (car bbox +10%). Splits a cluster by plate (`R014` → `R014-1/2/3`), composes 2–3 photos
   (`src/lib/compose.ts`), and allows "borrowed context" between siblings (rule B). Report
   category comes from a deterministic marker rule — the model only advises. Results are cached
   to `analysis.json` per the documented SCHEMA. Verification color coding: green = auto,
   red = plate verified via crop, dashed orange = unconfirmed.
4. **Pairing** (`src/lib/pairing.ts`) — turns `draft_order` from the vision stage into
   context+closeup `PhotoPair`s; GPS for a pair comes from the car photo, not a cluster centroid.
5. **Vehicle/proposals** (`src/api/vehicle.ts`, `src/api/geo.ts`, `src/api/alpr.ts`,
   `src/screens/ProposalsScreen.tsx`) — enrich with vehicle info
   (`GET https://parkowanie.zbiorkom.live/{PLATE}`, no auth, non-fatal), reverse-geocode via
   `GET /api/rest/geo/{lat},{lng}/n` (editable), category list via `GET /api/rest/config/categories`,
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
