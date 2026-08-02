import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetMessage = vi.fn((k: string) => {
  const m: Record<string, string> = {
    notifNoEditor: "No editor found. Reload the edit page and try again.",
    notifNoSourceTab: "Could not switch to source editor. Use the classic editor instead.",
    notifUsingApiVe: "Using API to fetch wikitext (VisualEditor active). Changes will be shown in the diff panel.",
    notifNoTitle: "Could not determine page title.",
    notifFetchFailed: "Failed to fetch wikitext.",
    notifEmptyEditor: "Editor is empty. Type or load article text first.",
    notifCancelled: "Processing was cancelled.",
    notifNoChanges: "No citation changes needed.",
    notifFetching: "Fetching wikitext...",
    btnFixCitations: "Fix citations",
    btnRetry: "Retry",
    btnWorking: "Working...",
    btnCopyWikitext: "Copy wikitext",
    btnOpenEditor: "Open editor",
    progressScanning: "Scanning citations...",
    progressProcessing: "Processing $1–$2 of $3...",
    progressProcessed: "Processed $1 of $2 citations",
    progressApplying: "Applying changes...",
    progressDone: "Done",
    progressNoCitations: "No citations found",
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
    errorProcessing: "Error: $1",
    copiedToClipboard: "Copied!",
    panelTitle: "WikiCitationExtension — Citation diff panel",
    btnCycleDock: "Cycle dock corner",
    btnMinimize: "Minimize",
    btnClose: "Close",
  };
  return m[k] || k;
});
const mockBrowser = { storage: { local: { get: vi.fn(), set: vi.fn() } }, i18n: { getMessage: mockGetMessage }, runtime: { onMessage: { addListener: vi.fn() } } } as any;
vi.stubGlobal("browser", mockBrowser);

delete (globalThis as any).location;
(globalThis as any).location = {
  origin: "https://en.wikipedia.org",
  pathname: "/wiki/Test_Page",
  search: "?action=edit",
  hostname: "en.wikipedia.org",
  host: "en.wikipedia.org",
  href: "https://en.wikipedia.org/w/index.php?action=edit",
  hash: "",
  port: "",
  protocol: "https:",
};

vi.mock("../src/lib/diff", () => ({
  generateDiff: vi.fn(() => "--- diff output"),
}));

import { resetApiProbeCache } from "../src/wiki-detector";
import {
  onClick, fixInEditor, fixLocally,
  resetPanel,
} from "../src/content";

Element.prototype.scrollIntoView = vi.fn();

const defaultSettings = {
  modules: "expand,cleanup,dates,ids,archive,dedup",
  force: false,
  ref_names: false,
};

let fetchMock: any;

beforeEach(() => {
  vi.clearAllMocks();
  resetPanel();
  resetApiProbeCache();
  document.body.innerHTML = "";
  fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(""),
  });
  globalThis.fetch = fetchMock;
  mockBrowser.storage.local.get.mockResolvedValue({
    wikifix_settings: defaultSettings,
  });
  Object.defineProperty(window.location, "search", { value: "?action=edit", configurable: true });
  Object.defineProperty(window.location, "pathname", { value: "/wiki/Test_Page", configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("onClick", () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="wikifix-btn">Fix citations</button>';
    const ta = document.createElement("textarea");
    ta.id = "wpTextbox1";
    ta.value = "{{cite journal |title=Test |date=2024}}";
    document.body.appendChild(ta);
  });

  it("disables button, calls fixInEditor, re-enables on success", async () => {
    await onClick();
    const btn = document.getElementById("wikifix-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.innerHTML).toContain("Fix citations");
  });

  it("completes without throwing even on storage error", async () => {
    mockBrowser.storage.local.get.mockRejectedValue(new Error("db down"));
    await onClick();
    const btn = document.getElementById("wikifix-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("fixLocally when not on edit page shows diff panel", async () => {
    Object.defineProperty(window.location, "search", { value: "", configurable: true });
    // Remove textarea so isEditPage returns false
    const ta = document.getElementById("wpTextbox1");
    if (ta) ta.remove();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        query: { pages: { "1": { revisions: [{ "*": "{{cite journal |title=Test |date=2024}}" }] } } },
      }),
    });
    await onClick();
    const panel = document.getElementById("wikifix-panel");
    expect(panel).not.toBeNull();
    expect(panel!.style.display).toBe("block");
  });
});

