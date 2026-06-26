import { checkWayback } from "./api";
import { detectCitationType } from "./wikitext";
import { hyphenate } from "isbn3";

const TYPO_MAP: Record<string, string> = {
  pubisher: "publisher",
  auther: "author",
  journl: "journal",
  edittion: "edition",
  pulisher: "publisher",
};

const NONE_VALUES = new Set(["none", "n/a", "-"]);

const VALID_URL_STATUSES = new Set(["live", "dead", "unfit", "usurped", "bot: unknown"]);

const DEPRECATED_PARAMS = ["month", "day", "coauthors", "co-author"];

const PLACEHOLDER_TITLES = new Set(["archived copy", "title", "untitled", "no title"]);

export function fixIsbn(isbn: string): string | null {
  const s = isbn.replace(/-/g, "");
  if (/^\d{9}[\dX]$/i.test(s)) {
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += (10 - i) * +s[i];
    const check = (11 - (sum % 11)) % 11;
    if ((check === 10 ? "X" : String(check)) !== s[9].toUpperCase()) return null;
    const prefix = "978" + s.slice(0, 9);
    let sum13 = 0;
    for (let i = 0; i < 12; i++) sum13 += (i % 2 === 0 ? 1 : 3) * +prefix[i];
    return prefix + ((10 - (sum13 % 10)) % 10);
  }
  if (/^\d{13}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * +s[i];
    if ((10 - (sum % 10)) % 10 !== +s[12]) return null;
    return s;
  }
  return null;
}

function formatIsbnDisplay(s: string): string {
  const h = hyphenate(s);
  return h || `${s.slice(0, 3)}-${s.slice(3, 4)}-${s.slice(4, 7)}-${s.slice(7, 12)}-${s.slice(12)}`;
}

function removeEmptyValues(p: Record<string, string>, changes: string[]): void {
  for (const k of Object.keys(p)) {
    if (p[k] === "") { delete p[k]; changes.push("removed-empty-" + k); }
  }
}

function removeNoneValues(p: Record<string, string>, changes: string[]): void {
  for (const k of Object.keys(p)) {
    if (NONE_VALUES.has(p[k].toLowerCase())) { delete p[k]; changes.push("removed-none-" + k); }
  }
}

function fixTypos(p: Record<string, string>, changes: string[]): void {
  for (const [wrong, correct] of Object.entries(TYPO_MAP)) {
    if (wrong in p) { p[correct] = p[wrong]; delete p[wrong]; changes.push("typo-" + wrong + "-to-" + correct); }
  }
}

function normalizeIssn(p: Record<string, string>, changes: string[]): void {
  if (!p.issn) return;
  const clean = p.issn.replace(/-/g, "");
  if (/^\d{7}[\dX]$/i.test(clean)) {
    p.issn = clean.slice(0, 4) + "-" + clean.slice(4);
  } else {
    delete p.issn;
    changes.push("removed-invalid-issn");
  }
}

function normalizeIsbn(p: Record<string, string>, changes: string[]): void {
  if (!p.isbn) return;
  const fixed = fixIsbn(p.isbn);
  if (fixed) {
    const display = fixed.length === 13 ? formatIsbnDisplay(fixed) : fixed;
    if (display !== p.isbn) { p.isbn = display; changes.push("isbn-normalized"); }
  } else {
    changes.push(/^\d{13}$/.test(p.isbn.replace(/-/g, "")) ? "invalid-isbn-13" : "invalid-isbn-10");
    delete p.isbn;
  }
}

function moveUrlFromTitle(p: Record<string, string>, changes: string[]): void {
  if (p.title && /^https?:\/\//i.test(p.title)) {
    p.url = p.title;
    delete p.title;
    changes.push("title-to-url");
  }
}

