import { escapeRe } from "./wikitext";

export type AuthorFetchSource = {
  name: string;
  fetch: (doi: string) => Promise<[string, string][] | null>;
};

const DIACRITICS_MAP: Record<string, string> = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a",
  è: "e", é: "e", ê: "e", ë: "e",
  ì: "i", í: "i", î: "i", ï: "i",
  ò: "o", ó: "o", ô: "o", õ: "o", ö: "o",
  ù: "u", ú: "u", û: "u", ü: "u",
  ñ: "n", ç: "c", ß: "ss",
};

export function normalizeName(name: string): string {
  let s = name.toLowerCase();
  for (const [char, repl] of Object.entries(DIACRITICS_MAP)) {
    s = s.replace(new RegExp(char, "g"), repl);
  }
  s = s.replace(/[\u0300-\u036f]/g, "");
  return s;
}

/** Prefixes indicating an organization rather than a person name in vauthors */
const ORG_PREFIXES = [
  // Government / intergovernmental
  "united states ", "u.s. ", "us ", "federal ", "national ", "government of ",
  "department of ", "office of ", "bureau of ", "ministry of ", "agency for ",
  "administration of ", "authority of ", "board of ", "commission of ",
  "committee on ", "council of ", "panel on ", "task force on ",
  "centers for ", "centre for ", "institute of ", "institute for ",
  "national institute of ", "national institutes of ", "national academy of ",
  "national research ", "national science ", "national health ",
  "european ", "european union ", "european commission ", "european parliament ",
  "european court of ", "european agency for ",
  "royal ", "her majesty's ",
  // International
  "united nations ", "united nations ", "world health ", "world bank ",
  "world trade ", "world meteorological ", "world intellectual property ",
  "world food ", "world economic ", "world customs ",
  "international ", "international labour ",
  "international monetary ", "international criminal ",
  "international atomic energy ", "international civil aviation ",
  "international maritime ", "international organization for ",
  "international organisation for ", "organisation for economic ",
  "organization for economic ", "north atlantic treaty ",
  // Professional associations & societies
  "american ", "british ", "canadian ", "australian ", "german ",
  "french ", "japanese ", "chinese ", "russian ", "indian ", "dutch ",
  "swiss ", "swedish ", "norwegian ", "danish ", "finnish ",
  "association for ", "association of ", "society for ", "society of ",
  "academy of ", "college of ", "school of ", "faculty of ",
  "federation of ", "confederation of ", "union of ",
  "council for ", "council of ",
  "institution of ", "institution for ",
  "royal society ", "royal college ", "royal academy ",
  "american society of ", "american academy of ", "american association of ",
  "american college of ", "american institute of ",
  "british society of ", "british academy of ", "british association of ",
  "british institute of ", "british college of ",
  "canadian society of ", "canadian academy of ",
  "european society of ", "european academy of ",
  "international society of ", "international academy of ",
  "international association of ", "international federation of ",
  "world federation of ", "world association of ",
  // Universities & research
  "university of ", "université de ", "universität ",
  "università ", "universidad de ", "universidade de ",
  "university college ", "university hospital ",
  "institute of technology ", "institute for ",
  "school of medicine ", "school of public ",
  "college of medicine ", "college of physicians ",
  "harvard ", "stanford ", "yale ", "oxford ", "cambridge ",
  "massachusetts institute of ", "california institute of ",
  "johns hopkins ", "mayo clinic ", "cleveland clinic ",
  // Hospitals & medical
  "hospital of ", "general hospital ", "university hospital ",
  "children's hospital ", "national hospital ",
  "st. ", "st ", "saint ",
  // Corporations (common in patents & pharma)
  "microsoft ", "google ", "ibm ", "apple ", "amazon ",
  "pfizer ", "novartis ", "roche ", "merck ", "johnson & johnson ",
  "bayer ", "sanofi ", "glaxo ", "astrazeneca ",
  // Generic organizational
  "committee for ", "commission for ", "commission on ",
  "conference of ", "congress of ", "assembly of ",
  "program on ", "programme on ", "project on ",
  "working group on ", "ad hoc ",
  "consortium for ", "consortium of ",
  "foundation for ", "fund for ",
  "group of ", "network of ", "coalition for ",
  "taskforce on ", "task force on ",
  "australian ", "new zealand ", "south african ",
  "deutsche ", "schweizer ", "suisse ", "nederlandse ",
];

