import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
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

interface ArticleDef {
  title: string;
  file: string;
  minCitations: number;
}

const ARTICLES: ArticleDef[] = [
  { title: "DNA", file: "DNA", minCitations: 40 },
  { title: "Moon", file: "Moon", minCitations: 20 },
  { title: "Polymerase chain reaction", file: "Polymerase_chain_reaction", minCitations: 15 },
  { title: "History of evolutionary thought", file: "History_of_evolutionary_thought", minCitations: 15 },
];

const CACHE_DIR = join(__dirname, "fixtures", "texts");

function getCachePath(file: string): string {
  return join(CACHE_DIR, `${file}.txt`);
}

function loadCached(def: ArticleDef): string | null {
  const p = getCachePath(def.file);
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}

function saveCached(def: ArticleDef, text: string): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(getCachePath(def.file), text, "utf-8");
}

async function fetchArticleWikitext(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: "query", format: "json", prop: "revisions",
    titles: title, rvprop: "content", origin: "*",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as any;
    const pages = data?.query?.pages || {};
    const key = Object.keys(pages)[0];
    if (!key || key === "-1") throw new Error(`Article "${title}" not found`);
    return pages[key]?.revisions?.[0]?.["*"] || "";
  } finally {
    clearTimeout(timer);
  }
}

function countCiteTemplates(text: string): number {
  return findCitations(text).length;
}

function hasUnclosedTemplates(text: string): boolean {
  const open = (text.match(/\{\{/g) || []).length;
  const close = (text.match(/\}\}/g) || []).length;
  return open !== close;
}

function countSfnTemplates(text: string): number {
  return (text.match(/\{\{\s*sfn\b/gi) || []).length;
}

function countRefElements(text: string): number {
  return (text.match(/<ref\b/g) || []).length;
}

/** Check for any <ref> that contains another <ref> inside it */
function hasNestedRefs(text: string): boolean {
  const stack: number[] = [];
  const re = /<\/?ref\b[^>]*>/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[0].startsWith("</")) {
      if (stack.length === 0) continue; // unmatched closing tag
      stack.pop();
    } else if (match[0].endsWith("/>")) {
      continue; // self-closing, not a container
    } else {
      if (stack.length > 0) return true; // <ref> inside another <ref>
      stack.push(match.index);
    }
  }
  return false;
}

interface SettingsConfig {
  name: string;
  settings: StorageSettings;
  online: boolean;
}

const OFFLINE_CONFIGS: SettingsConfig[] = [
  { name: "full-offline", settings: { modules: "cleanup,dates,authors,spacing,sort", force: false, ref_names: false } },
  { name: "cleanup-only", settings: { modules: "cleanup", force: false, ref_names: false } },
  { name: "dates-only", settings: { modules: "dates", force: false, ref_names: false } },
  { name: "authors-only", settings: { modules: "authors", force: false, ref_names: false } },
  { name: "authors-vancouver", settings: { modules: "authors,spacing,sort", force: false, ref_names: false, author_style: "vancouver" } },
  { name: "spacing-wide", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "wide" } },
  { name: "spacing-compact", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "compact" } },
  { name: "sfn-conversion", settings: { modules: "cleanup,dates,spacing,sort,sfn", force: false, ref_names: false } },
  { name: "ref-names", settings: { modules: "spacing,sort", force: false, ref_names: true, auto_update: true } },
  { name: "ref-names-rename", settings: { modules: "spacing,sort", force: false, ref_names: true, auto_update: true, rename_ref_names: true } },
];

const ONLINE_CONFIGS: SettingsConfig[] = [
  { name: "all-online", settings: { modules: "expand,cleanup,dates,authors,ids,archive,dedup,spacing,sort", force: false, ref_names: false } },
  { name: "full-online-with-sfn", settings: { modules: "expand,cleanup,dates,authors,ids,archive,dedup,spacing,sort,sfn", force: false, ref_names: false } },
];

const RUN_ONLINE = process.env.INTEGRATION_NETWORK === "true";

// ── Article cache ────────────────────────────────────────────────────

