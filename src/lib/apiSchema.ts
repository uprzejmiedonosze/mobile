// Wersja KONTRAKTU API z backendem UD = API_SCHEMA w ../uprzejmiedonosze/src/inc/config.php (do 11 jako SCHEMA w lib/vision.ts
// i VISION_SCHEMA w backendzie). Podbij przy każdej zmianie kontraktu (endpointy, pola, prompt i walidacja Vision) – w obu repo.
// - W górę: appka wysyła `X-UD-Schema`, a backend odrzuca (426) klienta o NIŻSZYM schemacie (wymuszenie aktualizacji, docs/NFR.md).
//   Dlatego backend z podbitym schematem idzie na produkcję dopiero po buildzie w sklepach.
// - W dół: backend zwraca w każdej odpowiedzi `X-UD-Server-Schema` (od 11, store/useServer.ts). Funkcje, których starszy backend
//   nie ma, appka chowa po tym numerze (np. film w zgłoszeniu: VIDEO_SERVER_SCHEMA w lib/video.ts). Brak nagłówka = backend < 11.
// Także klucz cache analizy wizyjnej (compose.ts).
export const API_SCHEMA = 11;
// 11: film w zgłoszeniu (POST/DELETE /app/{id}/video), kategorie `requiresVideo` (hałas, drift), bez flag `beta` i
//     `features.adHocReports`; nagłówek X-UD-Server-Schema.
// 10: POST /api/rest/demo-login (konto demo recenzentów); kształt odpowiedzi bez zmian względem 9. Podbite przed premierą prod,
//     żeby backend (426) odciął testowe buildy staging ≤ 1.1.7 (schemat 9) – testerzy przechodzą na wydanie prod.

// Numer z nagłówka `X-UD-Server-Schema` (null = brak albo śmieci, czyli starszy backend).
export function parseServerSchema(header: string | null | undefined): number | null {
  const n = header && /^\d+$/.test(header.trim()) ? Number(header.trim()) : NaN;
  return Number.isFinite(n) ? n : null;
}
