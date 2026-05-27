# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffolding (2026-05-27): repo, license, README, PRIVACY, threat model, permission rationale, browser target matrix.
- WXT config, TypeScript strict, Lit 3, idb, webextension-polyfill, Vitest + fake-indexeddb, Playwright dependency declarations.
- Docker build (`node:22-alpine`) and `Makefile` targets.
- Placeholder entrypoints for background, content, popup, options.
- Skeleton i18n (en, ru).

### Notes

This release is **not** functional yet — it is foundation only. See `CURRENT_SESSION_TASKS.md` in the maintainer's tracker for the implementation roadmap. v1.0.0 will be the first user-facing release.
