import type { StorageSettings } from "./lib/types";
import { encrypt, decrypt, isEncrypted } from "./lib/crypto";

// Storage key is determined per wiki variant at init time
let _storageKey = "wikifix_settings";
let _wikiVariant = "";

async function resolveStorageKey(): Promise<string> {
  try {
    const resp = await browser.runtime.sendMessage({ type: "getWikiVariant" }) as { variant?: string } | null;
    if (resp?.variant) {
      _wikiVariant = resp.variant;
      _storageKey = `wikifix_settings_${_wikiVariant}`;
    }
  } catch { /* use default */ }
  return _storageKey;
}

function storageKey(): string {
  return _storageKey;
}

const MODULES = ["expand", "cleanup", "dates", "authors", "ids", "sort", "archive", "dedup", "sfn"];
const ID_OPTIONS = ["issn", "pmid", "pmc", "s2cid", "qid"];

// Settings that depend on a module being enabled: element ID -> module name
const DEPENDS_ON: Record<string, string> = {
  author_style: "authors",
  refresh_authors: "authors",
  max_authors: "authors",
  skip_org_authors: "authors",
  force_archive_all: "archive",
  create_archive: "archive",
  strip_issn: "cleanup",
  sfn_page_conflict: "sfn",
};

function isModuleEnabled(mod: string): boolean {
  const cb = document.querySelector(`[data-module="${mod}"]`) as HTMLInputElement | null;
  return cb ? cb.checked : false;
}

function getModuleLabel(mod: string): string {
  try {
    const key = "module" + mod.charAt(0).toUpperCase() + mod.slice(1);
    return browser.i18n.getMessage(key) || mod;
  } catch {
    return mod;
  }
}

let _warnTimer: ReturnType<typeof setTimeout> | null = null;

function showDependencyWarning(mod: string): void {
  const old = document.getElementById("depends-warning");
  if (old) old.remove();

  const label = getModuleLabel(mod);
  const msg = browser.i18n.getMessage("dependsModuleWarning", label)
    || `Enable the "${label}" module to use this option.`;

  const warn = document.createElement("div");
  warn.id = "depends-warning";
  warn.textContent = msg;

  const dismiss = document.createElement("button");
  dismiss.className = "dismiss";
  dismiss.textContent = "✕";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.addEventListener("click", (e) => {
    e.stopPropagation();
    warn.remove();
  });
  warn.appendChild(dismiss);

  // Click on the warning scrolls to and pulses the module checkbox
  warn.addEventListener("click", () => {
    const cb = document.querySelector(`[data-module="${mod}"]`) as HTMLElement | null;
    if (cb) {
      cb.closest(".module-item")?.scrollIntoView({ behavior: "smooth", block: "center" });
      cb.closest(".module-item")?.classList.add("depends-pulse");
      setTimeout(() => cb.closest(".module-item")?.classList.remove("depends-pulse"), 2000);
    }
  });

  const container = document.querySelector(".container");
  if (container) container.prepend(warn);

  if (_warnTimer) clearTimeout(_warnTimer);
  _warnTimer = setTimeout(() => {
    const el = document.getElementById("depends-warning");
    if (el) el.remove();
  }, 5000);
}

function updateDependentVisuals(): void {
  for (const [id, mod] of Object.entries(DEPENDS_ON)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const enabled = isModuleEnabled(mod);
    el.closest(".opt-row, .checkbox-row")?.classList.toggle("depends-disabled", !enabled);
  }
  // Fetch IDs chips depend on "ids" module
  const idsSection = document.querySelector(".fetch-ids");
  if (idsSection) {
    idsSection.classList.toggle("depends-disabled", !isModuleEnabled("ids"));
  }
}

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
  sfn_page_conflict: "rp",
  cache_ttl_hours: 168,
  max_retries: 2,
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
    max_authors: (() => { const n = parseInt(val("max_authors"), 10); return isNaN(n) ? 6 : Math.max(0, n); })(),
    ids_to_fetch: collectIds(),
    force_archive_all: checked("force_archive_all"),
    create_archive: checked("create_archive"),
    strip_issn: checked("strip_issn"),
    rename_ref_names: checked("rename_ref_names"),
    spacing_style: val("spacing_style"),
    skip_org_authors: checked("skip_org_authors"),
    sfn_page_conflict: val("sfn_page_conflict") as "rp" | "both" | "cite",
    cache_ttl_hours: (() => { const n = parseInt(val("cache_ttl_hours"), 10); return isNaN(n) ? 168 : Math.max(1, n); })(),
    max_retries: (() => { const n = parseInt(val("max_retries"), 10); return isNaN(n) ? 2 : Math.max(0, n); })(),
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
  setVal("sfn_page_conflict", s.sfn_page_conflict || "rp");
  setVal("cache_ttl_hours", String(s.cache_ttl_hours ?? 168));
  setVal("max_retries", String(s.max_retries ?? 2));
  setVal("crossref_email", s.crossref_email || "");
  setVal("ncbi_api_key", s.ncbi_api_key || "");
  setVal("semantic_scholar_api_key", s.semantic_scholar_api_key || "");

  const saved = (s.modules || DEFAULTS.modules).split(",").map(m => m.trim());
  for (const mod of MODULES) {
    const cb = document.querySelector(`[data-module="${mod}"]`) as HTMLInputElement | null;
    if (cb) cb.checked = saved.includes(mod);
  }

  updateDependentVisuals();
}

