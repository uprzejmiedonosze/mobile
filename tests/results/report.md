# UD Pro vision eval — raport

Wygenerowano: 2026-09-21T17:55:17.062Z. Wagi score złożonego: {"plate":0.35,"category":0.25,"role":0.2,"plateBbox":0.15,"carBbox":0.05}.

## Tabela Pareto

| # | Pareto | Konfiguracja | Score | tablica | kategoria | rola | IoU tablicy | IoU auta | zdatne do wysyłki | $/zgłoszenie | $/1000 | napraw | błędów |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ✅ | openai/gpt-5-nano @azure/swedencentral / v2-pixels / hybrid-pr / candidate | 74.5% | 85.0% | 38.0% | 84.0% | 0.94 | 0.85 | 0.0% | $0.00271 | $2.70872 | 24 | 0 |
| 2 | ✅ | google/gemma-4-26b-a4b-it @nextbit/bf16 / v1-fixed / hybrid-pr / single | 66.2% | 85.0% | 2.0% | 88.0% | 0.91 | 0.95 | 0.0% | $0.00020 | $0.19691 | 0 | 0 |
| 3 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v2-pixels / hybrid-pr / candidate | 64.4% | 75.0% | 22.0% | 80.0% | 0.83 | 0.85 | 31.3% | $0.00184 | $1.83609 | 21 | 0 |
| 4 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v2-pixels / no-crop / candidate | 63.1% | 75.0% | 30.0% | 80.0% | 0.63 | 0.79 | 20.0% | $0.00203 | $2.02908 | 21 | 0 |
| 5 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v0-prod / no-crop / candidate | 62.1% | 75.0% | 36.7% | 73.3% | 0.53 | 0.82 | 22.2% | $0.00129 | $1.28514 | 3 | 0 |
| 6 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v2-pixels / no-crop / single | 61.3% | 75.0% | 30.0% | 70.0% | 0.63 | 0.83 | 0.0% | $0.00221 | $2.21383 | 25 | 0 |
| 7 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v3-categories / no-crop / candidate | 59.4% | 75.0% | 23.3% | 83.3% | 0.50 | 0.62 | 11.1% | $0.00189 | $1.89393 | 8 | 0 |
| 8 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v3-categories / no-crop / single | 59.0% | 75.0% | 26.7% | 80.0% | 0.47 | 0.62 | 0.0% | $0.00232 | $2.31641 | 19 | 0 |
| 9 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v0-prod / no-crop / single | 58.9% | 75.0% | 26.7% | 70.0% | 0.52 | 0.82 | 0.0% | $0.00184 | $1.84427 | 15 | 0 |
| 10 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v1-fixed / no-crop / single | 57.8% | 75.0% | 16.7% | 76.7% | 0.53 | 0.82 | 0.0% | $0.00177 | $1.76604 | 16 | 0 |
| 11 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v2-pixels / baseline / candidate | 55.9% | 75.0% | 26.0% | 78.0% | 0.23 | 0.81 | 15.6% | $0.00223 | $2.22994 | 20 | 0 |
| 12 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v1-fixed / no-crop / candidate | 55.1% | 75.0% | 10.0% | 73.3% | 0.53 | 0.77 | 22.2% | $0.00132 | $1.31787 | 3 | 0 |
| 13 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v5-twostage / no-crop / candidate | 54.1% | 62.5% | 0.0% | 80.0% | 0.77 | 0.94 | 0.0% | $0.00181 | $1.80636 | 3 | 0 |
| 14 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v4-relations / no-crop / candidate | 52.0% | 75.0% | 0.0% | 83.3% | 0.41 | 0.60 | 0.0% | $0.00175 | $1.74867 | 6 | 0 |
| 15 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v4-relations / no-crop / single | 51.7% | 77.8% | 0.0% | 83.3% | 0.34 | 0.55 | 0.0% | $0.00184 | $1.83748 | 18 | 2 |
| 16 | ✅ | google/gemma-4-26b-a4b-it @nextbit/bf16 / v1-fixed / no-crop / single | 48.3% | 50.0% | 8.0% | 84.0% | 0.52 | 0.83 | 0.0% | $0.00020 | $0.19674 | 0 | 0 |
| 17 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v3-categories / no-crop / single | 46.0% | 58.3% | 10.0% | 80.0% | 0.33 | 0.42 | 0.0% | $0.00031 | $0.30894 | 8 | 0 |
| 18 |  | openai/gpt-5-nano @azure/swedencentral / v2-pixels / baseline / candidate | 45.6% | 50.0% | 40.0% | 82.0% | 0.01 | 0.31 | 0.0% | $0.00345 | $3.45280 | 28 | 0 |
| 19 |  | z-ai/glm-5.3-flash @nextbit/fp8 / v5-twostage / no-crop / single | 45.0% | 50.0% | 0.0% | 70.0% | 0.64 | 0.79 | 0.0% | $0.00243 | $2.42924 | 15 | 0 |
| 20 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v4-relations / no-crop / single | 44.8% | 58.3% | 0.0% | 80.0% | 0.40 | 0.48 | 0.0% | $0.00033 | $0.32802 | 9 | 0 |
| 21 |  | openai/gpt-5-nano @azure/swedencentral / v2-pixels / no-crop / candidate | 44.7% | 47.5% | 38.0% | 84.0% | 0.00 | 0.35 | 0.0% | $0.00285 | $2.85014 | 23 | 0 |
| 22 |  | openai/gpt-5-nano @azure/swedencentral / v1-fixed / no-crop / candidate | 43.8% | 45.8% | 40.0% | 80.0% | 0.02 | 0.28 | 0.0% | $0.00176 | $1.75956 | 2 | 0 |
| 23 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v1-fixed / baseline / single | 43.6% | 55.0% | 4.0% | 82.0% | 0.19 | 0.82 | 0.0% | $0.00026 | $0.26432 | 5 | 0 |
| 24 |  | openai/gpt-5-nano @azure/swedencentral / v2-pixels / no-crop / single | 43.2% | 41.7% | 40.0% | 80.0% | 0.02 | 0.47 | 0.0% | $0.00381 | $3.81269 | 22 | 0 |
| 25 |  | openai/gpt-5-nano @azure/swedencentral / v3-categories / no-crop / single | 43.1% | 45.8% | 40.0% | 76.7% | 0.02 | 0.30 | 0.0% | $0.00280 | $2.80094 | 2 | 0 |
| 26 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v0-prod / no-crop / single | 42.7% | 50.0% | 0.0% | 90.0% | 0.34 | 0.42 | 0.0% | $0.00021 | $0.21449 | 6 | 0 |
| 27 |  | openai/gpt-5-nano @azure/swedencentral / v3-categories / no-crop / candidate | 42.2% | 41.7% | 40.0% | 80.0% | 0.02 | 0.28 | 0.0% | $0.00196 | $1.95911 | 1 | 0 |
| 28 |  | openai/gpt-5-nano @azure/swedencentral / v1-fixed / no-crop / single | 42.2% | 41.7% | 36.7% | 80.0% | 0.05 | 0.33 | 0.0% | $0.00219 | $2.18575 | 1 | 0 |
| 29 | ✅ | google/gemma-4-26b-a4b-it @nextbit/bf16 / v1-fixed / no-crop / candidate | 42.1% | 38.9% | 0.0% | 91.7% | 0.45 | 0.68 | 0.0% | $0.00018 | $0.17755 | 4 | 2 |
| 30 |  | openai/gpt-5-nano @azure/swedencentral / v0-prod / no-crop / candidate | 39.8% | 37.5% | 36.7% | 83.3% | 0.00 | 0.17 | 0.0% | $0.00151 | $1.50926 | 1 | 0 |
| 31 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v2-pixels / no-crop / single | 39.5% | 54.2% | 6.7% | 90.0% | 0.00 | 0.18 | 0.0% | $0.00020 | $0.19883 | 1 | 0 |
| 32 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v4-relations / no-crop / candidate | 39.4% | 54.2% | 0.0% | 83.3% | 0.14 | 0.34 | 0.0% | $0.00025 | $0.24702 | 4 | 0 |
| 33 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v5-twostage / no-crop / single | 37.5% | 50.0% | 0.0% | 90.0% | 0.00 | 0.40 | 0.0% | $0.00022 | $0.22084 | 0 | 0 |
| 34 |  | openai/gpt-4o-mini (bez pinu) / v1-fixed / no-crop / candidate | 37.1% | 50.0% | 5.0% | 85.0% | 0.01 | 0.23 | 0.0% | $0.00667 | $6.67329 | 0 | 0 |
| 35 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v3-categories / no-crop / candidate | 37.0% | 50.0% | 0.0% | 76.7% | 0.16 | 0.35 | 0.0% | $0.00024 | $0.24373 | 6 | 0 |
| 36 |  | openai/gpt-5-nano @azure/swedencentral / v0-prod / no-crop / single | 36.0% | 25.0% | 40.0% | 83.3% | 0.00 | 0.12 | 0.0% | $0.00228 | $2.27905 | 1 | 0 |
| 37 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v0-prod / no-crop / candidate | 35.5% | 50.0% | 0.0% | 80.0% | 0.04 | 0.29 | 0.0% | $0.00022 | $0.21954 | 5 | 0 |
| 38 |  | google/gemma-3-27b-it @nebius/fp8 / v1-fixed / no-crop / candidate | 35.5% | 50.0% | 0.0% | 80.0% | 0.00 | 0.39 | 0.0% | $0.00020 | $0.20101 | 0 | 0 |
| 39 |  | **openai/gpt-4o-mini (bez pinu) / v0-prod / baseline / candidate (BASELINE)** | 34.9% | 37.5% | 10.0% | 90.0% | 0.01 | 0.22 | 0.0% | $0.00416 | $4.16229 | 2 | 0 |
| 40 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v5-twostage / no-crop / candidate | 34.4% | 41.7% | 0.0% | 86.7% | 0.00 | 0.49 | 0.0% | $0.00019 | $0.19103 | 0 | 0 |
| 41 |  | google/gemma-4-26b-a4b-it @nextbit/bf16 / v2-pixels / no-crop / candidate | 33.7% | 50.0% | 0.0% | 76.7% | 0.00 | 0.16 | 0.0% | $0.00023 | $0.22777 | 6 | 0 |
| 42 |  | openai/gpt-5-nano @azure/swedencentral / v4-relations / no-crop / candidate | 33.5% | 45.8% | 0.0% | 80.0% | 0.01 | 0.27 | 0.0% | $0.00263 | $2.62803 | 2 | 0 |
| 43 |  | openai/gpt-4o-mini @azure/swedencentral / v1-fixed / no-crop / candidate | 32.5% | 37.5% | 0.0% | 85.0% | 0.07 | 0.28 | 0.0% | $0.00869 | $8.68741 | 0 | 0 |
| 44 |  | openai/gpt-5-nano @azure/swedencentral / v5-twostage / no-crop / candidate | 32.4% | 41.7% | 0.0% | 80.0% | 0.00 | 0.37 | 0.0% | $0.00342 | $3.41890 | 0 | 0 |
| 45 |  | mistralai/ministral-3b-2512 @mistral/eu / v1-fixed / no-crop / candidate | 32.4% | 50.0% | 30.0% | 30.0% | 0.00 | 0.27 | 0.0% | $0.00036 | $0.36037 | 2 | 0 |
| 46 |  | openai/gpt-5-nano @azure/swedencentral / v5-twostage / no-crop / single | 30.7% | 37.5% | 0.0% | 76.7% | 0.04 | 0.33 | 0.0% | $0.00459 | $4.59376 | 2 | 0 |
| 47 |  | openai/gpt-5-nano @azure/swedencentral / v4-relations / no-crop / single | 29.6% | 33.3% | 0.0% | 80.0% | 0.03 | 0.32 | 0.0% | $0.00344 | $3.44044 | 2 | 0 |
| 48 |  | **openai/gpt-4o-mini @azure/swedencentral / v0-prod / baseline / candidate (BASELINE)** | 29.1% | 25.0% | 5.0% | 90.0% | 0.00 | 0.23 | 0.0% | $0.00543 | $5.42792 | 2 | 0 |
| 49 |  | openai/gpt-4.1-nano @azure/swedencentral / v1-fixed / no-crop / candidate | 27.6% | 25.0% | 0.0% | 85.0% | 0.03 | 0.28 | 0.0% | $0.00050 | $0.49709 | 2 | 0 |

