import { findCitations, parseParams, generateRefName, escapeRe, detectCitationType } from "./lib/wikitext";
import { expandCitation } from "./lib/expand";
import { cleanupCitation, cleanupCitationBody, addArchiveUrls } from "./lib/cleanup";
import { normalizeDate } from "./lib/dates";
import { normalizeSpacing, sortParams } from "./lib/spacing";
import { generateDiff } from "./lib/diff";
import { convertToSfn, type SfnOptions } from "./lib/sfn";
import { processAuthors } from "./lib/authors";
import { setApiKeys, fetchCrossrefAuthors, searchNCBIPmid, searchNCBIPmc, fetchSemanticScholar, fetchOpenAlex, saveWayback, editPage } from "./lib/api";
import { decrypt, isEncrypted } from "./lib/crypto";
import type { StorageSettings, Citation, ProgressCallback, ProcessResult, ProcessStats, ProcessingError } from "./lib/types";
import { detectWiki, isEditPage, getPageTitle as getWikiPageTitle, probeApiUrl, getDisabledModules, getSettingsKey } from "./wiki-detector";
import { findEditor, waitForEditor, isVisualEditorActive, findVeSourceTab, type EditorHandle } from "./editor-adapter";
export { escapeRe };

let _isOffline = false;

function t(key: string, ...subs: (string | number)[]): string {
  try {
    let msg = browser.i18n.getMessage(key);
    if (!msg) return key;
    for (let i = 0; i < subs.length; i++) msg = msg.replace(`$${i + 1}`, String(subs[i]));
    return msg;
  } catch {
    return key;
  }
}

const BUTTON_ID = "wikifix-btn";
const PANEL_ID = "wikifix-panel";
const NOTE_ID = "wikifix-note";
const STORAGE_KEY = "wikifix_settings";

const DEFAULT_MODULES = "expand,cleanup,dates,ids,archive,dedup";
const PANEL_STATE_KEY = "wikifix_panel_state";

const WAND_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';

let _panelCleanup: (() => void) | null = null;

const CSS = `
.wikifix-progress {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 12px; font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #555; background: #f8f9fa;
  border-bottom: 1px solid #eaecf0;
}
.wikifix-progress-bar {
  flex: 1; height: 6px; background: #eaecf0; border-radius: 3px; overflow: hidden;
}
.wikifix-progress-fill {
  height: 100%; background: #3366cc; border-radius: 3px;
  transition: width 150ms ease;
}
.wikifix-progress-label { white-space: nowrap; color: #72777d; }
.wikifix-progress-bar-wrapper {
  width: 120px; display: flex; align-items: center;
}
.wikifix-progress-cancel {
  background: none; border: 1px solid #a2a9b1; color: #72777d;
  cursor: pointer; border-radius: 2px; padding: 1px 8px;
  font-size: 11px; line-height: 1.5; font-family: inherit;
  white-space: nowrap; flex-shrink: 0;
}
.wikifix-progress-cancel:hover { background: #eaecf0; color: #202122; }

.wikifix-undo-btn {
  display: inline-block; margin-top: 8px; padding: 4px 10px;
  background: #00af89; color: #fff; border: none; border-radius: 2px;
  cursor: pointer; font-size: 12px; font-family: inherit;
}
.wikifix-undo-btn:hover { background: #00c89c; }
.wikifix-undo-btn + .wikifix-close-btn { margin-left: 6px; }

#${BUTTON_ID} {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: #3366cc;
  color: #fff;
  border: 1px solid #2a4b8d;
  border-radius: 2px;
  cursor: pointer;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  white-space: nowrap;
  line-height: 1.4;
  transition: background 100ms;
  box-sizing: border-box;
}
#${BUTTON_ID}:hover { background: #447ff5; }
#${BUTTON_ID}:active { background: #2a4b8d; }
#${BUTTON_ID}:disabled { background: #72777d; border-color: #54595d; cursor: wait; opacity: 0.8; }
#${BUTTON_ID} svg { flex-shrink: 0; }

#${BUTTON_ID}.wikifix-toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #f8f9fa;
  color: #202122;
  border: 1px solid #a2a9b1;
  border-radius: 2px;
  cursor: pointer;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  white-space: nowrap;
  line-height: 1.4;
  transition: background 100ms, border-color 100ms;
  box-sizing: border-box;
}
#${BUTTON_ID}.wikifix-toolbar-btn:hover { background: #fff; border-color: #72777d; }
#${BUTTON_ID}.wikifix-toolbar-btn:active { background: #eaecf0; border-color: #54595d; }
#${BUTTON_ID}.wikifix-toolbar-btn:disabled { background: #eaecf0; border-color: #c8ccd1; cursor: wait; opacity: 0.7; }
#${BUTTON_ID}.wikifix-toolbar-btn svg { flex-shrink: 0; }

#${PANEL_ID} {
  all: initial; position: fixed; z-index: 9999;
  width: 540px; min-width: 320px; min-height: 200px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px; line-height: 1.5; color: #d4d4d4;
  background: #1e1e1e; border: 1px solid #444;
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.45);
  display: none; overflow: hidden;
  transition: box-shadow 200ms, opacity 200ms, transform 200ms;
}
#${PANEL_ID}.wikifix-docked { border-radius: 6px; }
#${PANEL_ID}.wikifix-hidden { opacity: 0; transform: scale(0.95); pointer-events: none; }
.wikifix-header {
  display: flex; align-items: center; padding: 0 10px; height: 38px;
  background: #2a2a2a; border-bottom: 1px solid #3a3a3a;
  cursor: grab; user-select: none;
}
.wikifix-header:active { cursor: grabbing; }
.wikifix-header h3 { margin: 0; font-size: 13px; font-weight: 600; color: #e0e0e0; flex: 1; }
.wikifix-header-btn {
  background: none; border: none; color: #999; cursor: pointer;
  padding: 4px 6px; border-radius: 4px; font-size: 14px; line-height: 1;
  display: flex; align-items: center; gap: 2px;
}
.wikifix-header-btn:hover { background: #3a3a3a; color: #e0e0e0; }
.wikifix-header-btn svg { width: 14px; height: 14px; }
.wikifix-body { padding: 14px; overflow-y: auto; max-height: 65vh; }
.wikifix-body pre {
  background: #2d2d2d; padding: 10px; border: 1px solid #444;
  border-radius: 4px; font-size: 12px; overflow-x: auto;
  white-space: pre-wrap; max-height: 350px; overflow-y: auto; margin: 0;
  color: #d4d4d4;
}
.wikifix-summary { color: #999; margin-bottom: 8px; }
.wikifix-error { color: #f55; font-weight: 600; }
.wikifix-actions { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; }
.wikifix-btn {
  padding: 5px 14px; border: none; border-radius: 4px; cursor: pointer;
  font-size: 12px; text-decoration: none; font-family: inherit;
  display: inline-flex; align-items: center; gap: 4px;
  transition: background 150ms;
}
.wikifix-btn-primary { background: #3366cc; color: #fff; }
.wikifix-btn-primary:hover { background: #447ff5; }
.wikifix-btn-secondary { background: #3a3a3a; color: #ccc; }
.wikifix-btn-secondary:hover { background: #4a4a4a; }
.wikifix-dock-indicator {
  position: fixed; z-index: 9998; pointer-events: none;
  background: rgba(51,102,204,0.15); border: 2px dashed rgba(51,102,204,0.4);
  border-radius: 6px; transition: opacity 200ms; opacity: 0;
}
.wikifix-dock-indicator.active { opacity: 1; }
.wikifix-resize-handle {
  position: absolute; bottom: 0; right: 0;
  width: 16px; height: 16px; cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, #555 50%, #555 55%, transparent 55%);
  border-radius: 0 0 8px 0;
}

#${NOTE_ID} {
  position: fixed; top: 20px; right: 20px;
  padding: 12px 20px; border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px; line-height: 1.5;
  z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  display: none; max-width: 420px;
}
#${NOTE_ID}.wikifix-success { background: #d5fdf4; border: 1px solid #00af89; color: #14866d; }
#${NOTE_ID}.wikifix-error { background: #fee7e6; border: 1px solid #d33; color: #a00; }
#${NOTE_ID}.wikifix-info { background: #eaf3ff; border: 1px solid #36c; color: #1d4d8f; }
@media (prefers-color-scheme: dark) {
  #${NOTE_ID}.wikifix-success { background: #1a3a32; border-color: #00af89; color: #7fbcb0; }
  #${NOTE_ID}.wikifix-error { background: #3a1a1a; border-color: #d33; color: #e88; }
  #${NOTE_ID}.wikifix-info { background: #1a2a3a; border-color: #36c; color: #8ab4f8; }
}
`;

