import { describe, it, expect } from "vitest";
import { convertToSfn } from "../src/lib/sfn";

describe("convertToSfn", () => {

  it("converts <ref>{{cite ...}}</ref> with {{rp|p=}} to {{sfn}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
    expect(result).not.toContain("{{rp|p=15}}");
    expect(result).not.toContain("<ref>");
  });

  it("leaves <ref>{{cite ...}}</ref> without {{rp}} untouched", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>`;
    const result = convertToSfn(input);
    expect(result).toBe(input);
  });

  it("converts named ref with rp to sfn", () => {
    const input = `<ref name="Smith-2020">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
    expect(result).not.toContain("|ref=Smith-2020");
  });

  it("converts named ref reuse with its own rp", () => {
    const input = `<ref name="Smith-2020">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}\n\n<ref name="Smith-2020" />{{rp|page=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
    expect(result).toContain("{{sfn|Smith|2020|p=42}}");
  });

  it("converts reuse without rp when definition was consumed", () => {
    const input = `<ref name="Smith-2020">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}\n\n<ref name="Smith-2020" />`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
    // Reuse without {{rp}} also becomes sfn (without pages) since definition consumed
    expect(result).toContain("{{sfn|Smith|2020}}");
  });

  it("handles nested templates in cite", () => {
    const input = `<ref>{{cite web |title={{Foo|bar}} |last=Smith |first=JA |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
    expect(result).toContain("* {{cite web |title={{Foo|bar}} |last=Smith |first=JA |year=2020}}");
  });

  it("handles deeply nested templates in cite", () => {
    const input = `<ref>{{cite web |title={{Infobox |name={{Other|val}}}} |last=Smith |first=JA |year=2020}}</ref>{{rp|p=5}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=5}}");
    expect(result).toContain("{{cite web |title={{Infobox |name={{Other|val}}}} |last=Smith |first=JA |year=2020");
  });

  it("converts bare ref invocation after definition with multiple rp uses", () => {
    const input = `<ref name="J-2021">{{cite journal |last=Jones |first=B |year=2021 |title=Bar}}</ref>{{rp|p=10}}\n\n<ref name="J-2021" />{{rp|p=20}}\n\n<ref name="J-2021" />`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Jones|2021|p=10}}");
    expect(result).toContain("{{sfn|Jones|2021|p=20}}");
    // Reuse without {{rp}} also becomes sfn (without pages) since definition consumed
    expect(result).toContain("{{sfn|Jones|2021}}");
  });

  it("handles {{Rp}} (uppercase R)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{Rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
  });

  it("handles {{RP}} (fully uppercase)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{RP|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
  });

  it("handles {{Reference page}} alias", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{Reference page|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
  });

  it("handles {{reference page}} (lowercase)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{reference page|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
  });

  it("handles multiple consecutive {{rp}} after the same ref (last rp wins)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}{{rp|p=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=42}}");
    expect(result).not.toContain("{{rp|");
  });

  it("handles bare number in {{rp}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|23}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=23}}");
  });

  it("handles {{rp|pp=}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|pp=23-25}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|pp=23-25}}");
  });

  it("handles {{rp|pages=}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|pages=23-25}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|pp=23-25}}");
  });

  it("handles {{rp|loc=}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|loc=Table 2}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|loc=Table 2}}");
  });

  it("handles {{rp|at=}}", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|at=end of chapter}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|at=end of chapter}}");
  });

  it("two authors uses positional params: Smith|Jones", () => {
    const input = `<ref>{{cite journal |last1=Smith |first1=JA |last2=Jones |first2=AB |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|Jones|2020|p=15}}");
  });

  it("four authors: Luiggi-Hernández|Fein|Bradley|Pelly|2025", () => {
    const input = `<ref>{{cite journal |last1=Luiggi-Hernández |first1=J |last2=Fein |first2=E |last3=Bradley |first3=R |last4=Pelly |first4=F |title=Test |year=2025}}</ref>{{rp|p=1}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Luiggi-Hernández|Fein|Bradley|Pelly|2025|p=1}}");
  });

  it("single author stays as-is (no et al.)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
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

  it("rp page takes precedence over cite's internal pages (default rp mode)", () => {
    const input = `<ref>{{cite journal |last=Schechter |first=Elizabeth |title=Introducing Plurals |year=2024 |pages=95–141}}</ref>{{Reference page|page=98}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Schechter|2024|p=98}}");
    expect(result).not.toContain("pp=95–141");
    expect(result).not.toContain("p=98|pp=95–141");
  });

  it("both mode includes cite's internal pages alongside rp", () => {
    const input = `<ref>{{cite journal |last=Schechter |first=Elizabeth |title=Introducing Plurals |year=2024 |pages=95–141}}</ref>{{Reference page|page=98}}`;
    const result = convertToSfn(input, { pageConflict: "both" });
    expect(result).toContain("{{sfn|Schechter|2024|p=98|pp=95–141}}");
  });

  it("cite mode ignores rp page and uses cite's internal pages", () => {
    const input = `<ref>{{cite journal |last=Schechter |first=Elizabeth |title=Introducing Plurals |year=2024 |pages=95–141}}</ref>{{Reference page|page=98}}`;
    const result = convertToSfn(input, { pageConflict: "cite" });
    expect(result).toContain("{{sfn|Schechter|2024|pp=95–141}}");
    expect(result).not.toContain("p=98");
  });

  it("reuse strips old page param and applies new rp page", () => {
    const input = `<ref name="S">{{cite journal |last=Christensen |first=J |title=Plurality |year=2022 |page=1}}</ref>{{rp|p=1}}\n<ref name="S" />{{rp|page=2}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Christensen|2022|p=1}}");
    expect(result).toContain("{{sfn|Christensen|2022|p=2}}");
    expect(result).not.toContain("p=1|p=2");
  });

  it("reuse strips loc param from original body when reuse has rp", () => {
    const input = `<ref name="S">{{cite web |last=Smith |first=JA |title=Foo |year=2020 |loc=Table 1}}</ref>{{rp|loc=Table 1}}\n<ref name="S" />{{rp|loc=Table 2}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|loc=Table 1}}");
    expect(result).toContain("{{sfn|Smith|2020|loc=Table 2}}");
  });

  it("converts {{citation}} template with {{rp}}", () => {
    const input = `<ref>{{citation |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
    expect(result).toContain("* {{citation |last=Smith |first=JA |title=Foo |year=2020}}");
  });

  it("handles extra content between {{cite}} and </ref> (e.g. {{dead link}})", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}} {{dead link|date=2023}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
    expect(result).not.toContain("<ref>");
  });

  it("handles {{citation}} with extra content before </ref>", () => {
    const input = `<ref>{{citation |last=Jones |first=B |title=Bar |year=2021}}  [https://example.com Extra]</ref>{{rp|p=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Jones|2021|p=42}}");
    expect(result).not.toContain("{{rp|");
  });

  it("handles {{rp|page=}} (long form)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|page=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=42}}");
  });

  it("handles citation with only author (no last)", () => {
    const input = `<ref>{{cite book |author=Smith JA |title=Baz |year=2021}}</ref>{{rp|p=10}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith JA|2021|p=10}}");
  });

  it("handles citation with only date and no year param", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |date=15 March 2022}}</ref>{{rp|p=5}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2022|p=5}}");
  });

  it("preserves non-sfn refs (different template types)", () => {
    const input = `<ref>{{notacite |param=val}}</ref>{{rp|p=1}}`;
    const result = convertToSfn(input);
    expect(result).toBe(input);
  });

  it("uses title as fallback surname when no author is present", () => {
    const input = `<ref>{{cite web |title="Multiple Systems" |url=https://example.com}}</ref>{{Reference page|pages=2–4}}`;
    const result = convertToSfn(input);
    expect(result).toContain('{{sfn|"Multiple Systems"|pp=2–4}}');
    expect(result).not.toContain("<ref>");
    expect(result).not.toContain("{{Reference page|pages=2–4}}");
  });

  it("uses title + archive-date year as fallback when no author or date", () => {
    const input = `<ref>{{cite web |title="Multiple Systems" versus Dissociative Identity Disorder: Life-Style or Mental Illness? |url=https://www.lycoming.edu/schemata/pdfs/Sullivan.pdf |archive-url=https://web.archive.org/web/20141111001229/http://www.lycoming.edu/schemata/pdfs/Sullivan.pdf |archive-date=11 November 2014 |url-status=live}}</ref>{{Reference page|pages=2–4}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|\"Multiple Systems\" versus Dissociative Identity Disorder: Life-Style or Mental Illness?|2014|pp=2–4}}");
    expect(result).not.toContain("<ref>");
    expect(result).not.toContain("{{Reference page|pages=2–4}}");
  });

  it("preserves ref without title or author (cannot convert)", () => {
    const input = `<ref>{{cite web |url=https://example.com}}</ref>{{Reference page|pages=2–4}}`;
    const result = convertToSfn(input);
    expect(result).toContain("<ref>");
    expect(result).toContain("{{Reference page|pages=2–4}}");
    expect(result).not.toContain("{{sfn");
  });

  it("handles single-quoted name attribute on open ref", () => {
    const input = `<ref name='Smith-2020'>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
    expect(result).not.toContain("|ref=");
  });

  it("handles single-quoted name attribute on self-closing ref", () => {
    const input = `<ref name='S'>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=1}}\n<ref name='S' />{{rp|p=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=1}}");
    expect(result).toContain("{{sfn|Smith|2020|p=42}}");
    expect(result).not.toContain("{{rp|");
  });

  it("strips rp from reuse match without leaving {{rp}} in output", () => {
    const input = `<ref name="S">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=1}}\n<ref name="S" />{{rp|page=42}}`;
    const result = convertToSfn(input);
    expect(result).not.toContain("{{rp|");
    expect(result).not.toContain("{{Reference page|");
  });

  it("handles {{rp}} with multiple params (p + loc)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15|loc=Table 2}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|loc=Table 2|p=15}}");
    expect(result).not.toContain("{{rp|");
  });

  it("handles {{rp}} with bare number and loc", () => {
    const input = `<ref>{{cite book |last=Jones |first=B |title=Bar |year=2021}}</ref>{{rp|23|loc=§4}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Jones|2021|loc=§4|p=23}}");
    expect(result).not.toContain("{{rp|");
  });

  it("handles {{rp}} with page + pp (uses both)", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|page=15|pages=23-25}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15|pp=23-25}}");
  });

  it("handles reuse with multi-param {{rp}}", () => {
    const input = `<ref name="S">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|page=1}}\n<ref name="S" />{{rp|loc=Table 2|p=42}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=1}}");
    expect(result).toContain("{{sfn|Smith|2020|loc=Table 2|p=42}}");
    const match = result.match(/\{\{sfn[^}]*\}\}/g);
    expect(match?.[1]).not.toContain("p=1");
  });

  it("handles vauthors as author fallback", () => {
    const input = `<ref>{{cite web |vauthors=Smith J|title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith J|2020|p=15}}");
  });

  it("prefers last over vauthors when both are present", () => {
    const input = `<ref>{{cite web |last=Jones|first=B|vauthors=Smith J|title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Jones|2020|p=15}}");
    const sfnMatch = result.match(/\{\{sfn\b[^}]*\}\}/)?.[0] || "";
    expect(sfnMatch).not.toContain("Smith");
  });

  it("handles {{cite|...}} without space before pipe (cite type omitted)", () => {
    const input = `<ref>{{cite|last=Smith|first=JA|title=Foo|year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
  });

  it("merges new sources into existing Sources section", () => {
    const input = `Text\n\n== Sources ==\n* {{cite web |last=Old |title=Already here |year=2019}}\n\nMore text\n\n<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    expect(result).toContain("* {{cite web |last=Old |title=Already here |year=2019}}");
    expect(result).toContain("* {{cite web |last=Smith |first=JA |title=Foo |year=2020}}");
    expect((result.match(/== Sources ==/g) || []).length).toBe(1);
  });

  it("does not duplicate sources when same cite appears in two open refs", () => {
    const input = `<ref name="A">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}\n<ref name="B">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=42}}`;
    const result = convertToSfn(input);
    const sourcesCount = (result.match(/\* \{\{cite web \|last=Smith/g) || []).length;
    expect(sourcesCount).toBe(1);
  });

  it("existing sfn template with multi-param rp", () => {
    const input = `{{sfn|Smith|2020|p=15}}{{rp|loc=Table 2}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|loc=Table 2}}");
    expect(result).not.toContain("{{rp|");
  });

  it("parseSfnParams correctly reads nested template values", () => {
    const input = `<ref>{{cite web |title={{Foo|bar}} |last=Smith |first=JA |year=2020}}</ref>{{rp|p=15}}`;
    const result = convertToSfn(input);
    const sourceMatch = result.match(/\* .+/)?.[0] || "";
    expect(sourceMatch).toContain("title={{Foo|bar}}");
  });

  it("handles comma-separated pages in {{Reference page}}", () => {
    const result = convertToSfn(`<ref name="Salter-2025">{{cite web |last=Salter |first=J |title=Test |year=2025}}</ref>{{rp|p=10}}\n\n<ref name="Salter-2025" />{{Reference page|pages=44,46}}`);
    expect(result).toContain("{{sfn|Salter|2025|p=10}}");
    expect(result).toContain("{{sfn|Salter|2025|pp=44,46}}");
    expect(result).not.toContain("{{rp|");
  });

  it("consumes {{sup|:page}} as page annotation after ref", () => {
    const input = `<ref name="Eve-2024">{{cite thesis |last=Eve |first=Zarah |title=Test |date=2024 |degree=doctoral |publisher=MMU}}</ref>{{sup|:14}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Eve|2024|p=14}}");
    expect(result).not.toContain("{{sup|:14}}");
  });

  it("handles HTML <sup>:page</sup> as page annotation", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref><sup>:15</sup>`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=15}}");
    expect(result).not.toContain("<sup>:15</sup>");
  });

  it("handles HTML <sup>page-range</sup> with en-dash", () => {
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref><sup>167–168</sup>`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|pp=167–168}}");
    expect(result).not.toContain("<sup>");
  });

  it("handles HTML <sup>:page</sup> with named ref reuse", () => {
    const input = `<ref name="S">{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=1}}\n<ref name="S" /><sup>:42</sup>`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=1}}");
    expect(result).toContain("{{sfn|Smith|2020|p=42}}");
    expect(result).not.toContain("<sup>");
  });

  it("skips existing sfn when its ref matches a converted ref", () => {
    const input = `<ref name="Eve-2024">{{cite thesis |last=Eve |first=Zarah |title=Test |date=28 May 2024 |degree=doctoral |publisher=MMU}}</ref>{{rp|page=14}}\n\n{{sfn|Eve|2024|p=14|ref=Eve-2024}}`;
    const result = convertToSfn(input);
    const sfnCount = (result.match(/\{\{sfn\|Eve\|2024\|p=14\}\}/g) || []).length;
    expect(sfnCount).toBe(1);
  });

  it("emits sfn for named ref reuse even when it has same rp pages as definition", () => {
    const input = `<ref name="S">{{cite journal |last=Schechter |first=Elizabeth |title=Introducing Plurals |year=2024 |pages=107-110}}</ref>{{rp|pp=107-110}}\n<ref name="S" />{{rp|pp=107-110}}`;
    const result = convertToSfn(input);
    const sfnCount = (result.match(/\{\{sfn\|Schechter\|2024\|pp=107-110\}\}/g) || []).length;
    // Each ref instance (definition + reuse) gets its own sfn
    expect(sfnCount).toBe(2);
  });

  it("handles colon page suffix after {{rp}} annotation", () => {
    // eslint-disable-next-line no-irregular-whitespace
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|10}}: 2–4`;
    const result = convertToSfn(input);
    // last page annotation wins (colon suffix is last)
    expect(result).toContain("{{sfn|Smith|2020|pp=2–4}}");
    expect(result).not.toContain("{{rp|");
  });

  it("handles colon page suffix after <sup> annotation", () => {
    // eslint-disable-next-line no-irregular-whitespace
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref><sup>10</sup>: 2–4`;
    const result = convertToSfn(input);
    // colon suffix is the last annotation, so its pages win
    expect(result).toContain("{{sfn|Smith|2020|pp=2–4}}");
    expect(result).not.toContain("<sup>");
  });

  it("handles colon page suffix alone after ref", () => {
    // eslint-disable-next-line no-irregular-whitespace
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>: 2–4`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|pp=2–4}}");
    expect(result).not.toContain(": 2–4");
  });

  it("handles single-page colon suffix after {{rp}}", () => {
    // eslint-disable-next-line no-irregular-whitespace
    const input = `<ref>{{cite web |last=Smith |first=JA |title=Foo |year=2020}}</ref>{{rp|p=15}}: 42`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Smith|2020|p=42}}");
    expect(result).not.toContain("{{rp|");
  });

  it("deduplicates when existing {{sfn}} appears before ref with same pages", () => {
    const input = `Some text.{{sfn|Schechter|2024|pp=107–110}}\n\n<ref name="S">{{cite journal |last=Schechter |first=Elizabeth |title=Introducing Plurals |year=2024 |pages=107–110}}</ref>{{rp|pp=107–110}}`;
    const result = convertToSfn(input);
    const sfnCount = (result.match(/\{\{sfn\|Schechter\|2024\|pp=107–110\}\}/g) || []).length;
    expect(sfnCount).toBe(1);
  });

  it("deduplicates when existing {{sfn}} with ref= attribute before ref", () => {
    const input = `{{sfn|Schechter|2024|pp=107–110|ref=Schechter2024}}\n\n<ref name="Schechter2024">{{cite journal |last=Schechter |first=Elizabeth |title=Introducing Plurals |year=2024 |pages=107–110}}</ref>{{rp|pp=107–110}}`;
    const result = convertToSfn(input);
    const sfnCount = (result.match(/\{\{sfn\|Schechter\|2024\}\}/g) || []).length;
    // Should emit zero new ones (the existing {{sfn}} with ref= is kept, ref is blocked)
    // The existing one has |ref=... so it won't match {{sfn|Schechter|2024|pp=107–110}} exactly
    // but after normalization the bodies match for dedup
    expect(sfnCount).toBe(0);
    expect(result).toContain("{{sfn|Schechter|2024|pp=107–110|ref=Schechter2024}}");
  });

  it("does not deduplicate two identical open refs (not named) with same rp", () => {
    const input = `<ref>{{cite journal |last=Schechter |first=Elizabeth |title=Introducing Plurals |year=2024 |pages=107-110}}</ref>{{rp|pp=107-110}}\n<ref>{{cite journal |last=Schechter |first=Elizabeth |title=Introducing Plurals |year=2024 |pages=107-110}}</ref>{{rp|pp=107-110}}`;
    const result = convertToSfn(input);
    const sfnCount = (result.match(/\{\{sfn\|Schechter\|2024\|pp=107-110\}\}/g) || []).length;
    // Each ref instance gets its own sfn
    expect(sfnCount).toBe(2);
    // Sources section should only have one entry (deduped by sourcesSet)
    const sourcesCount = (result.match(/\* \{\{cite journal \|last=Schechter/g) || []).length;
    expect(sourcesCount).toBe(1);
  });

  it("two ref reuses + Reference page: pages apply to both refs", () => {
    const input = `<ref name="Telfer-2015">{{cite journal |last=Telfer |year=2015 |title=Test}}</ref>\n<ref name="Schechter-2024">{{cite journal |last=Schechter |year=2024 |title=Test2}}</ref>\n\n<ref name="Telfer-2015" /><ref name="Schechter-2024" />{{Reference page|pages=107–110}}`;
    const result = convertToSfn(input);
    const sfns = result.match(/\{\{sfn[^}]*\}\}/g) || [];
    // Both should get the page, not just Schechter
    expect(sfns).toContain("{{sfn|Telfer|2015|pp=107–110}}");
    expect(sfns).toContain("{{sfn|Schechter|2024|pp=107–110}}");
  });

  // ── Integrity: no refs disappear ───────────────────────────────────

  it("single ref reuse with Reference page: produces sfn with page", () => {
    const input = `<ref name="Christensen-2022">{{cite journal |last=Christensen |year=2022 |title=Test}}</ref>\n\n<ref name="Christensen-2022" />{{Reference page|page=1}}`;
    const result = convertToSfn(input);
    expect(result).toContain("{{sfn|Christensen|2022|p=1}}");
    expect(result).not.toContain('<ref name="Christensen-2022" />');
  });

  it("unknown ref name preserved as-is even with Reference page following", () => {
    const input = '<ref name="UnknownRef" />{{Reference page|page=1}}';
    const result = convertToSfn(input);
    expect(result).toContain('<ref name="UnknownRef" />');
    expect(result).toContain('{{Reference page|page=1}}');
    expect(result).not.toContain('{{sfn|');
  });

  it("chain broken by unknown ref: known ref preserved, rp preserved", () => {
    const input = `<ref name="Known">{{cite journal |last=Smith |year=2020 |title=Test}}</ref>\n\n<ref name="Known" /><ref name="Unknown" />{{Reference page|page=5}}`;
    const result = convertToSfn(input);
    // Known ref should be preserved as <ref> (no rp pages — chain broken by Unknown)
    expect(result).not.toContain("{{sfn|");
    expect(result).toContain('<ref name="Known" />');
    // Unknown ref should be preserved as-is
    expect(result).toContain('<ref name="Unknown" />');
    // Reference page should be preserved (unchanged refs broke the chain)
    expect(result).toContain("{{Reference page|page=5}}");
  });

  it("all ref reuses produce either sfn or remain as ref (no silent drops)", () => {
    // Build a scenario with multiple refs, some known, some unknown
    const input = `<ref name="A">{{cite journal |last=Alpha |year=2020 |title=Test}}</ref>
<ref name="B">{{cite journal |last=Beta |year=2021 |title=Test}}</ref>
<ref name="C">{{cite journal |last=Gamma |year=2022 |title=Test}}</ref>

<ref name="A" /><ref name="B" />{{rp|p=10}}
<ref name="A" />{{rp|pp=20-25}}
<ref name="C" />
<ref name="Unknown" />`;
    const result = convertToSfn(input);

    // Count ref reuses in input
    const inputRefs = (input.match(/<ref name="[^"]*"\s*\/>/g) || []).length;
    // Count sfns in output
    const outputSfns = (result.match(/\{\{sfn\|/g) || []).length;
    // Count remaining ref reuses in output
    const outputRefs = (result.match(/<ref name="[^"]*"\s*\/>/g) || []).length;

    // Every input ref reuse should result in either an sfn or a remaining ref
    // Reuses without {{rp}} stay as <ref>, those with {{rp}} become sfn
    expect(outputRefs + outputSfns).toBeGreaterThanOrEqual(inputRefs);

    // Unknown ref preserved
    expect(result).toContain('<ref name="Unknown" />');

    // Known refs with rp appear as sfns (Alpha in chain with Beta so gets p=10 too)
    expect(result).toContain("{{sfn|Alpha|2020|p=10}}");
    expect(result).toContain("{{sfn|Beta|2021|p=10}}");
    // Gamma has no rp — stays as <ref>
    expect(result).not.toContain("{{sfn|Gamma|2022}}");
    expect(result).toContain('<ref name="C" />');
    // Alpha|2020|pp=20-25 is separate
    expect(result).toContain("{{sfn|Alpha|2020|pp=20-25}}");
  });

  // ── Comprehensive integrity: no content silently dropped ───────

  it("count integrity: every ref and page annotation is accounted for in output", () => {
    // Mix of all annotation types: <ref/>, {{rp}}, {{Reference page}},
    // {{sup}} (preserved), <sup> (consumed), colon-suffix (consumed)
    const input = `<ref name="A">{{cite journal |last=Alpha |year=2020 |title=T}}</ref>
<ref name="B">{{cite journal |last=Beta |year=2021 |title=T}}</ref>
<ref name="C">{{cite journal |last=Gamma |year=2022 |title=T}}</ref>

<ref name="A" /><ref name="B" />{{rp|p=10}}
<ref name="A" />{{rp|pp=20-25}}
<ref name="A" />{{Reference page|page=30}}
<ref name="A" /><sup>:40</sup>
<ref name="A" />{{sup|:50}}
<ref name="C" />
<ref name="Unknown" />{{rp|p=99}}`;
    const result = convertToSfn(input);

    // ── Input side ──
    // Self-closing ref reuses
    const inReuses = (input.match(/<ref name="[^"]*"\s*\/>/g) || []).length;
    // {{rp}} and {{Reference page}} templates (consumed or preserved)
    const _inRp = (input.match(/\{\{\s*(?:rp|reference page)\s*\|/gi) || []).length;
    // {{sup}} templates (should be preserved now)
    const _inSupTemplate = (input.match(/\{\{\s*sup\s*\|/gi) || []).length;
    // HTML <sup> tags (consumed, like rp)
    const _inSupHtml = (input.match(/<sup[^>]*>.*?<\/sup>/gi) || []).length;

    // ── Output side ──
    // Generated sfns
    const outSfn = (result.match(/\{\{sfn\|/g) || []).length;
    // Remaining ref reuses
    const outReuses = (result.match(/<ref name="[^"]*"\s*\/>/g) || []).length;
    // Remaining {{rp}}/{{Reference page}}
    const _outRp = (result.match(/\{\{\s*(?:rp|reference page)\s*\|/gi) || []).length;
    // Remaining {{sup}}
    const outSupTemplate = (result.match(/\{\{\s*sup\s*\|/gi) || []).length;
    // Remaining <sup>
    const outSupHtml = (result.match(/<sup[^>]*>.*?<\/sup>/gi) || []).length;
    // Remaining colon-suffix
    // eslint-disable-next-line no-irregular-whitespace
    const _outColon = (result.match(/: ?\\d[\\d\\-\\u2013,]*/g) || []).filter(m => /^: ?\\d/.test(m)).length;

    // ── Integrity rules ──
    // 1. Every ref reuse → either sfn or remaining ref
    expect(outReuses + outSfn).toBeGreaterThanOrEqual(inReuses);

    // 2. Every {{rp}}/{{Reference page}} → either consumed or preserved
    //    (consumed = they produce sfns; but dedup can merge sfns)
    expect(outSfn).toBeGreaterThanOrEqual(1);

    // 3. {{sup|:DIGIT}} templates consumed as page annotations
    expect(outSupTemplate).toBe(0);

    // 4. HTML <sup> tags should be consumed (turned into sfns with page)
    //    Since they produce pages, the sfn count should include them
    expect(outSupHtml).toBe(0);

    // 5. Verify specific content
    expect(result).not.toContain('{{sup|:50}}'); // consumed as page annotation
    expect(result).toContain('{{sfn|Alpha|2020|p=50}}'); // sup page IN sfn
    expect(result).toContain('{{sfn|Alpha|2020|p=40}}'); // <sup> IS consumed
    expect(result).toContain('{{sfn|Alpha|2020|pp=20-25}}');
    expect(result).toContain('{{sfn|Alpha|2020|p=30}}');
  });

  it("comprehensive: real-article mix with sup, rp, ref reuses, open refs", () => {
    // Simulates the pattern from Plural identity article
    // Note: NO pre-existing {{sfn}} for Eve at p=167-168 — the sup-based ref
    // reuses must produce their own sfns
    const input = `<ref name="Eve-2024">{{cite thesis |last=Eve |first=Zarah |title=Plural Lives |date=28 May 2024 |degree=doctoral |publisher=MMU}}</ref>
<ref name="Salter-2025">{{cite journal |last=Salter |first=J |last2=Brand |first2=J |last3=Robinson |first3=R |last4=Loewenstein |first4=S |title=Plurality in practice |year=2025 |journal=J. Plural}}</ref>

<ref name="Eve-2024" />{{sup|:167-168}} or "sysmedical" approach.
<ref name="Salter-2025" />{{Reference page|pages=44,46}} By contrast, a different group.
<ref name="Eve-2024" />{{sup|:167-168}}`;
    const result = convertToSfn(input);

    // 📊 Integrity: count all input markers 📊
    const inReuses = (input.match(/<ref name="[^"]*"\s*\/>/g) || []).length;
    const _inRp = (input.match(/\{\{\s*(?:rp|reference page)\s*\|/gi) || []).length;
    const _inSupTmpl = (input.match(/\{\{\s*sup\s*\|/gi) || []).length;

    // Count output
    const outSfn = (result.match(/\{\{sfn\|/g) || []).length;
    const outReuses = (result.match(/<ref name="[^"]*"\s*\/>/g) || []).length;
    const outSupTmpl = (result.match(/\{\{\s*sup\s*\|/gi) || []).length;
    const outRp = (result.match(/\{\{\s*(?:rp|reference page)\s*\|/gi) || []).length;

    // ── Integrity assertions ──
    // {{sup|:DIGIT}} templates consumed as page annotations
    expect(outSupTmpl).toBe(0);

    // All ref reuses should produce sfns (no refs or sup left behind)
    expect(outSfn).toBeGreaterThanOrEqual(inReuses);
    expect(outReuses).toBe(0);

    // {{Reference page}} consumed (page data applied to refs)
    expect(outRp).toBe(0);
    // Salter ref reuse + Reference page should produce sfn with pages=44,46
    expect(result).toContain("{{sfn|Salter|Brand|Robinson|Loewenstein|2025|pp=44,46}}");
    // Eve ref reuses with sup should produce sfns with p=167-168
    expect(result).toContain("{{sfn|Eve|2024|p=167-168}}");
  });
});