export function parseVauthors(vauthors: string): [string, string][] {
  if (!vauthors?.trim()) return [];
  const parts = vauthors.split(",").map(p => p.trim()).filter(p => p && !/^et\s+al/i.test(p));
  return parts.map(p => {
    const trimmed = p.trim();
    const lower = trimmed.toLowerCase();
    if (ORG_PREFIXES.some(pre => lower.startsWith(pre))) return [trimmed, ""];
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) return [trimmed, ""];
    return [trimmed.slice(0, spaceIdx).trim(), trimmed.slice(spaceIdx + 1).trim()];
  });
}

export function extractInitials(name: string): string {
  if (!name) return "";
  const parts = name.replace(/-/g, " ").split(/[\s.]+/).filter(p => p.length > 0);
  let result = "";
  for (const p of parts) {
    const c = p.charAt(0).toUpperCase();
    if (c >= "A" && c <= "Z") {
      result += c;
      if (result.length >= 2) break;
    }
  }
  return result;
}

/** Extract a param value from body, respecting [[brackets]] and {{templates}} */
function extractBracketAware(body: string, param: string): string | null {
  const re = new RegExp(`\\|\\s*${escapeRe(param)}\\s*=\\s*`, "i");
  const m = re.exec(body);
  if (!m) return null;
  let val = "";
  let depth = 0;
  for (let i = m.index + m[0].length; i < body.length; i++) {
    const ch = body[i];
    const next = body[i + 1] || "";
    if (ch === "{" && next === "{") { depth++; val += "{{"; i++; continue; }
    if (ch === "}" && next === "}") { depth--; val += "}}"; i++; continue; }
    if (ch === "[" && next === "[") { depth++; val += "[["; i++; continue; }
    if (ch === "]" && next === "]") { depth--; val += "]]"; i++; continue; }
    if (ch === "|" && depth === 0) break;
    val += ch;
  }
  return val.trim() || null;
}

/** Bracket-aware replace of a param in body */
function removeBracketAware(body: string, param: string): string {
  const re = new RegExp(`\\|\\s*${escapeRe(param)}\\s*=\\s*`, "i");
  const m = re.exec(body);
  if (!m) return body;
  let end = m.index + m[0].length;
  let depth = 0;
  for (let i = end; i < body.length; i++) {
    const ch = body[i];
    const next = body[i + 1] || "";
    if (ch === "{" && next === "{") { depth++; i++; }
    else if (ch === "}" && next === "}") { depth--; i++; }
    else if (ch === "[" && next === "[") { depth++; i++; }
    else if (ch === "]" && next === "]") { depth--; i++; }
    else if (ch === "|" && depth === 0) { end = i; break; }
    else { end = i + 1; }
  }
  return body.slice(0, m.index) + body.slice(end);
}

export function vauthorsToLastfirst(
  body: string,
  fullNames?: [string, string][],
  maxAuthors?: number
): string {
  const vauthorsVal = extractBracketAware(body, "vauthors");
  if (!vauthorsVal) return body;
  const authors = parseVauthors(vauthorsVal);
  let result = removeBracketAware(body, "vauthors");
  const limited = maxAuthors && maxAuthors > 0 && authors.length > maxAuthors;
  const count = limited ? maxAuthors! : authors.length;
  for (let i = 0; i < count; i++) {
    const suffix = i === 0 ? "" : String(i + 1);
    let [last, first] = authors[i];
    if (fullNames) {
      const matched = fullNames.find(f => normalizeName(f[0]) === normalizeName(last));
      if (matched && matched[1].length > first.length) first = matched[1];
    }
    result += `|last${suffix}=${last.replace(/\.$/, "")} |first${suffix}=${first.replace(/\.+$/, "")}`;
  }
  if (limited) result += " |display-authors=etal";
  return result;
}

