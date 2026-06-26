const PARAM_ORDER: string[] = [
  "title", "last", "first", "last1", "first1", "last2", "first2", "last3", "first3",
  "last4", "first4", "last5", "first5", "last6", "first6", "last7", "first7",
  "last8", "first8", "last9", "first9", "author", "author1", "author2",
  "vauthors", "translator", "editor", "editors",
  "date", "year", "orig-date",
  "journal", "work", "newspaper", "magazine", "website",
  "volume", "issue", "number",
  "pages", "page", "at",
  "publisher", "publication-place", "location", "place",
  "isbn", "issn", "doi", "pmid", "pmc", "s2cid", "arxiv", "bibcode", "qid",
  "url", "access-date", "archive-url", "archive-date", "url-status",
  "doi-access", "url-access",
  "language", "quote",
];

export function normalizeSpacing(params: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    result[k] = v.replace(/\s{2,}/g, " ").trim();
  }
  return result;
}

export function sortParams(params: Record<string, string>): Record<string, string> {
  const entries = Object.entries(params);
  const known: [string, string][] = [];
  const unknown: [string, string][] = [];

  for (const [k, v] of entries) {
    if (PARAM_ORDER.includes(k)) {
      known.push([k, v]);
    } else {
      unknown.push([k, v]);
    }
  }

  known.sort((a, b) => PARAM_ORDER.indexOf(a[0]) - PARAM_ORDER.indexOf(b[0]));

  const result: Record<string, string> = {};
  for (const [k, v] of [...known, ...unknown]) {
    result[k] = v;
  }
  return result;
}

export function formatCitationBody(
  params: Record<string, string>,
  style: string = "standard"
): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "";

  if (style === "compact") {
    return entries.map(([k, v]) => `|${k}=${v}`).join(" ");
  }
  if (style === "wide") {
    return entries.map(([k, v]) => ` | ${k} = ${v}`).join("").trimStart();
  }
  return entries.map(([k, v]) => `| ${k} = ${v}`).join(" ");
}