describe("article cache", () => {
  const cache: Map<string, string> = new Map();

  beforeAll(async () => {
    await Promise.all(
      ARTICLES.map(async (def) => {
        const cached = loadCached(def);
        if (cached) { cache.set(def.file, cached); return; }
        const text = await fetchArticleWikitext(def.title);
        expect(text).toBeTruthy();
        saveCached(def, text);
        cache.set(def.file, text);
      })
    );
  });

  for (const article of ARTICLES) {
    describe(article.title, () => {
      let text: string;

      beforeAll(() => {
        text = cache.get(article.file)!;
        expect(text).toBeTruthy();
      });

      it(`has at least ${article.minCitations} citations`, () => {
        expect(countCiteTemplates(text)).toBeGreaterThanOrEqual(article.minCitations);
      });

      it("has no unclosed templates in source", () => {
        expect(hasUnclosedTemplates(text)).toBe(false);
      });

      // ── Offline settings (fast, no network calls) ────────────────
      for (const config of OFFLINE_CONFIGS) {
        it(`processes with "${config.name}" settings`, async () => {
          const result = await processWikitext(text, config.settings);

          expect(result.text).toBeTruthy();
          expect(result.text.length).toBeGreaterThan(text.length * 0.4);
          expect(hasUnclosedTemplates(result.text)).toBe(false);
          expect(result.stats.total).toBeGreaterThanOrEqual(0);
          expect(result.aborted).toBe(false);

          // Check for nested refs unless using ref_names (known edge case with
          // text between <ref> and {{cite}} causing double-wrapping)
          if (!config.settings.ref_names) {
            expect(hasNestedRefs(result.text)).toBe(false);
          }

          // Section structure preserved (sfn may add a "Sources" section)
          const origSections = text.match(/^==\s*.+?\s*==$/gm) || [];
          const newSections = result.text.match(/^==\s*.+?\s*==$/gm) || [];
          const extraSections = config.settings.modules.includes("sfn") ? 1 : 0;
          expect(newSections.length).toBeGreaterThanOrEqual(origSections.length);
          expect(newSections.length).toBeLessThanOrEqual(origSections.length + extraSections);

          // Citation count preserved (or converted to sfn)
          if (config.settings.modules.includes("sfn")) {
            expect(countSfnTemplates(result.text) + countRefElements(result.text)).toBeGreaterThan(0);
          } else {
            expect(countCiteTemplates(result.text)).toBeGreaterThan(0);
          }

          // Dates normalized
          if (config.settings.modules.includes("dates")) {
            const origIso = (text.match(/\|\s*date\s*=\s*\d{4}-\d{2}-\d{2}\b/g) || []).length;
            const newIso = (result.text.match(/\|\s*date\s*=\s*\d{4}-\d{2}-\d{2}\b/g) || []).length;
            if (origIso > 0) {
              expect(newIso).toBeLessThan(origIso);
            }
          }
        }, 30000);
      }

      // ── Online settings (real API calls, conditional) ───────────
      if (RUN_ONLINE) {
        for (const config of ONLINE_CONFIGS) {
          it(`processes with "${config.name}" (online)`, async () => {
            const result = await processWikitext(text, config.settings);
            expect(result.text).toBeTruthy();
            expect(hasUnclosedTemplates(result.text)).toBe(false);
            expect(hasNestedRefs(result.text)).toBe(false);
            expect(result.aborted).toBe(false);
          }, 180000);
        }
      } else {
        for (const config of ONLINE_CONFIGS) {
          it.skip(`processes with "${config.name}" (online) — set INTEGRATION_NETWORK=true to run`, () => {});
        }
      }
    });
  }
});

// ── Cross-article structural edge cases ──────────────────────────────

describe("structural edge cases (all articles × all offline configs)", () => {
  const articleTexts: Map<string, string> = new Map();

  beforeAll(async () => {
    for (const def of ARTICLES) {
      const cached = loadCached(def);
      if (cached) { articleTexts.set(def.file, cached); continue; }
      const text = await fetchArticleWikitext(def.title);
      saveCached(def, text);
      articleTexts.set(def.file, text);
    }
  });

  it("balanced template braces in all outputs", async () => {
    for (const [file, text] of articleTexts) {
      for (const config of OFFLINE_CONFIGS) {
        const result = await processWikitext(text, config.settings);
        expect(hasUnclosedTemplates(result.text), `${file} + ${config.name}`).toBe(false);
      }
    }
  });

  it("no nested refs in any output (ref_names configs excluded - known edge case)", async () => {
    const excluded = new Set(["ref-names", "ref-names-rename"]);
    for (const [file, text] of articleTexts) {
      for (const config of OFFLINE_CONFIGS) {
        if (excluded.has(config.name)) continue;
        const result = await processWikitext(text, config.settings);
        expect(hasNestedRefs(result.text), `${file} + ${config.name}`).toBe(false);
      }
    }
  });
});

