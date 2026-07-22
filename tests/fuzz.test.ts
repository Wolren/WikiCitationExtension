import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { processWikitext } from "../src/content";
import { findCitations, parseParams } from "../src/lib/wikitext";
import { cleanupCitation } from "../src/lib/cleanup";
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
  // Stub fetch for all fuzz tests — no real API calls
  globalThis.fetch = async () => new Response(null, { status: 200 });
});

// ── Invariant checks ────────────────────────────────────────────────

function balancedBraces(text: string): boolean {
  const open = (text.match(/\{\{/g) || []).length;
  const close = (text.match(/\}\}/g) || []).length;
  return open === close;
}

function noNestedRefs(text: string): boolean {
  const stack: number[] = [];
  const re = /<\/?ref\b[^>]*>/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[0].startsWith("</")) {
      if (stack.length === 0) continue;
      stack.pop();
    } else if (match[0].endsWith("/>")) {
      continue;
    } else {
      if (stack.length > 0) return false;
      stack.push(match.index);
    }
  }
  return true;
}

function noDoublePipes(text: string): boolean {
  return !/\|{2}/.test(text);
}

function hasValidTemplateFormat(text: string): boolean {
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{{", i);
    if (start === -1) break;
    let depth = 1;
    let j = start + 2;
    while (j < text.length - 1 && depth > 0) {
      if (text[j] === "{" && text[j + 1] === "{") { depth++; j += 2; }
      else if (text[j] === "}" && text[j + 1] === "}") { depth--; j += 2; }
      else j++;
    }
    if (depth !== 0) return false;
    i = j;
  }
  return true;
}

function _countCitations(text: string): number {
  return findCitations(text).length;
}

// ── Fuzz generators ─────────────────────────────────────────────────

const TEMPLATES = [
  "cite web", "cite journal", "cite book", "cite news",
  "cite magazine", "cite encyclopedia", "cite conference",
  "cite thesis", "cite report", "citation",
];

const KNOWN_PARAMS = [
  "title", "url", "date", "year", "access-date", "archive-url",
  "archive-date", "url-status", "doi", "pmid", "pmc", "isbn",
  "issn", "last", "first", "author", "author1", "author-link",
  "editor", "editor1", "editor-link", "publisher", "journal",
  "volume", "issue", "pages", "page", "work", "website",
  "language", "quote", "ref", "name",
];

const RARE_PARAMS = [
  "arxiv", "bibcode", "s2cid", "oclc", "jstor", "lccn",
  "osti", "rfc", "ssrn", "hdl", "biorxiv", "medrxiv",
  "citeseerx", "asin", "degree", "department", "docket",
  "mode", "location", "place", "at", "no-pp", "postscript",
  "script-title", "trans-title", "type", "class", "id",
  "collaboration", "orig-date", "publication-place",
];

const DEPRECATED_PARAMS = [
  "month", "day", "coauthors", "deadurl", "subscription",
];

const VALUE_TEMPLATES = [
  "A short title",
  "U.S.A. Economy",
  "The End.",
  "Café & résumé",
  "https://example.com/article",
  "http://example.com/path?q=search&page=1#frag",
  "[[Foo]]",
  "[[Foo|Bar]]",
  "[[Foo (disambiguation)|Foo]]",
  "{{lang|de|Foo}}",
  "{{math|πr²}}",
  "{{ndash}}12",
  "{{hyphen}}15",
  "42",
  "1234.56789",
  "1234-5678",
  "978-0-306-40615-7",
  "10.1000/xyz123",
  "10.18778/1733-8077.16.3.02",
  "2024-01-15",
  "2024-01",
  "2024",
  "15 January 2024",
  "January 2024",
  "c. 1900",
  "n.d.",
  "Smith, J.A.",
  "Smith & Doe",
  "3{{hyphen}}12",
  "3{{ndash}}5",
  "",
  "  padded  ",
  "A".repeat(500),
  "日本語タイトル",
  "Étude sur l'évolution",
  "<span>test</span>",
  "<!-- comment -->",
  "contains [[Target|display]] text",
  "[[Target|display with | pipe]]",
  "line one\nline two\nline three",
];

// ── Fuzz iteration count ────────────────────────────────────────────

const FUZZ_COUNT = 500;
const CONFIGS: { name: string; settings: StorageSettings }[] = [
  { name: "bare-processing", settings: { modules: "", force: false, ref_names: false } },
  { name: "cleanup-only", settings: { modules: "cleanup", force: false, ref_names: false } },
  { name: "dates-only", settings: { modules: "dates", force: false, ref_names: false } },
  { name: "authors-only", settings: { modules: "authors", force: false, ref_names: false, author_style: "normal" } },
  { name: "spacing-standard", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "standard" } },
  { name: "spacing-wide", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "wide" } },
  { name: "spacing-compact", settings: { modules: "spacing,sort", force: false, ref_names: false, spacing_style: "compact" } },
  { name: "full-offline", settings: { modules: "cleanup,dates,authors,spacing,sort", force: false, ref_names: false, spacing_style: "standard" } },
  { name: "ref-names", settings: { modules: "spacing,sort", force: false, ref_names: true, auto_update: true, spacing_style: "standard" } },
  { name: "cs2tocs1", settings: { modules: "cs2tocs1,cleanup", citation_style: "cs1", force: false, ref_names: false } },
  { name: "all-offline", settings: { modules: "cleanup,dates,authors,spacing,sort,cs2tocs1", citation_style: "cs1", force: false, ref_names: false, spacing_style: "standard" } },
];

