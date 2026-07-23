import { t } from "./i18n";
import { CSS, WAND_ICON, WAND_ICON_DATAURI, escapeHtml, formatStatsSummary, describeChanges } from "./format";
import { findEditor, getMediaWiki } from "../editor-adapter";
import { editPage } from "./api";
import { isEditPage } from "../wiki-detector";
import type { ProcessStats, ProcessingError } from "./types";

export const BUTTON_ID = "wikifix-btn";
export const PANEL_ID = "wikifix-panel";
export const NOTE_ID = "wikifix-note";

// ── Style injection ────────────────────────────────────────────────

export function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ── Button helpers ─────────────────────────────────────────────────

function cmSelector(): string {
  return ".cm-editor, .CodeMirror";
}

function updateButtonLabel(): void {
  const btn = document.getElementById(BUTTON_ID) as HTMLElement | null;
  if (!btn) return;
  const editor = findEditor();
  let label: string;
  if (editor) {
    const sel = editor.getSelection();
    if (sel && sel.text.trim().length > 0) {
      label = t("btnFixSelection");
    } else {
      label = t("btnFixCitations");
    }
  } else {
    label = t("btnFixCitations");
  }
  btn.innerHTML = `${WAND_ICON} ${label}`;
  btn.setAttribute("aria-label", label);
}

function addBtnToCm(cmEditor: HTMLElement): void {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute !important;top:4px !important;right:4px !important;z-index:100 !important;";
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.type = "button";
  btn.innerHTML = `${WAND_ICON} ${t("btnFixCitations")}`;
  btn.setAttribute("aria-label", t("btnFixCitations"));
  btn.addEventListener("click", onClick);
  btn.classList.add("wikifix-toolbar-btn");
  wrapper.appendChild(btn);
  cmEditor.appendChild(wrapper);
  updateButtonLabel();
}

function addBtnToToolbar(toolbar: HTMLElement): void {
  const wrapper = document.createElement("span");
  wrapper.style.cssText = "display:inline-block;padding:6px 4px;vertical-align:middle;";
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.type = "button";
  btn.innerHTML = `${WAND_ICON} ${t("btnFixCitations")}`;
  btn.setAttribute("aria-label", t("btnFixCitations"));
  btn.addEventListener("click", onClick);
  btn.classList.add("wikifix-toolbar-btn");
  wrapper.appendChild(btn);
  toolbar.appendChild(wrapper);
  updateButtonLabel();
}

