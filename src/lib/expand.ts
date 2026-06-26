import { fetchCrossref, fetchNCBISummary, fetchArXiv, fetchOpenLibrary, fetchDataCite, fetchUnpaywall, searchNCBIPmid, searchNCBIPmc, searchCrossrefByTitle } from "./api";
import { normalizeDate } from "./dates";
import { fixIsbn } from "./cleanup";
import { extractDoiFromUrl } from "./wikitext";

const LANGUAGE_MAP: Record<string, string> = {
  fr: "French", de: "German", es: "Spanish", it: "Italian", pt: "Portuguese",
  ru: "Russian", ja: "Japanese", zh: "Chinese", ar: "Arabic", nl: "Dutch",
  ko: "Korean", sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish",
  pl: "Polish", tr: "Turkish", he: "Hebrew", th: "Thai", cs: "Czech",
  hu: "Hungarian", ro: "Romanian", uk: "Ukrainian", el: "Greek", id: "Indonesian",
  ms: "Malay", vi: "Vietnamese", bn: "Bengali", ta: "Tamil", te: "Telugu",
  mr: "Marathi", hi: "Hindi",
};

function detectWikiLanguage(): string | null {
  if (typeof document === "undefined") return null;
  const htmlLang = document.documentElement.lang?.split("-")[0]?.toLowerCase();
  if (htmlLang && htmlLang !== "en") return htmlLang;
  try {
    const host = window.location.hostname;
    const subdomain = host.split(".")[0];
    if (subdomain && subdomain !== "www" && subdomain.length === 2) return subdomain;
  } catch { /* ignore */ }
  return "en";
}

function normalizeLanguageCode(lang: string): string | null {
  const lower = lang.trim().toLowerCase();
  if (lower.length === 2 && /^[a-z]{2}$/.test(lower)) return lower;
  for (const [code, name] of Object.entries(LANGUAGE_MAP)) {
    if (name.toLowerCase() === lower || name.toLowerCase().startsWith(lower)) return code;
  }
  return null;
}