// ── Deterministic seeded random (no Math.random variance) ────────────

class SeededRng {
  private seed: number;
  constructor(seed: number) { this.seed = seed % 2147483647; }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  bool(): boolean { return this.next() > 0.5; }
}

function generateRandomCitation(rng: SeededRng): string {
  const template = rng.pick(TEMPLATES);
  const paramCount = rng.int(0, 12);
  const params: string[] = [];

  if (rng.bool()) {
    params.push(`date=${rng.pick(["2024", "2024-01-15", "15 January 2024", "January 2024"])}`);
  }

  for (let i = 0; i < paramCount; i++) {
    const source = rng.pick(["known", "rare", "deprecated", "random", "bracketValue"]);
    let key: string;
    let val: string;

    switch (source) {
      case "known":
        key = rng.pick(KNOWN_PARAMS);
        val = rng.pick(VALUE_TEMPLATES);
        break;
      case "rare":
        key = rng.pick(RARE_PARAMS);
        val = rng.pick(VALUE_TEMPLATES);
        break;
      case "deprecated":
        key = rng.pick(DEPRECATED_PARAMS);
        val = "yes";
        break;
      case "random":
        key = `x${rng.int(100, 999)}`;
        val = rng.pick(VALUE_TEMPLATES);
        break;
      case "bracketValue": {
        key = rng.pick(KNOWN_PARAMS);
        const embed = rng.pick([
          "{{lang|de|Foo}}",
          "{{math|π}}",
          "[[Foo|Bar]]",
          "[[Foo]]",
          "{{#expr:1+2}}",
        ]);
        val = `${rng.pick(["prefix ", "text before ", ""])}${embed}${rng.pick([" suffix", " more text", ""])}`;
        break;
      }
    }

    const spacing = rng.int(1, 3);
    const eq = spacing === 1 ? "=" : spacing === 2 ? " = " : "= ";
    if (key && val !== undefined) {
      params.push(`${key}${eq}${val}`);
    }
  }

  // Deduplicate by keeping last occurrence of each key
  const seen = new Map<string, number>();
  for (let i = params.length - 1; i >= 0; i--) {
    const k = params[i].split(/[= ]/)[0];
    if (seen.has(k)) {
      params.splice(i, 1);
    } else {
      seen.set(k, i);
    }
  }

  if (params.length === 0) {
    return `{{${template}}}`;
  }
  return `{{${template} |${params.join(" |")}}}`;
}

function generateRandomWikitext(rng: SeededRng): string {
  const parts: string[] = [];
  const citationCount = rng.int(0, 8);

  for (let i = 0; i < citationCount; i++) {
    if (rng.bool()) {
      const refName = rng.bool() ? ` name="${rng.pick(["Smith2024", "Doe2023", "ref1", "fn1"])}"` : "";
      parts.push(`<ref${refName}>${generateRandomCitation(rng)}</ref>`);
    } else {
      parts.push(generateRandomCitation(rng));
    }
    if (rng.int(0, 3) === 0) {
      parts.push(`{{rp|${rng.int(1, 200)}}}`);
    }
    if (rng.bool()) {
      const textLen = rng.int(0, 3);
      if (textLen > 0) parts.push(`Some inline text here with numbers ${rng.int(1, 100)} and symbols.`);
    }
  }
  if (rng.bool() && parts.length > 0) {
    const section = rng.pick(["== References ==", "== Notes ==", "== Sources ==", "== Further reading ==", "== See also =="]);
    return `${section}\n${parts.join("\n")}`;
  }
  return parts.join("\n");
}

