import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub browser APIs before importing popup
const mockStorage: Record<string, unknown> = {};
const mockGetMessage = vi.fn((key: string) => {
  const msgs: Record<string, string> = {
    appName: "WikiCitationExtension",
    appSubtitle: "Citation fixing for English Wikipedia",
    btnResetDefaults: "Reset defaults",
    sectionModules: "Modules",
    moduleExpand: "Expand",
    moduleExpandDesc: "Fill missing fields",
    labelStyle: "Style:",
    labelFetchIds: "Fetch IDs",
    sectionApiKeys: "API keys",
    labelSfnPageConflict: "SFN page conflict:",
    optionSfnPageRp: "prefer rp",
    optionSfnPageBoth: "both",
    optionSfnPageCite: "cite",
    labelCrossRefEmail: "CrossRef email:",
    labelNcbiKey: "NCBI API key:",
    labelSemanticScholarKey: "Semantic Scholar API key:",
    btnCycleDock: "Cycle dock corner",
    btnMinimize: "Minimize",
    btnClose: "Close",
    notifNoEditor: "No editor found",
    notifNoSourceTab: "Could not switch to source editor",
    notifNoTitle: "Could not determine page title",
    notifFetchFailed: "Failed to fetch wikitext",
    notifEmptyEditor: "Editor is empty",
    notifCancelled: "Processing was cancelled",
    notifNoChanges: "No citation changes needed",
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
  };
  return msgs[key] || "";
});
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) mockStorage[k] = v;
      }),
    },
  },
  i18n: { getMessage: mockGetMessage },
  runtime: { sendMessage: vi.fn(async () => ({ variant: "wikipedia" })) },
} as any;
vi.stubGlobal("browser", mockBrowser);

// Mock Web Crypto
const mockEncryptResult = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const mockCrypto = {
  subtle: {
    generateKey: vi.fn().mockResolvedValue("mock-key"),
    exportKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
    importKey: vi.fn().mockResolvedValue("mock-imported-key"),
    encrypt: vi.fn().mockResolvedValue(mockEncryptResult.buffer),
    decrypt: vi.fn().mockResolvedValue(new TextEncoder().encode("decrypted-value").buffer),
  },
  getRandomValues: vi.fn((arr: Uint8Array) => { arr.fill(1); return arr; }),
} as any;
Object.defineProperty(globalThis, "crypto", { value: mockCrypto });

import "../src/popup";

// Helper to await pending microtasks and debounced saves
function tick(delay = 0): Promise<void> {
  return new Promise(r => setTimeout(r, delay));
}

