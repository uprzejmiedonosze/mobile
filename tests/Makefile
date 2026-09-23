# Lokalna iteracja nad algorytmem wizji. Patrz plan:
# ~/.claude/plans/nie-jestem-zadowolony-z-curious-comet.md oraz tests/eval/README.md.
#
#   make step1                     # faza 2: resize/EXIF/grupowanie (za darmo, prep.ts)
#   make step1 FORCE=1             # wymuś przeliczenie (ignoruj cache)
#   make step2                     # faza 3: analiza LLM (kosztuje, vision-local.php) — wszyscy kandydaci
#   make step2 CANDIDATE=R001      # tylko jeden kandydat (taniej/szybciej przy iteracji)
#   make compose                   # podział po tablicy + kategoria + draftOrder (za darmo, compose-local.ts)
#   make serve                     # serwer HTTP do podglądu step1.html / step2.html / compose.html (fetch() nie działa z file://)

BACKEND := ../../uprzejmiedonosze
CANDIDATE ?=
FORCE ?=

.PHONY: step1 step2 compose serve

step1:
	cd eval && npx tsx prep.ts $(if $(FORCE),--force,)

step2:
	cd $(BACKEND) && php src/tools/vision-local.php $(if $(CANDIDATE),--candidate $(CANDIDATE),)

compose:
	cd eval && npx tsx compose-local.ts

serve:
	@echo "Otwórz: http://localhost:8931/results/step1.html"
	@echo "        http://localhost:8931/results/step2.html"
	@echo "        http://localhost:8931/results/compose.html"
	python3 -m http.server 8931