function cleanPrefixes(p: Record<string, string>, changes: string[]): void {
  const prefixes: [string, RegExp, string][] = [
    ["volume", /^(?:Vol\.|vol\.|Volume|volume)\s*/, "cleaned-volume"],
    ["pages", /^(?:pp\.|p\.|P\.|PP\.)\s*/, "cleaned-pages"],
    ["issue", /^(?:No\.|no\.|Issue|issue|#)\s*/, "cleaned-issue"],
    ["edition", /\s*(?:edition|ed\.|ed)\s*$/i, "cleaned-edition"],
  ];
  for (const [key, re, changeLabel] of prefixes) {
    if (!p[key]) continue;
    const v = p[key].replace(re, "");
    if (v !== p[key]) { p[key] = v; changes.push(changeLabel); }
  }
}

function detectPlaceholders(p: Record<string, string>, changes: string[]): void {
  if (p.title && PLACEHOLDER_TITLES.has(p.title.toLowerCase())) {
    changes.push("placeholder-title");
  }
}

function enforcePeriodicalRules(p: Record<string, string>, tt: string | undefined, changes: string[]): void {
  if (tt === "cite book" && p.location && !p.publisher) changes.push("location-no-publisher");

  if (p.isbn && p.work && tt !== "citation") { delete p.work; changes.push("work-with-isbn"); }

  let conflict = false;
  if (tt === "cite web") {
    if (p.journal) { delete p.journal; conflict = true; }
    if (p.newspaper) { delete p.newspaper; conflict = true; }
  } else if (tt === "cite journal") {
    if (p.work) { delete p.work; conflict = true; }
  } else if (tt === "cite news") {
    if (p.journal) { delete p.journal; conflict = true; }
  }
  if (conflict) changes.push("periodical-conflict");

  if (tt === "citation" && p.work && p.journal && p.work === p.journal) {
    delete p.journal;
    changes.push("work-journal-dedup");
  }
}

function removeDeprecatedParams(p: Record<string, string>, changes: string[]): void {
  let found = false;
  for (const k of DEPRECATED_PARAMS) {
    if (k in p) { delete p[k]; found = true; }
  }
  if (found) changes.push("deprecated-param");
}

function removeConflictingParams(p: Record<string, string>, changes: string[]): void {
  if (p["url-status"] && !VALID_URL_STATUSES.has(p["url-status"])) {
    delete p["url-status"];
    changes.push("invalid-url-status");
  }
  if (p.page && p.pages) { delete p.pages; changes.push("page-pages-conflict"); }
  if (p.year && p.date) { delete p.year; changes.push("year-date-conflict"); }
  if (p["access-date"] && !p.url) { delete p["access-date"]; changes.push("orphan-access-date"); }
  if (p["doi-broken-date"] && !p.doi) { delete p["doi-broken-date"]; changes.push("orphan-doi-broken-date"); }
}

function flagExternalLinks(p: Record<string, string>, changes: string[]): void {
  const skipKeys = new Set(["url", "doi", "isbn", "archive-url", "chapter-url"]);
  for (const [k, v] of Object.entries(p)) {
    if (!skipKeys.has(k) && /^https?:\/\//i.test(v)) { changes.push("external-link"); break; }
  }
}

function fixNbsp(p: Record<string, string>, changes: string[]): void {
  let found = false;
  for (const k of Object.keys(p)) {
    if (p[k].includes("\u00a0")) { p[k] = p[k].replace(/\u00a0/g, " "); found = true; }
  }
  if (found) changes.push("nbsp-fix");
}

function fixUrlScheme(p: Record<string, string>, changes: string[]): void {
  for (const k of ["url", "archive-url", "chapter-url"]) {
    if (p[k] && !/^https?:\/\//i.test(p[k])) {
      p[k] = "https://" + p[k];
      changes.push("fixed-url-scheme-" + k);
    }
  }
}

function fixUrlSpaces(p: Record<string, string>, changes: string[]): void {
  for (const k of ["url", "archive-url", "chapter-url", "doi"]) {
    if (p[k] && p[k].includes(" ")) {
      p[k] = p[k].replace(/\s+/g, "%20");
      changes.push("fixed-url-spaces-" + k);
    }
  }
}

function checkAuthorNames(p: Record<string, string>, changes: string[]): void {
  for (let i = 0; i <= 9; i++) {
    const s = i === 0 ? "" : String(i + 1);
    if (p[`first${s}`] && !p[`last${s}`]) {
      changes.push("first-without-last" + s);
    }
  }
}

const MONTH_NAMES = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]);

function validateDateRanges(p: Record<string, string>, changes: string[]): void {
  const dateStr = p.date || "";
  if (!dateStr) return;
  const monthM = dateStr.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  const monthFirstM = dateStr.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthM) {
    const day = parseInt(monthM[1], 10);
    if (day < 1 || day > 31) { changes.push("invalid-day"); delete p.date; }
  } else if (monthFirstM) {
    const day = parseInt(monthFirstM[2], 10);
    if (day < 1 || day > 31) { changes.push("invalid-day"); delete p.date; }
  }
  const yearM = dateStr.match(/(\d{4})/);
  if (yearM) {
    const year = parseInt(yearM[1], 10);
    if (year < 1000 || year > new Date().getFullYear() + 5) { changes.push("suspicious-year"); }
  }
}