beforeEach(() => {
  mockStorage["wikifix_settings_wikipedia"] = {
    modules: "expand,cleanup,dates,ids,archive,dedup",
    force: false,
    ref_names: false,
    auto_update: false,
    author_style: "normal",
    max_authors: 6,
    ids_to_fetch: "pmid,pmc,s2cid,qid",
    spacing_style: "",
    skip_org_authors: true,
    crossref_email: "",
    ncbi_api_key: "",
    semantic_scholar_api_key: "",
  };
  mockBrowser.storage.local.get.mockClear();
  mockBrowser.storage.local.set.mockClear();
  mockCrypto.subtle.encrypt.mockClear();
  mockCrypto.subtle.decrypt.mockClear();
  mockGetMessage.mockClear();

  document.body.innerHTML = `
    <div class="container">
      <h2 data-i18n="appName">WikiCitationExtension</h2>
      <p class="subtitle"><span data-i18n="appSubtitle">Citation fixing for English Wikipedia</span></p>
      <details class="section" open>
        <summary data-i18n="sectionModules">Modules</summary>
        <div class="module-list">
          <label class="module-item"><input type="checkbox" data-module="expand" checked><div><strong data-i18n="moduleExpand">Expand</strong><span data-i18n="moduleExpandDesc">desc</span></div></label>
          <label class="module-item"><input type="checkbox" data-module="cleanup" checked><div><strong>Cleanup</strong><span>desc</span></div></label>
          <label class="module-item"><input type="checkbox" data-module="dates" checked><div><strong>Dates</strong><span>desc</span></div></label>
          <label class="module-item"><input type="checkbox" data-module="authors"><div><strong>Authors</strong><span>desc</span></div></label>
          <label class="module-item"><input type="checkbox" data-module="ids" checked><div><strong>Enrich IDs</strong><span>desc</span></div></label>
          <label class="module-item"><input type="checkbox" data-module="sort"><div><strong>Sort</strong><span>desc</span></div></label>
          <label class="module-item"><input type="checkbox" data-module="archive" checked><div><strong>Archive</strong><span>desc</span></div></label>
          <label class="module-item"><input type="checkbox" data-module="dedup" checked><div><strong>Dedup</strong><span>desc</span></div></label>
          <label class="module-item"><input type="checkbox" data-module="sfn"><div><strong>SFN</strong><span>desc</span></div></label>
        </div>
      </details>
      <div class="opt-row"><select id="author_style"><option value="normal">Normal</option><option value="vancouver">Vancouver</option></select></div>
      <div><input id="refresh_authors" type="checkbox"></div>
      <div><input id="max_authors" type="number" value="6"></div>
      <div><input id="force_archive_all" type="checkbox"></div>
      <div><input id="create_archive" type="checkbox"></div>
      <div><select id="spacing_style"><option value="">Off</option><option value="wide">Wide</option></select></div>
      <div><select id="sfn_page_conflict"><option value="rp">prefer rp</option><option value="both">both</option><option value="cite">cite</option></select></div>
      <div><input id="strip_issn" type="checkbox"></div>
      <div><input id="upgrade_https" type="checkbox" checked></div>
      <div class="fetch-ids">
        <label class="chip-item"><input type="checkbox" data-id="issn"> ISSN</label>
        <label class="chip-item"><input type="checkbox" data-id="pmid" checked> PMID</label>
        <label class="chip-item"><input type="checkbox" data-id="pmc" checked> PMC</label>
        <label class="chip-item"><input type="checkbox" data-id="s2cid" checked> S2CID</label>
        <label class="chip-item"><input type="checkbox" data-id="qid" checked> QID</label>
      </div>
      <div><input id="crossref_email" type="text"></div>
      <div><input id="ncbi_api_key" type="password"></div>
      <div><input id="semantic_scholar_api_key" type="password"></div>
      <div><input id="auto_update" type="checkbox"></div>
      <div><input id="rename_ref_names" type="checkbox"></div>
      <div><input id="skip_org_authors" type="checkbox"></div>
      <div><input id="cache_ttl_hours" type="number" value="168"></div>
      <div><input id="max_retries" type="number" value="2"></div>
      <div><input id="force" type="checkbox"></div>
      <button id="resetBtn" class="btn-reset">Reset defaults</button>
    </div>`;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("popup initialization", () => {
  it("localizes HTML elements on DOMContentLoaded", async () => {
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    const title = document.querySelector("h2");
    expect(title!.textContent).toBe("WikiCitationExtension");
    const subtitle = document.querySelector(".subtitle");
    expect(subtitle!.textContent).toBe("Citation fixing for English Wikipedia");
  });

  it("loads settings and populates checkboxes", async () => {
    mockStorage["wikifix_settings_wikipedia"] = {
      modules: "expand,cleanup",
      force: false,
      ref_names: false,
      auto_update: false,
      author_style: "normal",
      max_authors: 6,
      ids_to_fetch: "pmid",
      spacing_style: "wide",
    };

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    const expandCb = document.querySelector('[data-module="expand"]') as HTMLInputElement;
    expect(expandCb.checked).toBe(true);
    const cleanupCb = document.querySelector('[data-module="cleanup"]') as HTMLInputElement;
    expect(cleanupCb.checked).toBe(true);
    const sfnCb = document.querySelector('[data-module="sfn"]') as HTMLInputElement;
    expect(sfnCb.checked).toBe(false);
  });

  it("uses defaults when no saved settings", async () => {
    delete mockStorage["wikifix_settings_wikipedia"];

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    const expandCb = document.querySelector('[data-module="expand"]') as HTMLInputElement;
    expect(expandCb.checked).toBe(true);
    const sfnCb = document.querySelector('[data-module="sfn"]') as HTMLInputElement;
    expect(sfnCb.checked).toBe(false);
  });
});

describe("popup saving", () => {
  it("saves settings when a module checkbox changes", async () => {
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    const cb = document.querySelector('[data-module="authors"]') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event("change"));
    await tick(350);

    expect(mockBrowser.storage.local.set).toHaveBeenCalled();
    const saved = (mockBrowser.storage.local.set as any).mock.calls.at(-1)[0];
    expect(saved.wikifix_settings_wikipedia.modules).toContain("authors");
  });

  it("encrypts API keys before saving", async () => {
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    // Mock encrypt to return a hex-like value
    mockCrypto.subtle.encrypt.mockResolvedValue(new Uint8Array(16).buffer);

    const ncbiInput = document.getElementById("ncbi_api_key") as HTMLInputElement;
    ncbiInput.value = "my-secret-key";
    ncbiInput.dispatchEvent(new Event("input"));
    await tick(350);

    expect(mockCrypto.subtle.encrypt).toHaveBeenCalled();
    // The saved value must be the ciphertext, never the plaintext key
    const saved = (mockBrowser.storage.local.set as any).mock.calls.at(-1)[0];
    const stored = saved.wikifix_settings_wikipedia || saved.wikifix_settings;
    expect(JSON.stringify(stored)).not.toContain("my-secret-key");
  });
});

describe("popup reset", () => {
  it("resets to defaults on reset button click", async () => {
    mockStorage["wikifix_settings_wikipedia"] = {
      modules: "authors,sfn",
      force: true,
      ref_names: true,
      spacing_style: "wide",
    };

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();
    mockBrowser.storage.local.set.mockClear();

    document.getElementById("resetBtn")!.click();
    await tick(350);

    const lastCall = (mockBrowser.storage.local.set as any).mock.calls.at(-1)?.[0];
    expect(lastCall.wikifix_settings_wikipedia.force).toBe(false);
    expect(lastCall.wikifix_settings_wikipedia.spacing_style).toBe("");
    expect(lastCall.wikifix_settings_wikipedia.modules).toBe("expand,cleanup,dates,ids,archive,dedup");
  });

  it("restores default spacing after reset", async () => {
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();
    mockBrowser.storage.local.set.mockClear();

    const spacingSelect = document.getElementById("spacing_style") as HTMLSelectElement;
    spacingSelect.value = "wide";
    spacingSelect.dispatchEvent(new Event("change"));
    await tick();

    document.getElementById("resetBtn")!.click();
    await tick();

    expect(spacingSelect.value).toBe("");
  });
});

describe("popup dependency warnings", () => {
  it("blocks checkbox change when parent module is disabled", async () => {
    // Keep SFN unchecked
    const sfnCb = document.querySelector('[data-module="sfn"]') as HTMLInputElement;
    sfnCb.checked = false;

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    // Try to change sfn_page_conflict while SFN module is off
    const conflictSelect = document.getElementById("sfn_page_conflict") as HTMLSelectElement;
    // dispatching focus first stores prevValue in popup.ts
    conflictSelect.dispatchEvent(new Event("focus", { bubbles: true }));
    conflictSelect.value = "both";
    conflictSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();

    // Value should have been reverted to original
    expect(conflictSelect.value).toBe("rp");
  });

  it("blocks author dropdown when authors module is off", async () => {
    const authorsCb = document.querySelector('[data-module="authors"]') as HTMLInputElement;
    authorsCb.checked = false;

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    // dispatching mousedown should not open the select
    const authorStyle = document.getElementById("author_style") as HTMLSelectElement;
    const mouseEvent = new MouseEvent("mousedown", { bubbles: true });
    const preventDefaultSpy = vi.spyOn(mouseEvent, "preventDefault");
    authorStyle.dispatchEvent(mouseEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});

describe("popup wiki variant", () => {
  it("shows wiki variant badge when variant is set", async () => {
    // Set up wiki variant badge element
    const badge = document.createElement("span");
    badge.id = "wiki-badge";
    document.querySelector(".container")!.appendChild(badge);

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    // runtime.sendMessage returns { variant: "wikipedia" } by default
    expect(badge.textContent).toBe("wikipedia");
  });

  it("disables sfn module on non-Wikipedia wikis", async () => {
    // Override sendMessage for this test
    mockBrowser.runtime.sendMessage = vi.fn(async () => ({ variant: "fandom" }));

    // Add badge
    const badge = document.createElement("span");
    badge.id = "wiki-badge";
    document.querySelector(".container")!.appendChild(badge);

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    const sfnCb = document.querySelector('[data-module="sfn"]') as HTMLInputElement;
    expect(sfnCb.disabled).toBe(true);
    expect(sfnCb.checked).toBe(false);
  });
});

describe("popup edge cases", () => {
  it("handles corrupt JSON in stored settings gracefully", async () => {
    mockStorage["wikifix_settings_wikipedia"] = "corrupt-json-not-an-object";

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    // Should fall back to defaults without crashing
    const expandCb = document.querySelector('[data-module="expand"]') as HTMLInputElement;
    expect(expandCb).toBeTruthy();
  });

  it("handles empty settings gracefully", async () => {
    mockStorage["wikifix_settings_wikipedia"] = {};

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();

    // Should not crash with empty settings
    const expandCb = document.querySelector('[data-module="expand"]') as HTMLInputElement;
    expect(expandCb.checked).toBe(true); // default
  });
});