function findToolbar(): HTMLElement | null {
  const selectors = [
    "#wikiEditor-ui-toolbar",
    ".wikiEditor-ui-toolbar",
    ".editor-toolbar",
    ".oo-ui-toolbar",
    ".page-header__actions",
    ".wiki-navigation-top",
    ".WikiaPageHeader",
    ".wds-toolbar-menu",
    ".wds-toolbar",
    ".cosmos-toolbar",
    ".skin-cosmos-toolbar",
    ".oasis-toolbar",
    ".skin-oasis-toolbar",
    ".actions-toolbar",
    ".ve-ui-toolbar",
    ".mw-editsection-bracket",
    ".mw-toolbar",
    ".toolbar",
    ".editTools",
    '#editpage-toolbar',
    '#toolbar',
    ".mw-editor-toolbar",
    ".wikiEditor-ui .wikiEditor-ui-top",
    '.skin-vector-toolbar',
    '.skin-timeless-toolbar',
    '.skin-monobook-toolbar',
    '.minerva-editor-toolbar',
    /* Generic wildcards */
    '[class*="wikiEditor"]',
    '[id*="wikiEditor"]',
    '[id*="toolbar"]',
    '[class*="wikieditor"]',
    // Broad matches near the top of #editform
    '#editform [class*="ui-toolbar"]',
    '#editform [role="toolbar"]',
    '#editform .wikiEditor-ui-top',
    ".page-toolbar",
    '[role="toolbar"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }

  const allToolbars = document.querySelectorAll<HTMLElement>('[class*="toolbar"], [class*="Toolbar"]');
  const editForm = document.getElementById("editform");
  for (const tb of allToolbars) {
    if (editForm?.contains(tb) || document.getElementById("wpTextbox1")?.closest("form")?.contains(tb)) {
      return tb;
    }
  }

  const veSurface = document.querySelector<HTMLElement>('.ve-ui-surface');
  if (veSurface && veSurface.querySelector('[role="toolbar"], .oo-ui-toolbar')) {
    const tb = veSurface.querySelector<HTMLElement>('[role="toolbar"], .oo-ui-toolbar');
    if (tb) return tb;
  }

  return null;
}

import { onClick } from "../content";

export function addButton(): void {
  if (document.getElementById(BUTTON_ID)) return;
  if (!isEditPage()) return;

  const mw = getMediaWiki();

  // Register hooks for later relocation
  if (mw?.hook) {
    try {
      mw.hook("wikiEditor.toolbarReady").add(function (...args: unknown[]) {
        const $textarea = args[0] as any;
        if (typeof $textarea?.wikiEditor === "function") {
          try {
            $textarea.wikiEditor("addToToolbar", {
              section: "main",
              group: "insert",
              tools: {
                wikifix: {
                  label: t("btnFixCitations"),
                  type: "button",
                  icon: WAND_ICON_DATAURI,
                  action: { type: "callback", execute: onClick },
                },
              },
            });
            const old = document.getElementById(BUTTON_ID);
            if (old) old.remove();
            return;
          } catch (e) {
            console.warn("[WikiCitationExtension] addToToolbar:", e);
          }
        }
      });
    } catch { /* ignore */ }

    try {
      mw.hook("ext.CodeMirror.ready").add(function (...args: unknown[]) {
        const cm = args[0] as any;
        const dom = cm?.dom || document.querySelector(".cm-editor");
        if (dom) {
          const old = document.getElementById(BUTTON_ID);
          if (old) old.remove();
          const wrapper = document.createElement("div");
          wrapper.style.cssText = "position:absolute !important;top:4px !important;right:4px !important;z-index:100 !important;";
          const btn = document.createElement("button");
          btn.id = BUTTON_ID;
          btn.type = "button";
          btn.innerHTML = `${WAND_ICON} ${t("btnFixCitations")}`;
          btn.setAttribute("aria-label", t("btnFixCitations"));
          btn.addEventListener("click", onClick);
          btn.classList.add("wikifix-toolbar-btn");
          wrapper.appendChild(btn);
          dom.appendChild(wrapper);
        }
      });
    } catch { /* ignore */ }
  }

  // Immediate: try toolbar, then CM, then plain textarea
  const toolbar = findToolbar();
  if (toolbar) { addBtnToToolbar(toolbar); return; }
  const cmEl = document.querySelector<HTMLElement>(cmSelector());
  if (cmEl) { addBtnToCm(cmEl); return; }

  // Plain textarea: place button inside #editform, before the textarea
  const editForm = document.getElementById("editform");
  const ta = document.getElementById("wpTextbox1");
  if (editForm && ta) {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.innerHTML = `${WAND_ICON} ${t("btnFixCitations")}`;
    btn.setAttribute("aria-label", t("btnFixCitations"));
    btn.addEventListener("click", onClick);
    btn.classList.add("wikifix-toolbar-btn");
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;justify-content:flex-end;padding:4px 0;";
    wrapper.appendChild(btn);
    editForm.insertBefore(wrapper, ta);
    return;
  }

  // MutationObserver for late-loading CM / toolbar relocation
  let observerTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (observerTimer) return;
    observerTimer = setTimeout(() => {
      observerTimer = null;
      const tb = findToolbar();
      if (tb) {
        const old = document.getElementById(BUTTON_ID);
        if (old && !tb.contains(old)) { old.remove(); observer.disconnect(); addBtnToToolbar(tb); }
        else if (!old) { observer.disconnect(); addBtnToToolbar(tb); }
        return;
      }
      const cm = document.querySelector<HTMLElement>(cmSelector());
      if (cm) {
        const old = document.getElementById(BUTTON_ID);
        if (old) old.remove();
        observer.disconnect();
        addBtnToCm(cm);
        return;
      }
    }, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Safety timeout: fallback after 20s if no CM/toolbar appeared
  setTimeout(() => {
    observer.disconnect();
    if (document.getElementById(BUTTON_ID)) return;

    // One last check
    const cmEl2 = document.querySelector<HTMLElement>(cmSelector());
    if (cmEl2?.parentElement) { addBtnToCm(cmEl2); return; }

    // Dump DOM state for debugging
    console.debug("[WikiCitationExtension] DOM state:", {
      cmEditor: !!document.querySelector(cmSelector()),
      toolbar: !!findToolbar(),
      wpTextbox1: !!document.getElementById("wpTextbox1"),
      editForm: !!document.getElementById("editform"),
      firstHeading: !!document.querySelector("#firstHeading, .mw-page-title-main, h1"),
    });

    // Try MediaWiki portlet link API (works on all skins, uses MW's own toolbar)
    try {
      const mwUtil = getMediaWiki()?.util;
      if (typeof mwUtil?.addPortletLink === "function") {
        const link = mwUtil.addPortletLink("p-cactions", "#", t("btnFixCitations"), "wikifix-btn");
        if (link) {
          link.addEventListener("click", (e: Event) => { e.preventDefault(); onClick(); });
          return;
        }
      }
    } catch { /* ignore */ }

    // Absolute fallback: fixed position at top-right of viewport.
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.innerHTML = `${WAND_ICON} ${t("btnFixCitations")}`;
    btn.setAttribute("aria-label", t("btnFixCitations"));
    btn.addEventListener("click", onClick);
    btn.classList.add("wikifix-toolbar-btn");
    btn.style.cssText = "position:fixed !important;top:10px !important;right:10px !important;z-index:10000 !important;";
    document.body.appendChild(btn);
  }, 20000);

  // Track selection changes to update button label
  function onSelectionChange(): void {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    updateButtonLabel();
  }
  document.addEventListener("mouseup", onSelectionChange);
  document.addEventListener("keyup", (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Shift"].includes(e.key)) {
      onSelectionChange();
    }
  });
  // Clean up on page navigation so listeners don't accumulate
  window.addEventListener("beforeunload", () => {
    document.removeEventListener("mouseup", onSelectionChange);
  });
}

// ── Progress/notification UI ───────────────────────────────────────

import { _abortController, _undoEditor, _undoOriginalText } from "./state";

export function showProgress(current: number, total: number, message: string, barFill?: number): void {
  let bar = document.getElementById("wikifix-progress-bar");
  let label = document.getElementById("wikifix-progress-label");
  if (!bar) {
    const progressDiv = document.createElement("div");
    progressDiv.className = "wikifix-progress";
    progressDiv.id = "wikifix-progress";
    progressDiv.innerHTML = `
      <div class="wikifix-progress-bar-wrapper">
        <div class="wikifix-progress-bar"><div class="wikifix-progress-fill" id="wikifix-progress-bar" style="width:0%"></div></div>
      </div>
      <span class="wikifix-progress-label" id="wikifix-progress-label">Starting...</span>
      <button class="wikifix-progress-cancel" id="wikifix-progress-cancel" type="button">Cancel</button>`;
    const btn = document.getElementById(BUTTON_ID);
    if (btn?.parentElement) {
      btn.parentElement.insertBefore(progressDiv, btn.nextSibling);
    } else {
      document.body.appendChild(progressDiv);
    }
    // Wire cancel button
    document.getElementById("wikifix-progress-cancel")?.addEventListener("click", () => {
      _abortController?.abort();
    });
    bar = document.getElementById("wikifix-progress-bar") as HTMLDivElement;
    label = document.getElementById("wikifix-progress-label") as HTMLSpanElement;
  }
  if (bar) {
    const pct = barFill != null ? barFill : (total > 0 ? Math.round((current / total) * 100) : 0);
    bar.style.width = `${Math.min(100, pct)}%`;
  }
  if (label) label.textContent = message;
}

export function hideProgress(): void {
  const el = document.getElementById("wikifix-progress");
  if (el) el.remove();
}

export function showSuccessWithUndo(message: string, desc: string): void {
  const html = desc + `<button class="wikifix-undo-btn">Undo</button>`;
  showNotification("success", message, html);
  // Wire undo button via event delegation on the notification
  const note = document.getElementById(NOTE_ID);
  if (!note) return;
  const handler = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains("wikifix-undo-btn")) {
      if (_undoEditor && _undoOriginalText !== null) {
        _undoEditor.setText(_undoOriginalText);
        const ta = document.getElementById("wpTextbox1") as HTMLTextAreaElement | null;
        if (ta) ta.value = _undoOriginalText;
        note.style.display = "none";
      }
    }
  };
  // Use capturing to fire before any other close handlers
  note.addEventListener("click", handler);
  // Clean up the listener when the note is closed
  const cleanup = () => {
    note.removeEventListener("click", handler);
    note.removeEventListener("webkitAnimationEnd", cleanup);
  };
  note.addEventListener("webkitAnimationEnd", cleanup);
}