// ── Existing: random citation generation fuzz ───────────────────────

describe("fuzz: random citation generation", () => {
  const INVOCATIONS = FUZZ_COUNT;
  const errors: { seed: number; config: string; input: string; error: string }[] = [];

  afterEach(() => {
    if (errors.length > 10) {
      console.log(`Fuzz: ${errors.length} errors so far, stopping early to investigate`);
      expect(errors).toHaveLength(0);
    }
  });

  for (let seed = 1; seed <= INVOCATIONS; seed++) {
    const rng = new SeededRng(seed);
    const input = generateRandomWikitext(rng);

    for (const config of CONFIGS) {
      it(`seed=${seed} config=${config.name}`, async () => {
        let result: { text: string; stats: { total: number; changed: number }; aborted: boolean };
        try {
          result = await processWikitext(input, config.settings);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push({ seed: seed, config: config.name, input, error: msg });
          throw new Error(`Crash: seed=${seed} config=${config.name}: ${msg}`, { cause: e });
        }
        expect(balancedBraces(result.text),
          `seed=${seed} config=${config.name}: unbalanced braces`).toBe(true);
        if (!config.settings.ref_names) {
          expect(noNestedRefs(result.text),
            `seed=${seed} config=${config.name}: nested refs`).toBe(true);
        }
        for (const line of result.text.split("\n")) {
          if (line.includes("{{cite") || line.includes("{{citation")) {
            const bodyStart = line.indexOf("|");
            const bodyEnd = line.lastIndexOf("}}");
            if (bodyStart >= 0 && bodyEnd >= 0) {
              const body = line.slice(bodyStart, bodyEnd);
              if (!body.includes("[[")) {
                expect(noDoublePipes(body),
                  `seed=${seed} config=${config.name}: double pipes in: ${line.slice(0, 100)}`).toBe(true);
              }
            }
          }
        }
        expect(hasValidTemplateFormat(result.text),
          `seed=${seed} config=${config.name}: malformed templates`).toBe(true);
        expect(result.stats.total).toBeGreaterThanOrEqual(0);
        expect(result.stats.changed).toBeGreaterThanOrEqual(0);
        expect(result.stats.total).toBe(findCitations(input).length);
        expect(result.aborted).toBe(false);
        expect(typeof result.text).toBe("string");
      }, 5000);
    }
  }
});

// ── Existing: edge case patterns ────────────────────────────────────

