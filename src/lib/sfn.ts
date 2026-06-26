export function convertToSfn(text: string): string {
  return text.replace(
    /<ref(?:\s+name\s*=\s*"([^"]*)")?\s*>(\{\{cite\s+\w+[\s\S]*?\}\})<\/ref>/gi,
    (_match, name, cite) => {
      const params = parseSfnParams(cite);
      const last = params.last || params.last1 || params.author || "";
      const year = params.year || extractYearFromDate(params.date) || "";
      const sfnBody = buildSfnBody(last, year, params);
      if (name) {
        return `{{sfn|${sfnBody}|ref=${name}}}`;
      }
      return `{{sfn|${sfnBody}}}`;
    }
  );
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
  const loc = params.loc || params.page || params.pages || params.at;
  if (loc) parts.push(loc);
  return parts.join(" | ");
}