export function showNotification(type: "success" | "error" | "info", message: string, html?: string): void {
  const panel = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (panel && panel.style.display !== "none") panel.style.display = "none";
  let note = document.getElementById(NOTE_ID) as HTMLDivElement;
  if (!note) {
    note = document.createElement("div");
    note.id = NOTE_ID;
    note.setAttribute("role", "alert");
    note.setAttribute("aria-live", "polite");
    document.body.appendChild(note);
  }
  note.className = `wikifix-${type}`;
  note.textContent = "";
  if (html) {
    const desc = document.createElement("div");
    desc.innerHTML = html;
    note.appendChild(desc);
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = "margin-top:8px;padding:4px 10px;background:#3366cc;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:12px";
    closeBtn.addEventListener("click", () => { note.style.display = "none"; });
    note.appendChild(closeBtn);
  } else {
    note.textContent = message;
  }
  note.style.display = "block";
  if (!html) {
    setTimeout(() => { note.style.display = "none"; }, 6000);
  }
  note.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── Panel types and constants ──────────────────────────────────────

export const DOCK_CORNERS = ["tr", "tl", "br", "bl"] as const;
export type DockCorner = typeof DOCK_CORNERS[number];

export const DOCKS: Record<DockCorner, { top: string; right: string; bottom: string; left: string }> = {
  tr: { top: "10px", right: "10px", bottom: "auto", left: "auto" },
  tl: { top: "10px", right: "auto", bottom: "auto", left: "10px" },
  br: { top: "auto", right: "10px", bottom: "10px", left: "auto" },
  bl: { top: "auto", right: "auto", bottom: "10px", left: "10px" },
};

export interface PanelState {
  docked: DockCorner | null;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
}

// ── Panel build/lifecycle ──────────────────────────────────────────

let _panelCleanup: (() => void) | null = null;

function getOrCreatePanel(): ReturnType<typeof buildPanel> {
  const existing = document.getElementById(PANEL_ID);
  if (existing) existing.remove();
  return buildPanel();
}

/** Reset panel — exported for testing */
export function resetPanel(): void {
  _panelCleanup?.();
  _panelCleanup = null;
  const existing = document.getElementById(PANEL_ID);
  if (existing) existing.remove();
}

const PANEL_STATE_KEY = "wikifix_panel_state";

function buildPanel(): { panel: HTMLDivElement; state: PanelState; show: (v: boolean) => void } {
  const existing = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", t("panelTitle"));

  let saved: Partial<PanelState> | null = null;
  try {
    const savedJson = localStorage.getItem(PANEL_STATE_KEY);
    if (savedJson) saved = JSON.parse(savedJson);
  } catch { /* corrupt JSON — use defaults */ }

  const state: PanelState = {
    docked: saved?.docked ?? "tr",
    x: saved?.x ?? window.innerWidth - 560,
    y: saved?.y ?? 60,
    w: saved?.w ?? 540,
    h: saved?.h ?? 0,
    minimized: saved?.minimized ?? false,
  };

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(state)); } catch { /* quota */ }
    }, 300);
  }

  DOCK_CORNERS.forEach(c => {
    const ind = document.createElement("div");
    ind.className = "wikifix-dock-indicator";
    ind.id = `${PANEL_ID}-dock-${c}`;
    ind.setAttribute("aria-hidden", "true");
    const pos = DOCKS[c];
    Object.assign(ind.style, { ...pos, width: "160px", height: "100px" });
    document.body.appendChild(ind);
  });

  const header = document.createElement("div");
  header.className = "wikifix-header";

  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let startX = 0, startY = 0;

  function startDrag(e: MouseEvent) {
    if ((e.target as HTMLElement).closest(".wikifix-header-btn")) return;
    isDragging = true;
    state.docked = null;
    panel.classList.remove("wikifix-docked");
    const rect = panel.getBoundingClientRect();
    startX = rect.left; startY = rect.top;
    dragStartX = e.clientX; dragStartY = e.clientY;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    e.preventDefault();
  }

  function onDrag(e: MouseEvent) {
    if (!isDragging) return;
    state.x = startX + e.clientX - dragStartX;
    state.y = startY + e.clientY - dragStartY;
    applyPosition();
    showDockIndicators(e.clientX, e.clientY);
  }

  function stopDrag(e: MouseEvent) {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    hideDockIndicators();
    const snap = findClosestDock(e.clientX, e.clientY);
    if (snap) {
      state.docked = snap;
      panel.classList.add("wikifix-docked");
      applyPosition();
    }
    scheduleSave();
  }

  function showDockIndicators(mx: number, my: number) {
    DOCK_CORNERS.forEach(c => {
      const el = document.getElementById(`${PANEL_ID}-dock-${c}`)!;
      el.classList.toggle("active", findClosestDock(mx, my) === c);
    });
  }

  function hideDockIndicators() {
    DOCK_CORNERS.forEach(c => {
      const dockEl = document.getElementById(`${PANEL_ID}-dock-${c}`);
      if (dockEl) dockEl.classList.remove("active");
    });
  }

  function findClosestDock(mx: number, my: number): DockCorner | null {
    const threshold = 100;
    const ww = window.innerWidth, wh = window.innerHeight;
    const fromLeft = mx, fromRight = ww - mx, fromTop = my, fromBottom = wh - my;
    if (Math.min(fromLeft, fromRight, fromTop, fromBottom) > threshold) return null;
    const horiz = fromLeft < fromRight ? "l" : "r";
    const vert = fromTop < fromBottom ? "t" : "b";
    return (vert + horiz) as DockCorner;
  }

  function applyPosition() {
    if (state.docked) {
      const pos = DOCKS[state.docked];
      Object.assign(panel.style, {
        top: pos.top, right: pos.right, bottom: pos.bottom, left: pos.left,
        transform: "none",
      });
    } else {
      panel.style.top = `${state.y}px`;
      panel.style.left = `${state.x}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }
  }

  const btnGroup = document.createElement("div");
  btnGroup.style.cssText = "display:flex;align-items:center;gap:2px";

  function cycleDock() {
    const idx = DOCK_CORNERS.indexOf(state.docked || "tr");
    state.docked = DOCK_CORNERS[(idx + 1) % DOCK_CORNERS.length];
    panel.classList.add("wikifix-docked");
    applyPosition();
    updateDockBtn();
    scheduleSave();
  }

  const dockBtn = btnGroup.appendChild(Object.assign(document.createElement("button"), {
    className: "wikifix-header-btn",
    innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>',
    title: t("btnCycleDock"),
    "aria-label": t("btnCycleDock"),
    onclick: cycleDock,
  }));

  function updateDockBtn() {
    const corner = state.docked || "tr";
    dockBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="${corner.includes("l") ? 3 : 9}" y="${corner.includes("t") ? 3 : 9}" width="12" height="12" rx="2"/></svg>`;
  }

  function toggleMin() {
    state.minimized = !state.minimized;
    body.style.display = state.minimized ? "none" : "block";
    panel.style.height = state.minimized ? "38px" : (state.h ? `${state.h}px` : "");
    minBtn.innerHTML = state.minimized
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 15 12 9 18 15"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
    scheduleSave();
  }

  const minBtn = btnGroup.appendChild(Object.assign(document.createElement("button"), {
    className: "wikifix-header-btn",
    innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 15 12 9 18 15"/></svg>',
    title: t("btnMinimize"),
    "aria-label": t("btnMinimize"),
    onclick: toggleMin,
  }));

  btnGroup.appendChild(Object.assign(document.createElement("button"), {
    className: "wikifix-header-btn",
    innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    title: t("btnClose"),
    "aria-label": t("btnClose"),
    onclick: () => { panel.style.display = "none"; },
  }));

  header.appendChild(Object.assign(document.createElement("h3"), { textContent: "WikiCitationExtension" }));
  header.appendChild(btnGroup);
  header.addEventListener("mousedown", startDrag);

  const body = document.createElement("div");
  body.className = "wikifix-body";

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "wikifix-resize-handle";
  resizeHandle.setAttribute("aria-hidden", "true");

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(resizeHandle);
  document.body.appendChild(panel);

  let isResizing = false;
  let resizeStartX = 0, resizeStartY = 0, resizeStartW = 540, resizeStartH = 0;

  resizeHandle.addEventListener("mousedown", (e) => {
    isResizing = true;
    resizeStartX = e.clientX; resizeStartY = e.clientY;
    resizeStartW = panel.offsetWidth;
    resizeStartH = body.offsetHeight;
    document.addEventListener("mousemove", onResize);
    document.addEventListener("mouseup", stopResize);
    e.stopPropagation();
    e.preventDefault();
  });

  function onResize(e: MouseEvent) {
    if (!isResizing) return;
    state.w = Math.max(320, resizeStartW + e.clientX - resizeStartX);
    state.h = Math.max(200, resizeStartH + e.clientY - resizeStartY);
    panel.style.width = `${state.w}px`;
    body.style.maxHeight = `${state.h}px`;
  }

  function stopResize() {
    isResizing = false;
    document.removeEventListener("mousemove", onResize);
    document.removeEventListener("mouseup", stopResize);
    scheduleSave();
  }

  function showPanel(visible: boolean) {
    if (visible) {
      panel.style.display = "block";
      if (state.docked) panel.classList.add("wikifix-docked");
      if (state.minimized) {
        body.style.display = "none";
        panel.style.height = "38px";
        minBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
      }
      applyPosition();
    } else {
      panel.style.display = "none";
    }
  }

  _panelCleanup = () => {
    if (isDragging) {
      document.removeEventListener("mousemove", onDrag);
      document.removeEventListener("mouseup", stopDrag);
    }
    if (isResizing) {
      document.removeEventListener("mousemove", onResize);
      document.removeEventListener("mouseup", stopResize);
    }
    DOCK_CORNERS.forEach(c => {
      document.getElementById(`${PANEL_ID}-dock-${c}`)?.remove();
    });
  };

  return { panel, state, show: showPanel };
}

