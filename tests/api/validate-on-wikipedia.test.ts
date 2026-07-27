import { describe, it, expect, beforeAll } from "vitest";
import { processWikitext } from "../../src/content";
import { findCitations } from "../../src/lib/wikitext";
import { resetApiProbeCache } from "../../src/wiki-detector";
import type { StorageSettings } from "../../src/lib/types";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Architecture:
//   Phase 1 (network): download articles + parse on Wikipedia → cache results
//   Phase 2 (pure TS):  run all configs against cached articles, compare against
//                        cached Wikipedia parse results — zero network
//
// Run once: VALIDATE_ON_WIKIPEDIA=true npx vitest run tests/validate-on-wikipedia.api.test.ts
// Re-runs:  npx vitest run — uses cache, no network, fast

const RUN_ON_WIKI = process.env.VALIDATE_ON_WIKIPEDIA === "true";
const ARTICLES_TO_FETCH = parseInt(process.env.WIKI_ARTICLE_COUNT || "5", 10);

const CACHE_DIR = join(__dirname, "..", "fixtures", "wiki-validation");
const ORIGINALS_FILE = join(CACHE_DIR, "originals.json");
const PARSED_ORIGINALS_FILE = join(CACHE_DIR, "parsed-originals.json");
const PARSED_PROCESSED_FILE = join(CACHE_DIR, "parsed-processed.json");

// The configs we want to validate against Wikipedia's parser.
// Add new configs here — the cache will be rebuilt on next VALIDATE_ON_WIKIPEDIA run.
const CONFIGS: { name: string; settings: StorageSettings }[] = [
  { name: "full-offline", settings: { modules: "cleanup,dates,authors,spacing,sort", force: false, ref_names: false, spacing_style: "standard" } },
  { name: "cleanup-only", settings: { modules: "cleanup", force: false, ref_names: false } },
  { name: "dates-only", settings: { modules: "dates", force: false, ref_names: false } },
  { name: "authors-only", settings: { modules: "authors", force: false, ref_names: false } },
  { name: "spacing-standard", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "standard" } },
  { name: "spacing-wide", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "wide" } },
  { name: "spacing-compact", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "compact" } },
  { name: "cs2tocs1", settings: { modules: "cs2tocs1,cleanup,dates,authors,spacing,sort", citation_style: "cs1", force: false, ref_names: false, spacing_style: "standard" } },
  { name: "ref-names", settings: { modules: "spacing,sort", force: false, ref_names: true, auto_update: true, spacing_style: "standard" } },
  { name: "sfn-conversion", settings: { modules: "cleanup,dates,spacing,sort,sfn", force: false, ref_names: false, spacing_style: "standard" } },
];

interface ArticleData { title: string; text: string; }
interface ParseData { categories: string[]; warnings: string[]; error?: string; }

// ── Cache helpers ────────────────────────────────────────────────────

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, "utf-8")) as T; }
  catch { return null; }
}

