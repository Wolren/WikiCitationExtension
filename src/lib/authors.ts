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

export function parseVauthors(vauthors: string): [string, string][] {
  if (!vauthors?.trim()) return [];
  const parts = vauthors.split(",").map(p => p.trim()).filter(p => p && !/^et\s+al/i.test(p));
  return parts.map(p => {
    const trimmed = p.trim();
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

export function vauthorsToLastfirst(
  body: string,
  fullNames?: [string, string][],
  maxAuthors?: number
): string {
  const match = body.match(/\|\s*vauthors\s*=\s*([^|]+)/i);
  if (!match) return body;
  const authors = parseVauthors(match[1].trim());
  let result = body.replace(/\|\s*vauthors\s*=\s*[^|]+\s*/gi, "");
  const limited = maxAuthors && maxAuthors > 0 && authors.length > maxAuthors;
  const count = limited ? maxAuthors! : authors.length;
  for (let i = 0; i < count; i++) {
    const suffix = i === 0 ? "" : String(i + 1);
    let [last, first] = authors[i];
    if (fullNames) {
      const matched = fullNames.find(f => normalizeName(f[0]) === normalizeName(last));
      if (matched && matched[1].length > first.length) first = matched[1];
    }
    result += `|last${suffix}=${last} |first${suffix}=${first}`;
  }
  if (limited) result += " |display-authors=etal";
  return result;
}

const INITIALS_WORD_BOUNDARY = /\b[A-Z](?:\.|\b)/g;

function collapseInitials(first: string): string {
  const matches = first.match(INITIALS_WORD_BOUNDARY);
  if (matches) {
    return matches.map(m => m.charAt(0).toUpperCase()).join("");
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

export function lastfirstToVauthors(body: string, maxAuthors?: number): string {
  if (/\|\s*vauthors\s*=/.test(body)) return body;
  const pairs = getLastFirstPairs(body);
  if (pairs.length === 0) return body;
  let result = body.replace(/\|\s*(?:last\d*|first\d*)\s*=\s*[^|]+?\s*(?=\||$)/gi, "").trim();
  if (result.endsWith("|")) result = result.slice(0, -1).trim();
  const limited = maxAuthors && maxAuthors > 0 && pairs.length > maxAuthors;
  const used = limited ? pairs.slice(0, maxAuthors!) : pairs;
  const vauthorsStr = used.map(p => `${p.last} ${collapseInitials(p.first)}`).join(", ");
  result += ` |vauthors=${vauthorsStr}`;
  if (limited) result += ", et al";
  return result;
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
}

export async function processAuthors(
  body: string,
  options: ProcessAuthorsOptions
): Promise<string> {
  if (options.style === "vancouver") {
    return lastfirstToVauthors(body, options.maxAuthors);
  }
  if (options.style === "normal") {
    return vauthorsToLastfirst(body, options.fullNames, options.maxAuthors);
  }
  return body;
}
