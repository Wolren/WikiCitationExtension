import { findCitations, parseParams, generateRefName, detectCitationType } from "./lib/wikitext";
import { expandCitation } from "./lib/expand";
import { cleanupCitation, cleanupCitationBody, addArchiveUrls } from "./lib/cleanup";
import { normalizeDate } from "./lib/dates";
import { normalizeSpacing, sortParams } from "./lib/spacing";
import { generateDiff } from "./lib/diff";
import { convertToSfn, type SfnOptions } from "./lib/sfn";
import { processAuthors } from "./lib/authors";
import { setApiKeys, fetchCrossrefAuthors, searchNCBIPmid, searchNCBIPmc, fetchSemanticScholar, fetchOpenAlex, saveWayback, editPage, setCacheConfig } from "./lib/api";
import { decrypt, isEncrypted } from "./lib/crypto";
import type { StorageSettings, Citation, ProgressCallback, ProcessResult, ProcessStats, ProcessingError } from "./lib/types";
import { detectWiki, isEditPage, getPageTitle as getWikiPageTitle, probeApiUrl, getDisabledModules, getSettingsKey } from "./wiki-detector";
import { findEditor, waitForEditor, isVisualEditorActive, findVeSourceTab, type EditorHandle } from "./editor-adapter";
import { t } from "./lib/i18n";
import {
  formatBody, buildPreservedBody, formatRefName, createEmptyStats,
  formatStatsSummary, escapeRe, templateTypeFor,
} from "./lib/format";
import {
  injectStyles, addButton, showNotification, showProgress,
  hideProgress, showSuccessWithUndo, showDiffPanel, resetPanel,
} from "./lib/panel";
import { _abortController, _processing, _undoEditor, _undoOriginalText, setAbortController, setProcessing, setUndoState } from "./lib/state";
import { DEFAULT_MODULES, SETTINGS_SCHEMA, validateSettings, DEFAULT_STORAGE_KEY, SENSITIVE_KEYS } from "./lib/settings";

// ── Re-exports for test compatibility ──────────────────────────────

export {
  formatBody, buildPreservedBody, formatRefName, createEmptyStats,
  formatStatsSummary, describeChanges, escapeHtml, bracketAwareValue,
  escapeRe, templateTypeFor, CSS, WAND_ICON, WAND_ICON_DATAURI,
} from "./lib/format";

export {
  injectStyles, addButton, showNotification, showProgress,
  hideProgress, showSuccessWithUndo, showDiffPanel, resetPanel,
  buildStructuredDiffHtml, DOCK_CORNERS, DOCKS, PanelState,
  BUTTON_ID, PANEL_ID, NOTE_ID,
} from "./lib/panel";

export { _abortController, _processing, _undoEditor, _undoOriginalText } from "./lib/state";
let _isOffline = false;

export const STORAGE_KEY = DEFAULT_STORAGE_KEY;

const DEFAULT_SETTINGS: StorageSettings = {
  modules: DEFAULT_MODULES,
  force: false,
  ref_names: false,
};

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
    for (const key of SENSITIVE_KEYS) {
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
    browser.runtime.onMessage.addListener((message: unknown) => {
      if ((message as Record<string, unknown>)?.type === "getWikiVariant") {
        return Promise.resolve({ variant: detectWiki().variant });
      }
      return undefined;
    });
  } catch { /* not in extension context */ }
}

/** @internal exported for testing */
export async function onClick(): Promise<void> {
  if (_processing) return;
  setProcessing(true);
  setAbortController(new AbortController());
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
    setProcessing(false);
    setAbortController(null);
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
  setUndoState(editor, wikitext);

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
  setCacheConfig(
    settings.cache_ttl_hours || 168,
    settings.max_retries ?? 2
  );

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
