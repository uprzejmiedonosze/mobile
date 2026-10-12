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