export function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

const WAND_ICON_DATAURI = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'/%3E%3C/svg%3E";

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

export function addButton(): void {
  if (document.getElementById(BUTTON_ID)) return;
  if (!isEditPage()) return;

  const mw = (globalThis as any).mw;

  // Register hooks for later relocation
  if (mw?.hook) {
    try {
      mw.hook("wikiEditor.toolbarReady").add(function ($textarea: any) {
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
      mw.hook("ext.CodeMirror.ready").add(function (cm: any) {
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
      const mwUtil = (globalThis as any).mw?.util;
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

const DEFAULT_SETTINGS: StorageSettings = {
  modules: DEFAULT_MODULES,
  force: false,
  ref_names: false,
};

const SETTINGS_SCHEMA: Record<string, string> = {
  modules: 'string', force: 'boolean', ref_names: 'boolean', auto_update: 'boolean',
  author_style: 'string', refresh_authors: 'boolean', max_authors: 'number',
  ids_to_fetch: 'string', force_archive_all: 'boolean', create_archive: 'boolean',
  strip_issn: 'boolean', rename_ref_names: 'boolean', skip_org_authors: 'boolean', spacing_style: 'string',
  crossref_email: 'string', ncbi_api_key: 'string', semantic_scholar_api_key: 'string',
};

function validateSettings(s: Record<string, unknown>): boolean {
  for (const [key, type] of Object.entries(SETTINGS_SCHEMA)) {
    if (s[key] !== undefined && typeof s[key] !== type) return false;
  }
  return true;
}

export async function getSettings(): Promise<StorageSettings> {
  try {
    // Try per-variant settings first, fall back to global
    const variantKey = getSettingsKey();
    const globalKey = STORAGE_KEY;
    const raw = await browser.storage.local.get([variantKey, globalKey]);
    const stored = (raw[variantKey] || raw[globalKey]) as Record<string, unknown> | undefined;
    if (!stored) return { ...DEFAULT_SETTINGS };

    // Migrate: remove deprecated serverUrl field
    if ('serverUrl' in stored) {
      const cleaned = { ...stored };
      delete cleaned.serverUrl;
      await browser.storage.local.set({ [variantKey]: cleaned });
      return cleaned as unknown as StorageSettings;
    }

    if (!validateSettings(stored)) {
      console.warn("[WikiCitationExtension] Invalid settings in storage, using defaults");
      return { ...DEFAULT_SETTINGS };
    }

    const settings = stored as unknown as StorageSettings;
    // Decrypt sensitive fields
    for (const key of ["crossref_email", "ncbi_api_key", "semantic_scholar_api_key"] as const) {
      const raw = settings[key] || "";
      if (isEncrypted(raw)) {
        const decrypted = await decrypt(raw);
        if (decrypted !== null) (settings as unknown as Record<string, string>)[key] = decrypted;
      }
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// Respond to variant queries from popup (routed through background)
if (typeof browser !== "undefined") {
  try {
    browser.runtime.onMessage.addListener((message: any) => {
      if (message.type === "getWikiVariant") {
        return Promise.resolve({ variant: detectWiki().variant });
      }
    });
  } catch { /* not in extension context */ }
}

function showProgress(current: number, total: number, message: string, barFill?: number): void {
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

function hideProgress(): void {
  const el = document.getElementById("wikifix-progress");
  if (el) el.remove();
}

let _processing = false;
let _abortController: AbortController | null = null;
let _undoEditor: EditorHandle | null = null;
let _undoOriginalText: string | null = null;

function showSuccessWithUndo(message: string, desc: string): void {
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

/** @internal exported for testing */
export async function onClick(): Promise<void> {
  if (_processing) return;
  _processing = true;
  _abortController = new AbortController();
  try {
    const settings = await getSettings();
    if (isEditPage()) {
      await fixInEditor(settings);
    } else {
      await fixLocally(settings);
    }
  } catch (e: unknown) {
    const msg = (e as Error).message || String(e);
    console.error("[WikiCitationExtension]", e);
    showNotification("error", t("errorProcessing", msg));
  } finally {
    _processing = false;
    _abortController = null;
    hideProgress();
  }
}

/** @internal exported for testing */
export async function fixInEditor(settings: StorageSettings): Promise<void> {
  let editor = findEditor();
  if (!editor) {
    editor = await waitForEditor({ timeout: 5000 });
    if (!editor) {
      showNotification("error", t("notifNoEditor"));
      return;
    }
  }

  // VisualEditor: try switching to source tab to access wikitext
  if (editor.type === 'visualeditor') {
    const sourceTab = findVeSourceTab();
    if (sourceTab) {
      sourceTab.click();
      editor = await waitForEditor({ timeout: 8000 });
      if (!editor) {
        showNotification("error", t("notifNoSourceTab"));
        return;
      }
    } else if (isVisualEditorActive()) {
      showNotification("info", t("notifUsingApiVe"));
      const title = getPageTitle();
      if (!title) { showNotification("error", t("notifNoTitle")); return; }
      const wikitext = await fetchWikitext(title);
      if (!wikitext) { showNotification("error", t("notifFetchFailed")); return; }
      const result = await processWikitext(wikitext, settings, _abortController?.signal, (info) => {
        showProgress(info.current, info.total, info.message);
      });
      const { text: fixed, stats, errors } = result;
      const diff = generateDiff(wikitext, fixed);
      let apiBase: string | undefined;
      const wiki = detectWiki();
      const probed = await probeApiUrl(wiki);
      if (probed) apiBase = probed;
      else if (wiki.apiUrl) apiBase = wiki.apiUrl;
      showDiffPanel(fixed, diff, title, stats, apiBase, errors);
      return;
    }
  }

  const wikitext = editor.getText();
  if (!wikitext || !wikitext.trim()) {
    showNotification("info", t("notifEmptyEditor"));
    return;
  }

  // Check for text selection — process only the selected fragment
  const sel = editor.getSelection();
  const isSelectionMode = sel !== null && sel.text.trim().length > 0;

  const textToProcess = isSelectionMode ? sel!.text : wikitext;
  const prefix = isSelectionMode ? wikitext.substring(0, sel!.start) : "";
  const suffix = isSelectionMode ? wikitext.substring(sel!.end) : "";

  const result = await processWikitext(textToProcess, settings, _abortController?.signal, (info) => {
    showProgress(info.current, info.total, info.message);
  });

  const { text: fixed, stats, aborted } = result;
  if (aborted) {
    showNotification("info", t("notifCancelled"));
    return;
  }

  if (textToProcess === fixed) {
    showNotification("info", t("notifNoChanges"));
    return;
  }

  // Reconstruct full text (selection mode replaces only the fragment)
  const fullFixed = isSelectionMode ? prefix + fixed + suffix : fixed;

  // Write to editor and sync to textarea for form submission
  const wrote = editor.setText(fullFixed);
  const ta = document.getElementById("wpTextbox1") as HTMLTextAreaElement | null;
  if (ta) ta.value = fullFixed;

  // Restore selection to highlight the changed region (selection mode only)
  if (isSelectionMode) {
    const selStart = sel!.start;
    const selEnd = sel!.start + fixed.length;
    editor.setSelection(selStart, selEnd);
    if (ta) ta.setSelectionRange(selStart, selEnd);
  }

  if (!wrote && !ta) {
    // Fallback: try API-based edit
    const title = getPageTitle();
    if (!title) { showNotification("error", t("errorProcessing", "Could not write to editor")); return; }
    const wiki = detectWiki();
    let apiBase = wiki.apiUrl || `${window.location.origin}/w/api.php`;
    const probed = await probeApiUrl(wiki);
    if (probed) apiBase = probed;
    const ok = await editPage(apiBase, title, fullFixed, "chore: fixed citation formatting");
    if (ok) {
      showNotification("success", t(stats.changed === 1 ? "statsChanged" : "statsChangedPlural", String(stats.changed)), formatStatsSummary(stats));
    } else {
      showNotification("error", t("errorProcessing", "Could not save changes. Try copying the diff manually."));
    }
    return;
  }

  // Register undo state after successful write
  _undoEditor = editor;
  _undoOriginalText = wikitext;

  // Selection mode: no full diff, just confirm and show stats
  if (isSelectionMode) {
    const desc = formatStatsSummary(stats);
    showSuccessWithUndo(t(stats.changed === 1 ? "statsChanged" : "statsChangedPlural", String(stats.changed)), desc);
    return;
  }

  // Show diff via "Show changes" button (standard MediaWiki edit diff)
  const desc = formatStatsSummary(stats);
  const diffBtn = document.getElementById("wpDiff") as HTMLButtonElement | null;
  if (diffBtn) {
    const diffFallbackTimer = setTimeout(() => {
      observer.disconnect();
      showSuccessWithUndo(t(stats.changed === 1 ? "statsChanged" : "statsChangedPlural", String(stats.changed)), desc);
    }, 8000);
    const observer = new MutationObserver((_, obs) => {
      if (document.querySelector(".diff, #mw-diff-otitle, table.diff")) {
        obs.disconnect();
        clearTimeout(diffFallbackTimer);
        setTimeout(() => showSuccessWithUndo(t(stats.changed === 1 ? "statsChanged" : "statsChangedPlural", String(stats.changed)), desc), 100);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => diffBtn.click(), 300);
  } else {
    showSuccessWithUndo(t(stats.changed === 1 ? "statsChanged" : "statsChangedPlural", String(stats.changed)), desc);
  }
}

/** @internal exported for testing */
export async function fixLocally(settings: StorageSettings): Promise<void> {
  const title = getPageTitle();
  if (!title) { showNotification("error", t("notifNoTitle")); return; }
  showNotification("info", t("notifFetching"));
  const wikitext = await fetchWikitext(title);
  if (!wikitext) { showNotification("error", t("notifFetchFailed")); return; }

  const result = await processWikitext(wikitext, settings, _abortController?.signal, (info) => {
    showProgress(info.current, info.total, info.message);
  });

  const { text: fixed, stats, errors } = result;
  const diff = generateDiff(wikitext, fixed);

  let apiBase: string | undefined;
  const wiki = detectWiki();
  const probed = await probeApiUrl(wiki);
  if (probed) apiBase = probed;
  else if (wiki.apiUrl) apiBase = wiki.apiUrl;

  showDiffPanel(fixed, diff, title, stats, apiBase, errors);
}

function moduleEnabled(modules: string, name: string): boolean {
  return modules.split(",").map(m => m.trim()).includes(name);
}

function createEmptyStats(): ProcessStats {
  return {
    total: 0, changed: 0, expanded: 0, cleaned: 0,
    archived: 0, enrichedIds: 0, datesFixed: 0,
    authorsProcessed: 0, sortApplied: 0, refNamesAdded: 0, errors: 0,
  };
}

const BATCH_SIZE = 10;

export async function processWikitext(
  text: string,
  settings: StorageSettings,
  signal?: AbortSignal,
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  setApiKeys({
    crossrefEmail: settings.crossref_email || "",
    ncbiKey: settings.ncbi_api_key || "",
    semanticScholarKey: settings.semantic_scholar_api_key || "",
  });

  if (signal?.aborted) return { text, stats: createEmptyStats(), aborted: true, errors: [] };

  _isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  onProgress?.({ current: 0, total: 0, phase: 'scanning', message: t("progressScanning") });

  const citations = findCitations(text);
  const total = citations.length;
  const stats = createEmptyStats();
  stats.total = total;
  const errors: ProcessingError[] = [];

  if (signal?.aborted) return { text, stats, aborted: true, errors };

  if (total === 0) {
    onProgress?.({ current: 0, total: 0, phase: 'done', message: t("progressNoCitations") });
    return { text, stats, aborted: false, errors };
  }

  const wiki = detectWiki();
  let mods = settings.modules || DEFAULT_MODULES;
  const disabledMods = getDisabledModules(wiki);
  mods = mods.split(',').map(m => m.trim()).filter(m => !disabledMods.includes(m)).join(',');
  const refNamesEnabled = settings.auto_update || settings.ref_names;
  const usedRefNames = new Set<string>();

  const allReplacements: { start: number; end: number; replacement: string }[] = [];

  for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
    if (signal?.aborted) return { text, stats, aborted: true, errors };

    const batch = citations.slice(batchStart, batchStart + BATCH_SIZE);

    const p1 = (batchStart ?? 0) + 1;
    const p2 = Math.min((batchStart ?? 0) + BATCH_SIZE, total ?? 0);
    onProgress?.({
      current: batchStart,
      total,
      phase: 'processing',
      message: "Citations " + String(p1) + "-" + String(p2) + " of " + String(total ?? 0),
    });

    // Phase 1: Parallel — do all async API work for the batch
    const dataResults = await Promise.allSettled(
      batch.map(async (citation, batchIdx) => {
        try {
          return await processCitationData(citation, settings, mods, signal);
        } catch (e) {
          const msg = (e as Error)?.message || String(e);
          console.error("[WikiCitationExtension] Error processing citation:", e);
          errors.push({ raw: citation.raw, message: msg, index: batchStart + batchIdx });
          stats.errors++;
          return null;
        }
      })
    );

    // Phase 2: Sequential — build replacements with refNames
    for (let i = 0; i < dataResults.length; i++) {
      const dataResult = dataResults[i];
      if (dataResult.status !== 'fulfilled' || !dataResult.value) {
        stats.errors++;
        continue;
      }

      const data = dataResult.value;
      const citation = batch[i];
      const si = citation.start;
      if (si === -1) continue;
      const ei = si + citation.raw.length;

      // Aggregate stats
      if (data.changed) stats.changed++;
      if (data.meta.expanded) stats.expanded++;
      if (data.meta.cleaned) stats.cleaned++;
      if (data.meta.archived) stats.archived++;
      if (data.meta.enrichedIds) stats.enrichedIds++;
      if (data.meta.datesFixed) stats.datesFixed++;
      if (data.meta.authorsProcessed) stats.authorsProcessed++;
      if (data.meta.sortApplied) stats.sortApplied++;

      const replacement = buildReplacementFromData(citation, data, settings);
      if (!replacement && !refNamesEnabled) continue;

      const finalReplacement = replacement ?? citation.raw;

      if (refNamesEnabled) {
        const wrapped = wrapWithRefName(text, si, ei, finalReplacement, data.params, data.newTemplateType || citation.template, citation, settings, usedRefNames);
        if (wrapped) {
          allReplacements.push(wrapped);
          if (wrapped.replacement !== finalReplacement) stats.refNamesAdded++;
          continue;
        }
      }

      if (replacement) {
        allReplacements.push({ start: si, end: ei, replacement });
      }
    }

    onProgress?.({
      current: Math.min(batchStart + BATCH_SIZE, total),
      total,
      phase: 'processing',
      message: "Processed " + String(Math.min(batchStart + BATCH_SIZE, total)) + " of " + String(total) + " citations",
    });
  }

  onProgress?.({ current: total, total, phase: 'applying', message: t("progressApplying") });

  let result = text;
  for (let i = allReplacements.length - 1; i >= 0; i--) {
    const r = allReplacements[i];
    result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
  }

  if (moduleEnabled(mods, "sfn")) {
    const sfnOpts: SfnOptions = {};
    if (settings.sfn_page_conflict) sfnOpts.pageConflict = settings.sfn_page_conflict;
    result = convertToSfn(result, sfnOpts);
    stats.changed += result !== text ? 1 : 0;
  }

  onProgress?.({ current: total, total, phase: 'done', message: 'Done' });

  return { text: result, stats, aborted: false, errors };
}

interface CitationMeta {
  expanded: boolean;
  cleaned: boolean;
  archived: boolean;
  enrichedIds: boolean;
  datesFixed: boolean;
  authorsProcessed: boolean;
  sortApplied: boolean;
}

interface ProcessedData {
  params: Record<string, string>;
  changed: boolean;
  newTemplateType: string | null;
  meta: CitationMeta;
  removedKeys?: string[];
}

async function processCitationData(
  citation: Citation,
  settings: StorageSettings,
  mods: string,
  signal?: AbortSignal
): Promise<ProcessedData | null> {
  if (signal?.aborted) return null;
  let params = { ...citation.params };
  let changed = false;
  let newTemplateType: string | null = null;
  const removedKeys: string[] = [];

  const meta: CitationMeta = {
    expanded: false, cleaned: false, archived: false,
    enrichedIds: false, datesFixed: false, authorsProcessed: false, sortApplied: false,
  };

  if (settings.spacing_style) {
    params = normalizeSpacing(params);
    changed = true;
  }

  if (moduleEnabled(mods, "expand") && !_isOffline) {
    if (signal?.aborted) return null;
    const exp = await expandCitation(citation, {
      templateType: citation.template,
      force: settings.force,
      mode: settings.force ? "force" : "incremental",
    });
    if (settings.force || exp.changes.length > 0) {
      params = exp.params;
      changed = true;
      if (exp.changes.length > 0) meta.expanded = true;
    }
    const templateHint = params["_template_hint"];
    if (templateHint) {
      delete params["_template_hint"];
      if (!newTemplateType) newTemplateType = templateHint;
    }
  }

  if (moduleEnabled(mods, "cleanup")) {
    const cl = cleanupCitation(params, { templateType: templateTypeFor(citation.template), force: settings.force });
    if (cl.changes.length > 0 || (cl.renameParams && Object.keys(cl.renameParams).length > 0)) {
      changed = true;
      params = cl.params;
      if (cl.renameParams) {
        for (const [old, next] of Object.entries(cl.renameParams)) {
          if (params[old] !== undefined) {
            params[next] = params[old];
            delete params[old];
            removedKeys.push(old);
          }
        }
      }
      if (cl.newTemplateType) newTemplateType = cl.newTemplateType;
      if (cl.changes.length > 0) meta.cleaned = true;
      if (cl.removedKeys) removedKeys.push(...cl.removedKeys);
    }
  }

  if (moduleEnabled(mods, "authors")) {
    const body = formatBody(params);
    const authorOpts: Parameters<typeof processAuthors>[1] = {
      style: (settings.author_style as "normal" | "vancouver") || "normal",
      maxAuthors: settings.max_authors ?? 6,
      force: settings.force,
      skipOrgAuthors: settings.skip_org_authors ?? true,
    };
    if (settings.refresh_authors && params["doi"] && !_isOffline) {
      if (signal?.aborted) return null;
      const fetched = await fetchCrossrefAuthors(params["doi"], signal);
      if (fetched) authorOpts.fullNames = fetched;
    }
    const authorResult = await processAuthors(body, authorOpts);
    if (authorResult !== body) {
      const oldKeys = Object.keys(params);
      params = parseParams(authorResult.replace(/^\||\|$/g, ""));
      for (const k of oldKeys) {
        if (!(k in params)) removedKeys.push(k);
      }
      // Vancouver mode creates vauthors but keeps last/first —
      // remove last/first to avoid "More than one of author-name-list" error
      if (authorOpts.style === "vancouver" && params.vauthors) {
        for (let i = 0; i <= 9; i++) {
          const s = i === 0 ? "" : String(i);
          if (params["last" + s]) { delete params["last" + s]; removedKeys.push("last" + s); }
          if (params["first" + s]) { delete params["first" + s]; removedKeys.push("first" + s); }
          if (params["author" + s]) { delete params["author" + s]; removedKeys.push("author" + s); }
        }
      }
      changed = true;
      meta.authorsProcessed = true;
    }
  }

  if (moduleEnabled(mods, "dates") && (params["date"] || params["access-date"] || params["archive-date"] || settings.force)) {
    // Normalize the main date field
    if (params["date"]) {
      const norm = normalizeDate(params["date"]);
      if (norm && norm !== params["date"]) {
        params["date"] = norm;
        changed = true;
        meta.datesFixed = true;
      }
    }
    // Also normalize access-date and archive-date
    for (const field of ["access-date", "archive-date"] as const) {
      if (params[field]) {
        const norm = normalizeDate(params[field]);
        if (norm && norm !== params[field]) {
          params[field] = norm;
          changed = true;
          meta.datesFixed = true;
        }
      }
    }
  }

  if (settings.strip_issn && params["doi"] && params["issn"]) {
    delete params["issn"];
    changed = true;
    meta.cleaned = true;
  }

  if (moduleEnabled(mods, "ids") && params["doi"] && !_isOffline) {
    if (signal?.aborted) return null;
    const doi = params["doi"];
    const toFetch = (settings.ids_to_fetch || "pmid,pmc,s2cid,qid").split(",").map(s => s.trim());

    // Phase 1: parallel — pmid, s2cid, qid are independent (all use doi)
    const [pmidResult, ssResult, oaResult] = await Promise.all([
      toFetch.includes("pmid") && !params["pmid"] ? searchNCBIPmid(doi, signal) : Promise.resolve(null),
      toFetch.includes("s2cid") && !params["s2cid"] ? fetchSemanticScholar(doi, signal) : Promise.resolve(null),
      toFetch.includes("qid") && !params["qid"] ? fetchOpenAlex(doi, signal) : Promise.resolve(null),
    ]);
    if (pmidResult) { params["pmid"] = pmidResult; changed = true; meta.enrichedIds = true; }
    if (ssResult?.externalIds?.CorpusId) { params["s2cid"] = ssResult.externalIds.CorpusId; changed = true; meta.enrichedIds = true; }
    if (oaResult?.ids?.wikidata) {
      const qid = oaResult.ids.wikidata.split("/").pop();
      if (qid) { params["qid"] = qid; changed = true; meta.enrichedIds = true; }
    }

    // Phase 2: pmc depends on pmid
    if (toFetch.includes("pmc") && !params["pmc"]) {
      const pmc = await searchNCBIPmc(params["pmid"] || "", signal);
      if (pmc) { params["pmc"] = pmc; changed = true; meta.enrichedIds = true; }
    }
  }

  if (moduleEnabled(mods, "archive") && !_isOffline) {
    const arc = await addArchiveUrls(params, !!settings.force_archive_all);
    if (arc.changes.length > 0) {
      params = arc.params;
      changed = true;
      meta.archived = true;
      if (settings.create_archive && params.url) {
        saveWayback(params.url, signal);
      }
    }
  }

  if (moduleEnabled(mods, "dates") && params["archive-date"]) {
    const ad = params["archive-date"];
    const adNorm = ad.replace(/^(\d{4})(\d{2})(\d{2}).*$/, "$1-$2-$3");
    if (adNorm !== ad) {
      params["archive-date"] = adNorm;
      changed = true;
      meta.datesFixed = true;
    }
  }

  // ── CS2 → CS1 conversion: {{citation}} → {{cite xxx}} ────────────────
  if (moduleEnabled(mods, "cs2tocs1") && citation.template === "citation" && settings.citation_style === "cs1") {
    const detected = detectCitationType(params);
    if (detected.new) {
      newTemplateType = detected.new;
      changed = true;

      // Apply CS2→CS1 param renames
      if (detected.new === "cite journal" && params.work !== undefined) {
        params.journal = params.work;
        delete params.work;
        removedKeys.push("work");
      } else if (detected.new === "cite web" && params.work !== undefined) {
        params.website = params.work;
        delete params.work;
        removedKeys.push("work");
      } else if (detected.new === "cite news" && params.work !== undefined) {
        params.website = params.work;
        delete params.work;
        removedKeys.push("work");
      }
      if (params.place !== undefined) {
        params.location = params.place;
        delete params.place;
        removedKeys.push("place");
      }
    }
  }

  if (moduleEnabled(mods, "sort")) {
    const sorted = sortParams(params);
    const sortedKeys = Object.keys(sorted);
    const origKeys = Object.keys(params);
    if (sortedKeys.some((k, i) => k !== origKeys[i]) || sortedKeys.length !== origKeys.length) {
      params = sorted;
      changed = true;
      meta.sortApplied = true;
    }
  }

  return { params, changed, newTemplateType, meta, removedKeys: removedKeys.length > 0 ? removedKeys : undefined };
}

function buildReplacementFromData(
  citation: Citation,
  data: ProcessedData,
  settings: StorageSettings
): string | null {
  if (!data.changed && !settings.spacing_style) return null;

  const template = data.newTemplateType || citation.template;
  let body: string;

  if (settings.spacing_style) {
    body = formatBody(data.params, settings.spacing_style);
  } else if (data.changed) {
    body = buildPreservedBody(citation, data.params);
    if (data.removedKeys) {
      for (const k of data.removedKeys) {
        body = body.replace(new RegExp(`\\|\\s*${escapeRe(k)}\\s*=\\s*[^|]+`), "").replace(/\s{2,}/g, " ").trim();
      }
    }
  } else {
    return null;
  }

  return body ? `{{${template} ${cleanupCitationBody(body)}}}` : `{{${template}}}`;
}

/** Detect the spacing style of the original body for consistent new-param formatting */
function detectSpacingStyle(body: string): { beforePipe: string; afterPipe: string; beforeEq: string; afterEq: string } {
  const idx = body.indexOf("=");
  if (idx === -1) return { beforePipe: " ", afterPipe: "", beforeEq: "", afterEq: "" };
  const hasInterPipeSpace = / \|/.test(body);
  const beforePipe = hasInterPipeSpace ? " " : "";
  const afterPipe = body.match(/^\|(\s)/)?.[1] || "";
  const beforeEq = idx > 0 && body[idx - 1] === " " ? " " : "";
  const afterEq = idx < body.length - 1 && body[idx + 1] === " " ? " " : "";
  return { beforePipe, afterPipe, beforeEq, afterEq };
}

/** @internal exported for testing */
export function buildPreservedBody(citation: Citation, params: Record<string, string>): string {
  const rawBody = citation.raw.slice(citation.template.length + 2, -2);
  let preserved = rawBody.replace(/^\s+/, "");
  const style = rawBody.length > 0 ? detectSpacingStyle(preserved) : { beforePipe: " ", afterPipe: "", beforeEq: " ", afterEq: " " };
  for (const [k, v] of Object.entries(params)) {
    const idx = preserved.search(new RegExp(`\\|\\s*${escapeRe(k)}\\s*=\\s*`, "i"));
    if (idx === -1) {
      preserved = preserved.replace(/\s+$/, "") + `${style.beforePipe}|${style.afterPipe}${k}${style.beforeEq}=${style.afterEq}${v}`;
      continue;
    }
    const prefix = preserved.slice(idx, preserved.indexOf("=", idx) + 1);
    const afterStart = idx + prefix.length;
    const oldVal = bracketAwareValue(preserved, afterStart);
    const oldLen = oldVal.length;
    const leading = oldVal.match(/^(\s*)/)?.[1] || "";
    const trailing = oldVal.match(/(\s*)$/)?.[1] || "";
    preserved = preserved.slice(0, idx) + prefix + leading + v + trailing + preserved.slice(afterStart + oldLen);
  }
  return preserved;
}

function wrapWithRefName(
  text: string,
  si: number,
  ei: number,
  replacement: string,
  params: Record<string, string>,
  template: string,
  citation: Citation,
  settings: StorageSettings,
  usedRefNames: Set<string>
): { start: number; end: number; replacement: string } {
  const body = replacement.slice(template.length + 2, -2);
  const refName = generateRefName(body);
  if (!refName) return { start: si, end: ei, replacement };

  let finalName = refName;
  if (usedRefNames.has(finalName)) {
    let suffix = 2;
    while (usedRefNames.has(`${finalName}-${suffix}`)) suffix++;
    finalName = `${finalName}-${suffix}`;
  }
  usedRefNames.add(finalName);

  const invRe = new RegExp(`<ref\\s+name=["']${escapeRe(finalName)}["']\\s*/>`);
  if (invRe.test(text) || text.includes(`<ref name="${finalName}">`)) {
    return { start: si, end: ei, replacement };
  }

  const prefix = text.slice(0, si);
  const refM = prefix.match(/<ref\s*([^>]*)>\s*$/);
  if (refM) {
    const refStart = si - refM[0].length;
    const attr = refM[1];
    const nameM = attr.match(/name\s*=\s*"([^"]*)"/i);
    if (nameM) {
      if (settings.rename_ref_names) {
        let refEnd = ei;
        if (text.slice(refEnd, refEnd + 6) === "</ref>") refEnd += 6;
        return { start: refStart, end: refEnd, replacement: `<ref name="${finalName}">${replacement}</ref>` };
      }
    } else {
      let refEnd = ei;
      if (text.slice(refEnd, refEnd + 6) === "</ref>") refEnd += 6;
      return {
        start: refStart, end: refEnd,
        replacement: formatRefName(citation, params, finalName, body),
      };
    }
  } else {
    const lastOpenRef = prefix.lastIndexOf("<ref");
    const lastCloseRef = prefix.lastIndexOf("</ref>");
    if (lastOpenRef > lastCloseRef) {
      // Inside a <ref> tag with text between it and the citation.
      // Don't wrap to avoid nested refs, and don't try to span the outer
      // <ref>...</ref> because there may be other citations inside it.
      return { start: si, end: ei, replacement };
    }
    if (!prefix.trim().endsWith("</ref>")) {
      const sections = prefix.match(/^==\s*(.+?)\s*==$/gm);
      const lastSection = sections ? sections[sections.length - 1] : "";
      if (!/^==\s*(?:See also|Further reading|External links|Bibliography|References|Sources|Works cited|Bibliography)\s*==$/i.test(lastSection)) {
        return { start: si, end: ei, replacement: `<ref name="${finalName}">${replacement}</ref>` };
      }
    }
  }

  return { start: si, end: ei, replacement };
}

export function templateTypeFor(template: string): string {
  if (template.startsWith("cite ") || template === "citation") return template;
  return "cite web";
}

export function formatRefName(citation: { template: string; params: Record<string, string> }, params: Record<string, string>, name: string, bodyOverride?: string): string {
  const body = bodyOverride ?? formatBody(params);
  return body ? `<ref name="${name}">{{${citation.template} ${body}}}</ref>` : `<ref name="${name}">{{${citation.template}}}</ref>`;
}

export function formatBody(params: Record<string, string>, style: string = "standard"): string {
  const entries = Object.entries(params);
  if (style === "wide") {
    return entries.map(([k, v]) => ` | ${k} = ${v}`).join("").trimStart();
  }
  if (style === "compact") return entries.map(([k, v]) => `|${k}=${v}`).join(" ");
  return entries.map(([k, v]) => `| ${k} = ${v}`).join(" ");
}

export function getPageTitle(): string {
  return getWikiPageTitle();
}

export function getEditUrl(title: string, wiki?: ReturnType<typeof detectWiki>): string {
  const w = wiki || detectWiki();
  const apiUrl = w.apiUrl || `${window.location.origin}/w/api.php`;
  const apiPath = apiUrl ? new URL(apiUrl).pathname.replace(/\/api\.php$/, '') : '/w';
  return `${window.location.origin}${apiPath}/index.php?title=${encodeURIComponent(title)}&action=edit`;
}

export async function fetchWikitext(title: string): Promise<string | null> {
  const wiki = detectWiki();
  let apiBase = wiki.apiUrl || `${window.location.origin}/w/api.php`;

  const probed = await probeApiUrl(wiki);
  if (probed) apiBase = probed;

  const params = new URLSearchParams({
    action: "query", format: "json", prop: "revisions",
    titles: title, rvprop: "content", origin: "*",
  });
  try {
    const resp = await fetch(`${apiBase}?${params}`);
    const data = await resp.json();
    const pages = data?.query?.pages || {};
    const keys = Object.keys(pages);
    if (keys.length === 0) return null;
    const page = pages[keys[0]];
    return page?.revisions?.[0]?.["*"] || null;
  } catch (e) {
    console.warn("fetchWikitext failed:", e);
    return null;
  }
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

export function formatStatsSummary(stats: ProcessStats): string {
  const items: string[] = [];
  if (stats.expanded > 0) items.push(`${t("statsExpanded")}: ${stats.expanded}`);
  if (stats.cleaned > 0) items.push(`${t("statsCleaned")}: ${stats.cleaned}`);
  if (stats.datesFixed > 0) items.push(`${t("statsDates")}: ${stats.datesFixed}`);
  if (stats.authorsProcessed > 0) items.push(`${t("statsAuthors")}: ${stats.authorsProcessed}`);
  if (stats.enrichedIds > 0) items.push(`${t("statsIds")}: ${stats.enrichedIds}`);
  if (stats.archived > 0) items.push(`${t("statsArchive")}: ${stats.archived}`);
  if (stats.sortApplied > 0) items.push(`${t("statsSorted")}: ${stats.sortApplied}`);
  if (stats.refNamesAdded > 0) items.push(`${t("statsRefNames")}: ${stats.refNamesAdded}`);

  if (stats.changed === 0 && items.length === 0) return '';

  return `<div style="font-weight:600;font-size:14px;margin-bottom:6px">${t(stats.changed === 1 ? "statsChanged" : "statsChangedPlural", String(stats.changed))}</div>
    ${items.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${items.map((b) => `<span style="background:#2d2d2d;padding:3px 8px;border-radius:3px;font-size:11px;white-space:nowrap">${b}</span>`).join("")}</div>` : ''}`;
}

export function describeChanges(original: string, fixed: string, _diff: string): { count: number; html: string } {
  const stats = createEmptyStats();
  stats.changed = original !== fixed ? 1 : 0;
  const html = formatStatsSummary(stats);
  return { count: stats.changed, html };
}

const DOCK_CORNERS = ["tr", "tl", "br", "bl"] as const;
type DockCorner = typeof DOCK_CORNERS[number];

const DOCKS: Record<DockCorner, { top: string; right: string; bottom: string; left: string }> = {
  tr: { top: "10px", right: "10px", bottom: "auto", left: "auto" },
  tl: { top: "10px", right: "auto", bottom: "auto", left: "10px" },
  br: { top: "auto", right: "10px", bottom: "10px", left: "auto" },
  bl: { top: "auto", right: "auto", bottom: "10px", left: "10px" },
};

interface PanelState {
  docked: DockCorner | null;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
}

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
      document.getElementById(`${PANEL_ID}-dock-${c}`)!.classList.remove("active");
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

export function showDiffPanel(fixed: string, diff: string, title: string, stats?: ProcessStats, apiBase?: string, errors?: ProcessingError[]): void {
  const { panel: p, show } = getOrCreatePanel();
  const desc = stats ? formatStatsSummary(stats) : describeChanges("", fixed, diff).html;
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
  p.querySelector(".wikifix-body")!.innerHTML = `
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

export function escapeHtml(s: string): string {
  if (typeof s !== "string") return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function bracketAwareValue(text: string, start: number): string {
  let val = "";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" && text[i + 1] === "{") { depth++; val += "{{"; i++; }
    else if (ch === "}" && text[i + 1] === "}") {
      if (depth === 0) break;
      depth--; val += "}}"; i++;
    }
    else if (ch === "[" && text[i + 1] === "[") { depth++; val += "[["; i++; }
    else if (ch === "]" && text[i + 1] === "]") {
      depth--; val += "]]"; i++;
    }
    else if (ch === "|" && depth === 0) break;
    else val += ch;
  }
  return val;
}

async function initialize(): Promise<void> {
  try {
    const wiki = detectWiki();
    if (!wiki.isMediaWiki) return;

    if (!window.location.pathname.startsWith('/wiki/') && !window.location.search.includes('action=edit') && !window.location.search.includes('veaction=edit')) {
      const apiUrl = wiki.apiUrl || await probeApiUrl(wiki);
      if (!apiUrl && !document.getElementById('mw-content-text')) return;
    }

    injectStyles();
    await addButton();
  } catch (e) {
    console.error("[WikiCitationExtension] Initialization failed:", e);
  }
}

function boot(): void {
  initialize().catch((e) => console.error("[WikiCitationExtension] Boot failed:", e));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
