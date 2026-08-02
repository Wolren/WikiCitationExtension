import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProcessStats } from "../src/lib/types";

// Mock i18n before importing content
const mockGetMessage = vi.fn((k: string) => {
  const m: Record<string, string> = {
    statsChanged: "$1 citation changed",
    statsChangedPlural: "$1 citations changed",
    statsExpanded: "Expanded",
    statsCleaned: "Cleaned",
    statsDates: "Dates fixed",
    statsAuthors: "Authors",
    statsIds: "IDs enriched",
    statsArchive: "Archived",
    statsSorted: "Sorted",
    statsRefNames: "Ref names added",
  };
  return m[k] || k;
});
const mockBrowser = { i18n: { getMessage: mockGetMessage } } as any;
vi.stubGlobal("browser", mockBrowser);

// Set up basic DOM
document.body.innerHTML = '<div id="firstHeading">Test Page</div>';

import {
  formatStatsSummary,
  describeChanges,
  buildPreservedBody,
  escapeHtml,
  bracketAwareValue,
  getPageTitle,
} from "../src/content";

describe("formatStatsSummary", () => {
  it("returns empty string for zero stats (nothing changed)", () => {
    const stats: ProcessStats = {
      total: 0, changed: 0, expanded: 0, cleaned: 0, archived: 0,
      enrichedIds: 0, datesFixed: 0, authorsProcessed: 0, sortApplied: 0,
      refNamesAdded: 0, errors: 0,
    };
    expect(formatStatsSummary(stats)).toBe("");
  });

  it("shows changed singular when 1 citation changed", () => {
    const stats: ProcessStats = {
      total: 1, changed: 1, expanded: 1, cleaned: 0, archived: 0,
      enrichedIds: 0, datesFixed: 0, authorsProcessed: 0, sortApplied: 0,
      refNamesAdded: 0, errors: 0,
    };
    const result = formatStatsSummary(stats);
    expect(result).toContain("1 citation changed");
    expect(result).toContain("Expanded: 1");
  });

  it("shows changed plural when multiple citations changed", () => {
    const stats: ProcessStats = {
      total: 3, changed: 3, expanded: 1, cleaned: 2, archived: 0,
      enrichedIds: 0, datesFixed: 0, authorsProcessed: 0, sortApplied: 0,
      refNamesAdded: 0, errors: 0,
    };
    const result = formatStatsSummary(stats);
    expect(result).toContain("3 citations changed");
    expect(result).toContain("Expanded: 1");
    expect(result).toContain("Cleaned: 2");
  });

  it("includes all non-zero stats", () => {
    const stats: ProcessStats = {
      total: 5, changed: 5, expanded: 1, cleaned: 2, archived: 3,
      enrichedIds: 4, datesFixed: 5, authorsProcessed: 6, sortApplied: 7,
      refNamesAdded: 8, errors: 0,
    };
    const result = formatStatsSummary(stats);
    expect(result).toContain("Expanded: 1");
    expect(result).toContain("Cleaned: 2");
    expect(result).toContain("Archived: 3");
    expect(result).toContain("IDs enriched: 4");
    expect(result).toContain("Dates fixed: 5");
    expect(result).toContain("Authors: 6");
    expect(result).toContain("Sorted: 7");
    expect(result).toContain("Ref names added: 8");
  });

  it("omits zero-value stats", () => {
    const stats: ProcessStats = {
      total: 1, changed: 1, expanded: 1, cleaned: 0, archived: 0,
      enrichedIds: 0, datesFixed: 0, authorsProcessed: 0, sortApplied: 0,
      refNamesAdded: 0, errors: 0,
    };
    const result = formatStatsSummary(stats);
    expect(result).toContain("Expanded: 1");
    expect(result).not.toContain("Cleaned:");
    expect(result).not.toContain("Archived:");
    expect(result).not.toContain("Sorted:");
  });
});

