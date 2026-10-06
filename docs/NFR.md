# Wymagania niefunkcjonalne (NFR)

Status: ✅ zrobione · 🟡 częściowo · ⬜ backlog. Każde wymaganie ma sposób weryfikacji.

## Kompatybilność i wersjonowanie
| Wymaganie | Status | Weryfikacja |
|---|---|---|
| Klient wysyła `X-UD-Client: pro/<wersja> (<build>; <platforma>)` w każdym żądaniu REST (`src/lib/appVersion.ts`, `authFetch`) | ✅ | curl z nagłówkiem na staging |
| Serwer odrzuca wersję < `minVersion` kodem **426** (`../uprzejmiedonosze/src/api/rest/index.php`, `src/api/config/app.json`) | ✅ | `X-UD-Client: pro/0.0.1 (1; android)` → 426; bez nagłówka → 200 |
| Aplikacja pokazuje blokujący ekran „Zaktualizuj” (`UpdateRequiredScreen`), także niezalogowanym | ✅ | podbić `minVersion` na stagingu, uruchomić apkę |
| Sprawdzenie wersji przy starcie i powrocie do apki; **fail-open** przy braku sieci (`useAppUpdate`) | ✅ | tryb samolotowy → apka startuje |
| Miękka zachęta, gdy `latestVersion` > bieżąca | ✅ | toast przy starcie |

**Polityka:** zmiana łamiąca API = nowy build w sklepach → wdrożenie backendu → dopiero podbicie `minVersion`.
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
| Crashe i błędy JS/natywne → Sentry (`index.ts`, DSN `EXPO_PUBLIC_SENTRY_DSN`), `environment` = staging/prod | 🟡 | wymaga projektu Sentry, DSN i `SENTRY_AUTH_TOKEN` w EAS; build `preview` + testowy crash |
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
