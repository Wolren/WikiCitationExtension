const SOURCES_HEADINGS = /^==\s*(Sources|Works cited|Bibliography|Works Cited)\s*==\s*$/im;
const REFLIST_HEADINGS = /^==\s*(References|Notes|Footnotes)\s*==\s*$/im;

function matchBracketed(text: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < text.length - 1) {
    if (text[i] === "{" && text[i + 1] === "{") { depth++; i += 2; }
    else if (text[i] === "}" && text[i + 1] === "}") { depth--; i += 2; if (depth === 0) return i; }
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
  }).join(" | ");
}

function extractAllRp(text: string, start: number): { params: Record<string, string>; end: number }[] {
  const results: { params: Record<string, string>; end: number }[] = [];
  let pos = start;
  while (pos < text.length - 1) {
    pos = skipWs(text, pos);
    const rpMatch = text.slice(pos).match(/^\{\{(?:rp|reference page)\s*\|/i);
    if (!rpMatch) break;
    const rpStart = pos + (rpMatch.index || 0);
    const rpEnd = matchBracketed(text, rpStart);
    if (rpEnd === -1) break;
    const rp = text.slice(rpStart, rpEnd);
    const params = parseRpParams(rp);
    if (params) results.push({ params, end: rpEnd });
    else break;
    pos = rpEnd;
  }
  return results;
}

function extractSfnBody(text: string, start: number): { body: string; end: number } | null {
  const sfnMatch = text.slice(start).match(/^\{\{sfn\|/i);
  if (!sfnMatch) return null;
  const sfnStart = start + (sfnMatch.index || 0);
  const sfnEnd = matchBracketed(text, sfnStart);
  if (sfnEnd === -1) return null;
  const inner = text.slice(sfnStart + 6, sfnEnd - 2);
  return { body: inner, end: sfnEnd };
}

export function convertToSfn(text: string): string {
  const sources: string[] = [];
  const refBodies = new Map<string, string>();
  const out: string[] = [];
  let i = 0;

  while (i < text.length) {
    // ---- Self-closing ref: <ref name="X" /> ----
    const sc = text.slice(i).match(/^<ref(?:\s+name\s*=\s*(?:"([^"]*)"|'([^']*)'))?\s*\/>/i);
    if (sc) {
      const name = sc[1] || sc[2];
      const scEnd = i + sc[0].length;
      if (name && refBodies.has(name)) {
        const rps = extractAllRp(text, scEnd);
        if (rps.length > 0) {
          const lastRp = rps[rps.length - 1].params;
          const body = stripPageParams(refBodies.get(name)!);
          const parts = body ? body.split(/\s*\|\s*/).filter(Boolean) : [];
          if (lastRp.loc) parts.push(`loc=${lastRp.loc}`);
          else if (lastRp.page) parts.push(`p=${lastRp.page}`);
          else if (lastRp.pages) parts.push(`pp=${lastRp.pages}`);
          else if (lastRp.at) parts.push(`at=${lastRp.at}`);
          out.push(`{{sfn|${parts.join(" | ")}|ref=${name}}}`);
          i = rps[rps.length - 1].end;
        } else {
          // Bare invocation (no {{rp}}) — output without page params
          const noPage = stripPageParams(refBodies.get(name)!);
          out.push(noPage ? `{{sfn|${noPage}|ref=${name}}}` : `{{sfn|ref=${name}}}`);
          i = scEnd;
        }
      } else {
        out.push(text.slice(i, scEnd));
        i = scEnd;
      }
      continue;
    }

    // ---- Open ref: <ref...> ----
    const op = text.slice(i).match(/^<ref(?:\s+name\s*=\s*(?:"([^"]*)"|'([^']*)'))?\s*>/i);
    if (op) {
      const name = op[1] || op[2];
      const contentStart = i + op[0].length;

      // Only convert if content starts with {{cite or {{citation
      const citeTest = text.slice(contentStart).match(/^\s*\{\{(?:cite\s|citation\s)/i);
      if (!citeTest) {
        out.push(text[i]);
        i++;
        continue;
      }
      const citeStart = contentStart + (citeTest.index || 0);

      // Bracket-match the cite template
      const citeEnd = matchBracketed(text, citeStart);
      if (citeEnd === -1) {
        out.push(text[i]);
        i++;
        continue;
      }
      const cite = text.slice(citeStart, citeEnd).trim();

      // Find the closing </ref> (allow extra content between cite and </ref>)
      const closeRef = text.slice(citeEnd).match(/<\/ref\s*>/i);
      if (!closeRef) {
        out.push(text[i]);
        i++;
        continue;
      }
      const refEnd = citeEnd + closeRef.index! + closeRef[0].length;

      // Extract all {{rp}} after </ref>
      const rps = extractAllRp(text, refEnd);
      if (rps.length === 0) {
        // No {{rp}} — don't convert
        out.push(text.slice(i, refEnd));
        i = refEnd;
        continue;
      }

      // Build sfn — use LAST rp params (later rp overrides earlier)
      const rpParams = rps[rps.length - 1].params;
      const params = parseSfnParams(cite);
      const last = params.last || params.last1 || params.author || "";
      const hasMultiple = last && (params.last2 || params.last3 || params.last4);
      const year = params.year || extractYearFromDate(params.date) || "";
      const sfnBody = buildSfnBody(hasMultiple ? `${last} et al.` : last, year, { ...params, ...rpParams });

      sources.push(`* ${cite}`);
      if (name) refBodies.set(name, sfnBody);

      const replacement = name
        ? `{{sfn|${sfnBody}|ref=${name}}}`
        : `{{sfn|${sfnBody}}}`;

      out.push(replacement);
      i = rps[rps.length - 1].end;
      continue;
    }

    // ---- sfn template followed by {{rp}} (consecutive rp) ----
    const sfnMatch = text.slice(i).match(/^\{\{sfn\|/i);
    if (sfnMatch) {
      const sfnStart = i + (sfnMatch.index || 0);
      const sfnEnd = matchBracketed(text, sfnStart);
      if (sfnEnd !== -1) {
        const afterSfn = text.slice(sfnEnd);
        const afterSfnPos = sfnEnd;
        const rps = extractAllRp(text, afterSfnPos);
        if (rps.length > 0) {
          const lastRp = rps[rps.length - 1].params;
          const inner = text.slice(sfnStart + 6, sfnEnd - 2);
          const kept = stripPageParams(inner).split(/\s*\|\s*/).filter(Boolean);
          if (lastRp.loc) kept.push(`loc=${lastRp.loc}`);
          else if (lastRp.page) kept.push(`p=${lastRp.page}`);
          else if (lastRp.pages) kept.push(`pp=${lastRp.pages}`);
          else if (lastRp.at) kept.push(`at=${lastRp.at}`);
          out.push(`{{sfn|${kept.join(" | ")}}}`);
          i = rps[rps.length - 1].end;
          continue;
        }
      }
    }

    // No match — copy character and advance
    out.push(text[i]);
    i++;
  }

  const final = out.join("");

  if (sources.length === 0) return final;
  if (SOURCES_HEADINGS.test(final)) return final;

  const reflistMatch = final.match(REFLIST_HEADINGS);
  if (reflistMatch) {
    const afterHeading = reflistMatch.index! + reflistMatch[0].length;
    const rest = final.slice(afterHeading);
    const nextH = rest.match(/^==\s/m);
    const sectionEnd = nextH ? afterHeading + nextH.index! : final.length;
    const before = final.slice(0, sectionEnd);
    const after = final.slice(sectionEnd);
    return before + `\n\n== Sources ==\n${sources.join("\n")}\n` + after;
  }

  return final + `\n\n== Sources ==\n${sources.join("\n")}\n`;
}

function parseRpParams(rp: string): Record<string, string> | null {
  const inner = rp.replace(/^\{\{(?:rp|reference page)\s*\|\s*/i, "").replace(/\s*\}\}$/i, "");
  let m = inner.match(/^\s*(page|p|pages|pp|loc|at)\s*=\s*(.+?)\s*$/i);
  if (m) {
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "p") return { page: val };
    if (key === "pages" || key === "pp") return { pages: val };
    if (key === "page") return { page: val };
    if (key === "loc") return { loc: val };
    if (key === "at") return { at: val };
  }
  m = inner.match(/^\s*(\d[\d\-\u2013,]*)\s*$/);
  if (m) return { page: m[1] };
  return null;
}

function parseSfnParams(cite: string): Record<string, string> {
  const params: Record<string, string> = {};
  const re = /\|\s*(\w[\w-]*)\s*=\s*([^|]*?)(?=\s*(?:\||\}\}))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cite)) !== null) {
    params[m[1].toLowerCase()] = m[2].trim();
  }
  return params;
}

function extractYearFromDate(date: string): string {
  if (!date) return "";
  const m = date.match(/(\d{4})/);
  return m ? m[1] : "";
}

function buildSfnBody(last: string, year: string, params: Record<string, string>): string {
  const parts: string[] = [];
  if (last) parts.push(last.trim());
  if (year) parts.push(year);
  if (params.loc) parts.push(`loc=${params.loc}`);
  else if (params.page) parts.push(`p=${params.page}`);
  else if (params.pages) parts.push(`pp=${params.pages}`);
  else if (params.at) parts.push(`at=${params.at}`);
  return parts.join(" | ");
}
