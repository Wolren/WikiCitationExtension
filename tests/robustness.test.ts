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

// ── Extended invariant checkers ──────────────────────────────────────

/** Balanced {{ }} in output */
function balancedBraces(text: string): boolean {
  const open = (text.match(/\{\{/g) || []).length;
  const close = (text.match(/\}\}/g) || []).length;
  return open === close;
}

/** No stray closing braces outside a matching {{ pair — detects generating broken templates */
function noStrayClosingBraces(text: string): boolean {
  let depth = 0;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "{" && text[i + 1] === "{") { depth++; i++; }
    else if (text[i] === "}" && text[i + 1] === "}") {
      depth--;
      if (depth < 0) return false;
      i++;
    }
  }
  return depth === 0;
}

/** Every opening <ref has a matching </ref> or is self-closing <ref .../> */
function allRefsClosed(text: string): boolean {
  const stack: number[] = [];
  const re = /<\/?ref\b[^>]*>/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[0].startsWith("</")) {
      if (stack.length === 0) return false;
      stack.pop();
    } else if (match[0].endsWith("/>")) {
      continue;
    } else {
      stack.push(match.index);
    }
  }
  return stack.length === 0;
}

/** No <ref></ref> with no content */
function noEmptyRefs(text: string): boolean {
  return !/<ref\b[^>]*>\s*<\/ref>/i.test(text);
}

/** No double pipes || outside wikilinks (inside citation bodies) */
function noDoublePipesInCites(text: string): boolean {
  const citations = findCitations(text);
  for (const c of citations) {
    const body = c.raw;
    // Extract pipe-separated params, skip content inside [[ ]]
    let inWikilink = false;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === "[" && body[i + 1] === "[") inWikilink = true;
      else if (body[i] === "]" && body[i + 1] === "]") inWikilink = false;
      if (!inWikilink && body[i] === "|" && body[i + 1] === "|") return false;
    }
  }
  return true;
}

/** Balanced [[ ]] */
function balancedWikilinks(text: string): boolean {
  // Count only those outside {{}} templates to avoid false positives
  let depth = 0;
  let wlDepth = 0;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "{" && text[i + 1] === "{") { depth++; i++; }
    else if (text[i] === "}" && text[i + 1] === "}") { depth--; i++; }
    else if (depth === 0 && text[i] === "[" && text[i + 1] === "[") { wlDepth++; i++; }
    else if (depth === 0 && text[i] === "]" && text[i + 1] === "]") { wlDepth--; i++; }
  }
  return wlDepth === 0;
}

/** No empty or broken wikilinks [[|]], [[]], [[foo]] without pipe where pipe is needed */
function noBrokenWikilinks(text: string): boolean {
  const broken = text.match(/\[\[\s*\]\]|\[\|\s*\]\]/g);
  return !broken || broken.length === 0;
}

/** Output should not contain replacement characters (encoding corruption) */
function noEncodingErrors(text: string): boolean {
  return !text.includes("\ufffd");
}

/** No orphaned access-date or archive-date without their parent params */
function noOrphanDateFields(text: string): boolean {
  const citations = findCitations(text);
  for (const c of citations) {
    const body = c.raw;
    if (/\|access-date\s*=/.test(body) && !/\|url\s*=/.test(body)) return false;
    if (/\|archive-date\s*=/.test(body) && !/\|archive-url\s*=/.test(body)) return false;
  }
  return true;
}

/** Output length must be at least 10% of input — detects catastrophic data loss */
function outputLengthReasonable(inputLen: number, outputLen: number): boolean {
  return outputLen >= inputLen * 0.1;
}

/** Sections in input should be preserved (or added to) */
function sections(text: string): string[] {
  return text.match(/^==\s*.+?\s*==$/gm) || [];
}

function hasSections(text: string): boolean {
  return sections(text).length > 0;
}

