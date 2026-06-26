export function generateDiff(original: string, modified: string): string {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");

  const result: string[] = [];
  let oi = 0;
  let mi = 0;

  result.push("--- original");
  result.push("+++ modified");

  while (oi < origLines.length && mi < modLines.length) {
    if (origLines[oi] === modLines[mi]) {
      result.push(" " + origLines[oi]);
      oi++;
      mi++;
    } else {
      const nextOrig = origLines.indexOf(modLines[mi], oi + 1);
      const nextMod = modLines.indexOf(origLines[oi], mi + 1);

      if (nextMod !== -1 && (nextOrig === -1 || (nextMod - mi) <= (nextOrig - oi))) {
        while (mi < nextMod) {
          result.push("+" + modLines[mi]);
          mi++;
        }
      } else if (nextOrig !== -1) {
        while (oi < nextOrig) {
          result.push("-" + origLines[oi]);
          oi++;
        }
      } else {
        result.push("-" + origLines[oi]);
        result.push("+" + modLines[mi]);
        oi++;
        mi++;
      }
    }
  }

  while (oi < origLines.length) {
    result.push("-" + origLines[oi]);
    oi++;
  }
  while (mi < modLines.length) {
    result.push("+" + modLines[mi]);
    mi++;
  }

  return result.join("\n");
}
