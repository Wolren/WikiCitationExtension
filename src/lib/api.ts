import { isValidDoi } from "../lib/wikitext";
import { PersistentCache } from "./cache";

interface CrossrefWork { DOI?: string; title?: string[]; "container-title"?: string[]; publisher?: string; "published-print"?: { "date-parts"?: number[][] }; "published-online"?: { "date-parts"?: number[][] }; author?: { given?: string; family?: string }[]; type?: string; "is-oa"?: boolean; }
interface OpenAlexWork { id?: string; ids?: { wikidata?: string }; }
interface NCBIResult { uid?: string; title?: string; source?: string; }
interface ArXivResult { title?: string; doi?: string; published?: string; }
interface OpenLibraryResult { title?: string; publishers?: string[]; }
interface SemanticScholarResult { externalIds?: { CorpusId?: string }; citationCount?: number; }
interface EuropePMCResult { title?: string; journalTitle?: string; }
interface WaybackResponse { archived_snapshots?: { closest?: { url?: string; timestamp?: string; status?: string } } }
interface DataCiteResult { id?: string; doi?: string; titles?: { title?: string }[]; publisher?: string; publicationYear?: number; dates?: { date?: string; dateType?: string }[]; creators?: { givenName?: string; familyName?: string; name?: string }[]; }
interface UnpaywallResult { doi?: string; is_oa?: boolean; best_oa_location?: { url?: string; host_type?: string; }; }

let crossrefEmail = "";
let ncbiKey = "";
let semanticScholarKey = "";

export function setApiKeys(keys: { crossrefEmail?: string; ncbiKey?: string; semanticScholarKey?: string }): void {
  if (keys.crossrefEmail !== undefined) crossrefEmail = keys.crossrefEmail;
  if (keys.ncbiKey !== undefined) ncbiKey = keys.ncbiKey;
  if (keys.semanticScholarKey !== undefined) semanticScholarKey = keys.semanticScholarKey;
}

// ── Rate limiter (per-domain) ───────────────────────────────────────────────
const domainLimiters = new Map<string, RateLimiter>();

class RateLimiter {
  private queue: (() => void)[] = [];
  private running = 0;
  private lastCall = 0;
  private retryUntil = 0;

  constructor(private maxRps: number) {}

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()); } catch (e) { reject(e); }
      });
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running >= 1) return;
    if (this.queue.length === 0) return;
    const now = Date.now();

    if (now < this.retryUntil) {
      setTimeout(() => this.drain(), this.retryUntil - now);
      return;
    }

    const wait = Math.max(0, 1000 / this.maxRps - (now - this.lastCall));
    if (wait > 0) {
      setTimeout(() => this.drain(), wait);
      return;
    }

    this.running++;
    this.lastCall = Date.now();
    const task = this.queue.shift()!;
    try {
      await task();
    } finally {
      this.running--;
      this.drain();
    }
  }

  retryAfter(ms: number): void {
    this.retryUntil = Date.now() + ms;
  }
}

function getRateLimiter(domain: string): RateLimiter {
  let limiter = domainLimiters.get(domain);
  if (!limiter) {
    let maxRps = 2;
    if (domain.includes("crossref")) maxRps = crossrefEmail ? 50 : 5;
    else if (domain.includes("ncbi")) maxRps = ncbiKey ? 10 : 3;
    else if (domain.includes("semanticscholar")) maxRps = semanticScholarKey ? 10 : 1;
    limiter = new RateLimiter(maxRps);
    domainLimiters.set(domain, limiter);
  }
  return limiter;
}

// ── In-flight request dedup ──────────────────────────────────────────────────
const inflightRequests = new Map<string, Promise<unknown>>();

function dedupKey(url: string, options?: RequestInit): string {
  return options?.method === 'POST' ? url : url;
}

async function dedupedFetch<T>(url: string, options?: RequestInit, signal?: AbortSignal): Promise<T | null> {
  const key = dedupKey(url, options);
  const existing = inflightRequests.get(key);
  if (existing) return existing as Promise<T | null>;
  const promise = (async () => {
    try {
      const domain = new URL(url).hostname;
      const limiter = getRateLimiter(domain);
      return await limiter.add(async () => {
        const mergedSignal = signal ? signal : undefined;
        const fetchOpts: RequestInit = { ...options, signal: mergedSignal };
        try {
          const res = await globalThis.fetch(url, fetchOpts);
          if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After");
            if (retryAfter) {
              const ms = parseInt(retryAfter) * 1000 || 60000;
              limiter.retryAfter(ms);
            }
            return null;
          }
          if (!res.ok) return null;
          return await res.json() as T;
        } catch (e) {
          if (signal?.aborted) return null;
          throw e;
        }
      });
    } catch {
      return null;
    }
  })();
  inflightRequests.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inflightRequests.get(key) === promise) {
      inflightRequests.delete(key);
    }
  }
}

