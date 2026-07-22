import { escapeRe } from "./wikitext";
import { t } from "./i18n";
import type { ProcessStats, Citation } from "./types";

// ── Constants shared between format and panel modules ──────────────

export const CSS = `
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

#wikifix-btn {
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
#wikifix-btn:hover { background: #447ff5; }
#wikifix-btn:active { background: #2a4b8d; }
#wikifix-btn:disabled { background: #72777d; border-color: #54595d; cursor: wait; opacity: 0.8; }
#wikifix-btn svg { flex-shrink: 0; }

#wikifix-btn.wikifix-toolbar-btn {
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
#wikifix-btn.wikifix-toolbar-btn:hover { background: #fff; border-color: #72777d; }
#wikifix-btn.wikifix-toolbar-btn:active { background: #eaecf0; border-color: #54595d; }
#wikifix-btn.wikifix-toolbar-btn:disabled { background: #eaecf0; border-color: #c8ccd1; cursor: wait; opacity: 0.7; }
#wikifix-btn.wikifix-toolbar-btn svg { flex-shrink: 0; }

#wikifix-panel {
  all: initial; position: fixed; z-index: 9999;
  width: 540px; min-width: 320px; min-height: 200px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px; line-height: 1.5; color: #d4d4d4;
  background: #1e1e1e; border: 1px solid #444;
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.45);
  display: none; overflow: hidden;
  transition: box-shadow 200ms, opacity 200ms, transform 200ms;
}
#wikifix-panel.wikifix-docked { border-radius: 6px; }
#wikifix-panel.wikifix-hidden { opacity: 0; transform: scale(0.95); pointer-events: none; }
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

#wikifix-note {
  position: fixed; top: 20px; right: 20px;
  padding: 12px 20px; border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px; line-height: 1.5;
  z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  display: none; max-width: 420px;
}
#wikifix-note.wikifix-success { background: #d5fdf4; border: 1px solid #00af89; color: #14866d; }
#wikifix-note.wikifix-error { background: #fee7e6; border: 1px solid #d33; color: #a00; }
#wikifix-note.wikifix-info { background: #eaf3ff; border: 1px solid #36c; color: #1d4d8f; }
@media (prefers-color-scheme: dark) {
  #wikifix-note.wikifix-success { background: #1a3a32; border-color: #00af89; color: #7fbcb0; }
  #wikifix-note.wikifix-error { background: #3a1a1a; border-color: #d33; color: #e88; }
  #wikifix-note.wikifix-info { background: #1a2a3a; border-color: #36c; color: #8ab4f8; }
}
`;

export const WAND_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';

export const WAND_ICON_DATAURI = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'/%3E%3C/svg%3E";

// ── Pure formatting functions ──────────────────────────────────────

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

export { escapeRe };

export function templateTypeFor(template: string): string {
  if (template.startsWith("cite ") || template === "citation") return template;
  return "cite web";
}

export function formatBody(params: Record<string, string>, style: string = "standard"): string {
  const entries = Object.entries(params);
  if (style === "wide") {
    return entries.map(([k, v]) => ` | ${k} = ${v}`).join("").trimStart();
  }
  if (style === "compact") return entries.map(([k, v]) => `|${k}=${v}`).join(" ");
  return entries.map(([k, v]) => `| ${k} = ${v}`).join(" ");
}

export function formatRefName(citation: { template: string; params: Record<string, string> }, params: Record<string, string>, name: string, bodyOverride?: string): string {
  const body = bodyOverride ?? formatBody(params);
  return body ? `<ref name="${name}">{{${citation.template} ${body}}}</ref>` : `<ref name="${name}">{{${citation.template}}}</ref>`;
}

export function createEmptyStats(): ProcessStats {
  return {
    total: 0, changed: 0, expanded: 0, cleaned: 0,
    archived: 0, enrichedIds: 0, datesFixed: 0,
    authorsProcessed: 0, sortApplied: 0, refNamesAdded: 0, errors: 0,
  };
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
