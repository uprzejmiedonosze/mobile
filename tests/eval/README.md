# UD Pro vision eval — harness price/quality

Batchowa ewaluacja modeli wizyjnych dla pipeline'u `POST /api/rest/vision/candidate`, poza
aplikacją mobilną. Pełny kontekst i uzasadnienie decyzji: plan
`~/.claude/plans/nie-jestem-zadowolony-z-curious-comet.md`.

## Setup

```bash
cd tests/eval
npm i
cp .env.example .env   # uzupełnij OPENROUTER_API_KEY, PLATERECOGNIZER_TOKEN
```

## Workflow

```bash
npx tsx prep.ts                # 1. miniatury + EXIF + klastrowanie (cache, raz)
npx tsx groundtruth.ts         # 2a. bootstrap GT (PlateRecognizer + jeden mocny model)
npx tsx gt-editor.ts           # 2b. generuje tests/results/gt-editor.html
# -> otwórz gt-editor.html w przeglądarce (patrz niżej), popraw ręcznie każde zdjęcie,
#    "Pobierz groundtruth.json", zapisz jako tests/groundtruth.json (nadpisując)

npx tsx run.ts --dry-run --round A     # 3. sprawdź macierz + szacowany koszt PRZED wysyłką
npx tsx run.ts --round A               # runda A: przesiew całego rostera (models.json)
npx tsx score.ts                       # 4. metryki względem tests/groundtruth.json
npx tsx report.ts                      # 5. tests/results/report.md + report.html

# po wyłonieniu finalistów z rundy A:
npx tsx run.ts --round B --models openai/gpt-4o-mini,<finalista2>,<finalista3>
npx tsx run.ts --round C --models <zwycięzcy z B>
npx tsx score.ts && npx tsx report.ts
```

`run.ts` cache'uje każdy wynik w `tests/results/runs/` po (model, prompt, pipeline, batching,
repeat, kandydat) — ponowne uruchomienie tego samego polecenia nic nie kosztuje. `score.ts`/
`report.ts` nie wołają żadnego API, więc iterowanie nad wagami (`scoring` w score.ts) lub
poprawianie GT jest darmowe i natychmiastowe.

## `gt-editor.html` wymaga serwera lokalnego

Przeglądarki (w tym rozszerzenie Claude in Chrome) często blokują `file://` z powodów
bezpieczeństwa. Otwórz zamiast tego przez lokalny serwer:

```bash
cd tests && python3 -m http.server 8931
# -> http://localhost:8931/results/gt-editor.html
```

Rysowanie boxa myszką w edytorze pokazuje natywny `confirm()` (auto/tablica) — to zwykłe okno
przeglądarki, nie problem narzędzia.

## Pliki

- `prep.ts`, `groundtruth.ts`, `gt-editor.ts`, `run.ts`, `score.ts`, `report.ts` — kroki 1-7 planu.
- `schema.ts` — port `VisionSchema.php` (kontrakt/walidacja/`extractJson`).
- `pipeline.ts` — port orkiestracji `Vision.php` (retry-crop, weryfikacja bbox, warianty).
- `relations.ts` — deterministyczny mapper scena→kategoria dla promptu `v4-relations`.
- `prompts/` — warianty promptu (`v0-prod` = dzisiejsza produkcja, reszta patrz plan krok 3).
- `providers/openrouter.ts`, `providers/platerecognizer.ts` — klienci API.
- `models.json` — roster (tylko EU + tańsze od `openai/gpt-4o-mini`, patrz plan krok 4).
- `categories.ts` — loader `categories.json` z backendu.

## Testy jednostkowe (bez API, darmowe)

```bash
npx tsx --test schema.test.ts relations.test.ts score.test.ts
npx tsc --noEmit -p tsconfig.json
```
