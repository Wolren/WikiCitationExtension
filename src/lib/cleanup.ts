import { checkWayback, headUrl } from "./api";
import { detectCitationType } from "./wikitext";
import { hyphenate } from "isbn3";

const TYPO_MAP: Record<string, string> = {
  pubisher: "publisher",
  auther: "author",
  journl: "journal",
  edittion: "edition",
  pulisher: "publisher",
};

/**
 * Wikipedia citation parameter aliases — the canonical (hyphenated) form
 * is the right one, but many articles still use the alias form.
 */
const PARAM_ALIASES: Record<string, string> = {
  // Aliases confirmed in Module:Citation/CS1/Configuration
  // AccessDate: {'access-date', 'accessdate'}
  accessdate: "access-date",
  // ArchiveDate: {'archive-date', 'archivedate'}
  archivedate: "archive-date",
  // ArchiveURL: {'archive-url', 'archiveurl'}
  archiveurl: "archive-url",
  // BookTitle: {'book-title', 'booktitle'}
  booktitle: "book-title",
  // Date: {'date', 'air-date', 'airdate'}
  airdate: "date",
  "air-date": "date",
  // DisplayAuthors: {'display-authors', 'display-subjects'}
  displayauthors: "display-authors",
  "display-subjects": "display-authors",
  // Language: {'language', 'lang'}
  lang: "language",
  // MailingList: {'mailing-list', 'mailinglist'}
  mailinglist: "mailing-list",
  // MapURL: {'map-url', 'mapurl'}
  mapurl: "map-url",
  // NoPP: {'no-pp', 'nopp'}
  nopp: "no-pp",
  // OrigDate: {'orig-date', 'orig-year', 'origyear'}
  origyear: "orig-date",
  "orig-year": "orig-date",
  // SeriesLink: {'series-link', 'serieslink'}
  serieslink: "series-link",
  // SeriesNumber: {'series-number', 'series-no'}
  "series-no": "series-number",
  // TitleLink: {'title-link', 'episode-link', 'episodelink'}
  episodelink: "title-link",
  // AuthorList-Link: {"author-link#", "author#-link", "subject-link#",
  //                    "subject#-link", "authorlink#", "author#link"}
  authorlink: "author-link",
  authorlink1: "author-link1",
  authorlink2: "author-link2",
  authorlink3: "author-link3",
  authorlink4: "author-link4",
  authorlink5: "author-link5",
  "author1-link": "author-link1",
  "author2-link": "author-link2",
  "author3-link": "author-link3",
  "author4-link": "author-link4",
  "author5-link": "author-link5",
  subjectlink: "author-link",
  "subject-link": "author-link",
  // EditorList-Link: {"editor-link#", "editor#-link"}
  // Note: the alias form is editor1-link (NOT editorlink1)
  "editor1-link": "editor-link1",
  "editor2-link": "editor-link2",
  "editor3-link": "editor-link3",
  "editor4-link": "editor-link4",
  "editor5-link": "editor-link5",
  // TranslatorList-Link: {'translator-link#', 'translator#-link'}
  // Note: the alias form is translator1-link (NOT translatorlink1)
  "translator1-link": "translator-link1",
  "translator2-link": "translator-link2",
  "translator3-link": "translator-link3",
  "translator4-link": "translator-link4",
  "translator5-link": "translator-link5",
  // InterviewerList-Link: {'interviewer-link#', 'interviewer#-link'}
  "interviewer1-link": "interviewer-link1",
  "interviewer2-link": "interviewer-link2",
  "interviewer3-link": "interviewer-link3",
  "interviewer4-link": "interviewer-link4",
  "interviewer5-link": "interviewer-link5",
  // ChapterURL: {'chapter-url', 'contribution-url', 'entry-url',
  //               'article-url', 'section-url'}
  // These are proper param names, not aliases — don't map.
  // ConferenceURL: 'conference-url' — no alias (single string).
};

