const SOURCES_HEADINGS = /^==\s*(?:Sources|Works? ?[Cc]ited|Bibliography)\s*==\s*$/im;
const REFLIST_HEADINGS = /^==\s*(?:References|Notes|Footnotes|Further reading)\s*==\s*$/im;

function matchBracketed(text: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < text.length - 1) {
    if (text[i] === "{" && text[i + 1] === "{") { depth++; i += 2; }
    else if (text[i] === "}" && text[i + 1] === "}") { depth--; i += 2; if (depth <= 0) return depth === 0 ? i : -1; }
    else i++;
  }
  return -1;
}

function skipWs(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

function stripPageParams(sfnBody: string): string {
  return sfnBody.split(/\s*\|\s*/).filter(p => {
    const key = p.split(/\s*=\s*/)[0].trim().toLowerCase();
    return !["p", "page", "pp", "pages", "loc", "at"].includes(key);
  }).join("|");
}

function parseHtmlSup(content: string): Record<string, string> {
  const stripped = content.replace(/^:/, "");
  const bare = stripped.match(/^\s*(\d[\d\-\u2013,]*)\s*$/);
  if (bare) {
    const val = bare[1];
    if (/[‑\-\u2013,]/.test(val)) return { pages: val };
    return { page: val };
  }
  return {};
}

function extractAllRp(text: string, start: number): { params: Record<string, string>; end: number }[] {
  const results: { params: Record<string, string>; end: number }[] = [];
  let pos = start;
  while (pos < text.length - 1) {
    pos = skipWs(text, pos);
    const snapshot = text.slice(pos);
    const rpMatch = snapshot.match(/^\{\{\s*(?:rp|reference page|sup)\s*\|/i);
    if (rpMatch) {
      const rpStart = pos + (rpMatch.index || 0);
      const rpEnd = matchBracketed(text, rpStart);
      if (rpEnd === -1) break;
      const rp = text.slice(rpStart, rpEnd);
      const params = parseRpParams(rp);
      if (Object.keys(params).length === 0) break;
      results.push({ params, end: rpEnd });
      pos = rpEnd;
      continue;
    }
    const supMatch = snapshot.match(/^<sup[^>]*>([^<]*)<\/sup>/i);
    if (supMatch) {
      const params = parseHtmlSup(supMatch[1].trim());
      if (Object.keys(params).length > 0) {
        const end = pos + supMatch[0].length;
        results.push({ params, end });
        pos = end;
        continue;
      }
    }
    const colonMatch = snapshot.match(/^:\s*(\d[\d\-\u2013,]*)/);
    if (colonMatch) {
      const val = colonMatch[1];
      const params = /[‑\-\u2013,]/.test(val) ? { pages: val } : { page: val };
      results.push({ params, end: pos + colonMatch[0].length });
      pos += colonMatch[0].length;
      continue;
    }
    break;
  }
  return results;
}

function parseRpParams(rp: string): Record<string, string> {
  const params: Record<string, string> = {};
  const inner = rp.replace(/^\{\{\s*(?:rp|reference page)\s*\|\s*/i, "").replace(/\s*\}\}$/i, "");
  const items = inner.split(/\s*\|\s*/);
  for (const item of items) {
    if (!item) continue;
    const m = item.match(/^\s*(page|p|pages|pp|loc|at)\s*=\s*(.+?)\s*$/i);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === "p" || key === "page") params.page = val;
      else if (key === "pages" || key === "pp") params.pages = val;
      else if (key === "loc") params.loc = val;
      else if (key === "at") params.at = val;
    } else {
      const stripped = item.replace(/^:/, "");
      const bare = stripped.match(/^\s*(\d[\d\-\u2013,]*)\s*$/);
      if (bare) params.page = bare[1];
    }
  }
  return params;
}

function parseSfnParams(cite: string): Record<string, string> {
  const params: Record<string, string> = {};
  let i = 0;
  if (!cite.startsWith("{{")) return params;
  i = 2;
  while (i < cite.length && /\s/.test(cite[i])) i++;
  while (i < cite.length && /[\w-]/.test(cite[i])) i++;
  while (i < cite.length && /\s/.test(cite[i])) i++;
  while (i < cite.length && /[\w-]/.test(cite[i])) i++;
  while (i < cite.length && /\s/.test(cite[i])) i++;

  while (i < cite.length) {
    while (i < cite.length && /\s/.test(cite[i])) i++;
    if (i >= cite.length) break;
    if (cite[i] !== "|") break;
    i++;
    while (i < cite.length && /\s/.test(cite[i])) i++;

    let name = "";
    while (i < cite.length && /[\w-]/.test(cite[i])) {
      name += cite[i]; i++;
    }
    if (!name) continue;

    while (i < cite.length && /\s/.test(cite[i])) i++;
    if (cite[i] !== "=") continue;
    i++;
    while (i < cite.length && /\s/.test(cite[i])) i++;

    let value = "";
    while (i < cite.length) {
      if (cite[i] === "{" && cite[i + 1] === "{") {
        const end = matchBracketed(cite, i);
        if (end === -1) break;
        value += cite.slice(i, end);
        i = end;
      } else if (cite[i] === "[" && cite[i + 1] === "[") {
        let j = i + 2;
        while (j < cite.length - 1 && !(cite[j] === "]" && cite[j + 1] === "]")) j++;
        if (j >= cite.length - 1) { value += cite.slice(i); i = cite.length; break; }
        value += cite.slice(i, j + 2);
        i = j + 2;
      } else if (cite[i] === "|" || cite[i] === "}") {
        break;
      } else {
        value += cite[i]; i++;
      }
    }

    params[name.toLowerCase()] = value.trim();
  }
  return params;
}

function extractYearFromDate(date: string): string {
  if (!date) return "";
  const m = date.match(/\b(\d{4})\b/);
  return m ? m[1] : "";
}

function buildSfnBody(surnames: string[], year: string, params: Record<string, string>): string {
  const parts: string[] = [];
  for (const s of surnames) {
    if (s) parts.push(s.trim());
  }
  if (year) parts.push(year);
  if (params.loc) parts.push(`loc=${params.loc}`);
  if (params.page) parts.push(`p=${params.page}`);
  if (params.pages) parts.push(`pp=${params.pages}`);
  if (params.at) parts.push(`at=${params.at}`);
  return parts.join("|");
}

function addPageParams(parts: string[], rpParams: Record<string, string>): void {
  if (rpParams.loc) parts.push(`loc=${rpParams.loc}`);
  if (rpParams.page) parts.push(`p=${rpParams.page}`);
  if (rpParams.pages) parts.push(`pp=${rpParams.pages}`);
  if (rpParams.at) parts.push(`at=${rpParams.at}`);
}

function insertSourcesSection(text: string, sources: string[]): string {
  if (sources.length === 0) return text;

  const existingHeading = text.match(SOURCES_HEADINGS);
  if (existingHeading) {
    const headingEnd = existingHeading.index! + existingHeading[0].length;
    const after = text.slice(headingEnd);
    const nextSection = after.match(/^==\s/m);
    const sectionEnd = nextSection ? headingEnd + nextSection.index! : text.length;
    const existingContent = text.slice(headingEnd, sectionEnd);

    const existingSet = new Set(
      existingContent
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.startsWith("* "))
        .map(l => l.replace(/^\*\s*/, "").trim())
    );

    const toAdd = sources.filter(s => {
      const key = s.replace(/^\*\s*/, "").trim();
      return !existingSet.has(key);
    });

    if (toAdd.length === 0) return text;
    return text.slice(0, sectionEnd) + "\n" + toAdd.join("\n") + "\n" + text.slice(sectionEnd);
  }

  const reflistMatch = text.match(REFLIST_HEADINGS);
  if (reflistMatch) {
    const afterHeading = reflistMatch.index! + reflistMatch[0].length;
    const rest = text.slice(afterHeading);
    const nextH = rest.match(/^==\s/m);
    const sectionEnd = nextH ? afterHeading + nextH.index! : text.length;
    const before = text.slice(0, sectionEnd);
    const after = text.slice(sectionEnd);
    return before + "\n\n== Sources ==\n" + sources.join("\n") + "\n" + after;
  }

  return text + "\n\n== Sources ==\n" + sources.join("\n") + "\n";
}

