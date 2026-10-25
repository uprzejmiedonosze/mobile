# Testy bez builda i urządzenia: typecheck + jednostkowe + kontraktowe (docs/TESTING.md).
# test-dev     – backend w dockerze (../uprzejmiedonosze: `make dev`, po zmianach `make export`)
# test-staging – https://staging.uprzejmiedonosze.net (wymaga pliku service account, patrz e2e/session.mjs)
# e2e-dev / e2e-staging – Maestro na prawdziwym telefonie (wymaga dev clienta i USB), poza `test-*`.

.DEFAULT_GOAL := help

.PHONY: help
help: ## Lista targetów
	@grep -E '^[a-z0-9-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

.PHONY: test-unit
test-unit: ## typecheck + testy jednostkowe (bez sieci)
	npm run typecheck
	npm test

.PHONY: test-dev
test-dev: test-unit ## pełny zestaw na lokalnym dockerze (kontrakt: local)
	npm run test:contract:local

.PHONY: test-staging
test-staging: test-unit ## pełny zestaw na stagingu (kontrakt: staging, e@nieradka.net)
	npm run test:contract:staging

# Szybki test na telefonie bez budowania APK: Metro + zainstalowany dev client (profil `development`, raz zbudowany),
# zmiany JS przeładowują się na żywo. Środowisko z .env albo wymuszone zmienną (process env ma pierwszeństwo przed .env;
# nadpisania pojedynczych pól w .env, np. EXPO_PUBLIC_UD_BASE, nadal wygrywają). -c: EXPO_PUBLIC_* są wkompilowane
# w bundle, więc po zmianie środowiska trzeba wyczyścić cache Metro.
# APP_VARIANT=development: konfiguracja wariantu dev (pakiet net.uprzejmiedonosze.pro.dev) – klawisz „a” w Metro
# otwiera wtedy dev client, a nie appkę ze sklepu o pakiecie net.uprzejmiedonosze.pro.
# Expo szuka adb w $ANDROID_HOME/platform-tools – bez Android Studio wskazujemy platform-tools z Homebrew
# (cask android-platform-tools: …/Caskroom/android-platform-tools/<wersja>/platform-tools/adb).
ANDROID_HOME ?= $(shell adb=$$(command -v adb) && cd "$$(dirname "$$(readlink -f "$$adb")")/.." && pwd)
export ANDROID_HOME

.PHONY: dev dev-staging dev-prod
dev: ## Metro z dev clientem, środowisko z .env (zmiany JS na żywo, bez builda)
	APP_VARIANT=development npx expo start --dev-client -c

dev-staging: ## Metro z dev clientem na backendzie stagingu
	APP_VARIANT=development EXPO_PUBLIC_UD_ENV=staging npx expo start --dev-client -c

dev-prod: ## Metro z dev clientem na backendzie produkcji (prawdziwe dane!)
	APP_VARIANT=development EXPO_PUBLIC_UD_ENV=prod npx expo start --dev-client -c

.PHONY: e2e-dev
e2e-dev: ## Maestro na telefonie przeciw lokalnemu dockerowi
	npm run e2e:local

.PHONY: e2e-staging
e2e-staging: ## Maestro na telefonie przeciw stagingowi
	npm run e2e:staging

# ── Release do sklepów (docs/RELEASE.md) ─────────────────────────────────────
#
# SemVer, źródłem prawdy są tagi `vX.Y.Z` (scripts/bump-version.sh); versionCode Androida nadaje EAS (autoIncrement).
# Buildy i wysyłka do Play idą wyłącznie przez GitHub Actions (.github/workflows/release-android.yml, `eas build --local`).
# Wydajesz z `main`, na czystym drzewie, po uzupełnieniu `## RELEASE-CANDIDATE` w CHANGELOG.md:
#   make release-patch|release-minor|release-major   → testy, bump, „Co nowego” (play-notes/), commit, tag, push → Actions
#   make staging-play                                 → staging z origin/main do Play internal
# Major nigdy nie bumpuje się „przy okazji” – tylko jawnym `make release-major`.

.PHONY: check-git-clean check-branch-main release-check bump-version \
	release-patch release-minor release-major tag-release \
	release-notes log-from-last-tag play-notes play-notes-staging \
	staging-play release-android-run workflow-runs

check-git-clean:
	@echo "==> Checking if the repo is clean"
	@test -z "$$(git status --porcelain)" || ( echo "There are uncommitted changes." && exit 1 )

check-branch-main:
	@echo "==> Checking if current branch is main"
	@test "$$(git rev-parse --abbrev-ref HEAD)" = "main" || ( echo "Not on branch main." && exit 1 )

# SCHEMA zmieniony od ostatniego tagu = zmiana kontraktu API: najpierw build w sklepach, dopiero potem backend z podbitym
# VISION_SCHEMA (docs/NFR.md, ../uprzejmiedonosze/API.md) – inaczej backend zablokuje (426) appki, które jeszcze są w sklepach.
release-check:
	@echo "==> Release checks"
	@! grep -q EXPO_PUBLIC_E2E eas.json || ( echo "eas.json ustawia EXPO_PUBLIC_E2E – tryb e2e nie może trafić do buildów." && exit 1 )
	@tag=$$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname | head -n1); \
	if [ -n "$$tag" ]; then \
		old=$$(git show "$$tag:src/lib/vision.ts" | grep -E '^export const SCHEMA' | head -n1); \
		new=$$(grep -E '^export const SCHEMA' src/lib/vision.ts | head -n1); \
		if [ "$$old" != "$$new" ]; then \
			echo "!! SCHEMA zmieniony od $$tag:"; echo "   było:  $$old"; echo "   jest:  $$new"; \
			echo "!! Najpierw publikacja w sklepach, dopiero potem backend z VISION_SCHEMA = nowy SCHEMA (docs/RELEASE.md)."; \
		fi; \
	fi
	npm run typecheck