/** deadurl="yes" → url-status="dead", deadurl="no" → remove */
function normalizeDeadurl(p: Record<string, string>, changes: string[]): void {
  if (!("deadurl" in p)) return;
  const v = p.deadurl.toLowerCase();
  if (v === "yes" || v === "y" || v === "true") {
    if (!p["url-status"]) p["url-status"] = "dead";
  }
  delete p.deadurl;
  changes.push("deadurl-to-url-status");
}

const NONE_VALUES = new Set(["none", "n/a", "-"]);

const VALID_URL_STATUSES = new Set(["live", "dead", "unfit", "usurped", "bot: unknown"]);

const URL_FIELDS = ["url", "archive-url", "chapter-url", "conference-url", "article-url"];

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
    ["volume", /^(?:(?:Vol|vol|VOL)\.?|Volume|volume|V\.|v\.)\s*/, "cleaned-volume"],
    ["pages", /^(?:(?:pp|PP|Pp)\.?|(?:p|P)\.?|Pages?|pages?)\s*/, "cleaned-pages"],
    ["issue", /^(?:(?:No|no|NO)\.?|Issue|issue|#|Number|number|Iss\.?)\s*/i, "cleaned-issue"],
    ["edition", /\s*(?:edition|Edition|ed\.|ed|Ed\.|Ed)\s*$/i, "cleaned-edition"],
  ];
  for (const [key, re, changeLabel] of prefixes) {
    if (!p[key]) continue;
    const v = p[key].replace(re, "");
    if (v !== p[key]) { p[key] = v; changes.push(changeLabel); }
  }
}

function normalizeAliases(p: Record<string, string>, changes: string[]): void {
  for (const [alias, canonical] of Object.entries(PARAM_ALIASES)) {
    if (alias in p && !(canonical in p)) {
      p[canonical] = p[alias];
      delete p[alias];
      changes.push("alias-" + alias + "-to-" + canonical);
    } else if (alias in p && canonical in p) {
      // Both exist; remove the alias, keep the canonical
      delete p[alias];
      changes.push("removed-duplicate-" + alias);
    }
  }
  normalizeDeadurl(p, changes);
}

/** Template-specific aliases: number → issue for periodical templates only.
 *  In cite techreport / cite patent, number has a different meaning. */
function normalizeTemplateSpecificAliases(p: Record<string, string>, tt: string | undefined, changes: string[]): void {
  const periodicalTypes = ["cite journal", "cite magazine", "cite news", "cite encyclopedia"];
  const isPeriodical = tt && periodicalTypes.includes(tt);
  const hasPeriodicalParam = p.journal || p.newspaper || p.magazine;
  if ((isPeriodical || (tt === "citation" && hasPeriodicalParam)) && "number" in p && !("issue" in p)) {
    p.issue = p.number;
    delete p.number;
    changes.push("alias-number-to-issue");
  } else if ((isPeriodical || (tt === "citation" && hasPeriodicalParam)) && "number" in p && "issue" in p) {
    delete p.number;
    changes.push("removed-duplicate-number");
  }
}

/** Vancouver-style author name normalization: split "Last, First" in last# fields.
 *  Wikipedia flags this as "Vancouver style error: name in name N" when the
 *  last field contains a comma — it should only contain the surname. */