function extractRefName(refMatch: string): string | undefined {
  const m = refMatch.match(/\s+name\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return m ? (m[1] || m[2]) : undefined;
}

function sanitizeTitle(title: string): string {
  return title.replace(/\|/g, "-").trim();
}

function getAuthorSurnames(params: Record<string, string>): string[] {
  const last1 = params.last || params.last1 || "";
  if (last1) {
    const s: string[] = [last1.trim()];
    for (let i = 2; i <= 4; i++) {
      const n = params[`last${i}`];
      if (n) s.push(n.trim());
    }
    return s;
  }
  if (params.author) return [params.author.trim()];
  if (params.vauthors) return [params.vauthors.trim()];
  if (params.title) return [sanitizeTitle(params.title)];
  return [];
}

function parseCiteBody(cite: string): { last: string; year: string; sfnBody: string; params: Record<string, string> } | null {
  const params = parseSfnParams(cite);
  const last = params.last || params.last1 || params.author || params.vauthors || params.title || "";
  if (!last) return null;
  const year = params.year || extractYearFromDate(params.date) || extractYearFromDate(params["archive-date"]) || "";
  const sfnBody = buildSfnBody(getAuthorSurnames(params), year, params);
  return { last, year, sfnBody, params };
}

/** Normalize an SFN body for dedup comparison: strip ref=, unify spacing */
function normalizeSfnBody(body: string): string {
  return body
    .replace(/\bref\s*=\s*[^|}]+/i, "")
    .replace(/\s*\|\s*/g, "|")
    .replace(/\s*=\s*/g, "=")
    .trim();
}

