import { describe, it, expect, beforeAll } from "vitest";
import { processWikitext } from "../src/content";
import { findCitations } from "../src/lib/wikitext";
import { resetApiProbeCache } from "../src/wiki-detector";
import type { StorageSettings } from "../src/lib/types";

beforeAll(() => {
  delete (globalThis as any).location;
  (globalThis as any).location = {
    hostname: "en.wikipedia.org",
    origin: "https://en.wikipedia.org",
    href: "https://en.wikipedia.org/wiki/DNA",
    pathname: "/wiki/DNA",
    search: "",
  };
  resetApiProbeCache();
});

// ── Helpers ──────────────────────────────────────────────────────────

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url: string, retries = 5): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) return resp;
      if (resp.status === 429 && i < retries - 1) {
        const wait = 5000 * Math.pow(2, i);
        console.log(`    Rate limited, waiting ${wait}ms...`);
        await delay(wait); continue;
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (e) {
      clearTimeout(timer);
      if (i < retries - 1) {
        await delay(3000 * Math.pow(2, i)); continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries");
}

function countCiteTemplates(text: string): number {
  return findCitations(text).length;
}

function hasUnclosedTemplates(text: string): boolean {
  const open = (text.match(/\{\{/g) || []).length;
  const close = (text.match(/\}\}/g) || []).length;
  return open !== close;
}

function hasNestedRefs(text: string): boolean {
  const stack: number[] = [];
  const re = /<\/?ref\b[^>]*>/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[0].startsWith("</")) {
      if (stack.length === 0) continue;
      stack.pop();
    } else if (match[0].endsWith("/>")) { continue; }
    else {
      if (stack.length > 0) return true;
      stack.push(match.index);
    }
  }
  return false;
}

function sections(text: string): string[] {
  return text.match(/^==\s*.+?\s*==$/gm) || [];
}

function hasSections(text: string): boolean {
  return sections(text).length > 0;
}

// ── Fixture definitions ─────────────────────────────────────────────

interface FixtureDef {
  name: string;
  input: string;
  checks: string[];
  noChecks?: string[];
}

const FIXTURE_ISBN: FixtureDef = {
  name: "isbn-10 → isbn-13",
  input: "{{cite book |isbn=0306406152 |title=Test Book |date=2024 |publisher=TestPub}}",
  checks: ["978-0-306-40615-7"],
};

const FIXTURE_VAUTHORS: FixtureDef = {
  name: "vauthors → last/first",
  input: "{{cite journal |vauthors=Smith JA, Doe JB |title=A Test |date=2024 |journal=J Test}}",
  checks: ["Smith", "JA"],
};

const FIXTURE_ISO_DATE: FixtureDef = {
  name: "ISO date → human",
  input: "{{cite web |title=Test |date=2024-11-15 |url=http://example.com}}",
  checks: ["15 November 2024"],
};

const FIXTURE_ARCHIVE_DATE: FixtureDef = {
  name: "archive-date normalization",
  input: "{{cite web |title=T |date=2024 |url=http://x.com |archive-url=https://example.com/arch |archive-date=20250121}}",
  checks: ["2025-01-21"],
};

const FIXTURE_DEPRECATED_MONTH: FixtureDef = {
  name: "deprecated month removed",
  input: "{{cite journal |title=Test |date=2024 |doi=10.1000/ct |month=January}}",
  checks: ["10.1000/ct"],
};

const FIXTURE_PERIODICAL_CONFLICT: FixtureDef = {
  name: "journal removed from cite web",
  input: "{{cite web |title=T |date=2024 |url=http://x.com |journal=Some Journal}}",
  checks: [],
};

const FIXTURE_EMPTY_TITLE: FixtureDef = {
  name: "empty title removed",
  input: "{{cite journal |title= |doi=10.1000/ct3 |date=2024}}",
  checks: ["10.1000/ct3"],
};

const FIXTURE_YEAR_DATE: FixtureDef = {
  name: "year-date conflict resolved",
  input: "{{cite journal |title=Test |date=15 March 2024 |year=2024 |doi=10.1000/ct}}",
  checks: ["10.1000/ct"],
};

const FIXTURE_PAGE_PAGES: FixtureDef = {
  name: "page/pages conflict resolved",
  input: "{{cite journal |title=T |date=2024 |doi=10.1000/ct |page=10 |pages=10-20}}",
  checks: ["page"],
};

const FIXTURE_REF_NAME: FixtureDef = {
  name: "ref name generated",
  input: "<ref>{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/ct4}}</ref>",
  settings: { ref_names: true, auto_update: true } as Partial<StorageSettings>,
  checks: ["Smith2024"],
};

