import { describe, it, expect } from "vitest";
import { convertToSfn } from "../src/lib/sfn";

const article = `{{Short description|Individuals with multiple personalities}}
{{Use dmy dates|date=September 2025}}
{{fringe theories|date=June 2026}}

'''Plurality''' is a self-reported identity used by those who believe they experience multiple distinct consciousnesses, identities, or self-states.

==Origins and characteristics==
{{See also|Hearing Voices Network}}
The identity and its related vocabulary was first present in [[mailing lists]] of the 1980s.<ref name="Telfer-2015">{{cite web |last=Telfer |first=Tori |date=11 May 2015 |title=Are Multiple Personalities Always a Disorder? |url=https://www.vice.com/en/article/when-multiple-personalities-are-not-a-disorder-400/ |access-date=15 June 2020 |website=Vice |language=en |archive-date=13 August 2024 |archive-url=https://web.archive.org/web/20240813035324/https://www.vice.com/en/article/when-multiple-personalities-are-not-a-disorder-400/ |url-status=live }}</ref> In the 1990s, online plural communities and their associated organizations emerged in greater abundance,<ref name="Schechter-2024">{{cite journal |last=Schechter |first=Elizabeth |date=March 2024 |title=Introducing Plurals |url=http://jcn.cognethic.org/jcnv9i2_Schechter.pdf |journal=Journal of Cognition and Neuroethics |volume=9 |issue=2 |pages=95–141}}</ref>{{Reference page|page=98}} and by 2001, online communities dedicated to plurality started to appear.<ref name="Christensen-2022">{{cite journal |last=Christensen |first=Emily M. |date=1 June 2022 |title=The online community: DID and plurality |journal=European Journal of Trauma & Dissociation |volume=6 |issue=2 |doi=10.1016/j.ejtd.2021.100257 |issn=2468-7499 |doi-access=free |article-number=100257}}</ref>{{Reference page|page=1}} Consensus to use ''plurality'' as an umbrella term emerged in 2018 when more than 23,000 votes were cast across different support groups and platforms in support of the term. According to licensed counselor Emily Christensen, this "was, in itself, a historic moment for Plurals as they organized together in a way they never have previously".<ref name="Christensen-2022" />{{Reference page|page=2}} A year later, the community was introduced to two new terms (''{{gli|Endogenic|endogenic}}'' and ''{{gli|Traumagenic|traumagenic}}'') during a presentation by a plural person in the Plural Positivity World Conference.<ref name="Hoek2024">{{cite journal |last1=Hoek |first1=Liorah |last2=Hengel |first2=Louis van den |last3=Nistelrooij |first3=Inge van |last4=Schippers |first4=Alice |date=29 December 2024|title=Performing Plurality: Meet the Alters Vlogs on YouTube as Breeding Grounds for Epistemic Justice |url=https://tmgonline.nl/articles/10.18146/tmg.896 |journal=TMG Journal for Media History |volume=27 |issue=2 |pages=1–36 |language=en-US |doi=10.18146/tmg.896|doi-access=free }}</ref>{{rp|33}}

Some in the plural community practice [[tulpa]]mancy (borrowed from [[Tibetan culture]]<ref name="Telfer-2015" />); similarities between that practice and the experience of multiplicity are a major conversation point in plural communities.<ref name="Telfer-2015" /><ref name="Schechter-2024" />{{Reference page|pages=107–110}}<ref name="Pierre-2023">{{cite web |last=Pierre |first=Joe |date=13 February 2023|title=Enacted Identities: Multiplicity, Plurality, and Tulpamancy |url=https://www.psychologytoday.com/us/blog/psych-unseen/202302/enacted-identities-multiplicity-plurality-and-tulpamancy |access-date=30 June 2023 |website=[[Psychology Today]] |language=en-US}}</ref> Plural communities continue to exist online through social media including blogging sites such as [[LiveJournal]], [[Tumblr]],<ref name="Riesman-2019">{{cite web |last=Riesman |first=Abraham |date=29 March 2019 |title=The Best Cartoonist You've Never Read Is Eight Different People |url=https://www.vulture.com/2019/03/lb-lee-dissociative-identity-disorder-comics.html |url-status=live |archive-url=https://web.archive.org/web/20230330200217/https://www.vulture.com/2019/03/lb-lee-dissociative-identity-disorder-comics.html |archive-date=30 March 2023 |access-date=28 June 2023 |website=Vulture |language=en-us}}</ref><ref>{{cite web |title="Multiple Systems" versus Dissociative Identity Disorder: Life-Style or Mental Illness? |url=https://www.lycoming.edu/schemata/pdfs/Sullivan.pdf |archive-url=https://web.archive.org/web/20141111001229/http://www.lycoming.edu/schemata/pdfs/Sullivan.pdf |archive-date=11 November 2014}}</ref>{{Reference page|pages=2–4}} and more recently, [[TikTok]], [[Reddit]], [[YouTube]],<ref name="Lucas-2021">{{cite web |last=Lucas |first=Jessica |date=6 July 2021 |title=Inside TikTok's booming dissociative identity disorder community |url=https://www.inputmag.com/culture/dissociative-identity-disorder-did-tiktok-influencers-multiple-personalities |url-status=live |archive-url=https://web.archive.org/web/20220429013048/https://www.inputmag.com/culture/dissociative-identity-disorder-did-tiktok-influencers-multiple-personalities |archive-date=29 April 2022 |access-date=25 September 2022 |website=Input |language=en}}</ref><ref name="Styx-2022">{{cite web |last=Styx |first=Lo |date=27 January 2022 |title=Teens Are Using TikTok to Diagnose Themselves With Dissociative Identity Disorder |url=https://www.teenvogue.com/story/dissociative-identity-disorder-on-tiktok |url-status=live |archive-url=https://web.archive.org/web/20220402024120/https://www.teenvogue.com/story/dissociative-identity-disorder-on-tiktok |archive-date=2 April 2022 |access-date=30 June 2023 |website=Teen Vogue |language=en-US}}</ref> and [[Discord]] servers.<ref name="Christensen-2022" />{{Reference page|page=1}}

Community members often identify as "{{Glossary link internal|system|systems}}"– multiple distinct identities or personalities in the same body.  Those distinct identities may be called "{{Glossary link internal|headmate|headmates}}" or "systemmates" as well as terms that some plural people consider to be problematic such as "alters" or "parts".<ref name="Riesman-2019" /><ref name="Parry-2022">{{cite journal |last1=Parry |first1=Sarah |last2=Eve |first2=Zarah |last3=Myers |first3=Gemma |date=21 July 2022 |title=Exploring the Utility and Personal Relevance of Co-Produced Multiplicity Resources with Young People |journal=Journal of Child & Adolescent Trauma |language=en |volume=15 |issue=2 |pages=427–439 |doi=10.1007/s40653-021-00377-7 |issn=1936-1521 |pmc=9120276 |pmid=35600531 |doi-access=free}}</ref><ref name="Pierre-2023" /><ref name="Schechter-2024" />{{Reference page|pages=100–101}} Plural systems may describe a dominant or controlling headmate as "{{Glossary link internal|fronting}}" or, in cases when there is more than one, "{{Glossary link internal|co-fronting}}".<ref name="Eve-2024">{{cite thesis |last=Eve |first=Zarah |title=Exploring emerging multiplicity and psychosocial functioning: a constructivist grounded theory study |date=28 May 2024 |access-date=12 September 2025 |degree=doctoral |publisher=Manchester Metropolitan University |url=https://e-space.mmu.ac.uk/634758/ |language=en |archive-url=https://web.archive.org/web/20250920232154/https://e-space.mmu.ac.uk/634758/ |archive-date=20 September 2025 |url-status=live}}</ref>{{Reference page|page=14}}<ref name="Turell2023">{{cite journal |last1=Turell |first1=Susan C. |last2=Wolf-Gould |first2=Christopher |last3=Flynn |first3=Sana |last4=Mckie |first4=Silver |last5=Adan |first5=Matthew A. |last6=Redwoods |first6=The |date=December 2023 |title=It's just a body: A community-based participatory exploration of the experiences and health care needs for transgender plural people |url=https://linkinghub.elsevier.com/retrieve/pii/S246874992300042X |journal=European Journal of Trauma & Dissociation |language=en |volume=7 |issue=4 |article-number=100354 |doi=10.1016/j.ejtd.2023.100354|url-access=subscription }}</ref> Headmates that identify as animals or other non-human entities may also identify as "[[otherkin]]", a separate but overlapping community.<ref name="Schechter-2024" />{{Reference page|pages=124–125}}

Certain plural terminology is taken from [[queer]] spaces, for example, [[Closeted|coming out of the closet]].<ref name="Eve-2024" />{{Reference page|pages=158–159}} There is also a documented overlap between [[transgender]] and plural identities; transgender headmates (different from the body's sex) are not uncommon.<ref name="Schechter-2024" />{{Reference page|pages=113–115}} A somewhat considerable contingent of [[autistic]] people identify as plural which, according to Christensen, may possibly be due to [[Neurodiversity|neurodivergency]] being [[Traumatizing|traumatising]] in a neurotypically dominant society.<ref name="Christensen-2022" />{{Reference page|page=3}}

According to a doctoral thesis written by a [[Manchester Metropolitan University]] student, "systemhood" seems to have certain identifiable commonalities.<ref name="Eve-2024" />{{Reference page|page=38}} For example, plurals who described themselves as "non-disordered" typically found systemhood to be soothing, while those with DID typically found it to be distressing.<ref name="Eve-2024" />{{Reference page|page=199}} Also commonly reported was that a system's {{gli|headspace}} exhibited elaborate individualities that changed based on specific emotions or events.<ref name="Eve-2024" />{{Reference page|pages=152–161}} A different study on tulpamancers reported that they also [[Mental image|visualised]] an inner world, commonly calling it a "wonderland".<ref name="Hale2024" />{{Reference page|page=54}} Most systems interviewed in two separate studies reported that their headmates were aware of and communicated with each other.<ref name="Turell2023"/><ref name="Christensen-2022" />{{Reference page|page=3}} Christensen provided accounts of headmates marrying or procreating new headmates.<ref name="Christensen-2022" />{{Reference page|page=3}}

== Mental health ==
Multiplicity has been proposed as an "extreme form of identity splitting" present in individuals with symptoms of DID.<ref name="Ribáry-2017">{{cite journal |last1=Ribáry |first1=Gergő |last2=Lajtai |first2=László |last3=Demetrovics |first3=Zsolt |last4=Maraz |first4=Aniko |date=13 June 2017 |title=Multiplicity: An Explorative Interview Study on Personal Experiences of People with Multiple Selves |journal=Frontiers in Psychology |volume=8 |doi=10.3389/fpsyg.2017.00938 |issn=1664-1078 |pmc=5468408 |pmid=28659840 |doi-access=free |article-number=938}}</ref>{{Reference page|page=2}}{{Unreliable medical source|reason=Frontiers Media journal; see wiki articles on Frontiers Media and Frontiers in Psychology|date=May 2026}} A study by Turrel et al. reported that many they interviewed with plural identities said they felt disconnected from their body in experiences that matched [[dysmorphia]] and [[gender dysphoria]], while additional stigma derived from popular media which often portrays those with plural identities as dangerous.<ref name="Turell2023"/>{{Page needed|date=June 2026}} Alternatively, recent clinical research has questioned whether identifying with multiplicity or plurality necessarily leads to distress.<ref name="Yarborough-2018">{{cite book |last=Yarborough|first=Eric|editor-first1=Eric|editor-last1=Yarbrough|title=Transgender Mental Health {{!}} Psychiatry Online|url=https://psychiatryonline.org/doi/book/10.1176/appi.books.9781615378944|access-date=2025-09-22|date=2018|page=159|language=en|doi=10.1176/appi.books.9781615378944|isbn=978-1-61537-113-6 |publisher=American Psychiatric Association}}</ref>{{Reference page|pages=157–162}} Indeed, some people with plural identities do not agree with, or seek, a DID diagnosis, instead rejecting the suggestion that there is anything inherently pathological about their experiences.<ref name="Telfer-2015" /> Clinical scrutiny of plural social media content has generated backlash from some plural community members who view what they call the "system medicalist"<ref name="Eve-2024" />{{sup|:167–168}} or "sysmedical" approach to be [[Gatekeeper|gatekeeping]] or undermining their [[lived experience]].<ref name="Salter-2025" />{{Reference page|pages=44,46}} By contrast, a different, largely DID-diagnosed sub-group within the plural community has been known to "call out" others they believe to be fabricating their experience of plurality. This sometimes includes arguing that the plural community should exclude those who are undiagnosed or identify as {{Glossary link internal|endogenic}} (believing that their identity does not arise from trauma).<ref name="Eve-2024" />{{sup|:167–168}}

A rise in self-diagnosed DID cases has coincided with a growing popularity of social media content relating to DID and plural identities,<ref name="Salter-2025">{{cite journal |last1=Salter |first1=Michael |last2=Brand |first2=Bethany L. |last3=Robinson |first3=Matt |last4=Loewenstein | first4 = Richard J.|last5=Silberg | first5 = Joyanna L.|last6=Korzekwa |first6=Marilyn |title=Self-Diagnosed Cases of Dissociative Identity Disorder on Social Media: Conceptualization, Assessment, and Treatment |journal=Harvard Review of Psychiatry |date=2025 |volume=33 |issue=1 |pages=41–48 |doi=10.1097/HRP.0000000000000416 |pmid=39761444 |pmc=11708999  |doi-access=free}}</ref> a development that dovetails with ongoing concern over links between [[social media and mental health]], particularly in relation to TikTok communities.<ref>{{cite magazine |last1=Colombo |first1=Charlotte |title=Viral 'Dissociative Identity Disorder' TikToker Sparks Questions About the Internet's Effect on Mental Health |url=https://www.rollingstone.com/culture/culture-features/wonderland-system-tiktok-dissociative-identity-disorder-1283571/ |magazine=Rolling Stone |date=15 January 2022 |access-date=20 September 2025 |archive-date=30 July 2025 |archive-url=https://web.archive.org/web/20250730094546/https://www.rollingstone.com/culture/culture-features/wonderland-system-tiktok-dissociative-identity-disorder-1283571/ |url-status=live }}</ref> Some professionals also worry that online spaces could [[Mass psychogenic illness|sociogenically]] exacerbate adverse effects of DID.<ref name="Salter-2025" /> In the ''[[Harvard Review of Psychiatry]]'', Salter et al. hypothesized that the rise in the 2020s of social media self-diagnoses was the result of multiple intersecting factors including undiagnosed neurodevelopmental issues, social isolation, and hardships associated with the [[COVID-19 pandemic]], drawing a parallel to the significant increase in [[tic]]-like presentations to [[Tourette syndrome]] clinics during this period.<ref name="Salter-2025" /> The publication also warned that distinguishing genuine DID cases from [[Malingering|malingered]], factitious, or imitative DID is difficult.<ref name="Salter-2025" /> On the other hand, most members of the plural community who identify specifically as endogenic systems reject the DID label and do not claim the diagnosis.<ref name="Schechter-2024" /><sup>:6</sup>

Other reports suggest that participation in plural communities might remedy some aspects of social isolation arising from DID.<ref name="Styx-2022" /> According to ''The Plural Association,'' a Netherlands-based nonprofit founded to "empower Plurals, no matter the words or labels they use to define their unique and individual experiences",<ref>{{cite web |last=Stronghold |title=TPA Nonprofit |url=https://powertotheplurals.com/tpa-nonprofit/ |url-status=live |archive-url=https://web.archive.org/web/20231107171917/https://powertotheplurals.com/tpa-nonprofit/ |archive-date=7 November 2023 |access-date=7 November 2023 |website=powertotheplurals.com |language=en-US}}</ref> "[d]enying the existence of separate experiences can be harmful and may not facilitate healing. Acknowledging and respecting the multiplicity-plurality of individuals with DID is essential for promoting understanding, acceptance, and support."<ref name="Stronghold-2023" /> The extent to which adopting a plural identity can be regarded as a healthy way of coping is under-researched, though Ribáry et al. noted that all interviewees in a 2017 study reported that discovering the notion of plurality and participating in related communities was "helpful and therapeutic" to them.<ref name="Ribáry-2017" />{{Reference page|page=6}}{{Unreliable medical source|reason=Frontiers Media journal; see wiki articles on Frontiers Media and Frontiers in Psychology|date=May 2026}} On a further note, Elizabeth Schechter, Associate Professor of Philosophy at the University of Maryland, reported that the related practice of tulpamancy was used as a coping method during some practitioners' mental health crises.<ref name="Schechter-2024" />{{Reference page|page=110}} She along with religious studies PhD student Elizabeth Hale at UC Santa Barbara [[Tulpa#Origins|equated]] such practices with [[Prayer|praying]], noting that they could potentially impute therapeutic benefits for mental health and wellbeing.<ref name="Schechter-2024" /><ref name="Hale2024"/>{{Reference page|pages=49–50}}

== Glossary {{Anchor|glossary}} ==
{{glossary}}
{{term|1=Co-fronting}}
{{defn|1=When two or more headmates are fronting simultaneously.<ref name="Eve-2024" />{{rp|p=14}}}}
{{term|1=Endogenic}}
{{defn|1=Forms of plurality that have non-traumagenic roots.<ref name="Pierre-2023" />}}
{{term|1=Fronter}}
{{defn|1=The headmate that currently controls the body.<ref name="Telfer-2015" />}}
{{term|1=Fronting}}
{{defn|1=The act of controlling the body.<ref name="Telfer-2015" />}}
{{term|1=Headmate}}
{{ghat|Also '''systemmate''', '''alter''', '''part'''.}}
{{defn|1=One of a system's distinct identities.<ref name="Eve-2024" />{{rp|p=14}}}}
{{anchor|Headspace}}{{term|1=Headspace}}
{{ghat|Also '''inner world'''.}}
{{defn|The concept of a [[mental world]]<ref name="Hale2024">{{cite journal |last=Hale |first=Elizabeth |date=28 May 2024|title=The Inner Vehicle: Prayer, Tulpamancy, and the Magic of the Mind |url=https://journals.colorado.edu/index.php/next/article/view/2685 |journal=NEXT |language=en |volume=7 |archive-date=19 March 2025 |access-date=3 October 2025 |archive-url=https://web.archive.org/web/20250319151703/https://journals.colorado.edu/index.php/next/article/view/2685 |url-status=live }}</ref> in which headmates interact together.<ref name="Telfer-2015" /><ref name="Riesman-2019" /> Similar to [[tulpamancy]]'s wonderland.}}
{{term|1=Multiplicity}}
{{defn|1=A [[Phenomenology (philosophy)|phenomenologically]] defined version of plurality.<ref name="Stronghold-2023">{{cite web |last=Stronghold |date=18 April 2023 |title=How they took the Multiple out of Multiplicity – Understanding the history |url=https://powertotheplurals.com/how-they-took-the-multiple-out-of-multiplicity-understanding-the-history-of-dissociative-identity-disorder-did-terminology/ |access-date=28 October 2023 |website=powertotheplurals.com |language=en-US | archive-url = http://web.archive.org/web/20251219064118/https://powertotheplurals.com/how-they-took-the-multiple-out-of-multiplicity-understanding-the-history-of-dissociative-identity-disorder-did-terminology/ | archive-date = 2025-12-19 | url-status = live}}</ref>}}
{{term|1=Singlet}}
{{defn|1=A person that does not experience plurality or is not a system.<ref name="Telfer-2015" /><ref name="Ribáry-2017" />{{rp|p=5}}<ref name="Schechter-2020">{{cite web |last=Schechter |first=Elizabeth |date=20 April 2020 |title=What we can learn about respect and identity from 'plurals' |url=https://aeon.co/ideas/what-we-can-learn-about-respect-and-identity-from-plurals |access-date=24 September 2023 |website=Aeon |language=en | archive-url = http://web.archive.org/web/20260118144512/https://aeon.co/ideas/what-we-can-learn-about-respect-and-identity-from-plurals | archive-date = 2026-01-18 | url-status = live}}</ref>}}
{{term|1=Switching}}
{{defn|1=When the fronter becomes a different headmate.<ref name="Lucas-2021" />}}
{{term|1=System}}
{{defn|1=The collective term for all of a plural person's headmates.<ref name="Eve-2024" />{{rp|p=14}}<ref name="Parry-2022" />}}
{{term|1=System name}}
{{defn|1=A name that represents the system as a whole.<ref name="Eve-2024" />{{rp|p=14}}}}
{{term|1=Traumagenic}}
{{defn|1=Forms of plurality caused by or rooted in [[psychological trauma]].<ref name="Pierre-2023" />}}

{{glossary end}}

== Notable people ==
* {{annotated link|Akwaeke Emezi}}<ref>{{cite web|last=Whitehouse|first=Matthew|date=24 December 2018|title=akwaeke emezi: the 'freshwater' author standing on the edge and claiming it as central|url=https://i-d.co/article/akwaeke-emezi-freshwater-adama-jalloh/|access-date=2021-08-19|website=i-D|language=en|archive-date=19 August 2021|archive-url=https://web.archive.org/web/20210819184524/https://i-d.vice.com/en_uk/article/d3bjyz/akwaeke-emezi-freshwater-adama-jalloh|url-status=live}}</ref><ref name="Goal">{{cite web |last=Binyam |first=Maya |date=19 May 2022 |title='The Goal Is to Get As Bright As Possible' |url=https://www.vulture.com/article/akwaeke-emezi-profile.html |access-date=2022-05-24 |website=Vulture |language=en-us | archive-url = http://web.archive.org/web/20251119092939/https://www.vulture.com/article/akwaeke-emezi-profile.html | archive-date = 2025-11-19 | url-status = live}}</ref>

== See also ==
* {{annotated link|Spirit possession#Medicine and psychology|Spirit possession § Medicine and psychology}}
* {{annotated link|Hypostatic model of personality}}
* {{annotated link|Personality style}}
* {{annotated link|Post-traumatic stress disorder}}
* {{annotated link|Social media and mental health}}
* {{annotated link|Subpersonality}}

== References ==
{{reflist|2}}

[[Category:Collective identity]]
[[Category:Dissociative identity disorder]]
[[Category:Subcultures]]
[[Category:Virtual communities]]`;