function normalizeVancouverNames(p: Record<string, string>, changes: string[]): void {
  for (let i = 0; i <= 9; i++) {
    const suffix = i === 0 ? "" : String(i);
    const lastKey = `last${suffix}`;
    const firstKey = `first${suffix}`;
    if (!p[lastKey]) continue;
    const commaIdx = p[lastKey].indexOf(",");
    if (commaIdx === -1) continue;

    const afterComma = p[lastKey].slice(commaIdx + 1).trim();
    // Skip org names: check if the value after the comma looks like a given name
    // or initials — not an organization name continuation.
    // Match: "Ernst", "John", "JA", "J.A.", "J. A.", "E.J." (given names / initials)
    // Reject: "American Psychiatric Association" (multi-word org continuation)
    const words = afterComma.split(/\s+/);
    const allWordsAreUppercase = words.every(w => /^[A-Z]\.?$/.test(w) || /^[A-Z]{1,4}$/.test(w.replace(/\./g, "")));
    const isSingleGivenName = words.length === 1 && /^[A-Z][a-z]+$/.test(afterComma);
    const looksLikeName = allWordsAreUppercase || isSingleGivenName
      || (words.length <= 2 && words.every(w => /^[A-Z][a-z]*\.?$/.test(w)));
    if (!looksLikeName) continue;

    const surname = p[lastKey].slice(0, commaIdx).trim();
    const given = afterComma;
    if (surname && given && !p[firstKey]) {
      p[lastKey] = surname;
      p[firstKey] = given;
      changes.push(`vancouver-split-last${suffix}`);
    }
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

  const periodicalFields = ["journal", "magazine", "newspaper"] as const;

  let conflict = false;
  if (tt === "cite web") {
    for (const f of periodicalFields) {
      if (p[f]) { delete p[f]; conflict = true; }
    }
    if (p.work) {
      if (!p.website) { p.website = p.work; changes.push("work-to-website"); }
      delete p.work; conflict = true;
    }
  } else if (tt === "cite journal") {
    if (p.magazine) { delete p.magazine; conflict = true; }
    if (p.newspaper) { delete p.newspaper; conflict = true; }
    if (p.work) {
      if (!p.journal) { p.journal = p.work; changes.push("work-to-journal"); }
      delete p.work; conflict = true;
    }
  } else if (tt === "cite news") {
    if (p.journal) { delete p.journal; conflict = true; }
    if (p.magazine) { delete p.magazine; conflict = true; }
    if (p.work) {
      if (!p.newspaper) { p.newspaper = p.work; changes.push("work-to-newspaper"); }
      delete p.work; conflict = true;
    }
  } else if (tt === "cite magazine") {
    if (p.journal) { delete p.journal; conflict = true; }
    if (p.newspaper) { delete p.newspaper; conflict = true; }
    if (p.work) {
      if (!p.magazine) { p.magazine = p.work; changes.push("work-to-magazine"); }
      delete p.work; conflict = true;
    }
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
  if (p["archive-date"] && !p["archive-url"]) { delete p["archive-date"]; changes.push("orphan-archive-date"); }
  if (p["doi-broken-date"] && !p.doi) { delete p["doi-broken-date"]; changes.push("orphan-doi-broken-date"); }
  if (p.location && p.place) { delete p.place; changes.push("location-place-conflict"); }
  if (p.work && p.website) { delete p.work; changes.push("work-website-conflict"); }
  if (p.vauthors && (p.last || p.last1)) { delete p.vauthors; changes.push("vauthors-last-conflict"); }
  if (p.author && (p.last || p.last1)) { delete p.author; changes.push("author-last-conflict"); }
  if (p.author && p.vauthors) { delete p.vauthors; changes.push("author-vauthors-conflict"); }
}

function flagExternalLinks(p: Record<string, string>, changes: string[]): void {
  const skipKeys = new Set([...URL_FIELDS, "doi", "isbn", "pmc", "arxiv", "bibcode"]);
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
  for (const k of URL_FIELDS) {
    if (p[k] && !/^https?:\/\//i.test(p[k])) {
      p[k] = "https://" + p[k];
      changes.push("fixed-url-scheme-" + k);
    }
  }
}

function fixUrlSpaces(p: Record<string, string>, changes: string[]): void {
  for (const k of [...URL_FIELDS, "doi"]) {
    if (p[k] && p[k].includes(" ")) {
      p[k] = p[k].replace(/\s+/g, "%20");
      changes.push("fixed-url-spaces-" + k);
    }
  }
}

function checkAuthorNames(p: Record<string, string>, changes: string[]): void {
  for (let i = 0; i <= 9; i++) {
    const s = i === 0 ? "" : String(i);
    if (p[`first${s}`] && !p[`last${s}`]) {
      changes.push("first-without-last" + s);
    }
  }
}

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
  if ((tt === "cite web" || tt === "cite news" || tt === "cite magazine") && !p.url) changes.push("missing-url");
  if (tt === "cite book" && !p.publisher) changes.push("missing-publisher");
  if (tt === "cite journal" && !p.journal && !p.work) changes.push("missing-journal");
  if (tt === "cite encyclopedia" && !p.encyclopedia) changes.push("missing-encyclopedia");
  if (tt === "cite conference" && !p.booktitle && !p.conference) changes.push("missing-conference");
  if (tt === "cite thesis" && !p.school) changes.push("missing-school");
  if (tt === "cite report" && !p.publisher) changes.push("missing-publisher");
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
  if (p["contributor-link"] && !p.contributor) changes.push("orphan-contributor-link");
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
    // CS1 module suppresses display for any English code (en, en-US, en-GB, etc.)
    // per "the language in which the source is written, if not English"
    if (lang === "en" || lang === "english" || lang.startsWith("en-")) {
      delete p.language;
      changes.push("redundant-english-language");
    }
  }
}