function writeJson(path: string, data: any): void {
  const dir = join(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function cacheKey(articleIdx: number, configName: string): string {
  return `${articleIdx}:${configName}`;
}

// ── Network helpers (Phase 1 only) ──────────────────────────────────

async function parseOnWikipedia(wikitext: string): Promise<ParseData> {
  const body = new URLSearchParams({
    action: "parse",
    text: wikitext,
    contentmodel: "wikitext",
    prop: "text|categories",
    preview: "yes",
    format: "json",
    origin: "*",
  });
  for (let retry = 0; retry < 3; retry++) {
    try {
      const resp = await fetch("https://en.wikipedia.org/w/api.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!resp.ok && retry < 2) { await delay(10000); continue; }
      if (!resp.ok) return { categories: ["HTTP-" + resp.status], warnings: [], error: resp.statusText };
      const data = await resp.json();
      const parse = data?.parse || {};
      const cats: any[] = parse?.categories || [];
      return {
        categories: cats.map((c: any) => c["*"] || "").filter(Boolean),
        warnings: parse?.parsewarnings || [],
      };
    } catch (e) {
      if (retry < 2) await delay(10000); else throw e;
    }
  }
  return { categories: ["max-retries"], warnings: [] };
}

async function fetchRandomTitles(count: number): Promise<string[]> {
  await delay(3000);
  for (let retry = 0; retry < 3; retry++) {
    try {
      const resp = await fetch(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({
        action: "query", list: "random", rnnamespace: "0",
        rnlimit: String(count), format: "json", origin: "*",
      })}`);
      if (!resp.ok && retry < 2) { await delay(10000); continue; }
      const data = (await resp.json()) as any;
      return (data?.query?.random || []).map((p: any) => p.title);
    } catch (_) {
      if (retry < 2) { await delay(10000); } else { throw _; }
    }
  }
  return [];
}

async function fetchWikitext(title: string): Promise<string> {
  await delay(5000);
  for (let retry = 0; retry < 3; retry++) {
    try {
      const resp = await fetch(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({
        action: "query", format: "json", prop: "revisions",
        titles: title, rvprop: "content", origin: "*",
      })}`);
      if (!resp.ok && retry < 2) { await delay(10000); continue; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as any;
      const pages = data?.query?.pages || {};
      const key = Object.keys(pages)[0];
      if (!key || key === "-1") throw new Error(`Article "${title}" not found`);
      return pages[key]?.revisions?.[0]?.["*"] || "";
    } catch (e) {
      if (retry < 2) await delay(10000);
      else throw e;
    }
  }
  return "";
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Tests ────────────────────────────────────────────────────────────

describe("Wikipedia validation (cached)", () => {
  beforeAll(() => { resetApiProbeCache(); });

  // ── Phase 1: fetch and cache (only when VALIDATE_ON_WIKIPEDIA=true) ──
  if (RUN_ON_WIKI) {
    it("Phase 1: fetch articles and cache Wikipedia parse results", async () => {
      await delay(3000);
      const titles = await fetchRandomTitles(ARTICLES_TO_FETCH);
      console.log(`Articles: ${titles.join(", ")}`);

      const articles: ArticleData[] = [];
      for (const title of titles) {
        await delay(5000);
        const text = await fetchWikitext(title);
        if (text) articles.push({ title, text });
      }
      writeJson(ORIGINALS_FILE, articles);
      console.log(`Cached ${articles.length} articles`);

      // Parse originals on Wikipedia
      const parsedOriginals: Record<string, ParseData> = {};
      for (let i = 0; i < articles.length; i++) {
        await delay(3000);
        parsedOriginals[String(i)] = await parseOnWikipedia(articles[i].text);
        console.log(`  Parsed original: "${articles[i].title}" — ${parsedOriginals[String(i)].categories.length} cats, ${parsedOriginals[String(i)].warnings.length} warnings`);
      }
      writeJson(PARSED_ORIGINALS_FILE, parsedOriginals);
      console.log(`Cached ${articles.length} original parse results`);

      // Process with each config and parse on Wikipedia
      const parsedProcessed: Record<string, ParseData> = {};
      let total = 0;
      for (let i = 0; i < articles.length; i++) {
        for (const cfg of CONFIGS) {
          await delay(3000);
          const processed = await processWikitext(articles[i].text, cfg.settings);
          const key = cacheKey(i, cfg.name);
          parsedProcessed[key] = await parseOnWikipedia(processed.text);
          total++;
          const errs = parsedProcessed[key].categories.filter(c => c.includes("CS1_errors"));
          if (errs.length > 0) {
            console.log(`  [${cfg.name}] "${articles[i].title}" → CS1 errors: ${errs.join(", ")}`);
          }
        }
      }
      writeJson(PARSED_PROCESSED_FILE, parsedProcessed);
      console.log(`Cached parse results for ${total} article×config combinations`);
    }, 600000);
    return; // Phase 1 done — don't run assertions yet (they run on cache)
  }

  // ── Phase 2: pure TypeScript assertions against cache ───────────────
  // This runs every time (no VALIDATE_ON_WIKIPEDIA needed) as long as cache exists.

  const articles = readJson<ArticleData[]>(ORIGINALS_FILE);
  const parsedOriginals = readJson<Record<string, ParseData>>(PARSED_ORIGINALS_FILE);
  const parsedProcessed = readJson<Record<string, ParseData>>(PARSED_PROCESSED_FILE);

  if (!articles || !parsedOriginals || !parsedProcessed) {
    it.skip("cache not built — run VALIDATE_ON_WIKIPEDIA=true once to populate", () => { /* skipped */ });
    return;
  }

  for (const cfg of CONFIGS) {
    describe(`config: ${cfg.name}`, () => {
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const originalParse = parsedOriginals[String(i)];
        const processedParse = parsedProcessed[cacheKey(i, cfg.name)];

        if (!originalParse || !processedParse) {
          it.skip(`"${article.title}" — no cached data`, () => { /* skipped */ });
          continue;
        }

        it(`"${article.title}" — no new CS1 errors`, async () => {
          // Process the article (pure TypeScript — no network)
          const processed = await processWikitext(article.text, cfg.settings);

          // Diff CS1 error categories against cached originals
          const origCS1 = originalParse.categories.filter(c => c.includes("CS1_errors"));
          const procCS1 = processedParse.categories.filter(c => c.includes("CS1_errors"));
          const newErrors = procCS1.filter(c => !origCS1.includes(c));
          const fixedErrors = origCS1.filter(c => !procCS1.includes(c));

          if (newErrors.length > 0 || fixedErrors.length > 0) {
            const citeIn = findCitations(article.text).length;
            const citeOut = findCitations(processed.text).length;
            console.log(`"${article.title}" [${cfg.name}]: cites ${citeIn}→${citeOut}`);
            if (fixedErrors.length > 0) console.log(`  FIXED: ${fixedErrors.join(", ")}`);
            if (newErrors.length > 0) console.log(`  NEW: ${newErrors.join(", ")}`);
          }

          expect(newErrors,
            `"${article.title}" [${cfg.name}] introduced: ${newErrors.join(", ")}`
          ).toHaveLength(0);

          // Also run our standard invariant checks on the processed output
          expect(balancedBraces(processed.text), `"${article.title}" [${cfg.name}]: unbalanced braces`).toBe(true);
          expect(noStrayClosingBraces(processed.text), `"${article.title}" [${cfg.name}]: stray braces`).toBe(true);
          expect(typeof processed.text).toBe("string");
          expect(processed.aborted).toBe(false);
        });
      }
    });
  }
});

// ── Invariant helpers (pure TS, no network) ─────────────────────────

function balancedBraces(text: string): boolean {
  const open = (text.match(/\{\{/g) || []).length;
  const close = (text.match(/\}\}/g) || []).length;
  return open === close;
}

function noStrayClosingBraces(text: string): boolean {
  let depth = 0;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "{" && text[i + 1] === "{") { depth++; i++; }
    else if (text[i] === "}" && text[i + 1] === "}") { depth--; i++; if (depth < 0) return false; }
  }
  return depth === 0;
}
