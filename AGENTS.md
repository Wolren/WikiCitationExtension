# WikiCitationExtension — Agent Guide

## Test structure

Tests are split into two tiers to avoid rate-limit timeouts.

### Fast — `npm test` (default)

Pure unit/functional tests. No external API calls. Run these during development:

```bash
npm test                 # all fast tests (6479 tests, ~64s)
npx vitest               # watch mode (re-runs on file changes)
npx vitest run tests/cleanup.test.ts   # single file
```

Config: `vitest.config.ts` — includes `tests/*.test.ts`, excludes `tests/api/` and `tests/fuzz.test.ts`.

> **Note:** `tests/fuzz.test.ts` is excluded from the default run — it has 5,500+ generated
> tests that can hang or time out on this machine. Run it explicitly with
> `npx vitest run tests/fuzz.test.ts` when making changes to citation processing.

### Slow (API) — `npm run test:api`

Tests that fetch real Wikipedia articles or hit external APIs. Can time out or hit
rate limits:

```bash
npm run test:api                                              # all API tests
VALIDATE_ON_WIKIPEDIA=true npx vitest run -c vitest.api.config.ts  # force re-fetch
```

Config: `vitest.api.config.ts` — includes `tests/api/**/*.test.ts`.

API test files live in `tests/api/`:
- `tests/api/robustness.test.ts` — invariant checks on live Wikipedia articles
- `tests/api/integration.test.ts` — end-to-end with article cache
- `tests/api/validate-on-wikipedia.test.ts` — compares output against Wikipedia parser

### All tests — `npm run test:all`

```bash
npm run test:all              # fast + API, full suite
```

Config: `vitest.all.config.ts` — includes everything.

### CI

The CI script (`npm run ci`) runs `npm run lint && npm run build && npm test` (fast tests
only). API tests are excluded from CI to prevent flaky rate-limit failures.

## Build

```bash
npm run build
npm run build -- --watch      # rebuild on file changes
```

Output goes to `dist/`. The `.xpi` and `.zip` packages are generated at the repo root.

## Settings dependency map (popup UI)

Settings in the popup that depend on a module being enabled:

| Setting | Depends on module |
|---------|------------------|
| `author_style`, `refresh_authors`, `max_authors`, `skip_org_authors` | `authors` |
| `force_archive_all`, `create_archive` | `archive` |
| `strip_issn` | `cleanup` |
| `sfn_page_conflict` | `sfn` |
| Fetch IDs chips (issn, pmid, pmc, s2cid, qid) | `ids` |

When a user changes a dependent setting while its module is off, a warning toast
appears and the change is reverted. Controls also appear dimmed when their
module is disabled.

Implementation: `src/popup.ts` — `DEPENDS_ON` map, `watchDependent()` handler.