describe("fuzz: edge case patterns", () => {
  const CONFIGS_SHORT = CONFIGS.slice(0, 4);

  const EDGE_CASES: { name: string; input: string }[] = [
    { name: "empty-citation", input: "{{cite web}}" },
    { name: "empty-citation-bare", input: "{{citation}}" },
    { name: "only-unknown-params", input: "{{cite web |foobar=baz |quux=42}}" },
    { name: "lang-inside-title", input: "{{cite web |title={{lang|de|Foo}} |url=http://x.com |date=2024}}" },
    { name: "math-inside-title", input: "{{cite web |title={{math|πr²}} |url=http://x.com |date=2024}}" },
    { name: "expr-inside-value", input: "{{cite web |title=page {{#expr:1+2}} of 5 |url=http://x.com |date=2024}}" },
    { name: "nested-templates", input: "{{cite journal |title={{lang|fr|{{italics|Foo}}}} |date=2024}}" },
    { name: "html-comment", input: "{{cite web |url=http://x.com |title=Test <!-- comment --> |date=2024}}" },
    { name: "quotes-in-value", input: '{{cite web |title=He said "hello" |url=http://x.com |date=2024}}' },
    { name: "url-with-params", input: "{{cite web |url=http://example.com?a=1&b=2&c=3 |title=T |date=2024}}" },
    { name: "url-with-fragment", input: "{{cite web |url=http://example.com/page#section |title=T |date=2024}}" },
    { name: "mixed-types", input: "{{cite web |url=http://x.com |title=Web |date=2024}}\n{{cite journal |title=J |journal=Nature |date=2024}}\n{{citation |title=C |work=Work |date=2024}}" },
    { name: "spaced-out", input: "{{  cite   web   |   title   =   Test   |   url   =   http://x.com   |   date   =   2024   }}" },
    { name: "no-spaces", input: "{{cite web|title=Test|url=http://x.com|date=2024}}" },
    { name: "pipe-in-wikilink", input: "{{cite web |title=See [[Target|display text]] for details |url=http://x.com |date=2024}}" },
    { name: "multiple-wikilinks", input: "{{cite web |title=About [[Foo]], [[Bar]], and [[Baz]] |url=http://x.com |date=2024}}" },
    { name: "newline-in-value", input: "{{cite web |title=line one\nline two |url=http://x.com |date=2024}}" },
    { name: "doi-variants", input: "{{cite journal |doi=10.1000/ct |date=2024 |title=T}}" },
    { name: "issn-x", input: "{{cite journal |issn=0317-847X |date=2024 |title=T}}" },
    { name: "explicit-empty", input: "{{cite web |title= |url= |date= |first= |last=}}" },
    { name: "non-latin", input: "{{cite web |title=اختبار |url=http://x.com |date=2024 |language=ar}}" },
    { name: "long-value", input: "{{cite web |title=" + "x".repeat(1000) + " |url=http://x.com |date=2024}}" },
    { name: "year-date-dual", input: "{{cite journal |title=T |date=2024-03-15 |year=2023 |doi=10.1000/ct}}" },
    { name: "sfn-rp", input: "{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/test}}{{rp|42}}" },
    { name: "ref-reuse", input: '<ref name="Smith2024">{{cite journal |last=Smith |year=2024 |title=Test}}</ref>\n<ref name="Smith2024" />' },
    { name: "ref-reuse-with-rp", input: '<ref name="Smith2024">{{cite journal |last=Smith |year=2024 |title=Test}}</ref>\n<ref name="Smith2024" />{{rp|42}}' },
    { name: "mini-article", input: "== Intro ==\nSome text.<ref>{{cite web |url=http://x.com |title=Test |date=2024}}</ref>\n\n== References ==\n{{reflist}}\n\n== Further reading ==\n* {{cite book |title=Book |date=2024 |publisher=Pub}}" },
  ];

  for (const edge of EDGE_CASES) {
    for (const config of CONFIGS_SHORT) {
      it(`edge=${edge.name} config=${config.name}`, async () => {
        let result: { text: string; stats: { total: number; changed: number }; aborted: boolean };
        try {
          result = await processWikitext(edge.input, config.settings);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`Crash: edge=${edge.name} config=${config.name}: ${msg}`, { cause: e });
        }
        expect(balancedBraces(result.text), `${edge.name} ${config.name}: unbalanced braces`).toBe(true);
        if (!config.settings.ref_names) {
          expect(noNestedRefs(result.text), `${edge.name} ${config.name}: nested refs`).toBe(true);
        }
        expect(typeof result.text).toBe("string");
        expect(result.aborted).toBe(false);
      }, 10000);
    }
  }
});

// ── NEW: deep nesting stress test ───────────────────────────────────

describe("fuzz: deeply nested templates", () => {
  const CONFIGS_SHORT = CONFIGS.slice(0, 4);

  const buildDeepNest = (depth: number): string => {
    if (depth <= 0) return "core text";
    return `{{lang|de|${buildDeepNest(depth - 1)}}}`;
  };

  // Citations with increasing nesting depth of templates inside param values
  const NESTED: { name: string; input: string }[] = [];
  for (let depth = 2; depth <= 10; depth++) {
    NESTED.push({
      name: `depth-${depth}`,
      input: `{{cite web |title=${buildDeepNest(depth)} |url=http://x.com |date=2024}}`,
    });
  }
  // Deep wikilink nesting
  NESTED.push({
    name: "wikilink-chain",
    input: "{{cite web |title=[[A|[[B|[[C|[[D|E]]]]]]]] |url=http://x.com |date=2024}}",
  });
  // Deep {{#expr: chain
  NESTED.push({
    name: "expr-chain",
    input: "{{cite web |title={{#expr:1+{{#expr:2+{{#expr:3+{{#expr:4+5}}}}}}}} |url=http://x.com |date=2024}}",
  });

  for (const nested of NESTED) {
    for (const config of CONFIGS_SHORT) {
      it(`${nested.name} config=${config.name}`, async () => {
        const result = await processWikitext(nested.input, config.settings);
        expect(balancedBraces(result.text), `${nested.name} ${config.name}`).toBe(true);
        expect(result.aborted).toBe(false);
      }, 10000);
    }
  }
});