function warnMissingRequired(p: Record<string, string>, tt: string | undefined, changes: string[]): void {
  if (tt === "cite web" && !p.url) changes.push("missing-url");
  if (tt === "cite book" && !p.publisher) changes.push("missing-publisher");
  if (tt === "cite journal" && !p.journal && !p.work) changes.push("missing-journal");
  if (p.url && !/^https?:\/\//i.test(p.url)) changes.push("url-missing-scheme");
}

function detectStyleConflicts(p: Record<string, string>, changes: string[]): void {
  if (p.vauthors) {
    for (let i = 0; i <= 9; i++) {
      const s = i === 0 ? "" : String(i + 1);
      if (p["last" + s]) { changes.push("vauthors-with-last"); break; }
    }
  }
  for (let i = 1; i <= 9; i++) {
    if (p["last" + i] && p["author"]) { changes.push("author-and-last"); break; }
  }
}

function detectOrphanedLinks(p: Record<string, string>, changes: string[]): void {
  if (p["author-link"] && !p.author && !p.last && !p.last1) changes.push("orphan-author-link");
  if (p["translator-link"] && !p.translator) changes.push("orphan-translator-link");
  if (p["series-link"] && !p.series) changes.push("orphan-series-link");
}

function normalizeAllValues(p: Record<string, string>, changes: string[]): void {
  for (const k of Object.keys(p)) {
    const trimmed = p[k].trim();
    if (trimmed !== p[k]) { p[k] = trimmed; changes.push("trimmed-" + k); }
    const noDbl = p[k].replace(/\s{2,}/g, " ");
    if (noDbl !== p[k]) { p[k] = noDbl; changes.push("collapse-space-" + k); }
  }
}

function detectArchiveWarnings(p: Record<string, string>, changes: string[]): void {
  if (p["url-status"] === "dead" && !p["archive-url"]) changes.push("dead-without-archive");
  if (p["archive-url"] && !p.url) changes.push("archive-without-url");
}

function detectIdAnomalies(p: Record<string, string>, changes: string[]): void {
  if (p.pmc && !p.pmid) changes.push("pmc-without-pmid");
  if (p.pmid && !/^\d+$/.test(p.pmid)) changes.push("non-numeric-pmid");
  if (p.pmc && !/^PMC\d+$/i.test(p.pmc) && !/^\d+$/.test(p.pmc)) changes.push("non-numeric-pmc");
}

function detectDeprecatedRef(p: Record<string, string>, changes: string[]): void {
  if (p.ref === "harv") {
    delete p.ref;
    changes.push("deprecated-ref-harv");
  }
}

function detectQuoteWithoutTitle(p: Record<string, string>, changes: string[]): void {
  if (p.quote && !p.title) changes.push("quote-without-title");
}

function detectLanguageIssues(p: Record<string, string>, changes: string[]): void {
  if (p.language) {
    const lang = p.language.toLowerCase();
    const knownEnglish = ["en", "english", "en-us", "en-gb"];
    if (knownEnglish.includes(lang)) {
      delete p.language;
      changes.push("redundant-english-language");
    }
  }
}

function warnMissingFields(p: Record<string, string>, tt: string | undefined, changes: string[]): void {
  if (tt === "cite web" && !p.url) changes.push("missing-url");
  if (tt === "cite book" && !p.publisher) changes.push("missing-publisher");
}

function detectTypeAndRename(
  p: Record<string, string>,
  tt: string | undefined,
  hadWork: boolean
): { renameParams?: Record<string, string>; newTemplateType?: string } {
  if (tt !== "citation") return {};
  const detected = detectCitationType(p);
  if (!detected.new) return {};

  const renameParams: Record<string, string> = {};
  if (detected.new === "cite book") {
    if (p.isbn && hadWork) {
      renameParams.title = "chapter";
      renameParams.work = "title";
      renameParams.url = "chapter-url";
      renameParams.place = "location";
    } else {
      renameParams.place = "location";
    }
  } else if (detected.new === "cite journal") {
    renameParams.place = "location";
    renameParams.work = "journal";
  } else if (detected.new === "cite web") {
    renameParams.work = "website";
    renameParams.place = "location";
  }
  return { renameParams, newTemplateType: detected.new };
}

export function cleanupCitation(
  params: Record<string, string>,
  options?: { templateType?: string; force?: boolean }
): { params: Record<string, string>; changes: string[]; renameParams?: Record<string, string>; newTemplateType?: string } {
  const p = { ...params };
  const changes: string[] = [];
  const tt = options?.templateType;
  const hadWork = !!p.work;

  removeEmptyValues(p, changes);
  removeNoneValues(p, changes);
  fixTypos(p, changes);
  normalizeIssn(p, changes);
  normalizeIsbn(p, changes);
  moveUrlFromTitle(p, changes);
  cleanPrefixes(p, changes);
  detectPlaceholders(p, changes);
  enforcePeriodicalRules(p, tt, changes);
  removeDeprecatedParams(p, changes);
  removeConflictingParams(p, changes);
  flagExternalLinks(p, changes);
  fixNbsp(p, changes);
  fixUrlScheme(p, changes);
  fixUrlSpaces(p, changes);
  checkAuthorNames(p, changes);
  validateDateRanges(p, changes);
  normalizeAllValues(p, changes);
  detectStyleConflicts(p, changes);
  detectOrphanedLinks(p, changes);
  detectArchiveWarnings(p, changes);
  detectIdAnomalies(p, changes);
  detectDeprecatedRef(p, changes);
  detectQuoteWithoutTitle(p, changes);
  detectLanguageIssues(p, changes);
  warnMissingRequired(p, tt, changes);

  return { params: p, changes, ...detectTypeAndRename(p, tt, hadWork) };
}

export function checkEssentialParams(params: Record<string, string>): string[] {
  const warnings: string[] = [];
  if (!params.title) warnings.push("missing-title");
  if (!params.date && !params.year) warnings.push("missing-date");
  if (!params.url && !params.doi) warnings.push("missing-url-or-doi");
  if (!params.journal && !params.work && !params.newspaper && !params.magazine && !params.website && !params.publisher && !params.isbn) {
    warnings.push("missing-source");
  }
  return warnings;
}

export function cleanupCitationBody(body: string): string {
  return body.replace(/\|{2,}/g, "|");
}

export function detectDuplicates(citations: { params: Record<string, string> }[]): string[] {
  const warnings: string[] = [];
  const doiCount = new Map<string, number>();
  const pmidCount = new Map<string, number>();
  for (const c of citations) {
    const doi = c.params.doi;
    const pmid = c.params.pmid;
    if (doi) {
      const n = (doiCount.get(doi) ?? 0) + 1;
      if (n === 2) warnings.push("duplicate-" + doi);
      doiCount.set(doi, n);
    }
    if (pmid) {
      const n = (pmidCount.get(pmid) ?? 0) + 1;
      if (n === 2) warnings.push("duplicate-" + pmid);
      pmidCount.set(pmid, n);
    }
  }
  return warnings;
}

export async function addArchiveUrls(params: Record<string, string>, forceAll: boolean): Promise<{ params: Record<string, string>; changes: string[] }> {
  const result = { ...params };
  const changes: string[] = [];
  if (result.url) {
    if (!forceAll && result.doi) return { params: result, changes };
    if (result["archive-url"]) return { params: result, changes };
    const wayback = await checkWayback(result.url);
    if (wayback?.archived_snapshots?.closest?.url) {
      const snap = wayback.archived_snapshots.closest;
      result["archive-url"] = snap.url!;
      if (snap.timestamp) {
        const ts = snap.timestamp;
        result["archive-date"] = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
      }
      changes.push("archive-added");
    }
  }
  return { params: result, changes };
}