describe("fixInEditor", () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="wikifix-btn">Fix citations</button>';
    const ta = document.createElement("textarea");
    ta.id = "wpTextbox1";
    ta.value = "{{cite journal |title=Test |date=2024}}";
    document.body.appendChild(ta);
  });

  it("reads wikitext from editor, processes it, writes back", async () => {
    const ta = document.getElementById("wpTextbox1") as HTMLTextAreaElement;
    ta.value = "{{cite web |url=http://example.com |title=Test |accessdate=2024-01-15}}";
    await fixInEditor(defaultSettings);
    // cleanup renames accessdate→access-date; dates normalizes the value
    expect(ta.value).toContain("access-date=15 January 2024");
    expect(ta.value).not.toContain("accessdate");
  });

  it("shows notification when editor is empty", async () => {
    const ta = document.getElementById("wpTextbox1") as HTMLTextAreaElement;
    ta.value = "";
    await fixInEditor(defaultSettings);
    const note = document.getElementById("wikifix-note");
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain("Editor is empty");
  });

  it("shows notification when no changes needed (no citations)", async () => {
    const ta = document.getElementById("wpTextbox1") as HTMLTextAreaElement;
    ta.value = "Just plain text no citations";
    await fixInEditor(defaultSettings);
    const note = document.getElementById("wikifix-note");
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain("No citation changes");
  });

  it("processes only selected text and restores selection range", async () => {
    const ta = document.getElementById("wpTextbox1") as HTMLTextAreaElement;
    ta.value = "lead {{cite journal |title=Test |date=2024-01-15}} tail";
    const citation = "{{cite journal |title=Test |date=2024-01-15}}";
    const startIdx = ta.value.indexOf(citation);
    const endIdx = startIdx + citation.length;
    ta.selectionStart = startIdx;
    ta.selectionEnd = endIdx;

    await fixInEditor(defaultSettings);

    // dates module normalizes 2024-01-15 → "15 January 2024"
    const normalized = "{{cite journal |title=Test |date=15 January 2024}}";
    expect(ta.value).toBe("lead " + normalized + " tail");

    // Selection restored to span the replaced region
    expect(ta.selectionStart).toBe(startIdx);
    expect(ta.selectionEnd).toBe(startIdx + normalized.length);

    // Selection mode shows notification (not diff button)
    const note = document.getElementById("wikifix-note");
    expect(note).not.toBeNull();
    expect(note!.className).toContain("wikifix-success");
    expect(note!.textContent).toContain("citation changed");
  });

  it("falls back to full-page when no selection exists", async () => {
    const ta = document.getElementById("wpTextbox1") as HTMLTextAreaElement;
    ta.value = "{{cite journal |title=Test |date=2024-01-15}}";
    // No selection set — selectionStart === selectionEnd === 0
    await fixInEditor(defaultSettings);

    // Full page processed — date normalized
    expect(ta.value).toBe("{{cite journal |title=Test |date=15 January 2024}}");
  });
});

describe("fixLocally", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        query: { pages: { "1": { revisions: [{ "*": "{{cite journal |title=Test |date=2024}}" }] } } },
      }),
    });
  });

  it("fetches wikitext, processes, shows diff panel", async () => {
    await fixLocally(defaultSettings);
    const panel = document.getElementById("wikifix-panel");
    expect(panel).not.toBeNull();
    expect(panel!.style.display).toBe("block");
    const body = panel!.querySelector(".wikifix-body")!;
    expect(body.innerHTML).toContain("Copy wikitext");
    expect(body.innerHTML).toContain("Open editor");
    expect(body.innerHTML).toContain("citation");
  });

  it("shows error when page title cant be determined", async () => {
    Object.defineProperty(window.location, "pathname", { value: "/", configurable: true });
    await fixLocally(defaultSettings);
    const note = document.getElementById("wikifix-note");
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain("Could not determine page title");
  });

  it("shows error when fetch returns no revisions", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ query: { pages: { "1": {} } } }),
    });
    await fixLocally(defaultSettings);
    const note = document.getElementById("wikifix-note");
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain("Failed to fetch wikitext");
  });
});