// ── Diff panel ─────────────────────────────────────────────────────

export function buildStructuredDiffHtml(original: string, modified: string): string {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const hd: string[] = [];
  hd.push('<table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:12px;background:#1e1e1e;border:1px solid #333;border-radius:4px">');
  hd.push('<thead><tr><th style="width:48%;padding:4px 8px;background:#2a2a2a;border-bottom:1px solid #444;color:#999;text-align:left">Original</th><th style="width:4px;padding:0"></th><th style="width:48%;padding:4px 8px;background:#2a2a2a;border-bottom:1px solid #444;color:#999;text-align:left">Modified</th></tr></thead><tbody>');
  const maxLines = Math.max(origLines.length, modLines.length);
  for (let i = 0; i < maxLines; i++) {
    const o = origLines[i];
    const m = modLines[i];
    if (o == null) {
      hd.push(`<tr><td style="padding:1px 8px;color:#555;background:#1a1a1a"></td><td style="width:4px;background:#00af89"></td><td style="padding:1px 8px;color:#d4d4d4;background:#1a3a32">${escapeHtml(m)}</td></tr>`);
    } else if (m == null) {
      hd.push(`<tr><td style="padding:1px 8px;color:#d4d4d4;background:#3a1a1a">${escapeHtml(o)}</td><td style="width:4px;background:#d33"></td><td style="padding:1px 8px;color:#555;background:#1a1a1a"></td></tr>`);
    } else if (o === m) {
      hd.push(`<tr><td style="padding:1px 8px;color:#999;background:#1e1e1e">${escapeHtml(o)}</td><td style="width:4px;background:#333"></td><td style="padding:1px 8px;color:#999;background:#1e1e1e">${escapeHtml(m)}</td></tr>`);
    } else {
      hd.push(`<tr><td style="padding:1px 8px;color:#d4d4d4;background:#3a1a1a">${escapeHtml(o)}</td><td style="width:4px;background:#d33"></td><td style="padding:1px 8px;color:#d4d4d4;background:#1a3a32">${escapeHtml(m)}</td></tr>`);
    }
  }
  hd.push('</tbody></table>');
  return hd.join('\n');
}