// ── Persistent cache layer ───────────────────────────────────────────────────
const apiCache = new PersistentCache<{ data: unknown; ttl: number }>();
const CACHE_TTL_MS = 3600000; // 1 hour

async function fetchJson<T>(url: string, options?: RequestInit, signal?: AbortSignal): Promise<T | null> {
  const cacheKey = options?.method === 'POST' ? null : `fetch:${url}`;
  if (cacheKey && !signal?.aborted) {
    const cached = await apiCache.get(cacheKey);
    if (cached) return cached.data as T;
  }
  const result = await dedupedFetch<T>(url, options, signal);
  if (result && cacheKey) {
    apiCache.set(cacheKey, { data: result, ttl: CACHE_TTL_MS }, CACHE_TTL_MS).catch(() => {});
  }
  return result;
}

function crossrefParams(): string {
  if (!crossrefEmail) return "";
  return "?" + new URLSearchParams({ mailto: crossrefEmail }).toString();
}

function crossrefUrl(path: string): string {
  return `https://api.crossref.org/works/${encodeURIComponent(path)}${crossrefParams()}`;
}

export async function fetchCrossref(doi: string, signal?: AbortSignal): Promise<CrossrefWork | null> {
  const data = await fetchJson<{ message: CrossrefWork }>(crossrefUrl(doi), undefined, signal);
  return data?.message ?? null;
}

export async function searchCrossrefByTitle(title: string, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({ "query.title": title, rows: "1" });
  if (crossrefEmail) params.set("mailto", crossrefEmail);
  const data = await fetchJson<{ message?: { items?: { DOI?: string }[] } }>(`https://api.crossref.org/works?${params}`, undefined, signal);
  return data?.message?.items?.[0]?.DOI ?? null;
}

export async function fetchCrossrefOaStatus(doi: string, signal?: AbortSignal): Promise<string | null> {
  const data = await fetchJson<{ message?: { "is-oa"?: boolean } }>(crossrefUrl(doi), undefined, signal);
  return data?.message?.["is-oa"] ? "free" : null;
}

export async function fetchOpenAlex(doi: string, signal?: AbortSignal): Promise<OpenAlexWork | null> {
  return fetchJson<OpenAlexWork>(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`, undefined, signal);
}

function ncbiUrl(db: string, extra: Record<string, string>): string {
  const params = new URLSearchParams({ db, retmode: "json", ...extra });
  if (ncbiKey) params.set("api_key", ncbiKey);
  return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${params}`;
}

export async function fetchNCBISummary(pmid: string, signal?: AbortSignal): Promise<NCBIResult | null> {
  const data = await fetchJson<{ result?: Record<string, NCBIResult> }>(ncbiUrl("pubmed", { id: pmid }), undefined, signal);
  return data?.result?.[pmid] ?? null;
}

export async function searchNCBIPmid(doi: string, signal?: AbortSignal): Promise<string | null> {
  if (!isValidDoi(doi)) return null;
  if (signal?.aborted) return null;
  const params = new URLSearchParams({ db: "pubmed", retmode: "json", term: `${doi}[doi]` });
  if (ncbiKey) params.set("api_key", ncbiKey);
  const data = await fetchJson<{ esearchresult?: { idlist?: string[] } }>(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params}`, undefined, signal);
  return data?.esearchresult?.idlist?.[0] ?? null;
}

export async function searchNCBIPmc(pmid: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;
  const params = new URLSearchParams({ db: "pmc", retmode: "json", term: `${pmid}[pmid]` });
  if (ncbiKey) params.set("api_key", ncbiKey);
  const data = await fetchJson<{ esearchresult?: { idlist?: string[] } }>(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params}`, undefined, signal);
  return data?.esearchresult?.idlist?.[0] ?? null;
}

