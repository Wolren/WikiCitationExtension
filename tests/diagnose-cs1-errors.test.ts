import { describe, it, expect, beforeAll } from "vitest";
import { processWikitext } from "../src/content";
import { findCitations } from "../src/lib/wikitext";
import { resetApiProbeCache } from "../src/wiki-detector";
import { readFileSync } from "fs";
import { join } from "path";

// Diagnose CS1 errors introduced by our processor on a real article.
// Extracts just the citation-containing lines to stay under Wikipedia's
// parse API size limit.

const FIXTURE = join(__dirname, "fixtures", "texts", "Schizoid_personality_disorder.txt");
const RUN_NETWORK = process.env.CHECK_CS1_ERRORS === "true";

const CONFIGS: { name: string; settings: any }[] = [
  { name: "cleanup", settings: { modules: "cleanup", force: false, ref_names: false } },
  { name: "dates", settings: { modules: "dates", force: false, ref_names: false } },
  { name: "authors", settings: { modules: "authors", force: false, ref_names: false, author_style: "normal" } },
  { name: "spacing-standard", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "standard" } },
  { name: "spacing-wide", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "wide" } },
  { name: "spacing-compact", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "compact" } },
  { name: "full-offline", settings: { modules: "cleanup,dates,authors,spacing,sort", force: false, ref_names: false, spacing_style: "standard" } },
  { name: "cs2tocs1", settings: { modules: "cs2tocs1,cleanup,dates,spacing,sort", citation_style: "cs1", force: false, ref_names: false, spacing_style: "standard" } },
  { name: "sfn", settings: { modules: "cleanup,dates,spacing,sort,sfn", force: false, ref_names: false, spacing_style: "standard" } },
];

async function parseOnWikipedia(wikitext: string): Promise<{ categories: string[]; warnings: string[]; error?: string }> {
  const body = new URLSearchParams({
    action: "parse", text: wikitext,
    contentmodel: "wikitext", prop: "categories",
    preview: "yes", format: "json", origin: "*",
  });
  try {
    const resp = await fetch("https://en.wikipedia.org/w/api.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!resp.ok) return { categories: [], warnings: [], error: `HTTP ${resp.status}` };
    const data = await resp.json();
    const parse = data?.parse || {};
    if (parse.error) return { categories: [], warnings: [], error: parse.error.info };
    const cats: any[] = parse?.categories || [];
    return {
      categories: cats.map((c: any) => c["*"] || "").filter(Boolean),
      warnings: parse?.parsewarnings || [],
    };
  } catch (e) {
    return { categories: [], warnings: [], error: String(e).slice(0, 200) };
  }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Extract just citation + context lines to reduce payload size */
function extractCitationContext(text: string): string {
  const lines = text.split("\n");
  const relevant = lines.filter(l =>
    l.includes("{{cite") || l.includes("{{citation") ||
    l.includes("<ref") || l.includes("</ref>") ||
    l.includes("{{sfn") || l.includes("{{rp") ||
    l.match(/^={2,}\s*(References|Notes|Sources|Bibliography|Further reading)/)
  );
  return relevant.join("\n").slice(0, 50000); // cap at 50KB
}

describe("CS1 error diagnostics: Schizoid personality disorder", () => {
  let articleText: string;

  beforeAll(() => {
    resetApiProbeCache();
    articleText = readFileSync(FIXTURE, "utf-8");
    globalThis.fetch = async () => new Response(null, { status: 200 });
  });

  // Phase 1: invariants on full article
  for (const cfg of CONFIGS) {
    it(`[${cfg.name}] invariants`, async () => {
      const result = await processWikitext(articleText, cfg.settings);
      expect(balancedBraces(result.text), "unbalanced braces").toBe(true);
      expect(result.aborted).toBe(false);
      expect(result.stats.total).toBe(findCitations(articleText).length);
      const outCites = findCitations(result.text).length;
      const sfnCount = cfg.settings.modules?.includes("sfn")
        ? (result.text.match(/\{\{\s*sfn\b/gi) || []).length : 0;
      if (!cfg.settings.modules?.includes("sfn"))
        expect(outCites).toBeGreaterThan(0);
      else
        expect(outCites + sfnCount).toBeGreaterThan(0);
    });
  }

  // Phase 2: validate citation context against Wikipedia's parser
  if (RUN_NETWORK) {
    let origCS1: string[] = [];

    it("baseline: original CS1 errors (citation context)", async () => {
      const context = extractCitationContext(articleText);
      console.log(`Sending ${context.length} chars to Wikipedia parser...`);
      const orig = await parseOnWikipedia(context);
      origCS1 = orig.categories.filter(c => c.includes("CS1_errors") || c.includes("CS1_maint"));
      console.log(`Original CS1 maint/errors: ${origCS1.join(", ") || "(none)"}`);
      if (orig.warnings.length) console.log(`Original warnings: ${orig.warnings.slice(0, 3).join("\n  ")}`);
      if (orig.error) console.log(`Error: ${orig.error}`);
    });

    for (const cfg of CONFIGS) {
      it(`[${cfg.name}] no new CS1 errors`, async () => {
        const result = await processWikitext(articleText, cfg.settings);
        const context = extractCitationContext(result.text);
        await delay(3000);
        const proc = await parseOnWikipedia(context);
        const procCS1 = proc.categories.filter(c => c.includes("CS1_errors") || c.includes("CS1_maint"));
        const newErrors = procCS1.filter(c => !origCS1.includes(c));
        const fixed = origCS1.filter(c => !procCS1.includes(c));

        console.log(`[${cfg.name}] cats: ${procCS1.length} (orig: ${origCS1.length})`);
        if (fixed.length) console.log(`  FIXED: ${fixed.join(", ")}`);
        if (newErrors.length) console.log(`  INTRODUCED: ${newErrors.join(", ")}`);
        if (proc.error) console.log(`  API error: ${proc.error}`);

        expect(newErrors, `[${cfg.name}] introduced: ${newErrors.join(", ")}`).toHaveLength(0);
      }, 60000);
    }
  } else {
    it.skip("set CHECK_CS1_ERRORS=true to validate against Wikipedia's parser", () => {});
  }
});

function balancedBraces(text: string): boolean {
  const open = (text.match(/\{\{/g) || []).length;
  const close = (text.match(/\}\}/g) || []).length;
  return open === close;
}
