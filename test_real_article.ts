import { readFileSync } from "fs";
import { convertToSfn } from "../src/lib/sfn";

const wikitext = readFileSync("therians_wikitext.txt", "utf8");
const result = convertToSfn(wikitext);

// Find ALL </ref> in output
const refCloseIndices: number[] = [];
let idx = -1;
while ((idx = result.indexOf("</ref>", idx + 1)) >= 0) {
  refCloseIndices.push(idx);
}

console.log(`Total </ref> in output: ${refCloseIndices.length}`);
if (refCloseIndices.length > 0) {
  console.log("\nFirst 5 </ref> locations:");
  for (const i of refCloseIndices.slice(0, 5)) {
    const ctx = result.substring(Math.max(0, i - 80), i + 20);
    console.log(`--- pos ${i} ---\n...${ctx}...\n`);
  }
}

// Check each named ref definition & reuse
const defs = wikitext.match(/<ref\s+name\s*=\s*"([^"]*)"\s*>/g) || [];
const reuses = wikitext.match(/<ref\s+name\s*=\s*"([^"]*)"\s*\/>/g) || [];
const defNames = new Set(defs.map(d => d.match(/name\s*=\s*"([^"]*)"/)?.[1]));
const reuseNames = new Set(reuses.map(r => r.match(/name\s*=\s*"([^"]*)"/)?.[1]));

console.log(`\nNamed ref definitions: ${defNames.size}`);
console.log(`Named ref reuses: ${reuseNames.size}`);

// Find reuses whose definition doesn't exist in output
for (const name of reuseNames) {
  if (!result.includes(`<ref name="${name}">`)) {
    console.log(`  DEFINITION MISSING: ${name} (reuse still in output? ${result.includes(`<ref name="${name}" />`) || result.includes(`<ref name="${name}"/>`)})`);
  }
}

// Find reuses with Reference page after them
const refPageReuses = wikitext.match(/<ref\s+name\s*=\s*"([^"]*)"\s*\/>\s*\{\{Reference page/gs);
console.log(`\nReuses followed by Reference page: ${refPageReuses ? refPageReuses.length : 0}`);
if (refPageReuses) {
  for (const r of refPageReuses) {
    const name = r.match(/name\s*=\s*"([^"]*)"/)?.[1];
    console.log(`  ${name}: still in output? ${result.includes(r)}`);
  }
}

// Check Cite errors
const citeErrors = result.match(/Cite\s+error/gi);
console.log(`\nCite errors: ${citeErrors ? citeErrors.length : 0}`);