export interface SfnOptions {
  pageConflict?: "rp" | "both" | "cite";
}

export function convertToSfn(text: string, options?: SfnOptions): string {
  const sources: string[] = [];
  const sourcesSet = new Set<string>();
  const refBodies = new Map<string, string>();
  const out: string[] = [];
  const generatedSfnBodies = new Set<string>();
  const existingSfnBodies = new Set<string>();
  const consumedRefs = new Set<string>();
  let i = 0;

  // Pre-scan: register existing {{sfn}} bodies so refs don't generate duplicates.
  {
    let ps = 0;
    while (ps < text.length) {
      const m = text.slice(ps).match(/^\{\{sfn\|/i);
      if (m) {
        const sfnStart = ps + (m.index || 0);
        const sfnEnd = matchBracketed(text, sfnStart);
        if (sfnEnd !== -1) {
          const sfnInner = text.slice(sfnStart + 6, sfnEnd - 2);
          existingSfnBodies.add(normalizeSfnBody(sfnInner));
          ps = sfnEnd;
          continue;
        }
      }
      ps++;
    }
  }

  // Pre-scan: collect all named ref definition bodies regardless of position,
  // so forward-referencing self-closing refs can be converted even when the
  // full definition appears later in the article.
  {
    let ps = 0;
    while (ps < text.length) {
      const op = text.slice(ps).match(/^<ref\b[^>]*>/i);
      if (op && !/\/\s*>$/.test(op[0])) {
        const name = extractRefName(op[0]);
        const contentStart = ps + op[0].length;
        const citeTest = text.slice(contentStart).match(/^\s*\{\{(?:cite\b|citation\b)/i);
        if (citeTest && name) {
          const citeStart = contentStart + (citeTest.index || 0);
          const citeEnd = matchBracketed(text, citeStart);
          if (citeEnd !== -1) {
            const cite = text.slice(citeStart, citeEnd).trim();
            const closeRef = text.slice(citeEnd).match(/<\/ref\s*>/i);
            if (closeRef) {
              if (!refBodies.has(name)) {
                const parsed = parseCiteBody(cite);
                if (parsed) refBodies.set(name, parsed.sfnBody);
              }
              const refEnd = citeEnd + closeRef.index! + closeRef[0].length;
              ps = refEnd;
              continue;
            }
          }
        }
      }
      ps++;
    }
  }

  function emitSfn(sfnBody: string): void {
    const key = normalizeSfnBody(sfnBody);
    if (existingSfnBodies.has(key)) return;
    generatedSfnBodies.add(key);
    out.push(`{{sfn|${sfnBody}}}`);
  }

  interface PendingRef { name: string; scEnd: number; originalText: string }

  const pendingRefs: PendingRef[] = [];

  function flushPending(pageParams?: Record<string, string>): void {
    for (const ref of pendingRefs) {
      if (pageParams) {
        const body = stripPageParams(refBodies.get(ref.name)!);
        const parts = body ? body.split(/\s*\|\s*/).filter(Boolean) : [];
        addPageParams(parts, pageParams);
        emitSfn(parts.join("|"));
      } else if (consumedRefs.has(ref.name)) {
        const body = stripPageParams(refBodies.get(ref.name)!);
        if (body) emitSfn(body);
        else out.push(ref.originalText);
      } else {
        out.push(ref.originalText);
      }
    }
    pendingRefs.length = 0;
  }

  while (i < text.length) {
    // ---- Self-closing ref: <ref name="X" /> ----
    const sc = text.slice(i).match(/^<ref\b[^>]*\/>/i);
    if (sc) {
      const name = extractRefName(sc[0]);
      const scEnd = i + sc[0].length;
      if (name && refBodies.has(name)) {
        const scText = sc[0];
        const rps = extractAllRp(text, scEnd);
        if (rps.length > 0) {
          pendingRefs.push({ name, scEnd, originalText: scText });
          flushPending(rps[rps.length - 1].params);
          i = rps[rps.length - 1].end;
        } else {
          pendingRefs.push({ name, scEnd, originalText: scText });
          i = scEnd;
        }
      } else {
        flushPending();
        out.push(text.slice(i, scEnd));
        i = scEnd;
      }
      continue;
    }

    // Flush any pending ref reuses before non-ref content
    if (pendingRefs.length > 0) flushPending();

    // ---- Open ref: <ref...> ----
    const op = text.slice(i).match(/^<ref\b[^>]*>/i);
    if (op) {
      if (/\/\s*>$/.test(op[0])) { i += op[0].length; continue; }
      const name = extractRefName(op[0]);
      const contentStart = i + op[0].length;

      const citeTest = text.slice(contentStart).match(/^\s*\{\{(?:cite\b|citation\b)/i);
      if (!citeTest) {
        out.push(text[i]);
        i++;
        continue;
      }
      const citeStart = contentStart + (citeTest.index || 0);

      const citeEnd = matchBracketed(text, citeStart);
      if (citeEnd === -1) {
        out.push(text[i]);
        i++;
        continue;
      }
      const cite = text.slice(citeStart, citeEnd).trim();

      const closeRef = text.slice(citeEnd).match(/<\/ref\s*>/i);
      if (!closeRef) {
        out.push(text[i]);
        i++;
        continue;
      }
      const refEnd = citeEnd + closeRef.index! + closeRef[0].length;

      const rps = extractAllRp(text, refEnd);
      if (rps.length === 0) {
        out.push(text.slice(i, refEnd));
        i = refEnd;
        continue;
      }

      const rpParams = rps[rps.length - 1].params;
      const params = parseSfnParams(cite);
      const last = params.last || params.last1 || params.author || params.vauthors || params.title || "";
      const year = params.year || extractYearFromDate(params.date) || extractYearFromDate(params["archive-date"]) || "";

      if (!last) {
        out.push(text.slice(i, refEnd));
        i = refEnd;
        continue;
      }

      const hasRpPage = rpParams.page || rpParams.pages || rpParams.loc || rpParams.at;
      const conflict = options?.pageConflict ?? "rp";
      const pageParams = conflict === "rp" && hasRpPage ? rpParams
        : conflict === "cite" ? params
        : { ...params, ...rpParams };
      const sfnBody = buildSfnBody(getAuthorSurnames(params), year, pageParams);

      if (!sourcesSet.has(cite)) {
        sourcesSet.add(cite);
        sources.push(`* ${cite}`);
      }
      if (name) {
        refBodies.set(name, sfnBody);
        consumedRefs.add(name);
      }

      const citeRef = params.ref;
      const refAttr = citeRef ? `|ref=${citeRef}` : "";
      emitSfn(sfnBody + refAttr);
      i = rps[rps.length - 1].end;
      continue;
    }

    // ---- sfn template ----
    const sfnMatch = text.slice(i).match(/^\{\{sfn\|/i);
    if (sfnMatch) {
      const sfnStart = i + (sfnMatch.index || 0);
      const sfnEnd = matchBracketed(text, sfnStart);
      if (sfnEnd !== -1) {
        const sfnInner = text.slice(sfnStart + 6, sfnEnd - 2);

        // Skip if body (normalized) matches a previously generated SFN
        if (generatedSfnBodies.has(normalizeSfnBody(sfnInner))) {
          i = sfnEnd;
          continue;
        }

        const rps = extractAllRp(text, sfnEnd);
        if (rps.length > 0) {
          const lastRp = rps[rps.length - 1].params;
          const kept = stripPageParams(sfnInner).split(/\s*\|\s*/).filter(Boolean);
          addPageParams(kept, lastRp);
          emitSfn(kept.join("|"));
          i = rps[rps.length - 1].end;
          continue;
        }
      }
    }

    out.push(text[i]);
    i++;
  }

  // Flush any remaining pending ref reuses at end of text
  flushPending();

  return insertSourcesSection(out.join(""), sources);
}