describe("describeChanges", () => {
  it("counts 0 when original equals fixed", () => {
    const result = describeChanges("same", "same", "");
    expect(result.count).toBe(0);
    expect(result.html).toBe("");
  });

  it("counts 1 when original differs from fixed", () => {
    const result = describeChanges("old", "new", "");
    expect(result.count).toBe(1);
    expect(result.html).toContain("citation changed");
  });

  it("counts 1 for whitespace differences", () => {
    const result = describeChanges("text", " text ", "");
    expect(result.count).toBe(1);
  });

  it("counts 1 for case differences", () => {
    const result = describeChanges("Title", "TITLE", "");
    expect(result.count).toBe(1);
  });
});

describe("buildPreservedBody", () => {
  const sampleCitation = {
    template: "cite journal",
    params: { last: "Smith", year: "2024", title: "Test" },
    raw: "{{cite journal |last=Smith |year=2024 |title=Test}}",
    start: 0,
  };

  it("uses provided params when different from original", () => {
    const newParams = { last: "Smith", year: "2024", title: "Updated" };
    const result = buildPreservedBody(sampleCitation, newParams);
    expect(result).toContain("Updated");
    expect(result).toContain("last=Smith");
    expect(result).toContain("year=2024");
  });

  it("preserves original spacing style when params unchanged", () => {
    const result = buildPreservedBody(sampleCitation, sampleCitation.params);
    // Exact roundtrip: same params + same input → byte-identical body
    expect(result).toBe("|last=Smith |year=2024 |title=Test");
  });

  it("handles empty params", () => {
    const result = buildPreservedBody(sampleCitation, {});
    // Empty params → original body untouched, no stray pipes appended
    expect(result).toBe("|last=Smith |year=2024 |title=Test");
  });
});

describe("escapeHtml", () => {
  it("escapes & < > \"", () => {
    expect(escapeHtml('&<>"')).toBe("&amp;&lt;&gt;&quot;");
  });

  it("returns empty string for non-string input", () => {
    expect(escapeHtml(null as any)).toBe("");
    expect(escapeHtml(undefined as any)).toBe("");
    expect(escapeHtml(42 as any)).toBe("");
  });

  it("passes through safe strings unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
    expect(escapeHtml("")).toBe("");
  });

  it("handles strings with only special characters", () => {
    expect(escapeHtml("<<>>")).toBe("&lt;&lt;&gt;&gt;");
  });
});

describe("bracketAwareValue", () => {
  it("treats [[Foo | Bar]] as atomic value", () => {
    const result = bracketAwareValue("[[Foo | Bar]]", 0);
    expect(result).toBe("[[Foo | Bar]]");
  });

  it("stops at pipe outside wikilink", () => {
    const result = bracketAwareValue("value1 | value2", 0);
    expect(result).toBe("value1 ");
  });

  it("handles simple value without pipes or brackets", () => {
    const result = bracketAwareValue("simple value", 0);
    expect(result).toBe("simple value");
  });
});

describe("getPageTitle", () => {
  beforeEach(() => {
    // wiki-detector.getPageTitle reads from window.location.pathname
    delete (globalThis as any).window;
    globalThis.window = Object.create(globalThis);
    Object.assign(globalThis.window, {
      location: {
        pathname: "/wiki/Test_Page",
        search: "",
        href: "https://en.wikipedia.org/wiki/Test_Page",
      },
    });
  });

  it("returns the page title from URL pathname", () => {
    const title = getPageTitle();
    expect(title).toBe("Test_Page");
  });

  it("returns title from URL query param when no pathname match", () => {
    Object.assign(globalThis.window.location, {
      pathname: "/w/index.php",
      search: "?title=Query_Page",
    });
    const title = getPageTitle();
    expect(title).toBe("Query_Page");
  });

  it("falls back to empty string when no route matches", () => {
    Object.assign(globalThis.window.location, {
      pathname: "/",
      search: "",
    });
    const title = getPageTitle();
    expect(title).toBe("");
  });
});