const INITIALS_WORD_BOUNDARY = /\b[A-Z](?:\.|\b)/g;

function collapseInitials(first: string): string {
  const matches = first.match(INITIALS_WORD_BOUNDARY);
  if (matches) {
    return matches.map(m => m.charAt(0).toUpperCase()).join("").slice(0, 2);
  }
  // Handle run-together initials like "CA" or "JT" (no separators between letters)
  const clean = first.replace(/\./g, "");
  if (/^[A-Za-z]{2,3}$/.test(clean)) {
    return clean.slice(0, 2).toUpperCase();
  }
  return first.charAt(0).toUpperCase();
}

interface LastFirstPair {
  last: string;
  first: string;
  idx: number;
}

function getLastFirstPairs(body: string): LastFirstPair[] {
  const lastRe = /\|\s*(?:last(\d*))\s*=\s*([^|]+?)(?=\s*(?:\||$))/gi;
  const firstRe = /\|\s*(?:first(\d*))\s*=\s*([^|]+?)(?=\s*(?:\||$))/gi;
  const lastMatches: { idx: string; val: string }[] = [];
  const firstMatches: { idx: string; val: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = lastRe.exec(body)) !== null) lastMatches.push({ idx: m[1] || "1", val: m[2].trim() });
  while ((m = firstRe.exec(body)) !== null) firstMatches.push({ idx: m[1] || "1", val: m[2].trim() });
  const allIndices = new Set([...lastMatches.map(l => l.idx), ...firstMatches.map(f => f.idx)]);
  return Array.from(allIndices)
    .map(idx => {
      const last = lastMatches.find(l => l.idx === idx)?.val;
      const first = firstMatches.find(f => f.idx === idx)?.val;
      return last ? { last, first: first || "", idx: parseInt(idx, 10) } : null;
    })
    .filter((p): p is LastFirstPair => p !== null)
    .sort((a, b) => a.idx - b.idx);
}

export function lastfirstToVauthors(body: string, maxAuthors?: number, skipOrgAuthors?: boolean): string {
  if (/\|\s*vauthors\s*=/.test(body)) return body;
  const pairs = getLastFirstPairs(body);
  if (pairs.length === 0) return body;

  // Determine which pairs to convert to vauthors (optionally skip orgs)
  const toRemove: typeof pairs = [];
  const toConvert: typeof pairs = [];
  for (const p of pairs) {
    if (skipOrgAuthors && ORG_PREFIXES.some(pre => p.last.toLowerCase().startsWith(pre))) {
      toRemove.push(p);                // org — keep in body, don't convert
    } else {
      toConvert.push(p);               // person — remove from body, convert
    }
  }
  if (toConvert.length === 0) return body;

  for (const p of toConvert) {
    const suffix = p.idx === 1 ? "" : String(p.idx);
    body = body.replace(new RegExp(`\\|\\s*last${suffix}\\s*=\\s*[^|]+?\\s*(?=\\||$)`), "").trim();
    const firstRe = new RegExp(`\\|\\s*first${suffix}\\s*=\\s*[^|]+?\\s*(?=\\||$)`);
    body = body.replace(firstRe, "").trim();
  }
  body = body.replace(/\s{2,}/g, " ").trim();
  if (body.endsWith("|")) body = body.slice(0, -1).trim();

  const limited = maxAuthors && maxAuthors > 0 && toConvert.length > maxAuthors;
  const used = limited ? toConvert.slice(0, maxAuthors!) : toConvert;
  const vauthorsStr = used.map(p => {
    let last = p.last.replace(/\.+$/, "").replace(/\b([A-Z])\s+(?=[A-Z](?:,\s*|$))/g, "$1").trim();
    const init = collapseInitials(p.first);
    return init ? `${last} ${init}` : last;
  }).join(", ");
  body += ` |vauthors=${vauthorsStr}`;
  if (limited) body += ", et al";
  return body;
}