// ── NEW: real-world citation format variation ───────────────────────

describe("fuzz: real-world citation formats", () => {
  const CONFIGS_SHORT = CONFIGS.slice(0, 4);

  const FORMATS: { name: string; input: string }[] = [
    // PMID/PMC variants
    { name: "pmid-numeric", input: "{{cite journal |pmid=12345678 |title=T |date=2024}}" },
    { name: "pmc-prefixed", input: "{{cite journal |pmc=PMC1234567 |title=T |date=2024}}" },
    { name: "pmc-numeric", input: "{{cite journal |pmc=1234567 |title=T |date=2024}}" },
    { name: "pmid-and-pmc", input: "{{cite journal |pmid=12345678 |pmc=PMC1234567 |title=T |date=2024}}" },

    // ArXiv variants
    { name: "arxiv-new", input: "{{cite arxiv |eprint=1234.56789 |title=T |date=2024}}" },
    { name: "arxiv-old", input: "{{cite arxiv |eprint=cs/0101011 |title=T |date=2024}}" },
    { name: "arxiv-classic-v1", input: "{{cite arxiv |eprint=astro-ph/9901001 |title=T |date=2024}}" },
    { name: "arxiv-with-class", input: "{{cite arxiv |eprint=math.GT/0309136 |title=T |date=2024}}" },

    // Date format variants
    { name: "date-yearmonth", input: "{{cite web |title=T |date=2024-01 |url=http://x.com}}" },
    { name: "date-circa", input: "{{cite web |title=T |date=c. 1900 |url=http://x.com}}" },
    { name: "date-nodate", input: "{{cite web |title=T |date=n.d. |url=http://x.com}}" },
    { name: "date-season", input: "{{cite web |title=T |date=Summer 2024 |url=http://x.com}}" },
    { name: "date-quarter", input: "{{cite web |title=T |date=First Quarter 2024 |url=http://x.com}}" },
    { name: "date-ordinal-day", input: "{{cite web |title=T |date=1st January 2024 |url=http://x.com}}" },
    { name: "date-ordinal-month", input: "{{cite web |title=T |date=15th March 2024 |url=http://x.com}}" },
    { name: "date-two-digit-day", input: "{{cite web |title=T |date=01 January 2024 |url=http://x.com}}" },

    // page/pages/at variants
    { name: "page-single", input: "{{cite book |title=T |page=42 |date=2024 |isbn=9780306406157}}" },
    { name: "pages-range", input: "{{cite book |title=T |pages=100-120 |date=2024 |isbn=9780306406157}}" },
    { name: "at-location", input: "{{cite book |title=T |at=section 2 |date=2024}}" },
    { name: "nopp-with-pages", input: "{{cite book |title=T |pages=100-120 |no-pp=yes |date=2024}}" },

    // page with template inside
    { name: "pages-with-hyphen", input: "{{cite book |title=T |pages=12{{hyphen}}15 |date=2024}}" },
    { name: "pages-with-ndash", input: "{{cite book |title=T |pages=100{{ndash}}120 |date=2024}}" },

    // volume + issue + number conflicts
    { name: "volume-issue", input: "{{cite journal |title=T |volume=5 |issue=2 |date=2024 |journal=J}}" },
    { name: "volume-number", input: "{{cite journal |title=T |volume=5 |number=2 |date=2024 |journal=J}}" },
    { name: "volume-issue-number-all", input: "{{cite journal |title=T |volume=5 |issue=2 |number=3 |date=2024 |journal=J}}" },

    // language variants
    { name: "language-fr", input: "{{cite web |title=Le Test |language=fr |url=http://x.com |date=2024}}" },
    { name: "language-en-US", input: "{{cite web |title=Test |language=en-US |url=http://x.com |date=2024}}" },
    { name: "language-de-CH", input: "{{cite web |title=Test |language=de-CH |url=http://x.com |date=2024}}" },
    { name: "language-English-full", input: "{{cite web |title=Test |language=English |url=http://x.com |date=2024}}" },

    // author style variants
    { name: "vauthors-vancouver", input: "{{cite journal |vauthors=Smith JA, Doe JB |title=T |date=2024 |journal=J}}" },
    { name: "vauthors-with-dots", input: "{{cite journal |vauthors=Smith J.A., Doe J.B. |title=T |date=2024 |journal=J}}" },
    { name: "author-last-first", input: "{{cite journal |last=Smith |first=John |title=T |date=2024 |journal=J}}" },
    { name: "author1-first1", input: "{{cite journal |last1=Smith |first1=John |last2=Doe |first2=Jane |title=T |date=2024 |journal=J}}" },

    // URL access indicators
    { name: "url-access-subscription", input: "{{cite journal |title=T |url=http://x.com |url-access=subscription |date=2024}}" },
    { name: "doi-access-free", input: "{{cite journal |title=T |doi=10.1000/test |doi-access=free |date=2024}}" },

    // Archive URL without date
    { name: "archive-no-date", input: "{{cite web |title=T |url=http://x.com |archive-url=http://archive.is/abc |date=2024}}" },

    // Various doi prefixes
    { name: "doi-with-slash", input: "{{cite journal |doi=10.1000/test |title=T |date=2024}}" },
    { name: "doi-long-path", input: "{{cite journal |doi=10.1000/s12345-024-00000-0 |title=T |date=2024}}" },
  ];

  for (const fmt of FORMATS) {
    for (const config of CONFIGS_SHORT) {
      it(`${fmt.name} config=${config.name}`, async () => {
        const result = await processWikitext(fmt.input, config.settings);
        expect(balancedBraces(result.text), `${fmt.name} ${config.name}: unbalanced braces`).toBe(true);
        expect(result.aborted).toBe(false);
        expect(result.stats.total).toBe(1);
      }, 10000);
    }
  }
});