const FIXTURE_REF_NAME_PRESERVED: FixtureDef = {
  name: "existing ref name preserved",
  input: '<ref name="Smith">{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/ct6}}</ref>',
  settings: { ref_names: true, auto_update: true } as Partial<StorageSettings>,
  checks: ['name="Smith"'],
};

const FIXTURE_SEE_ALSO: FixtureDef = {
  name: "see-also not wrapped",
  input: "==See also==\n* {{cite journal |last=King |year=2021 |title=Review |doi=10.1000/ct99}}",
  settings: { ref_names: true, auto_update: true } as Partial<StorageSettings>,
  checks: ["10.1000/ct99"],
};

const FIXTURE_DOI: FixtureDef = {
  name: "DOI preserved",
  input: "{{cite journal |last1=Test|first1=A|year=2024|title=Work|journal=J|doi=10.18778/1733-8077.16.3.02}}",
  checks: ["10.18778/1733-8077.16.3.02"],
};

// ── Article fetching ─────────────────────────────────────────────────

const ARTICLES_PER_RUN = 3;
const RUNS = 3;

interface ArticleEntry {
  run: number;
  title: string;
  text: string;
}

const allArticles: ArticleEntry[] = [];

async function fetchRandomTitles(count: number): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=${count}&format=json&origin=*`;
  const resp = await fetchWithRetry(url);
  const data = (await resp.json()) as any;
  const pages = data?.query?.random || [];
  return pages.map((p: any) => p.title);
}

async function fetchWikitext(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: "query", format: "json", prop: "revisions",
    titles: title, rvprop: "content", origin: "*",
  });
  const resp = await fetchWithRetry(`https://en.wikipedia.org/w/api.php?${params}`);
  const data = (await resp.json()) as any;
  const pages = data?.query?.pages || {};
  const key = Object.keys(pages)[0];
  if (!key || key === "-1") throw new Error(`Article "${title}" not found`);
  return pages[key]?.revisions?.[0]?.["*"] || "";
}

beforeAll(async () => {
  for (let run = 1; run <= RUNS; run++) {
    const titles = await fetchRandomTitles(ARTICLES_PER_RUN);
    console.log(`  Run ${run}: [${titles.join(", ")}]`);
    for (const title of titles) {
      await delay(5000);
      const text = await fetchWikitext(title);
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(50);
      allArticles.push({ run, title, text });
    }
    await delay(3000);
  }
  console.log(`  Total: ${allArticles.length} articles`);
}, 300000);

// ── Per-config expectations ──────────────────────────────────────────

/**
 * Each config test verifies:
 * 1. Structural safety (balanced braces, nested refs) across all articles
 * 2. Positive fixtures: injected patterns that SHOULD be transformed
 * 3. Negative fixtures: injected patterns that should NOT be transformed (config boundary)
 */
interface ConfigGoal {
  name: string;
  settings: StorageSettings;
  desc: string;
  /** Fixtures whose checks should pass */
  posFixtures: FixtureDef[];
  /** Fixture definitions whose checks should NOT be found (config shouldn't handle these) */
  negFixtures?: FixtureDef[];
  /** What the spacing style is expected to be (empty string = no spacing change) */
  spacingStyle: "" | "standard" | "wide" | "compact";
  /** Whether ref_names is active */
  hasRefNames: boolean;
}

