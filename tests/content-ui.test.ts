import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub browser API
const mockGetMessage = vi.fn((k: string) => {
  const m: Record<string, string> = {
    btnCopyWikitext: "Copy wikitext",
    btnOpenEditor: "Open editor",
    statsChanged: "$1 citation changed",
    statsChangedPlural: "$1 citations changed",
    statsExpanded: "Expanded",
    statsCleaned: "Cleaned",
    statsDates: "Dates",
    statsAuthors: "Authors",
    statsIds: "IDs",
    statsArchive: "Archive",
    statsSorted: "Sorted",
    statsRefNames: "Ref names",
    panelTitle: "WikiCitationExtension — Citation diff panel",
    btnCycleDock: "Cycle dock corner",
    btnMinimize: "Minimize",
    btnClose: "Close",
  };
  return m[k] || k;
});
const mockBrowser = { storage: { local: { get: vi.fn(), set: vi.fn() } }, i18n: { getMessage: mockGetMessage } } as any;
vi.stubGlobal("browser", mockBrowser);

// Stub window.location
delete (globalThis as any).location;
(globalThis as any).location = { origin: "https://en.wikipedia.org", pathname: "/wiki/Test_Page" };

import {
  showNotification, formatStatsSummary, describeChanges, resetPanel,
  buildStructuredDiffHtml, showDiffPanel, getSettings,
  formatBody, getEditUrl
} from "../src/content";

// jsdom lacks scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

describe("formatStatsSummary", () => {
  it("returns empty string for all-zero stats", () => {
    const stats = {
      total: 5, changed: 0, expanded: 0, cleaned: 0,
      archived: 0, enrichedIds: 0, datesFixed: 0,
      authorsProcessed: 0, sortApplied: 0, refNamesAdded: 0, errors: 0,
    };
    expect(formatStatsSummary(stats)).toBe("");
  });

  it("includes changed count in summary", () => {
    const stats = {
      total: 5, changed: 3, expanded: 2, cleaned: 1, archived: 0,
      enrichedIds: 0, datesFixed: 0, authorsProcessed: 0, sortApplied: 0,
      refNamesAdded: 0, errors: 0,
    };
    const html = formatStatsSummary(stats);
    expect(html).toContain("3 citations changed");
    expect(html).toContain("Expanded: 2");
    expect(html).toContain("Cleaned: 1");
  });

  it("uses singular for 1 citation", () => {
    const stats = {
      total: 1, changed: 1, expanded: 1, cleaned: 0, archived: 0,
      enrichedIds: 0, datesFixed: 0, authorsProcessed: 0, sortApplied: 0,
      refNamesAdded: 0, errors: 0,
    };
    const html = formatStatsSummary(stats);
    expect(html).toContain("1 citation changed");
  });

  it("includes all module stats when non-zero", () => {
    const stats = {
      total: 10, changed: 5, expanded: 1, cleaned: 1, archived: 1,
      enrichedIds: 1, datesFixed: 1, authorsProcessed: 1, sortApplied: 1,
      refNamesAdded: 1, errors: 0,
    };
    const html = formatStatsSummary(stats);
    expect(html).toContain("Expanded: 1");
    expect(html).toContain("Cleaned: 1");
    expect(html).toContain("Dates: 1");
    expect(html).toContain("Authors: 1");
    expect(html).toContain("IDs: 1");
    expect(html).toContain("Archive: 1");
    expect(html).toContain("Sorted: 1");
    expect(html).toContain("Ref names: 1");
  });
});

describe("describeChanges", () => {
  it("returns count 0 when original equals fixed", () => {
    const result = describeChanges("same text", "same text", "");
    expect(result.count).toBe(0);
    expect(result.html).toBe("");
  });

  it("returns count 1 when texts differ", () => {
    const result = describeChanges("old text", "new text", "");
    expect(result.count).toBe(1);
    expect(result.html).toContain("1 citation changed");
  });
});

