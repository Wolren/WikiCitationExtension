#!/usr/bin/env tsx
/**
 * CS1 Error Diagnostic Tool — hybrid mode
 *
 * Hybrid approach:
 *   1. Local param scanning — detects all CS1 parameter conflicts instantly
 *   2. Wikipedia API spot-check — verifies one sample citation per conflict type
 *
 * This gives instant comprehensive results + API-verified accuracy.
 *
 * Usage:
 *   npx tsx tools/diagnose-cs1-errors.ts "Schizoid personality disorder"
 *   echo "Article" | npx tsx tools/diagnose-cs1-errors.ts --local
 *
 * Flags:
 *   --config    Comma-separated config names (default: all)
 *   --local     Skip Wikipedia API entirely (instant)
 *   --api       Force full per-citation API validation (slow)
 *   --save      Save processed output to /tmp/
 *   --help      Show help
 */

(globalThis as any).document = {
  readyState: "complete", addEventListener: () => {},
  documentElement: { lang: "en" },
};
(globalThis as any).location = {
  hostname: "en.wikipedia.org", origin: "https://en.wikipedia.org",
  href: "https://en.wikipedia.org/wiki/DNA", pathname: "/wiki/DNA", search: "",
};
(globalThis as any).window = globalThis;
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, writable: true, configurable: true });

async function main() {
  const { processWikitext } = await import("../src/content");
  const { findCitations } = await import("../src/lib/wikitext");
  const { resetApiProbeCache } = await import("../src/wiki-detector");
  resetApiProbeCache();

  const args = parseArgs();
  let titles = args.titles;
  if (titles.length === 0) titles = await readStdin();
  if (titles.length === 0) { console.error("No article titles."); process.exit(1); }

  const configs = getConfigs(args.filterConfigs);

  console.log(`${bold("CS1 Error Diagnostic Tool")}`);
  console.log(`Configs: ${configs.map(c => c.name).join(", ")}`);
  console.log(`Mode: ${args.localOnly ? "Local only" : args.fullApi ? "Full API (slow)" : "Hybrid (local + spot-check)"}`);

  for (const title of titles) {
    console.log(`\n${bold("=".repeat(60))}`);
    console.log(`${bold("Article:")} ${title}`);
    console.log(`${bold("=".repeat(60))}`);

    const text = await fetchWikitext(title);
    if (!text) { console.log(red("✗ Not found")); continue; }

    const rawCites = findCitations(text);
    if (rawCites.length === 0) { console.log(yellow("No citations found.")); continue; }
    console.log(`  ${text.length} chars, ${rawCites.length} citations`);

    // --- Step 1: Local scan ---
    console.log(`\n  ${bold("Step 1:")} scanning original for CS1 conflicts...`);
    const origConflicts = scanLocal(rawCites);
    printConflicts(origConflicts);

    // --- Step 1b: Wikipedia API spot-check (unless --local) ---
    if (!args.localOnly && Object.keys(origConflicts).length > 0) {
      console.log(`\n  ${bold("Spot-check:")} verifying sample via Wikipedia API...`);
      for (const [key, _count] of Object.entries(origConflicts).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
        const sample = findSampleCitation(rawCites, key);
        if (sample) {
          const result = await parseOnWikipedia(sample.raw);
          const cs1 = result.categories.filter(c => c.includes("CS1_errors"));
          console.log(`    ${key}: ${cs1.length > 0 ? green("verified") : yellow("no CS1_errors cat (may be CS1_maint)")} — ${cs1.join(", ") || "no error cats"}`);
          await delay(2000);
        }
      }
    } else if (!args.localOnly) {
      console.log(`  ${green("No conflicts to spot-check.")}`);
    }

    // --- Step 2: Process & re-scan per config ---
    for (const cfg of configs) {
      const processed = await processWikitext(text, cfg.settings);
      const procCites = findCitations(processed.text);
      const procConflicts = scanLocal(procCites);

      // Diff
      const fixed: string[] = [];
      const introduced: string[] = [];
      for (const [key, count] of Object.entries(origConflicts)) {
        if ((procConflicts[key] || 0) < count) fixed.push(key);
      }
      for (const [key, count] of Object.entries(procConflicts)) {
        if ((origConflicts[key] || 0) < count) introduced.push(key);
      }

      const status = introduced.length > 0 ? red("✗") : green("✓");
      console.log(`\n  ${status} ${bold(cfg.name)}`);
      console.log(`    ${processed.stats.total} cites, ${processed.stats.changed} changed`);

      if (fixed.length) {
        console.log(`    ${green("Fixed:")}`);
        for (const key of fixed) {
          const remaining = procConflicts[key] || 0;
          const origCount = origConflicts[key] || 0;
          console.log(`      ${CS1_LABELS[key] || key} — ${origCount} → ${remaining} (${green("-" + (origCount - remaining))})`);
        }
      }
      if (introduced.length) {
        console.log(`    ${red("Introduced:")}`);
        for (const key of introduced) {
          const newCount = procConflicts[key] || 0;
          const origCount = origConflicts[key] || 0;
          console.log(`      ${CS1_LABELS[key] || key} — ${origCount} → ${newCount} (${red("+" + (newCount - origCount))})`);
        }
      }
      if (!fixed.length && !introduced.length) {
        console.log(`    No CS1 conflict changes`);
      }

      // Spot-check fixed/introduced conflicts
      if (!args.localOnly && (fixed.length > 0 || introduced.length > 0)) {
        for (const key of [...fixed, ...introduced].slice(0, 2)) {
          const sample = findSampleCitation(key === key ? procCites : [], key);
          if (sample) {
            const result = await parseOnWikipedia(sample.raw);
            const cs1 = result.categories.filter(c => c.includes("CS1_errors"));
            const changed = key === key ? "" : "";
            console.log(`    Verify ${key}: ${cs1.length > 0 ? yellow("still has errors") : green("clean")}`);
            await delay(2000);
          }
        }
      }
    }
  }
}

