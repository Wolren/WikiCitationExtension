/** Canonical settings schema — single source of truth for both content.ts and popup.ts */
export const SETTINGS_SCHEMA: Record<string, string> = {
  modules: 'string', force: 'boolean', ref_names: 'boolean', auto_update: 'boolean',
  author_style: 'string', refresh_authors: 'boolean', max_authors: 'number',
  ids_to_fetch: 'string', force_archive_all: 'boolean', create_archive: 'boolean',
  strip_issn: 'boolean', rename_ref_names: 'boolean', skip_org_authors: 'boolean', spacing_style: 'string',
  upgrade_https: 'boolean',
  sfn_page_conflict: 'string',
  cache_ttl_hours: 'number', max_retries: 'number',
  crossref_email: 'string', ncbi_api_key: 'string', semantic_scholar_api_key: 'string',
};

/** Validate settings object against schema — returns true if valid */
export function validateSettings(s: Record<string, unknown>): boolean {
  for (const [key, type] of Object.entries(SETTINGS_SCHEMA)) {
    if (s[key] !== undefined && typeof s[key] !== type) return false;
  }
  return true;
}

/** Sensitive keys that are stored encrypted */
export const SENSITIVE_KEYS = ["crossref_email", "ncbi_api_key", "semantic_scholar_api_key"] as const;

export const DEFAULT_MODULES = "expand,cleanup,dates,ids,archive,dedup";

export const DEFAULT_STORAGE_KEY = "wikifix_settings";
