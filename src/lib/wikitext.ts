import type { Citation } from "./types";

export function findCitations(text: string): Citation[] {
  const results: Citation[] = [];
  let i = 0;
  while (i < text.length) {
    const openIdx = text.indexOf("{{", i);
    if (openIdx === -1) break;
    const templateStart = openIdx + 2;
    let depth = 1;
    let j = templateStart;
    while (j < text.length && depth > 0) {
      if (text[j] === "{" && text[j + 1] === "{") { depth++; j += 2; }
      else if (text[j] === "}" && text[j + 1] === "}") { depth--; j += 2; }
      else { j++; }
    }
    if (depth !== 0) break;
    const raw = text.slice(openIdx, j);
    const inner = raw.slice(2, -2).trim();
    const pipeIdx = inner.indexOf("|");
    const templatePart = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
    const body = pipeIdx === -1 ? "" : inner.slice(pipeIdx);
    const templateMatch = templatePart.match(/^(citation|cite\s+[\w\s]+)$/i);
    if (templateMatch) {
      const template = templateMatch[1].trim().toLowerCase();
      const params = parseParams(body);
      results.push({ template, params, raw, start: openIdx });
    }
    i = j;
  }
  return results;
}

export function parseParams(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!body) return params;

  let i = 0;
  let currentKey = "";
  let currentVal = "";
  const depth = 0;
  let inKey = true;
  let inVal = false;
  let bracketDepth = 0;

  const addParam = (key: string, val: string) => {
    const k = key.trim().toLowerCase();
    const v = val.trim();
    if (k && v) params[k] = v;
  };

  while (i < body.length) {
    const ch = body[i];
    const next = body[i + 1] || "";

    if (ch === "{" && next === "{") {
      bracketDepth++;
      if (inVal) currentVal += "{{";
      i += 2;
      continue;
    }
    if (ch === "}" && next === "}") {
      bracketDepth--;
      if (inVal) currentVal += "}}";
      i += 2;
      continue;
    }

    if (ch === "[" && next === "[") {
      bracketDepth++;
      if (inVal) currentVal += "[[";
      i += 2;
      continue;
    }
    if (ch === "]" && next === "]") {
      bracketDepth--;
      if (inVal) currentVal += "]]";
      i += 2;
      continue;
    }

    if (ch === "|" && bracketDepth === 0) {
      if (currentKey && inVal) {
        addParam(currentKey, currentVal);
      } else if (currentKey && !inVal && currentKey.trim()) {
        params[currentKey.trim().toLowerCase()] = "";
      }
      currentKey = "";
      currentVal = "";
      inKey = true;
      inVal = false;
      i++;
      continue;
    }

    if (ch === "=" && bracketDepth === 0 && inKey) {
      currentKey = currentVal;
      currentVal = "";
      inKey = false;
      inVal = true;
      i++;
      continue;
    }

    if (inKey || inVal) {
      if (inKey) currentVal += ch;
      else currentVal += ch;
    }

    i++;
  }

  if (currentKey && inVal) {
    addParam(currentKey, currentVal);
  }

  return params;
}

export function extractDoiFromUrl(url: string): string | null {
  if (!url) return null;
  const m = url.match(/https?:\/\/(?:dx\.)?doi\.org\/(10\.\S+)/i);
  return m ? m[1] : null;
}

export function isValidDoi(doi: string): boolean {
  return /^10\.\d{4,}\/.\S+$/.test(doi);
}

export function detectCitationType(
  params: Record<string, string>
): { new?: string } {
  if (params.journal) return { new: "cite journal" };
  if (params.newspaper) return { new: "cite news" };
  if (params.magazine) return { new: "cite magazine" };
  if (params.website) return { new: "cite web" };
  if (params.isbn) return { new: "cite book" };
  if (params.degree) return { new: "cite thesis" };
  if (params.work) return { new: "cite web" };
  return {};
}

export function generateRefName(body: string): string | null {
  const lastM = body.match(/\|\s*last\s*=\s*([^|]+)/i);
  const firstM = body.match(/\|\s*first\s*=\s*([^|]+)/i);
  const yearM = body.match(/\|\s*year\s*=\s*(\d{4})/i);
  const dateM = body.match(/\|\s*date\s*=\s*(?:.*?\b(\d{4})\b)/i);

  const last = lastM?.[1]?.trim();
  const year = yearM?.[1] || dateM?.[1];

  if (!last) return null;

  // Use only the first surname: truncate at first comma, semicolon, or " and "
  const firstSurname = last.split(/[,;]|\s+and\s+/i)[0].replace(/\.+$/, "").trim();
  if (!firstSurname) return null;

  let name = firstSurname;
  if (year) name += year;

  if (/^\d/.test(name)) name = "ref-" + name;
  if (firstM) {
    const first = firstM[1].trim();
    if (first.length === 2 && !first.includes(".")) {
      name += first;
    }
  }

  return name;
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
