import { describe, it, expect } from "vitest";
import { processWikitext } from "../src/content";
import type { StorageSettings } from "../src/lib/types";
import fixtures from "./fixtures/shared.json";

interface Fixture {
  name: string;
  input: string;
  modules: string;
  checks?: string[];
  no_checks?: string[];
  ref_names?: boolean;
}

/** Structural integrity invariants — the pipeline may never emit corrupt
 * wikitext even when it changes nothing else. */
function assertStructuralIntegrity(text: string, fixtureName: string): void {
  const open = (text.match(/\{\{/g) || []).length;
  const close = (text.match(/\}\}/g) || []).length;
  expect(open, `${fixtureName}: unbalanced {{ }}`).toBe(close);

  const linkOpen = (text.match(/\[\[/g) || []).length;
  const linkClose = (text.match(/\]\]/g) || []).length;
  expect(linkOpen, `${fixtureName}: unbalanced [[ ]]`).toBe(linkClose);

  // No doubled pipes inside template bodies — sign of a broken remove
  const templateRe = /\{\{[^{}]*?\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = templateRe.exec(text)) !== null) {
    expect(/\|\s*\|/.test(m[0]), `${fixtureName}: doubled pipe in ${m[0].slice(0, 60)}`).toBe(false);
  }

  // No empty template body
  expect(text, `${fixtureName}: empty template body`).not.toContain("{{ }}");

  // No empty ref name attribute
  expect(text, `${fixtureName}: empty ref name`).not.toMatch(/<ref\s+name\s*=\s*""/);
}

describe("shared fixtures (cross-implementation)", () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, async () => {
      const mods = f.modules;
      const settings: StorageSettings = {
        modules: mods,
        force: false,
        ref_names: !!f.ref_names,
        auto_update: !!f.ref_names,
        spacing_style: mods.includes("spacing") ? "standard" : "",
      };
      const result = await processWikitext(f.input, settings);

      assertStructuralIntegrity(result.text, f.name);

      if (f.checks) {
        for (const c of f.checks) {
          expect(result.text).toContain(c);
        }
      }
      if (f.no_checks) {
        for (const c of f.no_checks) {
          expect(result.text).not.toContain(c);
        }
      }
    });
  }
});
