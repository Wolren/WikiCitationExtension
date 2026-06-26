import { checkWayback } from "./api";
import { escapeRe } from "./wikitext";

function findFieldRange(text: string, name: string): { start: number; end: number; valueStart: number } | null {
  const re = new RegExp(`\\|\\s*${escapeRe(name)}\\s*=`, "i");
  const match = re.exec(text);
  if (!match) return null;

  let i = match.index + match[0].length;
  let bracketDepth = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === "{" && text[i + 1] === "{") { bracketDepth++; i += 2; continue; }
    if (ch === "}" && text[i + 1] === "}") { bracketDepth--; i += 2; continue; }
    if (ch === "[" && text[i + 1] === "[") { bracketDepth++; i += 2; continue; }
    if (ch === "]" && text[i + 1] === "]") { bracketDepth--; i += 2; continue; }
    if (ch === "|" && bracketDepth === 0) break;
    i++;
  }

  return { start: match.index, end: i, valueStart: match.index + match[0].length };
}

export function getField(text: string, name: string): string | null {
  const range = findFieldRange(text, name);
  if (!range) return null;
  return text.slice(range.valueStart, range.end).trim();
}

export function removeField(text: string, name: string): string {
  const range = findFieldRange(text, name);
  if (!range) return text;
  return text.slice(0, range.start) + text.slice(range.end);
}

export function validateExistingArchive(text: string): { text: string; changes: string[] } {
  const changes: string[] = [];
  let result = text;

  const has = (name: string) => getField(result, name) !== null;

  const archiveUrlVal = getField(result, "archive-url");
  if (archiveUrlVal !== null) {
    const lower = archiveUrlVal.toLowerCase();
    if (lower.includes("webcitation.org") || lower.includes("archive.is") || lower.includes("archive.today")) {
      changes.push("deprecated-archive");
    }

    const archiveDateVal = getField(result, "archive-date");
    if (archiveDateVal !== null) {
      const webMatch = archiveUrlVal.match(/\/web\/(\d{8})/);
      if (webMatch) {
        const urlDate = webMatch[1];
        const cleanArchiveDate = archiveDateVal.replace(/[-.]/g, "");
        if (cleanArchiveDate !== urlDate) {
          changes.push("archive-date-mismatch");
        }
        if (/^\d{8}$/.test(archiveDateVal)) {
          const formatted = `${archiveDateVal.slice(0, 4)}-${archiveDateVal.slice(4, 6)}-${archiveDateVal.slice(6, 8)}`;
          const range = findFieldRange(result, "archive-date");
          if (range) {
            result = result.slice(0, range.valueStart) + formatted + result.slice(range.end);
          }
        }
      }
    }
  }

  if (has("archive-url") && !has("url")) {
    result = removeField(result, "archive-url");
    changes.push("archive-no-url");
  }

  if (has("archive-date") && !has("archive-url")) {
    result = removeField(result, "archive-date");
    changes.push("archive-date-no-url");
  }

  const urlStatus = getField(result, "url-status");
  if (urlStatus !== null) {
    if (urlStatus === "bot: unknown") {
      if (!has("url")) {
        result = removeField(result, "url-status");
        changes.push("orphan-url-status");
      }
    } else if (urlStatus !== "live" && !has("archive-url")) {
      result = removeField(result, "url-status");
      changes.push("orphan-url-status");
    }
  }

  return { text: result, changes };
}

export async function addArchiveFromWayback(
  params: Record<string, string>,
  options?: { mode?: "incremental" | "force" }
): Promise<{ params: Record<string, string>; changes: string[] }> {
  const mode = options?.mode ?? "incremental";
  const changes: string[] = [];

  if (!params.url) return { params, changes };

  if (params["archive-url"] && mode === "incremental") return { params, changes };

  const response = await checkWayback(params.url);
  if (!response?.archived_snapshots?.closest) return { params, changes };

  const snapshot = response.archived_snapshots.closest;
  if (!snapshot.url || !snapshot.timestamp) return { params, changes };

  const newParams = { ...params };
  newParams["archive-url"] = snapshot.url;
  const ts = snapshot.timestamp;
  newParams["archive-date"] = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  if (!newParams["url-status"]) {
    newParams["url-status"] = "live";
  }
  changes.push("archive-added");

  return { params: newParams, changes };
}

export async function processArchive(
  body: string,
  params: Record<string, string>,
  options: { templateType?: string; forceAll?: boolean }
): Promise<{ changes: string[] }> {
  const allChanges: string[] = [];

  const validated = validateExistingArchive(body);
  allChanges.push(...validated.changes);

  if (options.templateType === "cite web" || options.templateType === "cite news" || options.forceAll) {
    const result = await addArchiveFromWayback(params, { mode: options.forceAll ? "force" : "incremental" });
    allChanges.push(...result.changes);
  }

  return { changes: allChanges };
}