function fixVauthors(p: Record<string, string>, changes: string[]): void {
  if (p.vauthors) {
    // Strip wikilinks: [[Ernst Kretschmer]] → Ernst Kretschmer
    let clean = p.vauthors.replace(/\[\[([^\]]*)\]\]/g, "$1").trim();
    // Strip trailing dots from initials: "Smith J." → "Smith J"
    clean = clean.replace(/\.(?=[,\s]|$)/g, "");
    // Collapse spaced initials: "Smith J A" → "Smith JA"
    clean = clean.replace(/\b([A-Z])\s+(?=[A-Z](?:,|\s|$))/g, "$1");
    if (clean !== p.vauthors) {
      p.vauthors = clean;
      changes.push("fixed-vauthors-punctuation");
    }
  }
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
): { params: Record<string, string>; changes: string[]; renameParams?: Record<string, string>; newTemplateType?: string; removedKeys?: string[] } {
  const p = { ...params };
  const changes: string[] = [];
  const tt = options?.templateType;
  const hadWork = !!p.work;
  const origKeys = new Set(Object.keys(p));

  normalizeAliases(p, changes);
  normalizeTemplateSpecificAliases(p, tt, changes);
  normalizeVancouverNames(p, changes);
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
  fixVauthors(p, changes);
  warnMissingRequired(p, tt, changes);

  // Track which original keys were removed (so the caller can remove them from the body)
  const removedKeys = [...origKeys].filter(k => !(k in p));

  return { params: p, changes, ...detectTypeAndRename(p, tt, hadWork), removedKeys: removedKeys.length > 0 ? removedKeys : undefined };
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
  return body
    .replace(/\t+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\|{2,}/g, "|")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    if (result["archive-url"] && result["url-status"]) return { params: result, changes };
    if (result["archive-url"]) {
      if (!result["url-status"]) {
        const status = await headUrl(result.url);
        result["url-status"] = status === null ? "live" : status < 400 ? "live" : "dead";
        changes.push("archive-added");
      }
      return { params: result, changes };
    }
    const wayback = await checkWayback(result.url);
    if (wayback?.archived_snapshots?.closest?.url) {
      const snap = wayback.archived_snapshots.closest;
      result["archive-url"] = snap.url!;
      if (snap.timestamp) {
        const ts = snap.timestamp;
        result["archive-date"] = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
      }
      if (!result["url-status"]) {
        const status = await headUrl(result.url);
        if (status === null) {
          result["url-status"] = "live";
        } else {
          result["url-status"] = status < 400 ? "live" : "dead";
        }
      }
      changes.push("archive-added");
    }
  }
  return { params: result, changes };
}