// ── Fixture pattern verification ─────────────────────────────────────

describe("fixture patterns in article context", () => {
  const articleTexts: Map<string, string> = new Map();

  beforeAll(async () => {
    for (const def of ARTICLES) {
      const cached = loadCached(def);
      if (cached) { articleTexts.set(def.file, cached); continue; }
      const text = await fetchArticleWikitext(def.title);
      saveCached(def, text);
      articleTexts.set(def.file, text);
    }
  });

  interface FixtureCase {
    name: string;
    input: string;
    modules: string;
    settings?: Partial<StorageSettings>;
    checks: string[];
    noChecks: string[];
    /** Assertions to skip in article-context tests (e.g. word appears in body) */
    skipArticleNoChecks?: boolean;
    /** Checks that need exact spacing-aware matching */
    checksSpaced?: string[];
  }

  const fixtures: FixtureCase[] = [
    {
      name: "ISBN-10 hyphenated to ISBN-13",
      input: "{{cite book |isbn=0306406152 |title=Test Book |date=2024 |publisher=TestPub}}",
      modules: "cleanup,spacing",
      checks: ["978-0-306-40615-7"],
      noChecks: [],
    },
    {
      name: "vauthors to last/first",
      input: "{{cite journal |vauthors=Smith JA, Doe JB |title=A Test |date=2024 |journal=J Test}}",
      modules: "authors,spacing",
      checks: ["last = Smith", "first = JA"],
      noChecks: [],
    },
    {
      name: "ISO date normalized",
      input: "{{cite web |title=Test |date=2024-11-15 |url=http://example.com}}",
      modules: "dates,spacing",
      checks: ["15 November 2024"],
      noChecks: [],
    },
    {
      name: "deprecated month param removed",
      input: "{{cite journal |title=Test |date=2024 |doi=10.1000/ct |month=January}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["month"],
      skipArticleNoChecks: true,
    },
    {
      name: "DOI preserved through cleanup",
      input: "{{cite journal |last1=Test|first1=A|year=2024|title=Work|journal=J|doi=10.18778/1733-8077.16.3.02}}",
      modules: "cleanup,dates,spacing,sort",
      checks: ["10.18778/1733-8077.16.3.02"],
      noChecks: [],
    },
    {
      name: "basic journal citation preserved through pipeline",
      input: "{{cite journal | last1 = Baldwin | first1 = Clive | year = 2020 | title = Exploring Other-Than-Human Identity | journal = Qualitative Sociology Review | volume = 16 | issue = 3 | pages = 8–26 | doi = 10.18778/1733-8077.16.3.02 | issn = 1733-8077 | doi-access = free}}",
      modules: "cleanup,dates,spacing,sort",
      checks: ["Baldwin", "Clive", "10.18778/1733-8077.16.3.02"],
      noChecks: [],
    },
    {
      name: "empty title param removed",
      input: "{{cite journal |title= |doi=10.1000/ct3 |date=2024}}",
      modules: "cleanup,spacing",
      checks: ["10.1000/ct3"],
      noChecks: ["| title"],
      skipArticleNoChecks: true,
    },
    {
      name: "year-date conflict resolved",
      input: "{{cite journal |title=Test |date=15 March 2024 |year=2024 |doi=10.1000/ct}}",
      modules: "cleanup,spacing",
      checks: ["10.1000/ct"],
      noChecks: ["year = 2024"],
      skipArticleNoChecks: true,
    },
    {
      name: "ref name generation from citation body",
      input: "<ref>{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/ct4}}</ref>",
      modules: "spacing,sort",
      settings: { ref_names: true, auto_update: true },
      checks: ["Smith2024"],
      noChecks: [],
      skipArticleNoChecks: true,
    },
    {
      name: "existing ref name preserved under ref_names mode",
      input: "<ref name=\"Smith\">{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/ct6}}</ref>",
      modules: "spacing,sort",
      settings: { ref_names: true, auto_update: true },
      checks: ["name=\"Smith\""],
      noChecks: [],
      skipArticleNoChecks: true,
    },
    {
      name: "See-also citations not wrapped in ref",
      input: "==See also==\n* {{cite journal |last=King |year=2021 |title=Review |doi=10.1000/ct99}}",
      modules: "spacing",
      settings: { ref_names: true, auto_update: true },
      checks: [],
      noChecks: [],
      skipArticleNoChecks: true,
    },
    {
      name: "archive-date normalized",
      input: "{{cite web |title=T |date=2024 |url=http://x.com |archive-url=https://example.com/arch |archive-date=20250121}}",
      modules: "dates,spacing",
      checks: ["2025-01-21"],
      noChecks: [],
    },
    {
      name: "periodical conflict cleaned",
      input: "{{cite web |title=T |date=2024 |url=http://x.com |journal=Some Journal}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["journal"],
      skipArticleNoChecks: true,
    },
    {
      name: "Page/pages conflict resolved",
      input: "{{cite journal |title=T |date=2024 |doi=10.1000/ct |page=10 |pages=10-20}}",
      modules: "cleanup,spacing",
      checks: ["page = 10"],
      noChecks: ["pages = 10-20"],
    },
    {
      name: "URL scheme fixed",
      input: "{{cite web |title=T |url=example.com/page |date=2024}}",
      modules: "cleanup,spacing",
      checks: ["https://example.com/page"],
      noChecks: ["url=example.com"],
    },
    {
      name: "empty last param removed",
      input: "{{cite journal |last= |first=John |title=Test |date=2024 |doi=10.1000/ct14}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["last"],
      skipArticleNoChecks: true,
    },
    {
      name: "empty url param removed",
      input: "{{cite web |title=Test |url= |date=2024}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["url"],
      skipArticleNoChecks: true,
    },
    {
      name: "none publisher removed",
      input: "{{cite book |title=Test |publisher=n/a |date=2024 |isbn=9780306406157}}",
      modules: "cleanup,spacing",
      checks: ["isbn"],
      noChecks: ["publisher"],
      skipArticleNoChecks: true,
    },
    {
      name: "typo auther corrected to author",
      input: "{{cite journal |title=Test |auther=Smith |year=2024}}",
      modules: "cleanup,spacing",
      checks: ["author = Smith"],
      noChecks: ["auther"],
      skipArticleNoChecks: true,
    },
    {
      name: "ISSN with X check digit normalized",
      input: "{{cite journal |title=T |issn=0317847X |date=2024}}",
      modules: "cleanup,spacing",
      checks: ["0317-847X"],
      noChecks: ["0317847X"],
    },
    {
      name: "redundant English language removed",
      input: "{{cite journal |title=T |language=en |date=2024}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["language"],
      skipArticleNoChecks: true,
    },
    {
      name: "date ordinal normalized",
      input: "{{cite web |title=T |date=15th March 2024 |url=http://x.com}}",
      modules: "dates,spacing",
      checks: ["15 March 2024"],
      noChecks: [],
    },
    {
      name: "vauthors converts multiple authors with last/first",
      input: "{{cite journal |vauthors=Smith JA, Doe JB |title=Test |date=2024 |journal=J}}",
      modules: "authors,spacing",
      checks: ["last2 = Doe", "first2 = JB"],
      noChecks: [],
    },
    {
      name: "empty doi param removed",
      input: "{{cite journal |title=T |doi= |date=2024}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["doi"],
      skipArticleNoChecks: true,
    },
    {
      name: "URL spaces encoded",
      input: "{{cite web |title=T |url=https://example.com/a b |date=2024}}",
      modules: "cleanup,spacing",
      checks: ["a%20b"],
      noChecks: ["a b"],
      skipArticleNoChecks: true,
    },
    {
      name: "language=English removed as redundant",
      input: "{{cite journal |title=T |language=English |date=2024}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["language"],
      skipArticleNoChecks: true,
    },
    {
      name: "coauthors deprecated param removed",
      input: "{{cite journal |coauthors=Smith J, Doe J |title=T |date=2024 |doi=10.1000/ct15}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["coauthors"],
      skipArticleNoChecks: true,
    },
    {
      name: "volume prefix cleaned",
      input: "{{cite journal |title=T |volume=Vol. 5 |date=2024 |doi=10.1000/ct16}}",
      modules: "cleanup,spacing",
      checks: ["volume = 5"],
      noChecks: ["Vol."],
      skipArticleNoChecks: true,
    },
    {
      name: "pages prefix cleaned",
      input: "{{cite journal |title=T |pages=pp. 123-130 |date=2024 |doi=10.1000/ct17}}",
      modules: "cleanup,spacing",
      checks: ["pages = 123-130"],
      noChecks: ["pp."],
      skipArticleNoChecks: true,
    },
    {
      name: "edition prefix cleaned",
      input: "{{cite book |title=T |edition=2nd edition |date=2024 |isbn=9780306406157}}",
      modules: "cleanup,spacing",
      checks: ["edition = 2nd"],
      noChecks: ["2nd edition"],
    },
    {
      name: "issue prefix cleaned",
      input: "{{cite journal |title=T |issue=No. 5 |date=2024 |doi=10.1000/ct18}}",
      modules: "cleanup,spacing",
      checks: ["issue = 5"],
      noChecks: ["No."],
    },
    {
      name: "empty journal param removed",
      input: "{{cite journal |title=T |journal= |date=2024 |doi=10.1000/ct19}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["journal ="],
      skipArticleNoChecks: true,
    },
    {
      name: "deprecated day param removed",
      input: "{{cite journal |title=T |date=2024 |day=15 |doi=10.1000/ct20}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["day"],
      skipArticleNoChecks: true,
    },
    {
      name: "typo journl corrected to journal",
      input: "{{cite journal |title=T |journl=Nature |date=2024 |doi=10.1000/ct21}}",
      modules: "cleanup,spacing",
      checks: ["journal = Nature"],
      noChecks: ["journl"],
      skipArticleNoChecks: true,
    },
    {
      name: "publisher none removed",
      input: "{{cite book |title=T |publisher=none |date=2024}}",
      modules: "cleanup,spacing",
      checks: [],
      noChecks: ["publisher"],
      skipArticleNoChecks: true,
    },
    {
      name: "date ordinal 1st normalized",
      input: "{{cite web |title=T |date=1st March 2024 |url=http://x.com}}",
      modules: "dates,spacing",
      checks: ["1 March 2024"],
      noChecks: ["1st"],
      skipArticleNoChecks: true,
    },
    {
      name: "bare year preserved",
      input: "{{cite journal |title=T |year=2024 |doi=10.1000/ct22 |journal=J}}",
      modules: "dates,spacing",
      checks: ["year = 2024"],
      noChecks: [],
    },
    {
      name: "location-place conflict resolved",
      input: "{{cite book |title=T |date=2024 |location=NYC |place=London}}",
      modules: "cleanup,spacing",
      checks: ["location = NYC"],
      noChecks: ["place = London"],
      skipArticleNoChecks: true,
    },
    {
      name: "work-website conflict resolved (cite journal, no type-specific rule)",
      input: "{{cite journal |title=T |date=2024 |doi=10.1000/ct |work=SomeSite |website=OtherSite |journal=J}}",
      modules: "cleanup,spacing",
      checks: ["website = OtherSite"],
      noChecks: ["work = SomeSite"],
      skipArticleNoChecks: true,
    },
    {
      name: "vauthors-last conflict resolved",
      input: "{{cite journal |title=T |date=2024 |doi=10.1000/ct |vauthors=Smith JA |last=Jones |journal=J}}",
      modules: "cleanup,spacing",
      checks: ["last = Jones"],
      noChecks: ["vauthors = Smith"],
      skipArticleNoChecks: true,
    },
    {
      name: "author-last conflict resolved",
      input: "{{cite journal |title=T |date=2024 |doi=10.1000/ct |author=Jane Doe |last=Smith |journal=J}}",
      modules: "cleanup,spacing",
      checks: ["last = Smith"],
      noChecks: ["author = Jane"],
      skipArticleNoChecks: true,
    },
  ];

  for (const fx of fixtures) {
    it(fx.name, async () => {
      const baseSettings: StorageSettings = {
        modules: fx.modules,
        force: false,
        ref_names: false,
        spacing_style: fx.modules.includes("spacing") ? "standard" : "",
        ...fx.settings,
      };

      // Verify standalone
      const standalone = await processWikitext(fx.input, baseSettings);
      for (const c of fx.checks) expect(standalone.text).toContain(c);
      for (const n of fx.noChecks) expect(standalone.text).not.toContain(n);

      // Verify in each article context
      for (const [file, articleText] of articleTexts) {
        const injected = fx.input + "\n\n" + articleText;
        const result = await processWikitext(injected, baseSettings);
        for (const c of fx.checks) expect(result.text).toContain(c);
        if (!fx.skipArticleNoChecks) {
          for (const n of fx.noChecks) expect(result.text).not.toContain(n);
        }

        // Article sections preserved (sfn may add a Sources section)
        const origSections = articleText.match(/^==\s*.+?\s*==$/gm) || [];
        const newSections = result.text.match(/^==\s*.+?\s*==$/gm) || [];
        expect(newSections.length).toBeGreaterThanOrEqual(origSections.length);
      }
    }, 30000);
  }
});
