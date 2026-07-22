import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// Stub browser API before importing content
const mockGetMessage = vi.fn((k: string) => {
  const m: Record<string, string> = {
    statsChanged: "$1 citation changed",
    statsChangedPlural: "$1 citations changed",
    progressScanning: "Scanning citations...",
    progressNoCitations: "No citations found",
    progressProcessing: "Processing $1–$2 of $3...",
    progressProcessed: "Processed $1 of $2 citations",
    progressApplying: "Applying changes...",
    progressDone: "Done",
  };
  return m[k] || k;
});
const mockBrowser = { storage: { local: { get: vi.fn(), set: vi.fn() } }, i18n: { getMessage: mockGetMessage } } as any;
vi.stubGlobal("browser", mockBrowser);

// Stub window.location
delete (globalThis as any).location;
(globalThis as any).location = { origin: "https://en.wikipedia.org", pathname: "/wiki/Test_Page" };

import {
  bracketAwareValue,
  templateTypeFor, formatBody, formatRefName,
  escapeHtml, escapeRe, processWikitext, buildPreservedBody,
} from "../src/content";

const mockFetch = vi.fn();
let originalFetch: typeof globalThis.fetch;

beforeAll(() => {
  originalFetch = globalThis.fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
  document.body.innerHTML = "";
});

function mockOkResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
  } as Response);
}

describe("templateTypeFor", () => {
  it("returns cite journal for cite journal", () => {
    expect(templateTypeFor("cite journal")).toBe("cite journal");
  });

  it("returns citation for citation", () => {
    expect(templateTypeFor("citation")).toBe("citation");
  });

  it("returns cite web for unknown", () => {
    expect(templateTypeFor("something")).toBe("cite web");
  });
});

describe("formatBody", () => {
  it("formats params as | k = v lines", () => {
    const result = formatBody({ title: "Test", doi: "10.1000/x" });
    expect(result).toContain("| title = Test");
    expect(result).toContain("| doi = 10.1000/x");
  });

  it("returns empty string for empty params", () => {
    expect(formatBody({})).toBe("");
  });
});

describe("formatRefName", () => {
  it("wraps citation in ref tag with name", () => {
    const result = formatRefName(
      { template: "cite journal", params: { title: "Test" }, raw: "" },
      { title: "Test" },
      "Smith2024"
    );
    expect(result).toContain('<ref name="Smith2024">');
    expect(result).toContain("{{cite journal");
    expect(result).toContain("| title = Test");
    expect(result).toContain("</ref>");
  });
});

