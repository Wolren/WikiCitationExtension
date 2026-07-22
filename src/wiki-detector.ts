export type WikiVariant = 'wikipedia' | 'fandom' | 'miraheze' | 'generic';

export interface WikiInfo {
  isMediaWiki: boolean;
  variant: WikiVariant;
  apiUrl: string | null;
}

let apiProbeCache: string | null | undefined = undefined;

async function doProbeApiUrl(origin: string, candidates: string[]): Promise<string | null> {
  for (const path of candidates) {
    const url = `${origin}${path}?action=query&format=json&meta=siteinfo&origin=*`;
    try {
      const res = await globalThis.fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (data?.query?.generator?.startsWith('MediaWiki')) return `${origin}${path}`;
      }
    } catch { continue; }
  }
  return null;
}

export async function probeApiUrl(wiki: WikiInfo): Promise<string | null> {
  if (apiProbeCache !== undefined) return apiProbeCache;
  if (!wiki.isMediaWiki) { apiProbeCache = null; return null; }
  if (wiki.apiUrl) { apiProbeCache = wiki.apiUrl; return wiki.apiUrl; }
  const origin = window.location.origin;
  const result = await doProbeApiUrl(origin, API_PROBE_CANDIDATES);
  apiProbeCache = result;
  return result;
}

export function resetApiProbeCache(): void {
  apiProbeCache = undefined;
}

export function detectWiki(): WikiInfo {
  const host = window.location.hostname || '';

  if (host.endsWith('.wikipedia.org') || host === 'wikipedia.org') {
    return { isMediaWiki: true, variant: 'wikipedia', apiUrl: `${window.location.origin}/w/api.php` };
  }

  if (host.endsWith('.fandom.com') || host.endsWith('.wikia.org')) {
    return { isMediaWiki: true, variant: 'fandom', apiUrl: `${window.location.origin}/api.php` };
  }

  if (host.endsWith('.miraheze.org')) {
    return { isMediaWiki: true, variant: 'miraheze', apiUrl: `${window.location.origin}/w/api.php` };
  }

  if (host.endsWith('.gamepedia.com') || host.endsWith('.wiki.gg')) {
    return { isMediaWiki: true, variant: 'fandom', apiUrl: `${window.location.origin}/api.php` };
  }

  const isMW =
    document.documentElement.classList.contains('mediawiki') ||
    !!document.getElementById('mw-content-text') ||
    typeof (globalThis as any).mw === 'object';

  return {
    isMediaWiki: isMW,
    variant: 'generic',
    apiUrl: isMW ? `${window.location.origin}/w/api.php` : null,
  };
}

export { API_PROBE_CANDIDATES };

export function isEditPage(): boolean {
  if (window.location.search.includes('action=edit')) return true;
  if (window.location.search.includes('action=submit')) return true;
  if (window.location.search.includes('veaction=edit')) return true;
  if (document.getElementById('wpTextbox1')) return true;

  const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
  for (const ta of textareas) {
    if (ta.offsetWidth > 300 && ta.offsetHeight > 150) return true;
  }

  if (document.querySelector('[contenteditable="true"]')) return true;

  return false;
}

const API_PROBE_CANDIDATES = [
  '/w/api.php',
  '/api.php',
  '/wiki/api.php',
  '/mediawiki/api.php',
  '/w/api.php',
];

export function getDisabledModules(wiki: WikiInfo): string[] {
  const disabled: string[] = [];
  if (wiki.variant !== 'wikipedia') {
    disabled.push('sfn');
  }
  return disabled;
}

const STORAGE_KEY_PREFIX = "wikifix_settings";

export function getSettingsKey(): string {
  const wiki = detectWiki();
  return `${STORAGE_KEY_PREFIX}_${wiki.variant}`;
}

export function getGlobalSettingsKey(): string {
  return STORAGE_KEY_PREFIX;
}

export function getPageTitle(): string {
  const pathMatch = window.location.pathname.match(/\/(?:wiki|view|title)\/(.+)/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);

  const urlParams = new URLSearchParams(window.location.search);
  const title = urlParams.get('title');
  if (title) return title;

  const pageName = urlParams.get('page');
  if (pageName) return pageName;

  return '';
}
