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

.PHONY: e2e-dev
e2e-dev: ## Maestro na telefonie przeciw lokalnemu dockerowi
	npm run e2e:local

.PHONY: e2e-staging
e2e-staging: ## Maestro na telefonie przeciw stagingowi
	npm run e2e:staging

# ── Release do sklepów (docs/RELEASE.md) ─────────────────────────────────────
#
# SemVer, źródłem prawdy są tagi `vX.Y.Z` (scripts/bump-version.sh); numer buildu (iOS buildNumber / Android versionCode)
# nadaje EAS (autoIncrement). Wydajesz z `main`, na czystym drzewie, po uzupełnieniu `## RELEASE-CANDIDATE` w CHANGELOG.md:
#   make release-patch|release-minor|release-major   → testy, bump, commit „chore: release”, tag, push
#   make build-all                                    → podpisane buildy produkcyjne iOS + Android (z tagu)
#   make submit-ios submit-android                    → wysyłka do App Store Connect / Google Play (internal, draft)
# Major nigdy nie bumpuje się „przy okazji” – tylko jawnym `make release-major`.

.PHONY: check-git-clean check-branch-main release-check bump-version \
	release-patch release-minor release-major tag-release \
	check-on-tag build-ios build-android build-all submit-ios submit-android \
	build-staging-play submit-staging-play build-picker-ab \
	release-notes log-from-last-tag play-notes play-notes-staging \
	staging-play release-android-run workflow-runs \
	staging-play-eas release-android-eas eas-workflow-runs workflow-validate

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
	@echo "    Postęp: make workflow-runs. Nie ruszył albo padł? make release-android-run (awaryjnie na serwerach EAS: make release-android-eas)"

release-patch: check-git-clean check-branch-main release-check test-staging ## Wydanie patch (np. 1.0.0 → 1.0.1)
	@$(MAKE) bump-version BUMP=patch
	@$(MAKE) tag-release

release-minor: check-git-clean check-branch-main release-check test-staging ## Wydanie minor (np. 1.0.1 → 1.1.0)
	@$(MAKE) bump-version BUMP=minor
	@$(MAKE) tag-release

release-major: check-git-clean check-branch-main release-check test-staging ## Wydanie major (np. 1.1.0 → 2.0.0)
	@$(MAKE) bump-version BUMP=major
	@$(MAKE) tag-release

# Build tylko z czystego checkoutu dokładnie na tagu bieżącej wersji.
check-on-tag:
	@version=$$(tr -d '[:space:]' < VERSION); \
	test "$$(git describe --exact-match --tags HEAD 2>/dev/null)" = "v$$version" \
		|| ( echo "HEAD nie jest na tagu v$$version – zrób make release-* i zostań na tym commicie." && exit 1 )
	@test -z "$$(git status --porcelain)" || ( echo "Są niezacommitowane zmiany." && exit 1 )

build-ios: check-on-tag ## Build produkcyjny iOS (EAS, nadaje buildNumber)
	eas build --profile production --platform ios

build-android: check-on-tag ## Build produkcyjny Android AAB (EAS, nadaje versionCode)
	eas build --profile production --platform android

build-all: check-on-tag ## Buildy produkcyjne iOS + Android
	eas build --profile production --platform all

submit-ios: ## Wyślij ostatni build iOS do App Store Connect (TestFlight)
	eas submit --profile production --platform ios --latest

submit-android: ## Wyślij ostatni build Android do Google Play (internal, draft)
	eas submit --profile production --platform android --latest

# Sekcja CHANGELOG-a bieżącej wersji = tekst „Co nowego” w sklepach.
release-notes: ## Wypisz notatki wydania bieżącej wersji z CHANGELOG.md
	@version=$$(tr -d '[:space:]' < VERSION); \
	awk -v h="## v$$version " 'index($$0,h)==1{p=1;next} p&&/^## /{exit} p' CHANGELOG.md | sed '/./,$$!d'

log-from-last-tag: ## Commity od ostatniego tagu (pomoc przy pisaniu CHANGELOG-a)
	@tag=$$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname | head -n1); \
	if [ -z "$$tag" ]; then echo "==> Brak tagów, cała historia"; git log --pretty=format:"%h %ci %s"; \
	else echo "==> Commity od $$tag"; git log --pretty=format:"%h %ci %s" "$$tag"..HEAD; fi
	@echo ""