// ── Local conflict scanning ─────────────────────────────────────────

type CS1Map = Record<string, number>;

function scanLocal(cites: { params: Record<string, string> }[]): CS1Map {
  const m: CS1Map = {};
  for (const { params: p } of cites) {
    if (p.location && p.place) m["location+place"] = (m["location+place"] || 0) + 1;
    if (p.work && p.website) m["work+website"] = (m["work+website"] || 0) + 1;
    if (p.vauthors && (p.last || p.last1)) m["vauthors+last"] = (m["vauthors+last"] || 0) + 1;
    if (p.author && (p.last || p.last1)) m["author+last"] = (m["author+last"] || 0) + 1;
    if (p.vauthors && p.author) m["vauthors+author"] = (m["vauthors+author"] || 0) + 1;
    if (p.year && p.date) m["year+date"] = (m["year+date"] || 0) + 1;
    if (p.page && p.pages) m["page+pages"] = (m["page+pages"] || 0) + 1;
    if (p["archive-date"] && !p["archive-url"]) m["archive-date-no-url"] = (m["archive-date-no-url"] || 0) + 1;
    if (p["access-date"] && !p.url && !p["archive-url"]) m["access-date-no-url"] = (m["access-date-no-url"] || 0) + 1;
    for (let i = 0; i <= 9; i++) {
      const s = i === 0 ? "" : String(i);
      const lv = p[`last${s}`];
      if (lv && lv.includes(",")) m[`vancouver-name-last${s}`] = (m[`vancouver-name-last${s}`] || 0) + 1;
    }
  }
  return m;
}

function findSampleCitation(cites: { raw: string; params: Record<string, string> }[], key: string): { raw: string } | null {
  for (const c of cites) {
    const p = c.params;
    if (key === "location+place" && p.location && p.place) return c;
    if (key === "work+website" && p.work && p.website) return c;
    if (key === "vauthors+last" && p.vauthors && (p.last || p.last1)) return c;
    if (key === "author+last" && p.author && (p.last || p.last1)) return c;
    if (key === "vancouver-name-last" && p.last && p.last.includes(",")) return c;
    if (key.startsWith("vancouver-name-last") && p[key.replace("vancouver-name", "last")]?.includes(",")) return c;
    if (key === "archive-date-no-url" && p["archive-date"] && !p["archive-url"]) return c;
    if (key === "access-date-no-url" && p["access-date"] && !p.url) return c;
  }
  return null;
}

function printConflicts(m: CS1Map): void {
  const entries = Object.entries(m).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) { console.log(`    ${green("No CS1 conflicts")}`); return; }
  for (const [key, count] of entries) {
    console.log(`    ${yellow(`${count}x`)} ${CS1_LABELS[key] || key}`);
  }
}