export async function fetchArXiv(arxivId: string): Promise<ArXivResult | null> {
  const xml = await (async () => {
    try {
      const res = await globalThis.fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  })();
  if (!xml) return null;
  const titleM = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const doiM = xml.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i) || xml.match(/<doi[^>]*>([\s\S]*?)<\/doi>/i);
  const publishedM = xml.match(/<published[^>]*>([\s\S]*?)<\/published>/i);
  const result: ArXivResult = {};
  if (titleM) result.title = titleM[1].trim();
  if (doiM) result.doi = doiM[1].trim();
  if (publishedM) result.published = publishedM[1].trim();
  return Object.keys(result).length > 0 ? result : null;
}

export async function fetchOpenLibrary(isbn: string): Promise<OpenLibraryResult | null> {
  return fetchJson<OpenLibraryResult>(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
}

export async function fetchSemanticScholar(doi: string, signal?: AbortSignal): Promise<SemanticScholarResult | null> {
  if (!isValidDoi(doi)) return null;
  if (signal?.aborted) return null;
  const headers: Record<string, string> = {};
  if (semanticScholarKey) headers["x-api-key"] = semanticScholarKey;
  return fetchJson<SemanticScholarResult>(
    `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(doi)}?fields=externalIds,citationCount`,
    { headers }, signal
  );
}

export async function fetchEuropePMC(query: string): Promise<EuropePMCResult | null> {
  const params = new URLSearchParams({ query, format: "json", resultType: "core", pageSize: "1" });
  const data = await fetchJson<{ resultList?: { result?: EuropePMCResult[] } }>(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`);
  return data?.resultList?.result?.[0] ?? null;
}

export async function fetchEuropePMCByDoi(doi: string): Promise<EuropePMCResult | null> {
  return fetchEuropePMC(`(DOI:"${doi}")`);
}

export async function fetchEuropePMCByPmid(pmid: string): Promise<EuropePMCResult | null> {
  return fetchEuropePMC(`(PMID:"${pmid}")`);
}

export async function headUrl(url: string): Promise<number | null> {
  try {
    const res = await globalThis.fetch(url, { method: "HEAD" });
    return res.status;
  } catch {
    return null;
  }
}

export async function checkWayback(url: string): Promise<WaybackResponse | null> {
  const params = new URLSearchParams({ url });
  return fetchJson<WaybackResponse>(`https://archive.org/wayback/available?${params}`);
}

export async function saveWayback(url: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await globalThis.fetch(`https://web.archive.org/save/${encodeURIComponent(url)}`, { method: "POST", signal });
    return res.status === 200 || res.status === 429;
  } catch {
    return false;
  }
}

export async function fetchCrossrefAuthors(doi: string, signal?: AbortSignal): Promise<[string, string][] | null> {
  const data = await fetchJson<{ message?: { author?: { given?: string; family?: string }[] } }>(crossrefUrl(doi), undefined, signal);
  const authors = data?.message?.author;
  if (!authors) return null;
  return authors.map(a => [a.family ?? "", a.given ?? ""] as [string, string]);
}

export async function fetchDataCite(doi: string, signal?: AbortSignal): Promise<DataCiteResult | null> {
  return fetchJson<DataCiteResult>(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`, undefined, signal);
}

export async function fetchUnpaywall(doi: string): Promise<UnpaywallResult | null> {
  const email = crossrefEmail || "team@wikifix.example";
  return fetchJson<UnpaywallResult>(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`);
}

// ── MediaWiki API helpers ──────────────────────────────────────────────

export async function fetchEditToken(apiBase: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query", format: "json", meta: "tokens", type: "csrf", origin: "*",
  });
  try {
    const res = await globalThis.fetch(`${apiBase}?${params}`);
    if (!res.ok) return null;
    const data = await res.json() as { query?: { tokens?: { csrtoken?: string } } };
    return data?.query?.tokens?.csrtoken ?? null;
  } catch {
    return null;
  }
}

export async function editPage(
  apiBase: string,
  title: string,
  text: string,
  summary: string,
  signal?: AbortSignal
): Promise<boolean> {
  const token = await fetchEditToken(apiBase);
  if (!token) return false;

  const formData = new URLSearchParams({
    action: "edit",
    format: "json",
    title,
    text,
    summary,
    token,
    origin: "*",
  });
  try {
    const res = await globalThis.fetch(apiBase, {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal,
    });
    if (!res.ok) return false;
    const data = await res.json() as { edit?: { result?: string } };
    return data?.edit?.result === "Success";
  } catch {
    return false;
  }
}
