import type { StorageSettings } from "./lib/types";
import { encrypt, decrypt } from "./lib/crypto";

const STORAGE_KEY = "wikifix_settings";

const MODULES = ["expand", "cleanup", "dates", "authors", "ids", "sort", "archive", "dedup", "sfn"];
const ID_OPTIONS = ["issn", "pmid", "pmc", "s2cid", "qid"];

const DEFAULTS: StorageSettings = {
  modules: "expand,cleanup,dates,ids,archive,dedup",
  force: false,
  ref_names: false,
  auto_update: false,
  author_style: "normal",
  refresh_authors: false,
  max_authors: 6,
  ids_to_fetch: "pmid,pmc,s2cid,qid",
  force_archive_all: false,
  create_archive: false,
  strip_issn: false,
  rename_ref_names: false,
  spacing_style: "",
  skip_org_authors: true,
  crossref_email: "",
  ncbi_api_key: "",
  semantic_scholar_api_key: "",
};

// ── i18n helpers ────────────────────────────────────────────────────
const SENSITIVE_KEYS = new Set(["crossref_email", "ncbi_api_key", "semantic_scholar_api_key"]);

function localizeHtml(): void {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n")!;
    const msg = browser.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.getAttribute("data-i18n-placeholder")!;
    const msg = browser.i18n.getMessage(key);
    if (msg) (el as HTMLInputElement).placeholder = msg;
  }
}

// ── DOM helpers ─────────────────────────────────────────────────────
function val(id: string): string {
  return (document.getElementById(id) as HTMLInputElement).value;
}
function checked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement).checked;
}
function setVal(id: string, v: string): void {
  (document.getElementById(id) as HTMLInputElement).value = v;
}
function setChecked(id: string, v: boolean): void {
  (document.getElementById(id) as HTMLInputElement).checked = v;
}

function collectIds(): string {
  const ids: string[] = [];
  for (const id of ID_OPTIONS) {
    const cb = document.querySelector(`[data-id="${id}"]`) as HTMLInputElement | null;
    if (cb && cb.checked) ids.push(id);
  }
  return ids.join(",");
}
function setIds(v: string): void {
  const saved = v.split(",").map((s) => s.trim());
  for (const id of ID_OPTIONS) {
    const cb = document.querySelector(`[data-id="${id}"]`) as HTMLInputElement | null;
    if (cb) cb.checked = saved.includes(id);
  }
}

async function collectSettings(): Promise<StorageSettings> {
  const selected: string[] = [];
  for (const mod of MODULES) {
    const cb = document.querySelector(`[data-module="${mod}"]`) as HTMLInputElement | null;
    if (cb && cb.checked) selected.push(mod);
  }
  const settings: StorageSettings = {
    modules: selected.join(","),
    force: checked("force"),
    ref_names: checked("auto_update"),
    auto_update: checked("auto_update"),
    author_style: val("author_style"),
    refresh_authors: checked("refresh_authors"),
    max_authors: parseInt(val("max_authors"), 10) || 6,
    ids_to_fetch: collectIds(),
    force_archive_all: checked("force_archive_all"),
    create_archive: checked("create_archive"),
    strip_issn: checked("strip_issn"),
    rename_ref_names: checked("rename_ref_names"),
    spacing_style: val("spacing_style"),
    skip_org_authors: checked("skip_org_authors"),
    crossref_email: val("crossref_email"),
    ncbi_api_key: val("ncbi_api_key"),
    semantic_scholar_api_key: val("semantic_scholar_api_key"),
  };
  // Encrypt sensitive fields before saving
  for (const key of SENSITIVE_KEYS) {
    const raw = (settings as unknown as Record<string, string>)[key];
    if (raw) {
      (settings as unknown as Record<string, string>)[key] = await encrypt(raw);
    }
  }
  return settings;
}

function loadSettings(s: Partial<StorageSettings>): void {
  setChecked("force", !!s.force);
  setChecked("auto_update", !!s.auto_update);
  setVal("author_style", s.author_style || "normal");
  setChecked("refresh_authors", !!s.refresh_authors);
  setVal("max_authors", String(s.max_authors ?? 6));
  setIds(s.ids_to_fetch || "pmid,pmc,s2cid,qid");
  setChecked("force_archive_all", !!s.force_archive_all);
  setChecked("create_archive", !!s.create_archive);
  setChecked("strip_issn", !!s.strip_issn);
  setChecked("rename_ref_names", !!s.rename_ref_names);
  setVal("spacing_style", s.spacing_style || "");
  setChecked("skip_org_authors", !!s.skip_org_authors);
  setVal("crossref_email", s.crossref_email || "");
  setVal("ncbi_api_key", s.ncbi_api_key || "");
  setVal("semantic_scholar_api_key", s.semantic_scholar_api_key || "");

  const saved = (s.modules || DEFAULTS.modules).split(",").map(m => m.trim());
  for (const mod of MODULES) {
    const cb = document.querySelector(`[data-module="${mod}"]`) as HTMLInputElement | null;
    if (cb) cb.checked = saved.includes(mod);
  }
}

// Decrypt settings for display (reverse of collectSettings encryption)
async function decryptSettingsForDisplay(s: Partial<StorageSettings>): Promise<Partial<StorageSettings>> {
  const result = { ...s };
  for (const key of SENSITIVE_KEYS) {
    const raw = (result as unknown as Record<string, string>)[key];
    if (raw && raw.length > 32) {
      const decrypted = await decrypt(raw);
      if (decrypted !== null) {
        (result as unknown as Record<string, string>)[key] = decrypted;
      }
    }
  }
  return result;
}

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

async function save(): Promise<void> {
  const settings = await collectSettings();
  if (!validateSettings(settings as unknown as Record<string, unknown>)) {
    console.error("[WikiCitationFixer] Invalid settings, not saving");
    return;
  }
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

document.addEventListener("DOMContentLoaded", async () => {
  localizeHtml();

  let raw: Record<string, unknown> = {};
  try {
    raw = await browser.storage.local.get(STORAGE_KEY);
  } catch { /* ignore */ }
  const decrypted = await decryptSettingsForDisplay((raw[STORAGE_KEY] as Partial<StorageSettings>) || {});
  loadSettings(decrypted);

  function watch(id: string, event = "change"): void {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, save);
  }
  function watchModules(): void {
    for (const mod of MODULES) {
      const cb = document.querySelector(`[data-module="${mod}"]`) as HTMLElement | null;
      if (cb) cb.addEventListener("change", save);
    }
  }
  function watchIdCheckboxes(): void {
    for (const id of ID_OPTIONS) {
      const cb = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
      if (cb) cb.addEventListener("change", save);
    }
  }

  watch("force");
  watch("auto_update");
  watch("rename_ref_names");
  watch("author_style");
  watch("refresh_authors");
  watch("max_authors", "input");
  watch("force_archive_all");
  watch("create_archive");
  watch("strip_issn");
  watch("skip_org_authors");
  watch("spacing_style");
  watch("crossref_email", "input");
  watch("ncbi_api_key", "input");
  watch("semantic_scholar_api_key", "input");
  watchModules();
  watchIdCheckboxes();

  document.getElementById("resetBtn")!.addEventListener("click", async () => {
    loadSettings(DEFAULTS);
    await save();
  });
});