export function enrichLastfirst(
  body: string,
  fullNames: [string, string][]
): string {
  let result = body;
  for (let i = 1; i <= 10; i++) {
    const suffix = String(i);
    const firstRe = new RegExp(`\\|\\s*first${suffix}\\s*=\\s*([^|]+?)(?=\\s*(?:\\||$))`, "i");
    const lastRe = new RegExp(`\\|\\s*last${suffix}\\s*=\\s*([^|]+?)(?=\\s*(?:\\||$))`, "i");
    const firstMatch = result.match(firstRe);
    const lastMatch = result.match(lastRe);
    if (!firstMatch || !lastMatch) continue;
    const firstVal = firstMatch[1].trim();
    const lastVal = lastMatch[1].trim();
    if (firstVal.length <= 3) {
      const full = fullNames.find(f => normalizeName(f[0]) === normalizeName(lastVal));
      if (full && full[1].length > firstVal.length && firstMatch.index !== undefined) {
        result = result.slice(0, firstMatch.index) + `|first${suffix}=` + full[1] + result.slice(firstMatch.index + firstMatch[0].length);
      }
    }
  }
  return result;
}

export async function tryFetchAuthors(
  sources: AuthorFetchSource[],
  doi: string
): Promise<[string, string][]> {
  let best: [string, string][] | null = null;
  let bestLen = 0;
  for (const source of sources) {
    try {
      const result = await source.fetch(doi);
      if (!result) continue;
      const totalLen = result.reduce((sum, [, given]) => sum + (given?.length || 0), 0);
      if (totalLen > bestLen) {
        best = result;
        bestLen = totalLen;
      }
    } catch {
      continue;
    }
  }
  return best || [];
}

export function diagnoseMultiNameField(body: string): boolean {
  return /;\s/.test(body) || /\b(and|&)\s/.test(body);
}

export function diagnoseNumericName(body: string): boolean {
  return /\|\s*last\d*\s*=\s*\d+/.test(body);
}

const GENERIC_NAMES = ["anonymous", "anon", "author", "unknown", "n/a", "none"];

export function diagnoseGenericName(body: string): boolean {
  const lower = body.toLowerCase();
  return GENERIC_NAMES.some(n => new RegExp(`\\|\\s*(?:last\\d*|first\\d*|author)\\s*=\\s*${n}`, "i").test(lower));
}

export function diagnoseOthersDuplicate(body: string): boolean {
  const othersMatch = body.match(/\|\s*others\s*=\s*([^|]+)/i);
  if (!othersMatch) return false;
  const others = othersMatch[1].toLowerCase();
  const lastRe = /\|\s*(?:last(\d*))\s*=\s*([^|]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = lastRe.exec(body)) !== null) {
    if (others.includes(m[2].trim().toLowerCase())) return true;
  }
  return false;
}

export interface ProcessAuthorsOptions {
  style: "normal" | "vancouver";
  maxAuthors?: number;
  fullNames?: [string, string][];
  force?: boolean;
  skipOrgAuthors?: boolean;
}

export async function processAuthors(
  body: string,
  options: ProcessAuthorsOptions
): Promise<string> {
  if (options.style === "vancouver") {
    return lastfirstToVauthors(body, options.maxAuthors, options.skipOrgAuthors);
  }
  if (options.style === "normal") {
    return vauthorsToLastfirst(body, options.fullNames, options.maxAuthors);
  }
  return body;
}