# Staging do testów w Google Play (track internal): AAB z EXPO_PUBLIC_UD_ENV=staging, bez tagu i bez SemVer-owego rytuału release-*.
# Wersja = VERSION, versionCode z licznika EAS (wspólny z production). Wymaga zacommitowanych zmian (EAS buduje z gita).
build-picker-ab: ## Build APK (staging) z diagnostyką pickera zdjęć – tylko do testów na telefonie, nie do sklepu
	@test -z "$$(git status --porcelain --untracked-files=no)" || ( echo "Są niezacommitowane zmiany (EAS buduje z gita)." && exit 1 )
	eas build --profile picker-ab --platform android

build-staging-play: ## Build AAB (staging) pod Google Play internal testing
	@test -z "$$(git status --porcelain --untracked-files=no)" || ( echo "Są niezacommitowane zmiany (EAS buduje z gita)." && exit 1 )
	eas build --profile staging-play --platform android

submit-staging-play: ## Wyślij ostatni build staging-play do Google Play (internal, draft)
	eas submit --profile staging-play --platform android --latest

# GitHub Actions (.github/workflows/release-android.yml) – `eas build --local` na runnerze GitHuba, więc bez limitu
# buildów planu Free EAS; podpis i versionCode dalej z EAS, submit przez EAS Submit. Tag vX.Y.Z odpala wydanie sam;
# poniższe targety to ręczne uruchomienie (--ref: stan z GitHuba, nie z lokalnego katalogu – najpierw push).
GH_WF = gh workflow run release-android.yml

staging-play: ## Staging do Google Play internal przez GitHub Actions (build + submit, z origin/main)
	$(GH_WF) --ref main -f profile=staging-play

release-android-run: ## Ponów wydanie Androida dla bieżącego tagu przez GitHub Actions (gdy push tagu go nie uruchomił)
	$(GH_WF) --ref "v$$(tr -d '[:space:]' < VERSION)" -f profile=production

workflow-runs: ## Ostatnie uruchomienia wydań w GitHub Actions
	gh run list --workflow release-android.yml --limit 10

# EAS Workflows (.eas/workflows/) – ZAPAS: build na serwerach Expo, zużywa limit planu Free (15 buildów Androida/mies.).
# Tylko ręcznie, gdy GitHub Actions nie działa. Wersja CLI przypięta: 24.2.0 ma błąd w workflow:validate („reading 'const'”).
EAS_WF = npx -y eas-cli@24.14.0

staging-play-eas: ## [zapas] Staging do Play internal przez EAS Workflow (zużywa build z limitu EAS)
	$(EAS_WF) workflow:run .eas/workflows/staging-play.yml --ref main

release-android-eas: ## [zapas] Wydanie Androida bieżącego tagu przez EAS Workflow (zużywa build z limitu EAS)
	$(EAS_WF) workflow:run .eas/workflows/release-android.yml --ref "v$$(tr -d '[:space:]' < VERSION)"

# Nazwa wydania + „Co nowego” w Play z CHANGELOG.md (scripts/play-notes.js; klucz z secrets/ albo $$PLAY_SERVICE_ACCOUNT_JSON).
# Workflowy robią to same po submit – te targety są do poprawek ręcznych. CODE=N wskazuje build (domyślnie najnowszy na torze).
play-notes: ## Nazwa i „Co nowego” wydania X.Y.Z na testach otwartych (beta) z CHANGELOG-a
	node scripts/play-notes.js --track beta $(if $(CODE),--version-code $(CODE))

play-notes-staging: ## Nazwa i „Co nowego” stagingu na internal z RELEASE-CANDIDATE (COMPLETE=1 wydaje szkic testerom)
	node scripts/play-notes.js --track internal --staging $(if $(CODE),--version-code $(CODE)) $(if $(COMPLETE),--complete)

eas-workflow-runs: ## [zapas] Ostatnie uruchomienia EAS Workflows
	$(EAS_WF) workflow:runs

workflow-validate: ## Sprawdź składnię plików .eas/workflows/*.yml
	@for f in .eas/workflows/*.yml; do $(EAS_WF) workflow:validate $$f || exit 1; done
