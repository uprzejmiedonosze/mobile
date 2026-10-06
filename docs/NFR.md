# Wymagania niefunkcjonalne (NFR)

Status: ✅ zrobione · 🟡 częściowo · ⬜ backlog. Każde wymaganie ma sposób weryfikacji.

## Kompatybilność i wersjonowanie
| Wymaganie | Status | Weryfikacja |
|---|---|---|
| Klient wysyła `X-UD-Schema: <SCHEMA>` (wersja kontraktu API = `SCHEMA` w `src/lib/vision.ts` = `VISION_SCHEMA` backendu) oraz informacyjnie `X-UD-Client: pro/<wersja> (<build>; <platforma>)` w każdym żądaniu REST (`src/lib/appVersion.ts`, `authFetch`) | ✅ | curl z nagłówkami na staging |
| Kompatybilność tylko „w dół”: serwer odrzuca (**426**) klienta o schemacie **niższym** niż `VISION_SCHEMA` backendu; nowsza appka ze starszym backendem działa (`../uprzejmiedonosze/src/api/rest/index.php`) | ✅ | `X-UD-Schema: 7` przy backendzie 8 → 426; schemat 8 → 200; bez nagłówka → 200 |
| Aplikacja pokazuje blokujący ekran „Zaktualizuj” (`UpdateRequiredScreen`), także niezalogowanym | ✅ | `EXPO_PUBLIC_FAKE_SCHEMA=7` + `expo start -c` (backend ma schemat 8) |
| Decyduje backend: appka nie porównuje wersji lokalnie, tylko reaguje na 426 (pierwsze żądanie po starcie to `verify-token`); **fail-open** przy braku sieci (`useAppUpdate`) | ✅ | tryb samolotowy → apka startuje |
| Miękka zachęta, gdy `latestVersion` (wersja appki) > bieżąca | ✅ | toast przy starcie |

**Środowiska buildów (`eas.json`):** `eas build -p android --profile staging|shadow|production` (shadow = prod Firebase + host
`shadow.uprzejmiedonosze.net`). Profile ustawiają `EXPO_PUBLIC_*`; `.env` to tylko domyślne wartości lokalnego dev.

**Polityka:** zmiana łamiąca kontrakt API = podbicie `SCHEMA` w appce → nowy build w sklepach → dopiero wdrożenie backendu z podbitym `VISION_SCHEMA` (od tej chwili starsze appki są blokowane).
Każdy build do sklepu podbija `expo.version` w `app.json` (build number rośnie sam, `autoIncrement`). Aktualizacje tylko przez sklep (bez OTA).

## Niezawodność sieci
| Wymaganie | Status | Weryfikacja |
|---|---|---|
| Timeout każdego żądania: 20 s domyślnie, 90 s upload/vision (`UPLOAD_TIMEOUT_MS`) | ✅ | wolna sieć → komunikat zamiast zawieszenia |
| Czytelne błędy: „Brak połączenia z internetem”, „Serwer nie odpowiada” (`ApiError` status 0) | ✅ | tryb samolotowy w trakcie akcji |
| Retry tylko idempotentnych operacji (upload zdjęcia – 3 próby; reszta bez) | 🟡 | `stagePhoto` |
| Szkic zgłoszenia nie ginie (id persystowane w `useNewReport`) | ✅ | zabić apkę w trakcie formularza |
| Baner offline (NetInfo) | ⬜ | |

## Obserwowalność
| Wymaganie | Status | Weryfikacja |
|---|---|---|
| Crashe i błędy JS/natywne → Sentry (`index.ts`, DSN `EXPO_PUBLIC_SENTRY_DSN`), `environment` = staging/prod | 🟡 | wymaga projektu Sentry, DSN i `SENTRY_AUTH_TOKEN` w EAS; build `staging` + testowy crash |
| Brak PII w raportach (`sendDefaultPii: false`, breadcrumbs bez query) | ✅ | podgląd zdarzenia w Sentry |
| Logi verbose tylko w `__DEV__` (`src/lib/log.ts`) | ✅ | build release: konsola pusta poza warn/error |

## Bezpieczeństwo i prywatność
| Wymaganie | Status | Weryfikacja |
|---|---|---|
| Tokeny wyłącznie w SecureStore | ✅ | |
| Brak treści odpowiedzi API (adresy, tablice, e-maile) w logach release | ✅ | `logFetch` |
| Minimalne uprawnienia Androida (obrazy, lokalizacja z EXIF); audio/storage zablokowane | ✅ | `npx expo config --type public` |
| Aktualne opisy uprawnień (iOS `Info.plist`) | ✅ | |
| Wyłącznie HTTPS, keystore poza repo (`*.jks` w `.gitignore`) | ✅ | |
| Polityka prywatności / Data safety w sklepach | ⬜ | |

## Odporność UX
| Wymaganie | Status | Weryfikacja |
|---|---|---|
| Produkcyjny ErrorBoundary z „Spróbuj ponownie”, stack tylko w dev | ✅ | wymusić wyjątek w renderze |
| Splash nie zawiesza się bez sieci | ⬜ | `hydrate()` bez timeoutu – do sprawdzenia |

## Backlog (faza 2+)
- **Dostępność:** `accessibilityLabel`/`role` na wszystkich kontrolkach (dziś prawie brak), skalowanie czcionek, kontrast WCAG AA, cele dotyku ≥ 44 pt.
- **Wydajność:** start < 2 s, listy na `FlatList`, pamięć przy 3 zdjęciach 1600 px, cache listy zgłoszeń.
- **Jakość/CI:** GitHub Actions (typecheck + jest + `expo-doctor`), ESLint, testy E2E (Maestro), przegląd `npm audit`.
- **Utrzymanie:** aktualizacja SDK Expo co kwartał, przegląd zależności natywnych.
- **Analityka zdarzeń** (lejek tworzenia zgłoszenia) – po decyzji o narzędziu i zgodzie użytkownika.