const CS1_LABELS: Record<string, string> = {
  "location+place": `|location= and |place= both specified`,
  "work+website": `|work= and |website= both specified`,
  "vauthors+last": `|vauthors= and |last= both specified`,
  "author+last": `|author= and |last= both specified`,
  "vauthors+author": `|vauthors= and |author= both specified`,
  "year+date": `|year= and |date= both specified`,
  "page+pages": `|page= and |pages= both specified`,
  "access-date-no-url": `|access-date= without |url=`,
  "archive-date-no-url": `|archive-date= without |archive-url=`,
};

for (let i = 0; i <= 9; i++) {
  const s = i === 0 ? "" : String(i);
  CS1_LABELS[`vancouver-name-last${s}`] = `Vancouver style: comma in |last${s}=`;
}

// ── Wikipedia API ───────────────────────────────────────────────────

async function parseOnWikipedia(rawCite: string): Promise<{ categories: string[]; warnings: string[] }> {
  const wikitext = `<ref>${rawCite}</ref>`;
  try {
    const resp = await fetch("https://en.wikipedia.org/w/api.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        action: "parse", text: wikitext,
        contentmodel: "wikitext", prop: "categories",
        preview: "yes", format: "json", origin: "*",
      }).toString(),
    });
    const data = await resp.json() as any;
    const parse = data?.parse || {};
    const cats = (parse?.categories || []).map((c: any) => c["*"] || "").filter(Boolean);
    return { categories: cats, warnings: parse?.parsewarnings || [] };
  } catch {
    return { categories: [], warnings: [] };
  }
}

// ── CLI helpers ─────────────────────────────────────────────────────

function getConfigs(filter: string[] | null) {
  const all = [
    { name: "cleanup", settings: { modules: "cleanup", force: false, ref_names: false } },
    { name: "dates", settings: { modules: "dates", force: false, ref_names: false } },
    { name: "authors", settings: { modules: "authors", force: false, ref_names: false, author_style: "normal" as const } },
    { name: "spacing", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "standard" as const } },
    { name: "full-offline", settings: { modules: "cleanup,dates,authors,spacing,sort", force: false, ref_names: false, spacing_style: "standard" as const } },
    { name: "cs2tocs1", settings: { modules: "cs2tocs1,cleanup,dates,spacing,sort", citation_style: "cs1" as const, force: false, ref_names: false, spacing_style: "standard" as const } },
    { name: "sfn", settings: { modules: "cleanup,dates,spacing,sort,sfn", force: false, ref_names: false, spacing_style: "standard" as const } },
  ];
  return filter ? all.filter(c => filter.includes(c.name)) : all;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const titles: string[] = [];
  let filterConfigs: string[] | null = null;
  let localOnly = false;
  let fullApi = false;
  let saveOutput = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config") filterConfigs = args[++i]?.split(",") || null;
    else if (args[i] === "--local") localOnly = true;
    else if (args[i] === "--api") fullApi = true;
    else if (args[i] === "--save") saveOutput = true;
    else if (args[i] === "--help") {
      console.log(`CS1 Error Diagnostic — detects CS1 conflicts in extension output.

Usage:
  npx tsx tools/diagnose-cs1-errors.ts "Article Title"
  echo "Title" | npx tsx tools/diagnose-cs1-errors.ts --local

Modes:
  default   Hybrid — instant local scan + Wikipedia API spot-check
  --local   Local scan only (instant, no API)
  --api     Full per-citation API validation (slow but thorough)

Options:
  --config MODULES  Only test these configs (comma-sep: cleanup,dates)
  --save            Save processed output to /tmp/
  --help            Show this help`);
      process.exit(0);
    } else if (args[i].startsWith("--")) { console.error(`Unknown: ${args[i]}`); process.exit(1); }
    else { titles.push(args[i]); }
  }
  return { titles, filterConfigs, localOnly, fullApi, saveOutput };
}

async function readStdin(): Promise<string[]> {
  return new Promise(resolve => {
    if (process.stdin.isTTY) return resolve([]);
    let data = "";
    process.stdin.on("data", (chunk: string) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim().split("\n").filter(Boolean)));
  });
}

async function fetchWikitext(title: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query", format: "json", prop: "revisions",
    titles: title, rvprop: "content", origin: "*",
  });
  for (let retry = 0; retry < 3; retry++) {
    try {
      const resp = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
      if (!resp.ok) { await delay(3000); continue; }
      const data = await resp.json() as any;
      const pages = data?.query?.pages || {};
      const key = Object.keys(pages)[0];
      if (!key || key === "-1") return null;
      return pages[key]?.revisions?.[0]?.["*"] || "";
    } catch (_) {
      if (retry < 2) await delay(3000);
      else throw _;
    }
  }
  return null;
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }

main().catch(console.error);