export function cleanPublisher(name: string): string {
  const original = name.trim();
  if (!original) return original;
  let result = original;
  result = result.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const pressMatch = result.match(/(?:,\s*)?Press$/);
  if (pressMatch) {
    const before = result.slice(0, pressMatch.index).trimEnd();
    const lastWord = before.split(/\s+/).pop();
    if (lastWord && lastWord !== "University" && lastWord !== "Oxford") {
      result = before;
    }
  } else {
    const suffixes = ["Inc.", "Inc", "Ltd.", "Ltd", "Limited", "GmbH", "AG", "S.A.", "S.p.A.", "B.V.", "Verlag", "Publishing", "Publications"];
    for (const s of suffixes) {
      const re = new RegExp(`(?:,\\s*)?${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
      if (re.test(result)) {
        result = result.replace(re, "").trim();
        break;
      }
    }
  }
  return result || original;
}

export function cleanJournal(name: string): string {
  const original = name.trim();
  if (!original) return original;
  const result = original.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return result || original;
}

const CROSSREF_TYPE_MAP: Record<string, string> = {
  "journal-article": "cite journal",
  "journal-issue": "cite journal",
  "book-chapter": "cite book",
  "monograph": "cite book",
  "reference-book": "cite book",
  "book": "cite book",
  "book-set": "cite book",
  "edited-book": "cite book",
  "proceedings": "cite conference",
  "proceedings-article": "cite conference",
  "report": "cite report",
  "report-series": "cite report",
  "dissertation": "cite thesis",
  "posted-content": "cite web",
  "dataset": "cite web",
  "standard": "cite web",
  "peer-review": "cite journal",
  "other": "cite web",
};

function crossrefTypeToCite(type: string): string | null {
  return CROSSREF_TYPE_MAP[type] || "cite web";
}

function fmtCrossrefDate(parts: number[]): string {
  const [y, m, d] = parts;
  if (y && m && d) return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (y && m) return `${y}-${String(m).padStart(2, "0")}`;
  return String(y);
}

function fmtAuthors(authors: { given?: string; family?: string }[]): string {
  return authors.map(a => {
    const last = (a.family ?? "").trim();
    const first = (a.given ?? "").trim();
    return first ? `${last}, ${first}` : last;
  }).filter(Boolean).join("; ");
}

const CORE_FIELDS = ["title", "date", "journal", "author", "author1", "publisher", "volume", "issue", "pages", "doi", "issn"];

function hasAllCoreFields(params: Record<string, string>): boolean {
  return CORE_FIELDS.every(f => params[f]?.trim());
}

export async function expandCitation(
  citation: { template: string; params: Record<string, string>; raw: string },
  options: { templateType?: string; force?: boolean; mode?: "incremental" | "force" }
): Promise<{ params: Record<string, string>; changes: string[] }> {
  const params = { ...citation.params };
  const changes: string[] = [];
  const force = options.force || options.mode === "force";
  const fill = (k: string) => force || !params[k]?.trim();

  if (!force && hasAllCoreFields(params)) return { params, changes };

  let doi = params.doi?.trim() || null;
  if (!doi && params.url) {
    const extracted = extractDoiFromUrl(params.url);
    if (extracted) { params.doi = extracted; doi = extracted; changes.push("extracted-doi"); }
  }

  const pmid = params.pmid?.trim() || null;
  const arxiv = params.arxiv?.trim() || null;
  const rawIsbn = params.isbn?.trim() || null;
  const isbn = rawIsbn ? fixIsbn(rawIsbn) : null;

  const wikiLang = detectWikiLanguage();

  if (doi) {
    const data = await fetchCrossref(doi) || await fetchDataCite(doi);
    if (data) {
      const extra = data as any;
      if (extra.title?.[0] && fill("title")) { params.title = extra.title[0]; changes.push("expanded-title"); }
      if (extra["container-title"]?.[0] && fill("journal")) { params.journal = cleanJournal(extra["container-title"][0]); changes.push("expanded-journal"); }
      const dp = extra["published-print"]?.["date-parts"]?.[0] ?? extra["published-online"]?.["date-parts"]?.[0]
        ?? (extra.publicationYear ? [extra.publicationYear] : null);
      if (dp && fill("date")) { params.date = normalizeDate(fmtCrossrefDate(dp)); changes.push("expanded-date"); }
      if (data.publisher && fill("publisher")) { params.publisher = cleanPublisher(data.publisher); changes.push("expanded-publisher"); }
      if (extra.volume && fill("volume")) { params.volume = String(extra.volume); changes.push("expanded-volume"); }
      if (extra.issue && fill("issue")) { params.issue = String(extra.issue); changes.push("expanded-issue"); }
      if (extra.page && fill("pages")) { params.pages = String(extra.page); changes.push("expanded-pages"); }
      if (extra["DOI"] && fill("doi")) { params.doi = extra["DOI"]; changes.push("expanded-doi"); }
      if (extra.ISSN?.[0] && fill("issn")) { params.issn = extra.ISSN[0]; changes.push("expanded-issn"); }
      if (extra.author?.length && fill("author1")) { const a = fmtAuthors(extra.author); if (a) { params.author1 = a; changes.push("expanded-authors"); } }
      if (extra.type && fill("type")) {
        const ct = crossrefTypeToCite(extra.type);
        if (ct) { params["_template_hint"] = ct; changes.push("expanded-type"); }
      }
      if (Array.isArray(extra.subject) && extra.subject.length > 0 && fill("subject")) {
        const subs = extra.subject.slice(0, 5).join("; ");
        if (subs) { params.subject = subs; changes.push("expanded-subject"); }
      }
      const dcData = data as DataCiteResult;
      if (dcData.language && !params.language && wikiLang !== "en") {
        const normalized = normalizeLanguageCode(dcData.language);
        if (normalized && normalized !== wikiLang) {
          params.language = normalized;
          changes.push("expanded-language");
        }
      }
    }

    if (!params.pmid) {
      const foundPmid = await searchNCBIPmid(doi);
      if (foundPmid) { params.pmid = foundPmid; changes.push("found-pmid"); }
    }

    if (!params.pmc && params.pmid) {
      const foundPmc = await searchNCBIPmc(params.pmid);
      if (foundPmc) { params.pmc = foundPmc; changes.push("found-pmc"); }
    }

    if (!params["url"] && !params["doi-access"]) {
      const oa = await fetchUnpaywall(doi);
      if (oa?.best_oa_location?.url && fill("url")) {
        params["url"] = oa.best_oa_location.url;
        params["url-access"] = "free";
        changes.push("expanded-oa-url");
      }
    }
  }

  if (pmid) {
    const data = await fetchNCBISummary(pmid);
    if (data) {
      if (data.title && fill("title")) { params.title = data.title; changes.push("expanded-title"); }
      if (data.source && fill("journal")) { params.journal = cleanJournal(data.source); changes.push("expanded-journal"); }
      const ext = data as any;
      if (ext.pubdate && fill("date")) { params.date = normalizeDate(ext.pubdate); changes.push("expanded-date"); }
      if (ext.elocationid && fill("pages")) { params.pages = ext.elocationid; changes.push("expanded-pages"); }
      if (data.lang && !params.language && wikiLang !== "en") {
        const normalized = normalizeLanguageCode(data.lang);
        if (normalized && normalized !== wikiLang) {
          params.language = normalized;
          changes.push("expanded-language");
        }
      }
    }
  }

  if (arxiv) {
    const data = await fetchArXiv(arxiv);
    if (data) {
      if (data.title && fill("title")) { params.title = data.title; changes.push("expanded-title"); }
      if (data.doi && fill("doi")) {
        params.doi = data.doi; changes.push("expanded-doi");
        if (!params.pmid) {
          const foundPmid = await searchNCBIPmid(data.doi);
          if (foundPmid) { params.pmid = foundPmid; changes.push("found-pmid"); }
        }
      }
      if (data.published && fill("date")) { params.date = normalizeDate(data.published); changes.push("expanded-date"); }
    }
  }

  if (isbn) {
    const data = await fetchOpenLibrary(isbn);
    if (data) {
      if (data.title && fill("title")) { params.title = data.title; changes.push("expanded-title"); }
      if (data.publishers?.length && fill("publisher")) { params.publisher = cleanPublisher(data.publishers.join(", ")); changes.push("expanded-publisher"); }
    }
  }

  if (!doi && !pmid && !arxiv && !isbn && params.title) {
    const foundDoi = await searchCrossrefByTitle(params.title);
    if (foundDoi) { params.doi = foundDoi; changes.push("found-doi-by-title"); }
  }

  return { params, changes };
}