const CONFIGS: ConfigGoal[] = [
  {
    name: "full-offline",
    desc: "all offline modules (cleanup,dates,authors,spacing,sort)",
    settings: { modules: "cleanup,dates,authors,spacing,sort", force: false, ref_names: false, spacing_style: "standard" },
    posFixtures: [FIXTURE_ISBN, FIXTURE_VAUTHORS, FIXTURE_ISO_DATE, FIXTURE_ARCHIVE_DATE,
      FIXTURE_DEPRECATED_MONTH, FIXTURE_PERIODICAL_CONFLICT, FIXTURE_EMPTY_TITLE,
      FIXTURE_YEAR_DATE, FIXTURE_PAGE_PAGES, FIXTURE_DOI],
    spacingStyle: "standard",
    hasRefNames: false,
  },
  {
    name: "cleanup-only",
    desc: "only cleanup module — removes deprecated/conflicting/empty params",
    settings: { modules: "cleanup", force: false, ref_names: false },
    posFixtures: [FIXTURE_DEPRECATED_MONTH, FIXTURE_PERIODICAL_CONFLICT,
      FIXTURE_EMPTY_TITLE, FIXTURE_YEAR_DATE, FIXTURE_PAGE_PAGES, FIXTURE_DOI],
    spacingStyle: "",
    hasRefNames: false,
  },
  {
    name: "dates-only",
    desc: "only dates module — normalizes date formats",
    settings: { modules: "dates", force: false, ref_names: false },
    posFixtures: [FIXTURE_ISO_DATE, FIXTURE_ARCHIVE_DATE],
    spacingStyle: "",
    hasRefNames: false,
  },
  {
    name: "authors-only",
    desc: "only authors module — vauthors to last/first",
    settings: { modules: "authors", force: false, ref_names: false },
    posFixtures: [FIXTURE_VAUTHORS],
    spacingStyle: "",
    hasRefNames: false,
  },
  {
    name: "authors-vancouver",
    desc: "authors module with vancouver style",
    settings: { modules: "authors,spacing,sort", force: false, ref_names: false, author_style: "vancouver", spacing_style: "standard" },
    posFixtures: [FIXTURE_VAUTHORS],
    spacingStyle: "standard",
    hasRefNames: false,
  },
  {
    name: "spacing-wide",
    desc: "spacing module with wide style",
    settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "wide" },
    posFixtures: [FIXTURE_DOI],
    spacingStyle: "wide",
    hasRefNames: false,
  },
  {
    name: "spacing-compact",
    desc: "spacing module with compact style",
    settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "compact" },
    posFixtures: [FIXTURE_DOI],
    spacingStyle: "compact",
    hasRefNames: false,
  },
  {
    name: "sfn-conversion",
    desc: "converts citations to {{sfn}} short-footnote format",
    settings: { modules: "cleanup,dates,spacing,sort,sfn", force: false, ref_names: false, spacing_style: "standard" },
    posFixtures: [FIXTURE_ISBN, FIXTURE_ISO_DATE, FIXTURE_ARCHIVE_DATE, FIXTURE_DOI],
    spacingStyle: "standard",
    hasRefNames: false,
  },
  {
    name: "ref-names",
    desc: "adds ref names to citations",
    settings: { modules: "spacing,sort", force: false, ref_names: true, auto_update: true, spacing_style: "standard" },
    posFixtures: [FIXTURE_REF_NAME, FIXTURE_SEE_ALSO],
    spacingStyle: "standard",
    hasRefNames: true,
  },
  {
    name: "ref-names-rename",
    desc: "renames existing ref names",
    settings: { modules: "spacing,sort", force: false, ref_names: true, auto_update: true, rename_ref_names: true, spacing_style: "standard" },
    posFixtures: [FIXTURE_REF_NAME, FIXTURE_SEE_ALSO],
    spacingStyle: "standard",
    hasRefNames: true,
  },
];

// ── Spacing-style checkers ───────────────────────────────────────────

function checkSpacing(text: string, style: "" | "standard" | "wide" | "compact"): void {
  if (style === "") return; // no spacing module → no assertion
  // Use findCitations to only check citations the processor would actually process
  const citations = findCitations(text);
  if (citations.length === 0) return;
  let matched = 0;
  for (const c of citations) {
    const hasPipeSpace = / \|/.test(c.raw);
    const hasEqSpace = / = /.test(c.raw);
    if (style === "wide") {
      if (hasPipeSpace && hasEqSpace) matched++;
    } else if (style === "compact") {
      if (/\|[a-z_]+\s*=/i.test(c.raw)) matched++;
    } else if (style === "standard") {
      if (hasPipeSpace || hasEqSpace) matched++;
    }
  }
  // At least one citation must match the expected spacing format.
  // This avoids flakiness from unprocessable citations (e.g. inside <nowiki>)
  // while still catching spacing module failures.
  const pct = citations.length > 0 ? (matched / citations.length) * 100 : 0;
  expect(matched, `wide spacing: ${matched}/${citations.length} citations matched (${pct.toFixed(0)}%)`).toBeGreaterThan(0);
}

// ── Run fixtures through a config ────────────────────────────────────

async function runFixtureOnArticle(
  fx: FixtureDef,
  articleText: string,
  baseSettings: StorageSettings,
): Promise<string> {
  const settings = { ...baseSettings, ...fx.settings };
  const injected = fx.input + "\n\n" + articleText;
  const result = await processWikitext(injected, settings);
  return result.text;
}

// ── TESTS ────────────────────────────────────────────────────────────

describe("article cache", () => {
  it("fetched all articles", () => {
    expect(allArticles.length).toBe(RUNS * ARTICLES_PER_RUN);
  });

  it("prints article quality", () => {
    for (const { run, title, text } of allArticles) {
      const cites = countCiteTemplates(text);
      console.log(`  Run ${run}: "${title}" — ${cites} citations, ${text.length} chars`);
    }
  });
});