// Decrypt settings for display (reverse of collectSettings encryption)
async function decryptSettingsForDisplay(s: Partial<StorageSettings>): Promise<Partial<StorageSettings>> {
  const result = { ...s };
  for (const key of SENSITIVE_KEYS) {
    const raw = (result as unknown as Record<string, string>)[key];
    if (raw && isEncrypted(raw)) {
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
  sfn_page_conflict: 'string',
  cache_ttl_hours: 'number', max_retries: 'number',
  crossref_email: 'string', ncbi_api_key: 'string', semantic_scholar_api_key: 'string',
};

function validateSettings(s: Record<string, unknown>): boolean {
  for (const [key, type] of Object.entries(SETTINGS_SCHEMA)) {
    if (s[key] !== undefined && typeof s[key] !== type) return false;
  }
  return true;
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

async function save(): Promise<void> {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const settings = await collectSettings();
    if (!validateSettings(settings as unknown as Record<string, unknown>)) {
      console.error("[WikiCitationExtension] Invalid settings, not saving");
      return;
    }
    await browser.storage.local.set({ [storageKey()]: settings });
  }, 300);
}

document.addEventListener("DOMContentLoaded", async () => {
  await resolveStorageKey();
  localizeHtml();

  let raw: Record<string, unknown> = {};
  try {
    raw = await browser.storage.local.get(storageKey());
  } catch { /* ignore */ }
  const decrypted = await decryptSettingsForDisplay((raw[storageKey()] as Partial<StorageSettings>) || {});
  loadSettings(decrypted);

  // Show wiki variant badge and disable incompatible modules
  const badge = document.getElementById("wiki-badge");
  if (badge && _wikiVariant) {
    badge.textContent = _wikiVariant;
  }
  if (_wikiVariant && _wikiVariant !== "wikipedia") {
    // Non-Wikipedia wikis: SFN is not supported — remove from module list
    const sfnCb = document.querySelector('[data-module="sfn"]') as HTMLInputElement | null;
    if (sfnCb) {
      sfnCb.checked = false;
      sfnCb.disabled = true;
      sfnCb.closest(".module-item")?.classList.add("depends-disabled");
      const sfnSection = document.querySelector('[data-module="sfn"]')?.closest(".module-item");
      if (sfnSection) {
        const note = document.createElement("span");
        note.className = "hint";
        note.textContent = " (not available on this wiki)";
        sfnSection.querySelector("span")?.after(note);
      }
    }
  }

  function watch(id: string, event = "change"): void {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, save);
  }

  function watchDependent(id: string, mod: string, event = "change"): void {
    const el = document.getElementById(id);
    if (!el) return;

    // Checkboxes: intercept click entirely — no state change, no flash
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.addEventListener("click", (e) => {
        if (!isModuleEnabled(mod)) {
          e.preventDefault();
          showDependencyWarning(mod);
          return;
        }
        setTimeout(save, 0);
      });
      return;
    }

    // Selects: prevent dropdown from opening on mousedown/keydown
    if (el instanceof HTMLSelectElement) {
      el.addEventListener("mousedown", (e) => {
        if (!isModuleEnabled(mod)) {
          e.preventDefault();
          showDependencyWarning(mod);
        }
      });
      el.addEventListener("keydown", (e) => {
        if ((e.key === " " || e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp")
            && !isModuleEnabled(mod)) {
          e.preventDefault();
          showDependencyWarning(mod);
        }
      });
      // Safety net: revert if value somehow changes despite guards
      let prevValue: string;
      el.addEventListener("focus", () => { prevValue = el.value; });
      el.addEventListener("change", () => {
        if (!isModuleEnabled(mod)) { el.value = prevValue; return; }
        save();
      });
      return;
    }

    // Number/text inputs (e.g. max_authors): store on focus, revert on change
    let prevValue: string;
    el.addEventListener("focus", () => { prevValue = (el as HTMLInputElement).value; });
    el.addEventListener(event, () => {
      if (!isModuleEnabled(mod)) {
        (el as HTMLInputElement).value = prevValue;
        showDependencyWarning(mod);
        return;
      }
      save();
    });
  }

  function watchModules(): void {
    for (const mod of MODULES) {
      const cb = document.querySelector(`[data-module="${mod}"]`) as HTMLElement | null;
      if (cb) {
        cb.addEventListener("change", () => {
          save();
          updateDependentVisuals();
        });
      }
    }
  }
  function watchIdCheckboxes(): void {
    for (const id of ID_OPTIONS) {
      const cb = document.querySelector(`[data-id="${id}"]`) as HTMLInputElement | null;
      if (!cb) continue;
      let prevChecked: boolean;
      cb.addEventListener("focus", () => { prevChecked = cb.checked; });
      cb.addEventListener("change", () => {
        if (!isModuleEnabled("ids")) {
          cb.checked = prevChecked;
          showDependencyWarning("ids");
          return;
        }
        save();
      });
    }
  }

  watch("force");
  watch("auto_update");
  watch("rename_ref_names");
  watch("spacing_style");
  watch("cache_ttl_hours", "input");
  watch("max_retries", "input");
  watch("crossref_email", "input");
  watch("ncbi_api_key", "input");
  watch("semantic_scholar_api_key", "input");

  watchDependent("author_style", "authors");
  watchDependent("refresh_authors", "authors");
  watchDependent("max_authors", "authors", "input");
  watchDependent("skip_org_authors", "authors");
  watchDependent("force_archive_all", "archive");
  watchDependent("create_archive", "archive");
  watchDependent("strip_issn", "cleanup");
  watchDependent("sfn_page_conflict", "sfn");

  watchModules();
  watchIdCheckboxes();

  document.getElementById("resetBtn")!.addEventListener("click", async () => {
    loadSettings(DEFAULTS);
    await save();
  });
});
