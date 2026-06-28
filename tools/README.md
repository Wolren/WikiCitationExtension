# CS1 Error Diagnostic Tool

A CLI tool that fetches a Wikipedia article, processes it through the
extension, and detects CS1 parameter conflicts in the output.

## Quick start

```bash
# Local scan (instant, no network)
npx tsx tools/diagnose-cs1-errors.ts "Schizoid personality disorder"

# Pipe article titles from stdin
cat /tmp/articles.txt | npx tsx tools/diagnose-cs1-errors.ts

# Single config
npx tsx tools/diagnose-cs1-errors.ts "DNA" --config cleanup
```

## Modes

| Flag | Network | Speed | Accuracy |
|------|---------|-------|----------|
| (none) | Hybrid | Fast | Confirmed via API spot-check |
| `--local` | None | Instant | Param-level only |
| `--api` | Full per-citation | Slow (1-5 min) | Wikipedia parser verdict |

`--local` scans raw wikitext for conflicting params. This catches most
CS1 errors without any API calls. Default mode uses local scan plus
Wikipedia API spot-checks on a sample of detected conflicts.

`--api` sends every citation individually to the Wikipedia parse API.
Returns the exact CS1 error categories the module generates. Rate
limited to 3 concurrent requests with 1.5s delay between batches.

## What it detects

| Pattern | CS1 Error |
|---------|-----------|
| `location` + `place` both specified | More than one of `location` and `place` |
| `work` + `website` both specified | More than one of `work` and `website` |
| `vauthors` + `last` both specified | More than one of author-name-list parameters |
| `author` + `last` both specified | More than one of author-name-list parameters |
| `year` + `date` both specified | Both `year` and `date` specified |
| `page` + `pages` both specified | Both `page` and `pages` specified |
| comma in `last` field | Vancouver style error: name in name N |
| `access-date` without `url` | |access-date= without |url= |
| `archive-date` without `archive-url` | |archive-date= without |archive-url= |

## Configs tested

Runs against all 7 configurations:

| Config | Modules |
|--------|---------|
| cleanup | cleanup |
| dates | dates |
| authors | authors |
| spacing | spacing,sort |
| full-offline | cleanup,dates,authors,spacing,sort |
| cs2tocs1 | cs2tocs1,cleanup,dates,spacing,sort |
| sfn | cleanup,dates,spacing,sort,sfn |

Filter with `--config cleanup,dates,authors`.

## Architecture

The tool uses two verification layers:

### Layer 1: Local param scanning (always runs)

Uses `findCitations` from `src/lib/wikitext.ts` to extract every
`{{cite ...}}` and `{{citation}}` template from the output. Iterates
over each citation's params and checks for known conflict patterns.
This is deterministic, instant, and catches the root cause of most
CS1 errors.

### Layer 2: Wikipedia API validation (optional)

Each citation is wrapped in `<ref>` tags and sent to the Wikipedia
parse API individually. The API returns rendered categories including
`CS1_errors:*` entries. This confirms that the local scan's findings
match what Wikipedia's CS1 module actually flags.

The per-citation approach is needed because the Wikipedia parse API
has a ~30KB POST limit. Sending the full article text fails for any
article with more than a few dozen citations. Sending citations one
at a time bypasses this limit entirely.

## Known limitations

- Vancouver style errors only appear in the rendered HTML output of
  the Wikipedia parse API, not in the categories. The local scan
  detects the root cause (comma in `last` field) instead.
- The `--api` mode takes 1-2 minutes for articles with 200+
  citations. The `--local` mode is sufficient for most debugging.
- The tool only checks citation templates (`{{cite ...}}` and
  `{{citation}}`). Infoboxes, navboxes, and other non-citation
  templates are not scanned.

## Adding new checks

Add a new pattern to `scanLocal()` in the tool. Add the pattern and
category to `CS1_LABELS`. The local scanner and the API spot-check
will pick it up automatically.