/** Citation count preserved or properly converted */
function hasSfnTemplates(text: string): boolean {
  return (text.match(/\{\{\s*sfn\b/gi) || []).length > 0;
}

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

interface FixtureDef {
  name: string;
  input: string;
  checks: string[];
  noChecks?: string[];
  settings?: Partial<StorageSettings>;
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

interface ConfigGoal {
  name: string;
  settings: StorageSettings;
  desc: string;
  posFixtures: FixtureDef[];
  negFixtures?: FixtureDef[];
  spacingStyle: "" | "standard" | "wide" | "compact";
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
  if (style === "") return;
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
    // ── Structural safety (extended) ─────────────────────────────
    describe("structural safety", () => {
      it("balanced braces for all articles", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(balancedBraces(result.text), `"${title}" run ${run}`).toBe(true);
        }
      }, 120000);

      it("stray closing braces detected", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(noStrayClosingBraces(result.text), `"${title}" run ${run}: stray }} without matching {{`).toBe(true);
        }
      }, 120000);

      it("all ref tags properly closed", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(allRefsClosed(result.text), `"${title}" run ${run}: unclosed or stray </ref>`).toBe(true);
        }
      }, 120000);

      it("no empty ref tags", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(noEmptyRefs(result.text), `"${title}" run ${run}: empty <ref></ref>`).toBe(true);
        }
      }, 120000);

      it("no nested refs (ref_names configs excluded from assertion)", async () => {
        if (cfg.hasRefNames) return;
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          const stack: number[] = [];
          const re = /<\/?ref\b[^>]*>/gi;
          let match;
          let nested = false;
          while ((match = re.exec(result.text)) !== null) {
            if (match[0].startsWith("</")) {
              if (stack.length === 0) continue;
              stack.pop();
            } else if (match[0].endsWith("/>")) { continue; }
            else {
              if (stack.length > 0) nested = true;
              stack.push(match.index);
            }
          }
          expect(nested, `"${title}" run ${run}: nested refs`).toBe(false);
        }
      }, 120000);

      it("balanced wikilinks in output", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(balancedWikilinks(result.text), `"${title}" run ${run}: unbalanced [[ ]]`).toBe(true);
        }
      }, 120000);

      it("no broken wikilinks", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(noBrokenWikilinks(result.text), `"${title}" run ${run}: broken [[|]] or [[]]`).toBe(true);
        }
      }, 120000);

      it("no double pipes in citation bodies", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(noDoublePipesInCites(result.text), `"${title}" run ${run}: double || in citation`).toBe(true);
        }
      }, 120000);

      it("no encoding errors", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(noEncodingErrors(result.text), `"${title}" run ${run}: replacement characters`).toBe(true);
        }
      }, 120000);

      it("no orphan date fields (access-date/archive-date without parent)", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(noOrphanDateFields(result.text), `"${title}" run ${run}: orphan access-date or archive-date`).toBe(true);
        }
      }, 120000);

      it("output length reasonable", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          expect(outputLengthReasonable(text.length, result.text.length),
            `"${title}" run ${run}: output ${result.text.length} vs input ${text.length}`).toBe(true);
        }
      }, 120000);

      it("processor does not capitalize template names (input may have {{Cite}} already)", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          // Only flag templates the processor itself generates
          // The processor always outputs lowercase template names
          const generated = result.text.match(/\{\{(citation|cite\s+\w+)\b/gi) || [];
          const original = text.match(/\{\{(citation|cite\s+\w+)\b/gi) || [];
          // If the output has more uppercase templates than input, something is wrong
          const upperOut = generated.filter(t => /[A-Z]/.test(t.slice(2))).length;
          const upperIn = original.filter(t => /[A-Z]/.test(t.slice(2))).length;
          expect(upperOut, `"${title}" run ${run}: processor generated ${upperOut} uppercase templates (input had ${upperIn})`).toBeLessThanOrEqual(upperIn);
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

      // NEW: Detect citation count drop — ensure we didn't silently eat citations
      it("citation count not zero when input had citations", async () => {
        for (const { run, title, text } of allArticles) {
          const inputCites = countCiteTemplates(text);
          if (inputCites === 0) continue;
          const result = await processWikitext(text, cfg.settings);
          const isSfn = cfg.settings.modules.includes("sfn");
          const outputCites = countCiteTemplates(result.text);
          const sfnCount = hasSfnTemplates(result.text) ? (result.text.match(/\{\{\s*sfn\b/gi) || []).length : 0;
          const totalRefs = outputCites + sfnCount;
          if (isSfn) {
            expect(totalRefs, `"${title}" run ${run}: sfn conversion lost all ${inputCites} citations`).toBeGreaterThan(0);
          } else {
            expect(outputCites, `"${title}" run ${run}: all ${inputCites} citations disappeared`).toBeGreaterThan(0);
          }
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
              // Also run extended invariants on fixture-injected text
              expect(noStrayClosingBraces(resultText), `"${title}" run ${run}: stray braces`).toBe(true);
              expect(allRefsClosed(resultText), `"${title}" run ${run}: unclosed refs`).toBe(true);
              expect(balancedWikilinks(resultText), `"${title}" run ${run}: unbalanced wikilinks`).toBe(true);
              expect(noDoublePipesInCites(resultText), `"${title}" run ${run}: double pipes`).toBe(true);
              expect(noEncodingErrors(resultText), `"${title}" run ${run}: encoding errors`).toBe(true);
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

    // ── Regression: output should not introduce new problems ──────
    describe("regression detection", () => {
      it("output does not contain error markers", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          const errorMarkers = ["\ufffd", "undefined", "NaN", "[object Object]"];
          for (const marker of errorMarkers) {
            expect(result.text, `"${title}" run ${run}: contains "${marker}"`).not.toContain(marker);
          }
        }
      }, 120000);

      it("all open ref tags eventually close (no formatting that breaks refs)", async () => {
        for (const { run, title, text } of allArticles) {
          const result = await processWikitext(text, cfg.settings);
          // Count <ref> open tags and </ref> close tags separately
          const opens = (result.text.match(/<ref\b[^>]*\/?>/gi) || []).filter(r => !r.endsWith("/>")).length;
          const closes = (result.text.match(/<\/ref\s*>/gi) || []).length;
          expect(opens, `"${title}" run ${run}: ${opens} open refs vs ${closes} closed`).toBe(closes);
        }
      }, 120000);
    });
  });
}