describe("buildStructuredDiffHtml", () => {
  it("returns a table with original and modified columns", () => {
    const html = buildStructuredDiffHtml("line1\nline2", "line1\nmodified2");
    expect(html).toContain("<table");
    expect(html).toContain("Original");
    expect(html).toContain("Modified");
    expect(html).toContain("line1");
    expect(html).toContain("modified2");
  });

  it("handles added lines", () => {
    const html = buildStructuredDiffHtml("line1", "line1\nline2");
    expect(html).toContain("line2");
  });

  it("handles removed lines", () => {
    const html = buildStructuredDiffHtml("line1\nline2", "line1");
    expect(html).toContain("line2");
  });

  it("escapes HTML in diff content", () => {
    const html = buildStructuredDiffHtml("<script>", "safe");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("getEditUrl", () => {
  it("builds edit URL from page title", () => {
    const url = getEditUrl("Test_Page");
    expect(url).toContain("index.php");
    expect(url).toContain("title=Test_Page");
    expect(url).toContain("action=edit");
  });

  it("encodes special characters in title", () => {
    const url = getEditUrl("Page With Spaces");
    expect(url).not.toContain("Page With Spaces");
    expect(url).toContain(encodeURIComponent("Page With Spaces"));
  });
});

describe("formatBody", () => {
  it("formats params in standard style by default", () => {
    const body = formatBody({ title: "Test", doi: "10.1000/x" });
    expect(body).toContain("| title = Test");
    expect(body).toContain("| doi = 10.1000/x");
  });

  it("formats params in compact style", () => {
    const body = formatBody({ title: "Test", doi: "10.1000/x" }, "compact");
    expect(body).toContain("|title=Test");
    expect(body).toContain("|doi=10.1000/x");
  });

  it("formats params in wide style", () => {
    const body = formatBody({ title: "Test", doi: "10.1000/x" }, "wide");
    // wide style trims leading space: "| title = Test | doi = 10.1000/x"
    expect(body).toContain("| title = Test");
    expect(body).toContain("| doi = 10.1000/x");
    expect(body).not.toMatch(/^ /);
  });

  it("returns empty string for empty params", () => {
    expect(formatBody({})).toBe("");
  });
});

describe("showNotification", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("creates a notification element and shows it", () => {
    showNotification("success", "Test message");
    const note = document.getElementById("wikifix-note");
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain("Test message");
    expect(note!.className).toContain("wikifix-success");
    expect(note!.style.display).toBe("block");
  });

  it("creates error notification", () => {
    showNotification("error", "Error message");
    const note = document.getElementById("wikifix-note");
    expect(note!.className).toContain("wikifix-error");
  });

  it("reuses existing notification element", () => {
    showNotification("info", "First");
    showNotification("success", "Second");
    const notes = document.querySelectorAll("#wikifix-note");
    expect(notes.length).toBe(1);
    expect(notes[0].textContent).toContain("Second");
  });

  it("hides the diff panel if visible", () => {
    const panel = document.createElement("div");
    panel.id = "wikifix-panel";
    panel.style.display = "block";
    document.body.appendChild(panel);
    showNotification("info", "test");
    expect(panel.style.display).toBe("none");
  });

  it("adds close button when html is provided", () => {
    showNotification("info", "Summary", "<b>detail</b>");
    const note = document.getElementById("wikifix-note")!;
    expect(note.innerHTML).toContain("<b>detail</b>");
    expect(note.querySelector("button")).not.toBeNull();
  });

  it("auto-dismisses plain text notifications after 6 seconds", () => {
    vi.useFakeTimers();
    showNotification("success", "Auto dismiss");
    const note = document.getElementById("wikifix-note")!;
    vi.advanceTimersByTime(6000);
    expect(note.style.display).toBe("none");
    vi.useRealTimers();
  });
});

describe("showDiffPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetPanel();
  });

  it("creates panel and shows diff content", () => {
    showDiffPanel(
      "fixed wikitext",
      "--- original\n+++ modified\n-something\n+something else",
      "Test_Page"
    );
    const panel = document.getElementById("wikifix-panel");
    expect(panel).not.toBeNull();
    expect(panel!.style.display).toBe("block");
    const body = panel!.querySelector(".wikifix-body")!;
    expect(body.innerHTML).toContain("something else");
  });

  it("includes copy and open editor buttons", () => {
    showDiffPanel("fixed", "diff", "Test_Page");
    const body = document.querySelector(".wikifix-body")!;
    expect(body.innerHTML).toContain("Copy wikitext");
    expect(body.innerHTML).toContain("Open editor");
  });

  it("displays stats summary when stats provided", () => {
    const stats = {
      total: 3, changed: 2, expanded: 1, cleaned: 0,
      archived: 0, enrichedIds: 0, datesFixed: 1, authorsProcessed: 0,
      sortApplied: 0, refNamesAdded: 0, errors: 0,
    };
    showDiffPanel("fixed", "diff", "Test_Page", stats);
    const body = document.querySelector(".wikifix-summary")!;
    expect(body.innerHTML).toContain("2 citations changed");
    expect(body.innerHTML).toContain("Expanded: 1");
  });
});

describe("getSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default settings when nothing stored", async () => {
    mockBrowser.storage.local.get.mockResolvedValue({});
    const settings = await getSettings();
    expect(settings.modules).toBe("expand,cleanup,dates,ids,archive,dedup");
    expect(settings.force).toBe(false);
  });

  it("returns stored settings when valid", async () => {
    mockBrowser.storage.local.get.mockResolvedValue({
      wikifix_settings: { modules: "expand,cleanup", force: true, ref_names: false }
    });
    const settings = await getSettings();
    expect(settings.modules).toBe("expand,cleanup");
    expect(settings.force).toBe(true);
  });

  it("migrates old serverUrl field", async () => {
    const stored = { wikifix_settings: { modules: "expand", force: false, ref_names: false, serverUrl: "http://old" } };
    mockBrowser.storage.local.get.mockResolvedValue(stored);
    const settings = await getSettings();
    expect((settings as any).serverUrl).toBeUndefined();
    // Should have saved cleaned version
    expect(mockBrowser.storage.local.set).toHaveBeenCalled();
    // Saved under generic variant key since jsdom's location.hostname is empty
    const setCall = mockBrowser.storage.local.set.mock.calls[0][0];
    const saved = setCall.wikifix_settings_generic || setCall.wikifix_settings;
    expect(saved).toBeDefined();
    expect(saved.serverUrl).toBeUndefined();
  });

  it("returns defaults on storage error", async () => {
    mockBrowser.storage.local.get.mockRejectedValue(new Error("Storage error"));
    const settings = await getSettings();
    expect(settings.modules).toBe("expand,cleanup,dates,ids,archive,dedup");
  });
});
