import { describe, it, expect } from "vitest";
import { convertToSfn } from "../src/lib/sfn";

describe("convertToSfn", () => {

  it("converts <ref>{{cite ...}}</ref> with {{rp|p=}} to {{sfn}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15}}");
    expect(result).not.toContain("{{rp|p=15}}");
    expect(result).not.toContain("<ref>");
  });

  it("leaves <ref>{{cite ...}}</ref> without {{rp}} untouched", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>`;
    const result = convertToSfn(input);
    expect(result).toBe(input);
  });

  it("converts named ref with rp to sfn with ref param", () => {
    const input = `<ref name="Smith-2020">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15|ref=Smith-2020}}");
  });

  it("converts named ref reuse with its own rp", () => {
    const input = `<ref name="Smith-2020">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}\n\n<ref name="Smith-2020" />{{rp|page=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15|ref=Smith-2020}}");
    expect(result).toContain("{{sfn|Smith | 2020 | p=42|ref=Smith-2020}}");
  });

  it("leaves reuse without rp untouched", () => {
    const input = `<ref name="Smith-2020">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}\n\n<ref name="Smith-2020" />`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15|ref=Smith-2020}}");
    // Bare invocations without {{rp}} are converted to sfn (no page) to prevent cite errors
    expect(result).toContain("{{sfn|Smith | 2020|ref=Smith-2020}}");
    expect(result).not.toContain('<ref name="Smith-2020" />');
  });

  it("handles nested templates in cite", () => {
    const input = `<ref>{{cite web |title={{Foo|bar}} |last=Smith |first=JA |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15}}");
    expect(result).toContain("* {{cite web |title={{Foo|bar}} |last=Smith |first=JA |year=2020}}");
  });

  it("handles deeply nested templates in cite", () => {
    const input = `<ref>{{cite web |title={{Infobox |name={{Other|val}}}} |last=Smith |first=JA |year=2020}}</ref>{{rp|p=5}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=5}}");
    expect(result).toContain("{{cite web |title={{Infobox |name={{Other|val}}}} |last=Smith |first=JA |year=2020");
  });

  it("bare ref invocation after definition with multiple rp uses", () => {
    const input = `<ref name="J-2021">{{cite journal |last=Jones |first=B |year=2021 |title=Bar}}</ref>{{rp|p=10}}\n\n<ref name="J-2021" />{{rp|p=20}}\n\n<ref name="J-2021" />`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Jones | 2021 | p=10|ref=J-2021}}");
    expect(result).toContain("{{sfn|Jones | 2021 | p=20|ref=J-2021}}");
    expect(result).toContain("{{sfn|Jones | 2021|ref=J-2021}}");
  });

  it("handles {{Rp}} (uppercase R)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{Rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15}}");
  });

  it("handles {{RP}} (fully uppercase)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{RP|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15}}");
  });

  it("handles {{Reference page}} alias", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{Reference page|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15}}");
  });

  it("handles {{reference page}} (lowercase)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{reference page|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15}}");
  });

  it("handles multiple consecutive {{rp}} after the same ref (last rp wins)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}{{rp|p=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=42}}");
    expect(result).not.toContain("{{rp|");
  });

  it("handles bare number in {{rp}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|23}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=23}}");
  });

  it("handles {{rp|pp=}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|pp=23-25}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | pp=23-25}}");
  });

  it("handles {{rp|pages=}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|pages=23-25}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | pp=23-25}}");
  });

  it("handles {{rp|loc=}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|loc=Table 2}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | loc=Table 2}}");
  });

  it("handles {{rp|at=}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|at=end of chapter}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | at=end of chapter}}");
  });

  it("uses multi-author (last1, last2) — adds et al.", () => {
    const input = `<ref>{{cite journal |last1=Smith |first1=JA |last2=Jones |first2=AB |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith et al. | 2020 | p=15}}");
  });

  it("single author stays as-is (no et al.)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15}}");
    expect(result).not.toContain("et al.");
  });

  it("creates Sources section when none exists", () => {
    const input = `Some text.\n\n<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}\n\nMore text.`;
    const result = convertToSfn(input);
    expect(result).toContain("== Sources ==");
    expect(result).toContain("* {{cite web |last=Smith |first=JA |title=Foo |year=2020}}");
  });

  it("does not duplicate Sources section if one already exists", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}\n\n== Sources ==\n* already there\n`;
    const result = convertToSfn(input);
    expect(result).toContain("== Sources ==");
    expect((result.match(/== Sources ==/g) || []).length).toBe(1);
  });

  it("deduplicates sources (same cite used with different pages)", () => {
    const input = `<ref name="S">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}\n<ref name="S" />{{rp|p=42}}`;
    const result = convertToSfn(input);
    const sourcesCount = (result.match(/\* \{\{cite web \|last=Smith/g) || []).length;
    expect(sourcesCount).toBe(1);
  });

  it("inserts Sources after References section", () => {
    const input = `Text\n\n== References ==\n{{reflist}}\n\nMore text\n\n== Further reading ==\nstuff`;
    const result = convertToSfn(input + `\n\n<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`);
    expect(result).toContain("== References ==");
    expect(result).toContain("== Sources ==");
  });

  it("reuse strips old page param and applies new rp page", () => {
    const input = `<ref name="S">{{cite journal |last=Christensen |first=J |title=Plurality |year=2022 |page=1}}</ref>{{rp|p=1}}\n<ref name="S" />{{rp|page=2}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Christensen | 2022 | p=1|ref=S}}");
    expect(result).toContain("{{sfn|Christensen | 2022 | p=2|ref=S}}");
    expect(result).not.toContain("p=1 | p=2");
  });

  it("reuse strips loc param from original body when reuse has rp", () => {
    const input = `<ref name="S">{{cite web |last=Smith |first=JA |title=Foo |year=2020 |loc=Table 1}}</ref>{{rp|loc=Table 1}}\n<ref name="S" />{{rp|loc=Table 2}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | loc=Table 1|ref=S}}");
    expect(result).toContain("{{sfn|Smith | 2020 | loc=Table 2|ref=S}}");
  });

  it("converts {{citation}} template with {{rp}}", () => {
    const input = `<ref>{{citation |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15}}");
    expect(result).toContain("* {{citation |last=Smith |first=JA |title=Foo |year=2020}}");
  });

  it("handles extra content between {{cite}} and </ref> (e.g. {{dead link}})", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}} {{dead link|date=2023}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15}}");
    expect(result).not.toContain("<ref>");
  });

  it("handles {{citation}} with extra content before </ref>", () => {
    const input = `<ref>{{citation |last=Jones |first=B |title=Bar |year=2021}}  [https://example.com Extra]</ref>{{rp|p=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Jones | 2021 | p=42}}");
    expect(result).not.toContain("{{rp|");
  });

  it("handles {{rp|page=}} (long form)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|page=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=42}}");
  });

  it("handles citation with only author (no last)", () => {
    const input = `<ref>{{cite book |author=Smith JA |title=Baz |year=2021}}</ref>{{rp|p=10}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith JA | 2021 | p=10}}");
  });

  it("handles citation with only date and no year param", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |date=15 March 2022}}</ref>{{rp|p=5}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2022 | p=5}}");
  });

  it("preserves non-sfn refs (different template types)", () => {
    const input = `<ref>{{notacite |param=val}}</ref>{{rp|p=1}}`;
    const result = convertToSfn(input);
    expect(result).toBe(input);
  });

  it("handles single-quoted name attribute on open ref", () => {
    const input = `<ref name='Smith-2020'>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=15|ref=Smith-2020}}");
  });

  it("handles single-quoted name attribute on self-closing ref", () => {
    const input = `<ref name='S'>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=1}}\n<ref name='S' />{{rp|p=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith | 2020 | p=42|ref=S}}");
    expect(result).not.toContain("{{rp|");
  });

  it("strips rp from reuse match without leaving {{rp}} in output", () => {
    const input = `<ref name="S">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=1}}\n<ref name="S" />{{rp|page=42}}`;
    const result = convertToSfn(input);
    expect(result).not.toContain("{{rp|");
    expect(result).not.toContain("{{Reference page|");
  });

});
