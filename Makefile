# Typio Chrome Form Recovery NG — build orchestration.
# All targets run inside Docker. No npm/node touches the host.

IMAGE := typio-ng-build:local
DOCKER_RUN := docker run --rm -v "$$PWD":/app -w /app $(IMAGE)

.PHONY: help image install build build-chrome build-firefox build-edge build-opera \
        zip icons lint format test test-coverage test-e2e clean shell

help:
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

image: ## Build the local Docker build image
	docker build -t $(IMAGE) .

install: image ## npm install inside the build image (writes node_modules to host)
	$(DOCKER_RUN) npm ci

build: build-chrome build-firefox build-edge ## Build artefacts for all browsers

build-chrome: image ## Build Chrome MV3 artefact in .output/chrome-mv3/
	$(DOCKER_RUN) npm run build:chrome

build-firefox: image ## Build Firefox MV3 artefact in .output/firefox-mv3/
	$(DOCKER_RUN) npm run build:firefox

build-edge: image ## Build Edge MV3 artefact in .output/edge-mv3/
	$(DOCKER_RUN) npm run build:edge

build-opera: build-chrome ## Opera installs Chromium packages — reuse the Chrome build
	@mkdir -p .output/opera
	@cp -r .output/chrome-mv3/. .output/opera/
	@echo "Opera package ready at .output/opera/"

zip: image ## Produce store-ready zips for every target browser
	$(DOCKER_RUN) npm run zip:chrome
	$(DOCKER_RUN) npm run zip:firefox
	$(DOCKER_RUN) npm run zip:edge

icons: image ## Regenerate PNG icons from assets/icon-master.svg
	$(DOCKER_RUN) npm run icons

lint: image ## ESLint + tsc --noEmit + web-ext lint (Firefox build must exist)
	$(DOCKER_RUN) npm run lint
	$(DOCKER_RUN) npm run compile
	@if [ -d .output/firefox-mv3 ]; then $(DOCKER_RUN) npm run lint:webext; \
	else echo "skipping web-ext lint (no firefox build yet — run 'make build-firefox' first)"; fi

format: image ## Prettier write
	$(DOCKER_RUN) npm run format

test: image ## Vitest unit tests
	$(DOCKER_RUN) npm run test

test-coverage: image ## Vitest with coverage
	$(DOCKER_RUN) npm run test:coverage

test-e2e: image ## Playwright E2E (bundled Chromium only — see docs/TARGETS.md)
	$(DOCKER_RUN) npm run test:e2e

clean: ## Delete build outputs and node_modules
	rm -rf .output dist node_modules .wxt coverage test-results playwright-report

shell: image ## Drop into a shell in the build container
	docker run --rm -it -v "$$PWD":/app -w /app $(IMAGE) bash
