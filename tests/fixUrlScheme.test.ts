import { describe, it, expect } from "vitest";
import { fixUrlScheme } from "../src/lib/cleanup";

describe("fixUrlScheme", () => {
  it("upgrades known HTTPS domains from http:// to https://", () => {
    const p = { url: "http://doi.org/10.1000/test" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://doi.org/10.1000/test");
    expect(changes).toContain("upgraded-http-to-https-doi.org");
  });

  it("leaves already-https URLs unchanged", () => {
    const p = { url: "https://doi.org/10.1000/test" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://doi.org/10.1000/test");
    expect(changes).toHaveLength(0);
  });

  it("prepends https:// to bare hostnames without scheme", () => {
    const p = { url: "example.com/path" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://example.com/path");
    expect(changes).toContain("fixed-url-scheme-url");
  });

  it("does not upgrade unknown domains from http://", () => {
    const p = { url: "http://example.com/page" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("http://example.com/page");
    expect(changes).toHaveLength(0);
  });

  it("leaves non-http schemes like ftp:// alone", () => {
    const p = { url: "ftp://example.com/file.pdf" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("ftp://example.com/file.pdf");
    expect(changes).toHaveLength(0);
  });

  it("upgrades web.archive.org from http://", () => {
    const p = { url: "http://web.archive.org/web/20200101000000/https://example.com/" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://web.archive.org/web/20200101000000/https://example.com/");
    expect(changes).toContain("upgraded-http-to-https-web.archive.org");
  });

  it("upgrades archive.org from http://", () => {
    const p = { url: "http://archive.org/details/something" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://archive.org/details/something");
  });

  it("upgrades en.wikipedia.org from http://", () => {
    const p = { url: "http://en.wikipedia.org/wiki/Foo" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://en.wikipedia.org/wiki/Foo");
  });

  it("upgrades wikidata.org from http://", () => {
    const p = { url: "http://wikidata.org/wiki/Q42" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://wikidata.org/wiki/Q42");
  });

  it("upgrades commons.wikimedia.org from http://", () => {
    const p = { url: "http://commons.wikimedia.org/wiki/File:Foo.jpg" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://commons.wikimedia.org/wiki/File:Foo.jpg");
  });

  it("upgrades ncbi.nlm.nih.gov from http://", () => {
    const p = { url: "http://ncbi.nlm.nih.gov/pubmed/123" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://ncbi.nlm.nih.gov/pubmed/123");
  });

  it("upgrades pubmed.ncbi.nlm.nih.gov from http://", () => {
    const p = { url: "http://pubmed.ncbi.nlm.nih.gov/12345/" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://pubmed.ncbi.nlm.nih.gov/12345/");
  });

  it("upgrades dx.doi.org from http:// to https://", () => {
    const p = { url: "http://dx.doi.org/10.1000/test" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://dx.doi.org/10.1000/test");
  });

  it("processes all URL fields", () => {
    const p: Record<string, string> = {
      url: "http://doi.org/abc",
      "archive-url": "http://web.archive.org/web/1",
      "chapter-url": "http://en.wikipedia.org/wiki/Chapter",
      "conference-url": "http://dx.doi.org/def",
      "article-url": "http://ncbi.nlm.nih.gov/ghi",
    };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://doi.org/abc");
    expect(p["archive-url"]).toBe("https://web.archive.org/web/1");
    expect(p["chapter-url"]).toBe("https://en.wikipedia.org/wiki/Chapter");
    expect(p["conference-url"]).toBe("https://dx.doi.org/def");
    expect(p["article-url"]).toBe("https://ncbi.nlm.nih.gov/ghi");
    expect(changes).toHaveLength(5);
  });

  it("handles empty url field gracefully", () => {
    const p: Record<string, string> = {};
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(changes).toHaveLength(0);
  });

  it("skips null/empty string values", () => {
    const p = { url: "", "archive-url": "" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(changes).toHaveLength(0);
  });

  it("handles case-insensitive http://", () => {
    const p = { url: "HTTP://DOI.ORG/10.1000/test" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    expect(p.url).toBe("https://doi.org/10.1000/test");
  });

  it("prevents domain overlap false positive (pubmed subdomain vs ncbi)", () => {
    const p = { url: "http://pubmed.ncbi.nlm.nih.gov/12345/" };
    const changes: string[] = [];
    fixUrlScheme(p, changes);
    // Should match pubmed.ncbi.nlm.nih.gov, not ncbi.nlm.nih.gov
    expect(changes).toContain("upgraded-http-to-https-pubmed.ncbi.nlm.nih.gov");
  });
});
