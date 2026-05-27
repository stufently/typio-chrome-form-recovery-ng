# Contributing

Thanks for taking interest. The project is in pre-alpha — most user-facing things don't work yet. If you want to help, the easiest path is:

1. **Read the docs first.** Start with [README.md](README.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), [docs/PERMISSIONS.md](docs/PERMISSIONS.md), [docs/TARGETS.md](docs/TARGETS.md). The threat model is binding — please don't propose changes that conflict with it without discussion.
2. **Open an issue before a PR** if the change is non-trivial. We don't want anyone to write code that ends up rejected on principle.
3. **No telemetry, no remote endpoints, no third-party SDKs.** Pull requests adding any of these will be closed without merge.

## Build

All commands run in Docker — see [README.md § Build](README.md#build). Do not install Node locally.

```bash
make image            # one-time, builds the build container
make install          # npm ci
make build-chrome     # build the Chrome target
make test             # vitest unit tests
make lint             # eslint + tsc + web-ext lint
```

## Commit style

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`). One logical change per commit. Imperative mood, ≤ 50 chars on the subject line.

## Code style

- TypeScript strict, no `any`, no `// @ts-ignore` without a comment explaining why.
- No `innerHTML`, no `eval`, no `Function()` constructor. Lit templates handle escaping.
- DOM I/O lives in content scripts; storage I/O lives in the service worker. Cross-script communication is typed via `lib/types.ts → Message`.
- Public APIs in `lib/` have JSDoc; private helpers don't need it.
- Comments explain *why*, not *what*. The code shows what.

## License

MIT — see [LICENSE](LICENSE). By contributing you agree your contribution is licensed under MIT.