// ── NEW: error recovery under stress ────────────────────────────────

describe("fuzz: error recovery under stress", () => {
  const BASE_SETTINGS: StorageSettings = { modules: "cleanup,dates,spacing", spacing_style: "standard", force: false, ref_names: false };
  const SAMPLE = "{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/test |journal=J |pages=10-20}}";

  // AbortSignal: abort mid-batch
  it("handles AbortSignal mid-processing in batch", async () => {
    const longInput = (SAMPLE + "\n").repeat(30);
    const controller = new AbortController();
    // Trigger abort after a short delay
    const abortTimer = setTimeout(() => controller.abort(), 5);
    const result = await processWikitext(longInput, BASE_SETTINGS, controller.signal);
    clearTimeout(abortTimer);
    expect(result.stats.total).toBeGreaterThanOrEqual(0);
    expect(typeof result.text).toBe("string");
  });

  it("handle AbortSignal before processing starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await processWikitext(SAMPLE, BASE_SETTINGS, controller.signal);
    expect(result.aborted).toBe(true);
    expect(result.stats.total).toBe(0);
    expect(result.text).toBe(SAMPLE);
  });

  // Mixed API failures: some calls succeed, some fail
  it("handles mixed API success/failure in expand batch", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: string | URL | Request, _init?: RequestInit) => {
      callCount++;
      // Every 3rd call fails
      if (callCount % 3 === 0) throw new Error("Network error");
      return new Response(null, { status: 200 });
    };
    // Multiple citations with DOI (triggers expand/API calls)
    const multiInput = [
      "{{cite journal |doi=10.1000/one |title=A |date=2024 |journal=J}}",
      "{{cite journal |doi=10.1000/two |title=B |date=2024 |journal=J}}",
      "{{cite journal |doi=10.1000/three |title=C |date=2024 |journal=J}}",
      "{{cite journal |doi=10.1000/four |title=D |date=2024 |journal=J}}",
    ].join("\n");
    const result = await processWikitext(multiInput, { ...BASE_SETTINGS, modules: "expand" });
    expect(result.aborted).toBe(false);
    expect(typeof result.text).toBe("string");
    expect(balancedBraces(result.text)).toBe(true);
    globalThis.fetch = originalFetch;
  }, 15000);

  // Network offline simulated
  it("handles offline gracefully across modules", async () => {
    const originalFetch = globalThis.fetch;
    // Simulate offline by making all fetches fail
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    const result = await processWikitext(
      "{{cite journal |doi=10.1000/test |title=T |date=2024 |journal=J |url=http://x.com}}",
      { ...BASE_SETTINGS, modules: "expand,cleanup,dates,archive" }
    );
    expect(result.aborted).toBe(false);
    expect(balancedBraces(result.text)).toBe(true);
    globalThis.fetch = originalFetch;
  }, 10000);

  // Very large article
  it("handles large article with 500+ citations", async () => {
    const citations: string[] = [];
    for (let i = 0; i < 500; i++) {
      citations.push(`<ref name="ref${i}">{{cite journal |last=Smith${i} |year=2024 |title=Test ${i} |doi=10.1000/ct${i} |journal=J}}</ref>`);
    }
    const largeInput = citations.join("\n");
    const result = await processWikitext(largeInput, BASE_SETTINGS);
    expect(result.aborted).toBe(false);
    expect(result.stats.total).toBe(500);
    expect(balancedBraces(result.text)).toBe(true);
  }, 60000);

  // Back-to-back processing
  it("handles back-to-back processing runs without state leakage", async () => {
    const inputs = [
      "{{cite journal |last=A |year=2024 |title=First |doi=10.1000/a |journal=J}}",
      "{{cite journal |last=B |year=2024 |title=Second |doi=10.1000/b |journal=J}}",
      "{{cite journal |last=C |year=2024 |title=Third |doi=10.1000/c |journal=J}}",
    ];
    const results = await Promise.all(inputs.map(input => processWikitext(input, BASE_SETTINGS)));
    for (const result of results) {
      expect(result.aborted).toBe(false);
      expect(balancedBraces(result.text)).toBe(true);
    }
    // No duplicates or cross-contamination between runs
    expect(results[0].text).toContain("First");
    expect(results[1].text).toContain("Second");
    expect(results[2].text).toContain("Third");
  }, 30000);
});

