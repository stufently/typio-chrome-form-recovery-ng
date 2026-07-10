# Tasks

## Active

### 2026-07-10 — Apply code-review fixes (pending owner decision)

- docs/CODE_REVIEW_2026-07-10.md lists 11 verified findings (security,
  bugs, performance). Fixes not yet applied.

## Completed

### 2026-07-10 — Full code review (self + Codex + agy)

- Reviewed the entire extension source (Claude + Codex + Antigravity in
  parallel); cross-verified all reviewer findings against the code and
  published docs/CODE_REVIEW_2026-07-10.md.

### 2026-07-10 — Check CWS publication status

- Verified Chrome Web Store status: Typio Chrome Form Recovery NG
  (`jjmhahofhlbacclodnajllhicglffmcn`) is published and live — v1.0.1,
  listing last updated July 8, 2026, 9 users. The Jun 22 removal
  ("Inaccurate Description — Non functional") is resolved.

### 2026-06-24 — Fix CWS removal "Non functional" (autosave broken)

- Root-caused and fixed the content-script startup crash (`customElements`
  is `null` in the isolated world) that disabled all autosave; rewrote the
  recovery dialog as plain DOM in a closed Shadow DOM; hardened the E2E
  smoke test (HTTP fixture, wait for content-script attach). Released as
  v1.0.1.