import { getEditUrl } from "../content";

export function showDiffPanel(fixed: string, diff: string, title: string, stats?: ProcessStats, apiBase?: string, errors?: ProcessingError[]): void {
  const { panel: p, show } = getOrCreatePanel();
  const desc = stats ? formatStatsSummary(stats) : describeChanges("", fixed).html;
  const link = getEditUrl(title);
  const diffHtml = buildStructuredDiffHtml(diff.replace(/^--- original\n\+\+\+ modified\n/, '').split('\n').map(l => l.replace(/^[+-] /, '').replace(/^[+-]/, '')).join('\n'), fixed);

  // Build error section
  let errorHtml = '';
  if (errors && errors.length > 0) {
    const errItems = errors.map((e, i) => `
      <div style="margin-bottom:8px;padding:8px;background:#3a1a1a;border:1px solid #d33;border-radius:4px">
        <div style="color:#e88;font-weight:600;font-size:12px;margin-bottom:4px">Error #${i + 1}: ${escapeHtml(e.message)}</div>
        <pre style="margin:0;font-size:11px;color:#d4d4d4;white-space:pre-wrap;word-break:break-all">${escapeHtml(e.raw.substring(0, 200))}${e.raw.length > 200 ? '...' : ''}</pre>
      </div>`).join('');
    errorHtml = `
      <div style="margin-bottom:12px">
        <div style="color:#e88;font-weight:600;font-size:13px;margin-bottom:6px">${errors.length} citation(s) could not be processed</div>
        ${errItems}
      </div>`;
  }

  const saveBtn = apiBase ? `<button class="wikifix-btn wikifix-btn-primary" id="wikifix-save-api">${WAND_ICON} ${t("btnSaveChanges")}</button>` : '';
  const body = p.querySelector(".wikifix-body");
  if (body) body.innerHTML = `
    <div class="wikifix-summary">${desc}</div>
    ${errorHtml}
    <div style="margin-bottom:8px;max-height:400px;overflow-y:auto">${diffHtml}</div>
    <div class="wikifix-actions">
      ${saveBtn}
      <button class="wikifix-btn wikifix-btn-primary" onclick="navigator.clipboard.writeText(${JSON.stringify(fixed)}).then(t=>{this.textContent='${t("copiedToClipboard")}'})">${WAND_ICON} ${t("btnCopyWikitext")}</button>
      <a href="${link}" target="_blank" class="wikifix-btn wikifix-btn-primary">${WAND_ICON} ${t("btnOpenEditor")}</a>
    </div>`;
  show(true);
  if (apiBase) {
    const saveButton = document.getElementById("wikifix-save-api") as HTMLButtonElement | null;
    if (saveButton) {
      saveButton.addEventListener("click", async () => {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        const ok = await editPage(apiBase, title, fixed, "chore: fixed citation formatting");
        if (ok) {
          saveButton.textContent = "✓ " + t("saved");
        } else {
          saveButton.textContent = "✗ " + t("errorProcessing", "Save failed");
          saveButton.disabled = false;
        }
      });
    }
  }
}