// ── NEW: config combinatorics ───────────────────────────────────────

describe("fuzz: config combinatorics", () => {
  // All boolean toggles in StorageSettings
  interface BoolToggle { key: string; on: string; off: string; setting: any; }
  const TOGGLES: BoolToggle[] = [
    { key: "force", on: "force-on", off: "force-off", setting: { force: true } },
    { key: "strip_issn", on: "strip-issn", off: "keep-issn", setting: { strip_issn: true } },
    { key: "ref_names", on: "ref-names-on", off: "ref-names-off", setting: { ref_names: true, auto_update: true } },
    { key: "rename_ref_names", on: "rename-ref-names", off: "keep-ref-names", setting: { ref_names: true, auto_update: true, rename_ref_names: true } },
    { key: "skip_org_authors", on: "skip-org", off: "include-org", setting: { skip_org_authors: true } },
  ];

  const MODULE_SETS = [
    { name: "minimal", modules: "" },
    { name: "cleanup", modules: "cleanup" },
    { name: "cleanup+dates", modules: "cleanup,dates" },
    { name: "cleanup+dates+spacing", modules: "cleanup,dates,spacing,sort", spacing_style: "standard" },
    { name: "full-offline", modules: "cleanup,dates,authors,spacing,sort", spacing_style: "standard" },
    { name: "with-cs2tocs1", modules: "cs2tocs1,cleanup,dates,spacing,sort", citation_style: "cs1", spacing_style: "standard" },
  ];

  const TEST_INPUTS = [
    "{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/test |journal=J}}",
    "{{cite web |title=Test |url=http://x.com |date=2024 |access-date=2024-01-15 |archive-url=http://archive.is/abc}}",
    "{{citation |title=Book |isbn=9780306406157 |date=2024 |publisher=Pub}}",
    "{{cite journal |vauthors=Smith JA, Doe JB |title=T |date=2024 |journal=J |issn=12345678}}",
  ];

  // Module-set × input combinatory matrix
  for (const ms of MODULE_SETS) {
    for (const input of TEST_INPUTS) {
      it(`modules=${ms.name} with ${JSON.stringify(input).slice(20, 80)}`, async () => {
        const settings: StorageSettings = {
          force: false,
          ref_names: false,
          ...ms,
        };
        const result = await processWikitext(input, settings);
        expect(balancedBraces(result.text), `${ms.name}: unbalanced braces`).toBe(true);
        expect(result.aborted).toBe(false);
        expect(result.stats.total).toBe(1);
      }, 10000);
    }
  }

  // Toggle × input matrix
  for (const toggle of TOGGLES) {
    for (const input of TEST_INPUTS) {
      it(`toggle=${toggle.on} with ${JSON.stringify(input).slice(20, 80)}`, async () => {
        const settings: StorageSettings = {
          modules: "cleanup,dates,spacing,sort",
          spacing_style: "standard",
          force: false,
          ref_names: false,
          ...toggle.setting,
        };
        const result = await processWikitext(input, settings);
        expect(balancedBraces(result.text), `${toggle.on}: unbalanced braces`).toBe(true);
        expect(result.aborted).toBe(false);
      }, 10000);
    }
  }
});