Pareto ✅ = żadna inna konfiguracja nie jest jednocześnie tańsza i lepsza jakościowo.

## Porażki zwycięzcy: openai/gpt-5-nano @azure/swedencentral / v2-pixels / hybrid-pr / candidate

- **PXL_20260914_081354709**: zła kategoria
- **PXL_20260914_081450783**: zła kategoria
- **PXL_20260914_081456501**: zła kategoria
- **PXL_20260915_095410107**: zła tablica (CER 1.00), zła kategoria
- **PXL_20260915_095415318**: zła kategoria
- **PXL_20260918_101316924.MP**: zła rola, zła tablica (CER 1.50), IoU tablicy 0.00
- **PXL_20260918_101325860**: zła rola
- **PXL_20260919_065308349**: zła kategoria
- **PXL_20260919_065333754.MP**: zła kategoria
- **PXL_20260914_081450783**: zła kategoria
- **PXL_20260914_081456501**: zła kategoria
- **PXL_20260915_095410107**: zła tablica (CER 1.00), zła kategoria
- **PXL_20260915_095415318**: zła kategoria
- **PXL_20260918_101316924.MP**: zła rola, zła tablica (CER 1.50), IoU tablicy 0.00
- **PXL_20260918_101325860**: zła rola
- **PXL_20260919_065308349**: zła kategoria
- **PXL_20260919_065333754.MP**: zła kategoria
- **PXL_20260914_081450783**: zła kategoria
- **PXL_20260914_081456501**: zła kategoria
- **PXL_20260915_095410107**: zła rola, zła kategoria
- **PXL_20260915_095415318**: zła kategoria
- **PXL_20260918_101325860**: zła rola
- **PXL_20260919_065308349**: zła kategoria
- **PXL_20260919_065333754.MP**: zła kategoria
- **PXL_20260914_081450783**: zła kategoria
- **PXL_20260914_081456501**: zła kategoria
- **PXL_20260915_095410107**: zła tablica (CER 1.00), zła kategoria
- **PXL_20260915_095415318**: zła kategoria
- **PXL_20260918_101325860**: zła rola
- **PXL_20260919_065308349**: zła kategoria
- **PXL_20260919_065333754.MP**: zła kategoria
- **PXL_20260914_081450783**: zła kategoria
- **PXL_20260914_081456501**: zła kategoria
- **PXL_20260915_095410107**: zła tablica (CER 1.00), zła kategoria
- **PXL_20260915_095415318**: zła kategoria
- **PXL_20260918_101325860**: zła rola
- **PXL_20260919_065308349**: zła kategoria
- **PXL_20260919_065333754.MP**: zła kategoria
