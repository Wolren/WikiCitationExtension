import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub browser API
const mockGetMessage = vi.fn((k: string) => {
  const m: Record<string, string> = {
    btnCopyWikitext: "Copy wikitext",
    btnOpenEditor: "Open editor",
    statsChanged: "$1 citation changed",
    statsChangedPlural: "$1 citations changed",
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

Element.prototype.scrollIntoView = vi.fn();

import { showDiffPanel, resetPanel } from "../src/content";

describe("buildPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    resetPanel();
  });

  it("creates panel with correct structure", () => {
    showDiffPanel("wikitext", "diff", "Test_Page");
    const panel = document.getElementById("wikifix-panel");
    expect(panel).not.toBeNull();
    expect(panel!.querySelector(".wikifix-header")).not.toBeNull();
    expect(panel!.querySelector(".wikifix-body")).not.toBeNull();
    expect(panel!.querySelector(".wikifix-resize-handle")).not.toBeNull();
    expect(panel!.querySelectorAll(".wikifix-header-btn").length).toBe(3);
  });

  it("starts docked to top-right by default", () => {
    showDiffPanel("wikitext", "diff", "Test_Page");
    const panel = document.getElementById("wikifix-panel")!;
    expect(panel.style.top).toBe("10px");
    expect(panel.style.right).toBe("10px");
    expect(panel.classList.contains("wikifix-docked")).toBe(true);
  });

  it("shows panel as visible after creation", () => {
    showDiffPanel("wikitext", "diff", "Test_Page");
    const panel = document.getElementById("wikifix-panel")!;
    expect(panel.style.display).toBe("block");
  });

  it("restores saved dock state from localStorage", () => {
    localStorage.setItem("wikifix_panel_state", JSON.stringify({ docked: "bl" }));
    showDiffPanel("wikitext", "diff", "Test_Page");
    const panel = document.getElementById("wikifix-panel")!;
    expect(panel.style.bottom).toBe("10px");
    expect(panel.style.left).toBe("10px");
    expect(panel.classList.contains("wikifix-docked")).toBe(true);
  });

  it("restores saved minimized state from localStorage", () => {
    localStorage.setItem("wikifix_panel_state", JSON.stringify({ minimized: true }));
    showDiffPanel("wikitext", "diff", "Test_Page");
    const body = document.querySelector(".wikifix-body")! as HTMLElement;
    const panel = document.getElementById("wikifix-panel")!;
    expect(body.style.display).toBe("none");
    expect(panel.style.height).toBe("38px");
  });

  it("falls back to default dock when localStorage is corrupt", () => {
    localStorage.setItem("wikifix_panel_state", "{bad json");
    showDiffPanel("wikitext", "diff", "Test_Page");
    const panel = document.getElementById("wikifix-panel")!;
    expect(panel.style.top).toBe("10px");
    expect(panel.style.right).toBe("10px");
  });

  it("panel shows correct diff content", () => {
    showDiffPanel("line1\nline2\ntest", "diff content", "Test_Page");
    const body = document.querySelector(".wikifix-body")!;
    expect(body.innerHTML).toContain("line1");
    expect(body.innerHTML).toContain("line2");
    expect(body.innerHTML).toContain("Copy wikitext");
    expect(body.innerHTML).toContain("Open editor");
  });

  it("dock cycle button rotates through corners", () => {
    showDiffPanel("text", "diff", "Test_Page");
    const panel = document.getElementById("wikifix-panel")!;
    const dockBtns = document.querySelectorAll(".wikifix-header-btn");
    const dockBtn = dockBtns[0] as HTMLButtonElement;

    expect(panel.style.top).toBe("10px");
    expect(panel.style.right).toBe("10px");

    dockBtn.click();
    expect(panel.style.top).toBe("10px");
    expect(panel.style.left).toBe("10px");

    dockBtn.click();
    expect(panel.style.bottom).toBe("10px");
    expect(panel.style.right).toBe("10px");

    dockBtn.click();
    expect(panel.style.bottom).toBe("10px");
    expect(panel.style.left).toBe("10px");

    dockBtn.click();
    expect(panel.style.top).toBe("10px");
    expect(panel.style.right).toBe("10px");
  });

  it("minimize button toggles body visibility and panel height", () => {
    showDiffPanel("text", "diff", "Test_Page");
    const minBtn = document.querySelectorAll(".wikifix-header-btn")[1] as HTMLButtonElement;
    const body = document.querySelector(".wikifix-body")! as HTMLElement;
    const panel = document.getElementById("wikifix-panel")!;

    expect(body.style.display).not.toBe("none");

    minBtn.click();
    expect(body.style.display).toBe("none");
    expect(panel.style.height).toBe("38px");

    minBtn.click();
    expect(body.style.display).toBe("block");
    expect(panel.style.height).not.toBe("38px");
  });

  it("close button hides the panel", () => {
    showDiffPanel("text", "diff", "Test_Page");
    const closeBtn = document.querySelectorAll(".wikifix-header-btn")[2] as HTMLButtonElement;
    const panel = document.getElementById("wikifix-panel")!;
    expect(panel.style.display).toBe("block");
    closeBtn.click();
    expect(panel.style.display).toBe("none");
  });

  it("resetPanel removes the panel from DOM", () => {
    showDiffPanel("text", "diff", "Test_Page");
    expect(document.getElementById("wikifix-panel")).not.toBeNull();
    resetPanel();
    expect(document.getElementById("wikifix-panel")).toBeNull();
  });

  it("showDiffPanel replaces existing panel", () => {
    showDiffPanel("first text", "diff", "Test_Page");
    const body = document.querySelector(".wikifix-body")!;
    expect(body.innerHTML).toContain("first text");

    showDiffPanel("second text", "diff2", "Test_Page");
    const bodies = document.querySelectorAll(".wikifix-body");
    expect(bodies.length).toBe(1);
    expect(bodies[0].innerHTML).toContain("second text");
  });

  it("dock indicators are created for each corner", () => {
    showDiffPanel("text", "diff", "Test_Page");
    expect(document.getElementById("wikifix-panel-dock-tr")).not.toBeNull();
    expect(document.getElementById("wikifix-panel-dock-tl")).not.toBeNull();
    expect(document.getElementById("wikifix-panel-dock-br")).not.toBeNull();
    expect(document.getElementById("wikifix-panel-dock-bl")).not.toBeNull();
  });

  it("panel persists across showDiffPanel calls with same state", () => {
    showDiffPanel("text", "diff", "Test_Page");
    showDiffPanel("more text", "diff2", "Test_Page");
    const panel2 = document.getElementById("wikifix-panel")!;
    expect(panel2).not.toBeNull();
  });

  it("does not create duplicate panels", () => {
    showDiffPanel("text", "diff", "Test_Page");
    showDiffPanel("more", "diff2", "Test_Page");
    const panels = document.querySelectorAll("#wikifix-panel");
    expect(panels.length).toBe(1);
  });
});