// ── Existing: parseParams edge cases ────────────────────────────────

describe("fuzz: parseParams edge cases", () => {
  const WEIRD_BODIES = [
    "|a=b|c=d|e=f",
    "|a = b | c = d | e = f",
    "|a=[[b|c]]|d=e",
    "|a={{b|c}}|d=e",
    "|a={{b|c|d}}|e=f",
    "|a=|b=|c=",
    "|a=b||c=d",
    "|||a=b|||c=d||",
    "|=value",
    "|key=",
    "|",
    "",
    "|a=b\n|c=d\n|e=f",
    "|a  =  b  |  c  =  d",
    "|a=b | c=d | a=e",
    "|a=b <!-- comment --> |c=d",
    "|a=b [[c|d]] e |f=g",
    "|{{#tag:ref|content}}",
    "|a=b {{{c}}} d |e=f",
  ];

  for (const body of WEIRD_BODIES) {
    it(`parses: ${JSON.stringify(body.slice(0, 60))}`, () => {
      const result = parseParams(body);
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
      for (const [k, v] of Object.entries(result)) {
        expect(typeof k).toBe("string");
        expect(typeof v).toBe("string");
      }
    });
  }
});

// ── Existing: cleanupCitation invariants ────────────────────────────

describe("fuzz: cleanupCitation invariants", () => {
  const RANDOM_PARAMS = [
    {},
    { title: "Test" },
    { title: "", doi: "10.1000/test" },
    { title: "Test", url: "http://x.com", "access-date": "2024-01-15" },
    { accessdate: "2024-01-15" },
    { archiveurl: "http://archive.org/123", archivedate: "2024-01-15" },
    { vauthors: "Smith JA, Doe JB" },
    { month: "January", day: "15", year: "2024" },
    { coauthors: "Smith J, Doe J" },
    { journal: "Nature", newspaper: "The Times" },
    { page: "5", pages: "5-10" },
    { year: "2024", date: "15 March 2024" },
    { "url-status": "invalid" },
    { "url-status": "dead" },
    { "url-status": "live" },
    { "url-status": "deviated" },
    { deadurl: "yes" },
    { deadurl: "no" },
    { isbn: "invalid" },
    { isbn: "9780306406157" },
    { issn: "12345678" },
    { language: "en" },
    { language: "fr" },
    { authorlink: "John_Smith" },
    { "author1-link": "Smith" },
    { number: "42" },
    { airdate: "2024-01-15" },
    { lang: "fr" },
    { origyear: "2020" },
    { booktitle: "A Book" },
    { nopp: "yes" },
    { place: "London" },
    { accessdate: "2024-01-15", deadurl: "yes", month: "January", coauthors: "X, Y", year: "2024", title: "" },
  ];

  for (const params of RANDOM_PARAMS) {
    it(`cleanup: ${JSON.stringify(params).slice(0, 80)}`, () => {
      const result = cleanupCitation(params, { templateType: "cite web" });
      expect(result.params).toBeDefined();
      expect(result.changes).toBeInstanceOf(Array);
      for (const key of Object.keys(result.params)) {
        expect(key).toEqual(key.toLowerCase());
      }
    });
  }
});