describe("escapeHtml", () => {
  it("escapes & < > \"", () => {
    expect(escapeHtml('& < > "')).toBe("&amp; &lt; &gt; &quot;");
  });

  it("returns empty string for non-string", () => {
    expect(escapeHtml(null as any)).toBe("");
    expect(escapeHtml(undefined as any)).toBe("");
  });

  it("passes through safe strings", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("escapeRe", () => {
  it("escapes regex special chars", () => {
    expect(escapeRe("a.b[c]d")).toBe("a\\.b\\[c\\]d");
  });
});

describe("bracketAwareValue", () => {
  it("treats [[Foo | Bar]] as an atomic value (pipe inside wikilink not a separator)", () => {
    expect(bracketAwareValue("[[Foo | Bar]]", 0)).toBe("[[Foo | Bar]]");
  });

  it("handles nested wikilinks [[Foo [[Bar]] Baz]]", () => {
    expect(bracketAwareValue("[[Foo [[Bar]] Baz]]", 0)).toBe("[[Foo [[Bar]] Baz]]");
  });

  it("handles template inside wikilink {{[[Foo | Bar]]}}", () => {
    expect(bracketAwareValue("{{[[Foo | Bar]]}}", 0)).toBe("{{[[Foo | Bar]]}}");
  });

  it("handles simple wikilink [[Foo]] without pipe", () => {
    expect(bracketAwareValue("[[Foo]]", 0)).toBe("[[Foo]]");
  });

  it("stops at pipe outside wikilink, correctly separating next param", () => {
    // The | inside [[...]] is not a separator; only the | after ]] at depth 0 breaks
    expect(bracketAwareValue("[[Foo | Bar]] | param = value", 0)).toBe("[[Foo | Bar]] ");
  });
});

describe("processWikitext", () => {
  beforeEach(() => {
    // Mock all API calls to return null (no expansion)
    mockFetch.mockResolvedValue(mockOkResponse(null));
  });

  it("returns empty string unchanged", async () => {
    const result = await processWikitext("", { modules: "expand,cleanup,dates,ids,archive,dedup", force: false, ref_names: false });
    expect(result.text).toBe("");
  });

  it("returns text with no citations unchanged", async () => {
    const result = await processWikitext("Hello world", { modules: "expand,cleanup,dates,ids,archive,dedup", force: false, ref_names: false });
    expect(result.text).toBe("Hello world");
  });

  it("returns reformatted but equivalent citation for unchanged content", async () => {
    const result = await processWikitext(
      "{{cite journal | title = Test | doi = 10.1000/ct1 | date = 15 March 2024}}",
      { modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" }
    );
    expect(result.text).toContain("title = Test");
    expect(result.text).toContain("doi = 10.1000/ct1");
    expect(result.text).toContain("15 March 2024");
    expect(result.text).toContain("{{cite journal");
  });

  it("normalizes date in citation", async () => {
    const result = await processWikitext("{{cite journal |date=2024-03-15 |title=Test}}",
      { modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" }
    );
    expect(result.text).toContain("15 March 2024");
  });

  it("normalizes spacing in citation", async () => {
    const result = await processWikitext("{{cite journal|title=Test|doi=10.1000/ct2|date=2024}}",
      { modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" }
    );
    expect(result.text).toContain("| title = Test");
    expect(result.text).toContain("| doi = 10.1000/ct2");
  });

  it("applies cleanup changes", async () => {
    const result = await processWikitext("{{cite journal |title= |doi=10.1000/ct3 |date=2024}}",
      { modules: "expand,cleanup,dates,ids,archive,dedup", force: false, ref_names: false });
    expect(result.text).not.toContain("| title =");
  });

  it("adds ref name when refNames=true", async () => {
    const result = await processWikitext(
      "<ref>{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/ct4}}</ref>",
      { ref_names: true, modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" }
    );
    expect(result.text).toContain('name="Smith2024"');
  });

  it("handles duplicate ref names with suffix", async () => {
    const text =
      '<ref>{{cite journal |last=Smith |year=2024 |title=A |doi=10.1000/ct5a}}</ref>' +
      ' <ref>{{cite journal |last=Smith |year=2024 |title=B |doi=10.1000/ct5b}}</ref>';
    const result = await processWikitext(text, { ref_names: true, modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" });
    expect(result.text).toContain('name="Smith2024"');
    expect(result.text).toContain('name="Smith2024-2"');
  });

  it("leaves existing ref names as-is", async () => {
    const text =
      '<ref name="Smith">{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/ct6}}</ref>';
    const result = await processWikitext(text, { ref_names: true, modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" });
    expect(result.text).toContain('name="Smith"');
    expect(result.text).not.toContain('name="Smith2024"');
    expect(result.text.match(/<ref/g)?.length).toBe(1);
  });

  it("renames existing ref names when rename_ref_names is true", async () => {
    const text =
      '<ref name="Smith">{{cite journal |last=Smith |year=2024 |title=Test |doi=10.1000/ct6r}}</ref>';
    const result = await processWikitext(text, { ref_names: true, rename_ref_names: true, modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" });
    expect(result.text).toContain('name="Smith2024"');
    expect(result.text).not.toContain('name="Smith"');
    expect(result.text.match(/<ref/g)?.length).toBe(1);
  });

  it("does not double-wrap <ref> when adding name to bare <ref>", async () => {
    const text =
      '<ref>{{cite journal |last=Jones |year=2023 |title=Article |doi=10.1000/ct7}}</ref>';
    const result = await processWikitext(text, { ref_names: true, modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" });
    expect(result.text).toContain('name="Jones2023"');
    expect(result.text.match(/<ref/g)?.length).toBe(1);
    expect(result.text).not.toMatch(/<ref><ref/);
  });

  it("does not double-wrap when free text between <ref> and {{cite}}", async () => {
    const text =
      '<ref>Some introductory text {{cite journal |last=Adams |year=2023 |title=Study |doi=10.1000/ct12}}</ref>';
    const result = await processWikitext(text, { ref_names: true, modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" });
    expect(result.text).not.toMatch(/<ref><ref/);
    expect(result.text).toContain("Some introductory text");
    expect(result.text.match(/<ref/g)?.length).toBe(1);
    expect(result.text).not.toContain('name="Adams2023"');
  });

  it("does not double-wrap when free text after named <ref> and {{cite}}", async () => {
    const text =
      '<ref name="OrigName">Preamble text {{cite journal |last=Miller |year=2023 |title=Analysis |doi=10.1000/ct13}}</ref>';
    const result = await processWikitext(text, { ref_names: true, modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" });
    expect(result.text.match(/<ref/g)?.length).toBe(1);
    expect(result.text).not.toMatch(/<ref><ref/);
    expect(result.text).toContain("Preamble text");
    expect(result.text).toContain('name="OrigName"');
  });

  it("does not wrap citations in See also / Further reading sections", async () => {
    const text =
      "==See also==\n\n* {{cite journal |last=King |year=2021 |title=Review |doi=10.1000/ct99}}";
    const result = await processWikitext(text, { ref_names: true, modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" });
    expect(result.text).not.toContain("<ref");
    expect(result.text).toContain("{{cite journal");
  });

  it("wraps bare citation in ref name when no <ref> tag exists", async () => {
    const text =
      '{{cite journal |last=Lee |year=2022 |title=Paper |doi=10.1000/ct8}}';
    const result = await processWikitext(text, { ref_names: true, modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" });
    expect(result.text).toContain('<ref name="Lee2022">');
    expect(result.text).toMatch(/<\/ref>$/);
    expect(result.text.match(/<ref/g)?.length).toBe(1);
  });

  it("processes multiple citations in sequence", async () => {
    const text =
      "{{cite journal |last=Smith|title=A|date=2024-03-15}}" +
      "{{cite web |title=B|date=2024-04-20|url=http://example.com}}";
    const result = await processWikitext(text, { modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" });
    expect(result.text).toContain("15 March 2024");
    expect(result.text).toContain("20 April 2024");
    expect(result.text).toContain("| last = Smith");
    expect(result.text).toContain("| url = http://example.com");
  });

  it("runs cleanup param renames (citation→cite book with isbn)", async () => {
    const text = "{{citation |isbn=9780306406157 |title=My Book |date=2024}}";
    const result = await processWikitext(text, { modules: "expand,cleanup,dates,ids,archive,dedup", force: false, ref_names: false });
    expect(result.text).toContain("cite book");
  });

  it("removes empty params via cleanup", async () => {
    const result = await processWikitext(
      "{{cite journal |title= |doi=10.1000/ct7 |date=2024}}",
      { modules: "expand,cleanup,dates,ids,archive,dedup", force: false, ref_names: false }
    );
    expect(result.text).not.toContain("title =");
  });

  it("handles sort params", async () => {
    const result = await processWikitext(
      "{{cite journal |doi=10.1000/ct8 |title=Test |date=2024}}",
      { modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" }
    );
    const titleIdx = result.text.indexOf("title");
    const doiIdx = result.text.indexOf("doi");
    expect(doiIdx).toBeGreaterThan(titleIdx);
  });

  it("preserves text outside citations", async () => {
    const result = await processWikitext(
      "Before {{cite journal |date=2024-03-15 |title=Test}} After",
      { modules: "expand,cleanup,dates,ids,archive,dedup", force: false, ref_names: false }
    );
    expect(result.text).toContain("Before ");
    expect(result.text).toContain(" After");
  });

  it("handles no changes gracefully (reformats but preserves content)", async () => {
    const result = await processWikitext(
      "{{cite web |title=Test |date=2024 |url=http://example.com}}",
      { modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" }
    );
    expect(result.text).toContain("title = Test");
    expect(result.text).toContain("date = 2024");
    expect(result.text).toContain("url = http://example.com");
  });

  it("adds archive-url when available for cite web", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("archive.org/wayback/available")) {
        return mockOkResponse({
          archived_snapshots: {
            closest: { url: "https://web.archive.org/web/20240101000000/http://ex-arch-test.com", timestamp: "20240101000000", status: "200" }
          }
        });
      }
      return mockOkResponse(null);
    });
    const result = await processWikitext(
      "{{cite web |url=http://ex-arch-test.com |title=Test |date=2024}}",
      { modules: "expand,cleanup,dates,ids,archive,dedup", force: false, ref_names: false }
    );
    expect(result.text).toContain("archive-url");
  });

  it("calls expandCitation with mocked API data", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("api.crossref.org/works/")) {
        return mockOkResponse({
          message: { DOI: "10.1000/ct9", title: ["Expanded Title"], "container-title": ["Some Journal"], "published-print": { "date-parts": [[2024, 3, 15]] }, publisher: "Acme" }
        });
      }
      return mockOkResponse(null);
    });
    const result = await processWikitext(
      "{{cite journal |doi=10.1000/ct9}}",
      { modules: "expand,cleanup,dates,ids,archive,dedup", force: false, ref_names: false }
    );
    expect(result.text).toContain("Expanded Title");
    expect(result.text).toContain("Some Journal");
    expect(result.text).toContain("15 March 2024");
  });

  it("preserves exact spacing when spacing_style is off — no changes", async () => {
    const input = `{{cite web |last=Telfer |first=Tori |date=11 May 2015 |title=Are Multiple Personalities Always a Disorder? |url=https://www.vice.com/en/article/when-multiple-personalities-are-not-a-disorder-400/ |access-date=15 June 2020 |website=Vice |archive-date=13 August 2024 |archive-url=https://web.archive.org/web/20240813035324/https://www.vice.com/en/article/when-multiple-personalities-are-not-a-disorder-400/ |url-status=live }}`;
    const result = await processWikitext(input, { modules: "expand,cleanup,dates,ids,archive", spacing_style: "", force: false, ref_names: false });
    expect(result.text).toBe(input);
  });

  it("preserves original pipe spacing when spacing is off but modules change values", async () => {
    const input = `{{cite journal |last=Smith |year=2024 |doi=10.1000/ct_no_spacing}}`;
    const result = await processWikitext(input, { modules: "cleanup", spacing_style: "", force: false, ref_names: false });
    expect(result.text).toContain(`|last=Smith |year=2024`);
    expect(result.text).not.toMatch(/ {2}\|/);
    expect(result.text).not.toMatch(/\| {2}/);
  });

  it("returns stats with correct counts", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("archive.org/wayback/available")) {
        return mockOkResponse({
          archived_snapshots: {
            closest: { url: "https://web.archive.org/web/20240101000000/http://ex-arch-test.com", timestamp: "20240101000000", status: "200" }
          }
        });
      }
      return mockOkResponse(null);
    });
    const result = await processWikitext(
      "{{cite web |url=http://ex-arch-test.com |title=Test |date=2024-03-15}}",
      { modules: "expand,cleanup,dates,archive", spacing_style: "standard" }
    );
    expect(result.text).toContain("15 March 2024");
    expect(result.text).toContain("archive-url");
    expect(result.stats.changed).toBeGreaterThan(0);
    expect(result.stats.datesFixed).toBeGreaterThan(0);
    expect(result.stats.archived).toBeGreaterThan(0);
    expect(result.aborted).toBe(false);
  });

  it("supports abort via AbortSignal", async () => {
    const ac = new AbortController();
    ac.abort();
    const result = await processWikitext(
      "{{cite journal |title=Test |date=2024}}",
      { modules: "expand,cleanup,dates,ids,archive,dedup", force: false, ref_names: false },
      ac.signal
    );
    expect(result.aborted).toBe(true);
    expect(result.text).toBe("{{cite journal |title=Test |date=2024}}");
  });

  it("fires progress callbacks", async () => {
    const progresses: string[] = [];
    const result = await processWikitext(
      "{{cite journal |title=A |doi=10.1000/p1}} {{cite journal |title=B |doi=10.1000/p2}}",
      { modules: "expand,cleanup,dates,spacing,sort", spacing_style: "standard" },
      undefined,
      (info) => { progresses.push(`${info.phase}:${info.current}/${info.total}`); }
    );
    expect(result.text).toContain("title = A");
    expect(result.text).toContain("title = B");
    expect(progresses.length).toBeGreaterThan(0);
    expect(progresses.some(p => p.includes('done'))).toBe(true);
  });

  it("preserves leading whitespace after = when value changes", async () => {
    // buildPreservedBody should keep the extra space between = and the old value
    mockFetch.mockResolvedValue(mockOkResponse(null));
    const result = await processWikitext(
      "{{cite journal | date =  2024-03-15 | doi = 10.1000/spacing-test}}",
      { modules: "dates", force: false, ref_names: false }
    );
    expect(result.text).toContain("| date = 15 March 2024");
  });

  it("buildPreservedBody strips trailing whitespace before appending new params", () => {
    const citation = {
      template: "cite journal",
      raw: "{{cite journal |last=Temple |date=January 2019 }}",
      params: { last: "Temple", date: "January 2019" },
      start: 0,
    };
    const newParams = { last: "Temple", date: "January 2019", "archive-url": "https://web.archive.org/web/20200101000000/http://example.com" };
    const result = buildPreservedBody(citation, newParams);
    expect(result).not.toContain("  |");
    expect(result).toMatch(/2019 \| ?archive-url/);
  });

  it("does not add archive-url when DOI is present and force_archive_all is false", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("archive.org/wayback/available")) {
        return mockOkResponse({
          archived_snapshots: {
            closest: { url: "https://web.archive.org/web/20240101000000/http://doi-arch-test.com", timestamp: "20240101000000", status: "200" }
          }
        });
      }
      return mockOkResponse(null);
    });
    const result = await processWikitext(
      "{{cite web |url=http://doi-arch-test.com |doi=10.1000/doi-arch-test |title=Test |date=2024}}",
      { modules: "archive", force: false, force_archive_all: false, ref_names: false }
    );
    expect(result.text).not.toContain("archive-url");
  });

  it("adds archive-url when DOI is present and force_archive_all is true", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("archive.org/wayback/available")) {
        return mockOkResponse({
          archived_snapshots: {
            closest: { url: "https://web.archive.org/web/20240101000000/http://doi-arch-force.com", timestamp: "20240101000000", status: "200" }
          }
        });
      }
      return mockOkResponse(null);
    });
    const result = await processWikitext(
      "{{cite web |url=http://doi-arch-force.com |doi=10.1000/doi-arch-force |title=Test |date=2024}}",
      { modules: "archive", force: false, force_archive_all: true, ref_names: false }
    );
    expect(result.text).toContain("archive-url");
  });

  it("adds archive-url when no DOI is present even without force_archive_all", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("archive.org/wayback/available")) {
        return mockOkResponse({
          archived_snapshots: {
            closest: { url: "https://web.archive.org/web/20240101000000/http://no-doi-arch-test.com", timestamp: "20240101000000", status: "200" }
          }
        });
      }
      return mockOkResponse(null);
    });
    const result = await processWikitext(
      "{{cite web |url=http://no-doi-arch-test.com |title=Test |date=2024}}",
      { modules: "archive", force: false, ref_names: false }
    );
    expect(result.text).toContain("archive-url");
  });

  it("converts vauthors to last/first and removes vauthors", async () => {
    const input = "{{cite journal |vauthors = Robertson VL | date = 13 January 2014 | title = The Law of the Jungle: Self and Community in the Online Therianthropy Movement | url = https://journal.equinoxpub.com/POM/article/view/3153 | journal = Pomegranate: The International Journal of Pagan Studies | volume = 14 | issue = 2 | doi = 10.1558/pome.v14i2.256 | url-access = subscription}}";
    const result = await processWikitext(input, {
      modules: "authors", author_style: "normal",
      force: false, ref_names: false,
    });
    expect(result.text).toContain("last");
    expect(result.text).toContain("Robertson");
    expect(result.text).toContain("first");
    expect(result.text).toContain("VL");
    expect(result.text).not.toContain("vauthors");
    expect(result.text).not.toMatch(/\|{2}/);
  });

  it("normalizes access-date ISO format through dates module", async () => {
    mockFetch.mockResolvedValue(mockOkResponse(null));
    const result = await processWikitext(
      "{{cite web |url=http://example.com |title=T |access-date=2024-11-15 |date=2024}}",
      { modules: "dates", force: false, ref_names: false }
    );
    expect(result.text).toContain("15 November 2024");
  });

  it("normalizes archive-date ISO format through dates module", async () => {
    mockFetch.mockResolvedValue(mockOkResponse(null));
    const result = await processWikitext(
      "{{cite web |url=http://example.com |title=T |archive-date=2025-01-21 |archive-url=https://web.archive.org/123 |date=2024}}",
      { modules: "dates", force: false, ref_names: false }
    );
    expect(result.text).toContain("21 January 2025");
  });

  it("converts accessdate alias through cleanup then normalizes date through dates module", async () => {
    mockFetch.mockResolvedValue(mockOkResponse(null));
    const result = await processWikitext(
      "{{cite web |url=http://example.com |title=T |accessdate=2024-11-15 |date=2024}}",
      { modules: "cleanup,dates", force: false, ref_names: false }
    );
    // accessdate should be renamed to access-date, then date normalized
    expect(result.text).toContain("access-date");
    expect(result.text).toContain("15 November 2024");
    expect(result.text).not.toContain("accessdate");
  });

  it("converts deadurl=yes through cleanup pipeline", async () => {
    mockFetch.mockResolvedValue(mockOkResponse(null));
    const result = await processWikitext(
      "{{cite web |url=http://example.com |title=T |deadurl=yes |date=2024}}",
      { modules: "cleanup", force: false, ref_names: false }
    );
    expect(result.text).toContain("url-status=dead");
    expect(result.text).not.toContain("deadurl");
  });

  it("converts archiveurl alias through cleanup pipeline", async () => {
    mockFetch.mockResolvedValue(mockOkResponse(null));
    const result = await processWikitext(
      "{{cite web |url=http://example.com |title=T |archiveurl=https://web.archive.org/123 |archivedate=2025-01-21 |date=2024}}",
      { modules: "cleanup,dates", force: false, ref_names: false }
    );
    expect(result.text).toContain("archive-url");
    expect(result.text).toContain("archive-date");
    expect(result.text).not.toContain("archiveurl");
    expect(result.text).not.toContain("archivedate");
  });

  it("handles multiple alias conversions in a single citation", async () => {
    mockFetch.mockResolvedValue(mockOkResponse(null));
    const result = await processWikitext(
      "{{cite web |url=http://example.com |title=T |archiveurl=https://web.archive.org/123 |archivedate=2025-01-21 |deadurl=no |date=2024}}",
      { modules: "cleanup,dates", force: false, ref_names: false }
    );
    expect(result.text).toContain("archive-url");
    expect(result.text).toContain("archive-date");
    expect(result.text).not.toContain("archiveurl");
    expect(result.text).not.toContain("archivedate");
    expect(result.text).not.toContain("deadurl");
    expect(result.text).not.toContain("url-status"); // deadurl=no, so no url-status
  });

  describe("cs2tocs1 module", () => {
    it("converts {{citation}} with journal to {{cite journal}}", async () => {
      mockFetch.mockResolvedValue(mockOkResponse(null));
      const result = await processWikitext(
        "{{citation |title=A Study |journal=Nature |date=2024 |doi=10.1000/test}}",
        { modules: "cs2tocs1", citation_style: "cs1", force: false, ref_names: false }
      );
      expect(result.text).toContain("{{cite journal");
      expect(result.text).not.toContain("{{citation");
      expect(result.text).toMatch(/journal\s*=\s*Nature/);
    });

    it("converts {{citation}} with website to {{cite web}}", async () => {
      mockFetch.mockResolvedValue(mockOkResponse(null));
      const result = await processWikitext(
        "{{citation |title=Test |website=Example |url=http://example.com |date=2024}}",
        { modules: "cs2tocs1", citation_style: "cs1", force: false, ref_names: false }
      );
      expect(result.text).toContain("{{cite web");
      expect(result.text).not.toContain("{{citation");
    });

    it("converts {{citation}} with isbn to {{cite book}}", async () => {
      mockFetch.mockResolvedValue(mockOkResponse(null));
      const result = await processWikitext(
        "{{citation |title=A Book |isbn=9780306406157 |date=2024 |publisher=TestPub}}",
        { modules: "cs2tocs1", citation_style: "cs1", force: false, ref_names: false }
      );
      expect(result.text).toContain("{{cite book");
      expect(result.text).not.toContain("{{citation");
    });

    it("renames work to website when converting to cite web", async () => {
      mockFetch.mockResolvedValue(mockOkResponse(null));
      const result = await processWikitext(
        "{{citation |title=Test |work=Example Site |url=http://example.com |date=2024}}",
        { modules: "cs2tocs1", citation_style: "cs1", force: false, ref_names: false }
      );
      expect(result.text).toContain("{{cite web");
      expect(result.text).toMatch(/website\s*=\s*Example Site/);
      expect(result.text).not.toContain("work");
    });

    it("converts journal param directly to cite journal", async () => {
      mockFetch.mockResolvedValue(mockOkResponse(null));
      const result = await processWikitext(
        "{{citation |title=Test |journal=Nature |date=2024}}",
        { modules: "cs2tocs1", citation_style: "cs1", force: false, ref_names: false }
      );
      expect(result.text).toContain("{{cite journal");
      expect(result.text).not.toContain("{{citation");
    });

    it("renames place to location when converting", async () => {
      mockFetch.mockResolvedValue(mockOkResponse(null));
      const result = await processWikitext(
        "{{citation |title=Test |journal=J |place=London |date=2024}}",
        { modules: "cs2tocs1", citation_style: "cs1", force: false, ref_names: false }
      );
      expect(result.text).toMatch(/location\s*=\s*London/);
      expect(result.text).not.toContain("place");
    });

    it("does not convert when cs2tocs1 module is not enabled", async () => {
      mockFetch.mockResolvedValue(mockOkResponse(null));
      const result = await processWikitext(
        "{{citation |title=Test |journal=Nature |date=2024}}",
        { modules: "spacing", citation_style: "cs1", force: false, ref_names: false }
      );
      expect(result.text).toContain("{{citation");
      expect(result.text).not.toContain("{{cite journal");
    });

    it("does not touch CS1 citations when cs2tocs1 is enabled", async () => {
      mockFetch.mockResolvedValue(mockOkResponse(null));
      const result = await processWikitext(
        "{{cite journal |title=Test |journal=Nature |date=2024}}",
        { modules: "cs2tocs1", citation_style: "cs1", force: false, ref_names: false }
      );
      expect(result.text).toContain("{{cite journal");
    });

    it("does not convert citation without detectable type", async () => {
      mockFetch.mockResolvedValue(mockOkResponse(null));
      const result = await processWikitext(
        "{{citation |title=Untyped |date=2024}}",
        { modules: "cs2tocs1", citation_style: "cs1", force: false, ref_names: false }
      );
      // No journal, website, isbn etc — stays as citation
      expect(result.text).toContain("{{citation");
    });
  });
});