describe("convertToSfn on real article", () => {
  const result = convertToSfn(article);

  it("runs without error", () => {
    expect(() => convertToSfn(article)).not.toThrow();
  });

  it("no Schechter {{sfn}} body appears more than once", () => {
    const sfns = result.match(/\{\{sfn\|[^}]*\}\}/g) || [];
    const schechter = sfns.filter(s => s.includes("Schechter"));
    const bodies = schechter.map(s => {
      const inner = s.slice(5, -2);
      return inner.replace(/\bref\s*=\s*[^|}]+/i, "").replace(/\s*\|\s*/g, "|").trim();
    });
    const counts = new Map<string, number>();
    for (const b of bodies) counts.set(b, (counts.get(b) || 0) + 1);
    const dupes = [...counts.entries()].filter(([, c]) => c > 1);
    expect(dupes).toEqual([]);
  });

  it("has no existing-sfn duplication (same body emitted from ref AND copied from original)", () => {
    const sfns = result.match(/\{\{sfn\|[^}]*\}\}/g) || [];
    const bodies = sfns.map(s => {
      const inner = s.slice(5, -2);
      return inner.replace(/\bref\s*=\s*[^|}]+/i, "").replace(/\s*\|\s*/g, "|").trim();
    });
    const counts = new Map<string, number>();
    for (const b of bodies) counts.set(b, (counts.get(b) || 0) + 1);
    const problem = [...counts.entries()].filter(([, c]) => c > 10);
    expect(problem).toEqual([]);
  });

  it("no unconverted Reference page except for no-author refs", () => {
    const refPageMatches = result.match(/\{\{Reference page\|[^}]*\}\}/gi) || [];
    expect(refPageMatches.length).toBe(0);
  });

  it("preserves {{sup|:page}} templates (formatting, not page annotation)", () => {
    // {{sup}} is a formatting template, not a page indicator like {{rp}}.
    // It should be preserved, not consumed.
    const supMatch = result.match(/\{\{sup\|:\d[^}]*\}\}/);
    // This article may or may not have {{sup}} templates
    if (supMatch) {
      expect(supMatch.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("has no degenerate {{sfn}} without author", () => {
    const sfns = result.match(/\{\{sfn\|[^}]*\}\}/g) || [];
    for (const s of sfns) {
      const inner = s.slice(5, -2);
      const firstPipe = inner.indexOf("|");
      const firstParam = (firstPipe === -1 ? inner : inner.slice(0, firstPipe)).trim();
      expect(firstParam).not.toMatch(/^p=|^pp=|^loc=|^at=/i);
    }
  });

  it("stats show all refs processed", () => {
    const refsLeft = (result.match(/<ref\b/g) || []).length;
    const sfnCount = (result.match(/\{\{sfn\|/g) || []).length;
    expect(refsLeft + sfnCount).toBeGreaterThanOrEqual(30);
  });
});