# BUMP=patch|minor|major. Wylicza wersję (bump-version.sh), zapisuje ją i commituje (apply-version.sh).
bump-version:
	@new_version=$$(bash scripts/bump-version.sh $(BUMP)) || exit 1; \
	echo "==> Next release: v$$new_version"; \
	bash scripts/apply-version.sh "$$new_version"

tag-release:
	@version=$$(tr -d '[:space:]' < VERSION); \
	if git rev-parse -q --verify "refs/tags/v$$version" >/dev/null; then \
		echo "==> Tag v$$version już istnieje"; \
	else \
		echo "==> Tagging v$$version"; git tag -a "v$$version" -m "release v$$version"; \
	fi
	@echo "==> Pushing main + tag"
	git push origin main
	git push origin "refs/tags/v$$(tr -d '[:space:]' < VERSION)"
	@echo "==> Tag uruchamia GitHub Actions „Wydanie Android” (.github/workflows/release-android.yml): eas build --local → Play testy otwarte (beta, szkic) + nazwa i „Co nowego”."
	@echo "    Postęp: make workflow-runs. Nie ruszył albo padł? make release-android-run"

release-patch: check-git-clean check-branch-main release-check test-staging ## Wydanie patch (np. 1.0.0 → 1.0.1)
	@$(MAKE) bump-version BUMP=patch
	@$(MAKE) tag-release

release-minor: check-git-clean check-branch-main release-check test-staging ## Wydanie minor (np. 1.0.1 → 1.1.0)
	@$(MAKE) bump-version BUMP=minor
	@$(MAKE) tag-release

release-major: check-git-clean check-branch-main release-check test-staging ## Wydanie major (np. 1.1.0 → 2.0.0)
	@$(MAKE) bump-version BUMP=major
	@$(MAKE) tag-release

# „Co nowego” w Play (limit 500 zn.): sekcja CHANGELOG-a w całości, gdy się mieści, inaczej streszczenie przez `claude -p`
# (scripts/play-notes.js). Przy wydaniu robi to samo apply-version.sh i commituje play-notes/vX.Y.Z.txt – plik można
# poprawić ręcznie przed pushem tagu. RC=1: sekcja RELEASE-CANDIDATE (podgląd tego, co dostanie staging).
release-notes: ## Podgląd „Co nowego” bieżącej wersji (RC=1: RELEASE-CANDIDATE), streszczenie LLM gdy > 500 zn.
	@node scripts/play-notes.js --summarize $(if $(RC),--staging)

log-from-last-tag: ## Commity od ostatniego tagu (pomoc przy pisaniu CHANGELOG-a)
	@tag=$$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname | head -n1); \
	if [ -z "$$tag" ]; then echo "==> Brak tagów, cała historia"; git log --pretty=format:"%h %ci %s"; \
	else echo "==> Commity od $$tag"; git log --pretty=format:"%h %ci %s" "$$tag"..HEAD; fi
	@echo ""

# GitHub Actions (.github/workflows/release-android.yml) – `eas build --local` na runnerze GitHuba, więc bez limitu
# buildów planu Free EAS; podpis i versionCode dalej z EAS, submit przez EAS Submit. Tag vX.Y.Z odpala wydanie sam;
# poniższe targety to ręczne uruchomienie (--ref: stan z GitHuba, nie z lokalnego katalogu – najpierw push).
# Staging: build z origin/main, VERSION bez zmian, versionCode z licznika EAS (wspólny z production). „Co nowego” =
# streszczenie lokalnego RELEASE-CANDIDATE (na runnerze nie ma claude), przekazane do workflowu jako input.
GH_WF = gh workflow run release-android.yml

staging-play: ## Staging do Google Play internal przez GitHub Actions (build + submit, z origin/main)
	@notes=$$(node scripts/play-notes.js --summarize --staging) || exit 1; \
	printf '==> Co nowego:\n%s\n' "$$notes"; \
	$(GH_WF) --ref main -f profile=staging-play -f notes="$$notes"

release-android-run: ## Ponów wydanie Androida dla bieżącego tagu przez GitHub Actions (gdy push tagu go nie uruchomił)
	$(GH_WF) --ref "v$$(tr -d '[:space:]' < VERSION)" -f profile=production

workflow-runs: ## Ostatnie uruchomienia wydań w GitHub Actions
	gh run list --workflow release-android.yml --limit 10

# Nazwa wydania + „Co nowego” w Play (scripts/play-notes.js; klucz z secrets/ albo $$PLAY_SERVICE_ACCOUNT_JSON).
# Workflow robi to sam po submit – te targety są do poprawek ręcznych. CODE=N wskazuje build (domyślnie najnowszy na torze).
play-notes: ## Nazwa i „Co nowego” wydania X.Y.Z na testach otwartych (beta) z play-notes/vX.Y.Z.txt
	node scripts/play-notes.js --track beta $(if $(CODE),--version-code $(CODE))

play-notes-staging: ## Nazwa i „Co nowego” stagingu na internal ze streszczenia RELEASE-CANDIDATE (COMPLETE=1 wydaje testerom)
	@notes=$$(mktemp); trap 'rm -f "$$notes"' EXIT; \
	node scripts/play-notes.js --summarize --staging > "$$notes" || exit 1; \
	node scripts/play-notes.js --track internal --staging $$(test -s "$$notes" && echo --notes-file "$$notes") \
		$(if $(CODE),--version-code $(CODE)) $(if $(COMPLETE),--complete)