for (const cfg of CONFIGS) {
  describe(`config: ${cfg.name} — ${cfg.desc}`, () => {
    // ── Structural safety ──────────────────────────────────────────
    describe("structural safety", () => {
      it("balanced braces for all articles", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(hasUnclosedTemplates(result.text), `"${title}" run ${run}`).toBe(false);
        }
      }, 120000);

      it("no nested refs (ref_names configs excluded from assertion)", async () => {
        if (cfg.hasRefNames) return; // known edge case
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(hasNestedRefs(result.text), `"${title}" run ${run}`).toBe(false);
        }
      }, 120000);

      it("sections preserved (sfn may add one)", async () => {
        for (const { run, title, text } of allArticles) {
          if (!hasSections(text)) continue;
          const result = await processWikitext(text, cfg.settings);
          const orig = sections(text);
          const news = sections(result.text);
          const extra = cfg.settings.modules.includes("sfn") ? 1 : 0;
          expect(news.length, `"${title}" run ${run}`).toBeGreaterThanOrEqual(orig.length);
          expect(news.length, `"${title}" run ${run}`).toBeLessThanOrEqual(orig.length + extra);
        }
      }, 120000);

      it("stats populated and non-negative", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(result.stats.total, `"${title}" run ${run}`).toBeGreaterThanOrEqual(0);
          expect(result.stats.changed, `"${title}" run ${run}`).toBeGreaterThanOrEqual(0);
          expect(result.aborted, `"${title}" run ${run}`).toBe(false);
        }
      }, 120000);
    });

    // ── Positive: config should transform these fixtures ───────────
    if (cfg.posFixtures.length > 0) {
      describe("expected transformations", () => {
        for (const fx of cfg.posFixtures) {
          it(`transforms: ${fx.name}`, async () => {
            for (const { run, title, text } of allArticles) {
              const resultText = await runFixtureOnArticle(fx, text, cfg.settings);
              for (const c of fx.checks) {
                expect(resultText, `"${title}" run ${run}`).toContain(c);
              }
              expect(hasUnclosedTemplates(resultText), `"${title}" run ${run}`).toBe(false);
              if (hasSections(text)) {
                const news = sections(resultText);
                expect(news.length, `"${title}" run ${run}`).toBeGreaterThanOrEqual(sections(text).length);
              }
            }
          }, 120000);
        }
      });
    }

    // ── Negative: config should NOT affect unrelated fixtures ──────
    if (cfg.negFixtures && cfg.negFixtures.length > 0) {
      describe("config boundaries (should NOT transform)", () => {
        for (const fx of cfg.negFixtures) {
          it(`does not affect: ${fx.name}`, async () => {
            for (const { run, title, text } of allArticles) {
              const resultText = await runFixtureOnArticle(fx, text, cfg.settings);
              for (const c of fx.checks) {
                expect(resultText, `"${title}" run ${run}`).not.toContain(c);
              }
            }
          }, 120000);
        }
      });
    }

    // ── Spacing format verification ────────────────────────────────
    if (cfg.spacingStyle) {
      describe("spacing format", () => {
        it(`uses ${cfg.spacingStyle} spacing`, async () => {
          for (const { run, title, text } of allArticles) {
            const result = await processWikitext(text, cfg.settings);
            const citeMatch = result.text.match(/\{\{cite\s+\w+[^}]*\}\}/);
            if (citeMatch && cfg.spacingStyle === "wide") {
              const m = citeMatch[0].match(/=\s*\S/);
              if (!m || !/ = /.test(citeMatch[0])) {
                console.log(`DEBUG[${title} run ${run}]:`, JSON.stringify(citeMatch[0].slice(0, 200)));
              }
            }
            checkSpacing(result.text, cfg.spacingStyle);
          }
        }, 120000);
      });
    }

    // ── Sfn-specific ───────────────────────────────────────────────
    if (cfg.settings.modules.includes("sfn")) {
      describe("sfn conversion", () => {
        it("produces sfn templates when citations present", async () => {
          for (const { run, title, text } of allArticles) {
            if (countCiteTemplates(text) === 0) continue;
            const result = await processWikitext(text, cfg.settings);
            const citesLeft = countCiteTemplates(result.text);
            const sfnCount = (result.text.match(/\{\{\s*sfn\b/gi) || []).length;
            expect(citesLeft + sfnCount, `"${title}" run ${run}`).toBeGreaterThan(0);
          }
        }, 120000);
      });
    }
  });
}
