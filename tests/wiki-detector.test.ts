import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectWiki, isEditPage, getPageTitle } from "../src/wiki-detector";

function setLocation(overrides: Partial<Location>): void {
  const base = {
    hostname: "example.com",
    origin: "https://example.com",
    search: "",
    pathname: "/",
    href: "https://example.com/",
  };
  delete (globalThis as any).location;
  (globalThis as any).location = { ...base, ...overrides };
}

describe("detectWiki", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("mediawiki");
    document.body.innerHTML = "";
    delete (window as any).mw;
  });

  it("detects Wikipedia by hostname", () => {
    setLocation({ hostname: "en.wikipedia.org", origin: "https://en.wikipedia.org" });
    const wiki = detectWiki();
    expect(wiki.isMediaWiki).toBe(true);
    expect(wiki.variant).toBe("wikipedia");
    expect(wiki.apiUrl).toBe("https://en.wikipedia.org/w/api.php");
  });

  it("detects Fandom by hostname", () => {
    setLocation({ hostname: "memory-alpha.fandom.com", origin: "https://memory-alpha.fandom.com" });
    const wiki = detectWiki();
    expect(wiki.isMediaWiki).toBe(true);
    expect(wiki.variant).toBe("fandom");
    expect(wiki.apiUrl).toBe("https://memory-alpha.fandom.com/api.php");
  });

  it("detects Wikia.org as Fandom", () => {
    setLocation({ hostname: "memory-alpha.wikia.org", origin: "https://memory-alpha.wikia.org" });
    const wiki = detectWiki();
    expect(wiki.isMediaWiki).toBe(true);
    expect(wiki.variant).toBe("fandom");
    expect(wiki.apiUrl).toBe("https://memory-alpha.wikia.org/api.php");
  });

  it("detects Miraheze by hostname", () => {
    setLocation({ hostname: "dev.miraheze.org", origin: "https://dev.miraheze.org" });
    const wiki = detectWiki();
    expect(wiki.isMediaWiki).toBe(true);
    expect(wiki.variant).toBe("miraheze");
    expect(wiki.apiUrl).toBe("https://dev.miraheze.org/w/api.php");
  });

  it("detects generic MediaWiki via class on html", () => {
    setLocation({ hostname: "wiki.custom.org", origin: "https://wiki.custom.org" });
    document.documentElement.classList.add("mediawiki");
    const wiki = detectWiki();
    expect(wiki.isMediaWiki).toBe(true);
    expect(wiki.variant).toBe("generic");
    expect(wiki.apiUrl).toBe("https://wiki.custom.org/w/api.php");
  });

  it("detects generic MediaWiki via mw global", () => {
    setLocation({ hostname: "wiki.custom.org", origin: "https://wiki.custom.org" });
    (window as any).mw = {};
    const wiki = detectWiki();
    expect(wiki.isMediaWiki).toBe(true);
    expect(wiki.variant).toBe("generic");
  });

  it("detects generic MediaWiki via mw-content-text element", () => {
    setLocation({ hostname: "wiki.custom.org" });
    document.body.innerHTML = '<div id="mw-content-text"></div>';
    const wiki = detectWiki();
    expect(wiki.isMediaWiki).toBe(true);
    expect(wiki.variant).toBe("generic");
  });

  it("returns isMediaWiki=false for non-MediaWiki pages", () => {
    setLocation({ hostname: "example.com" });
    const wiki = detectWiki();
    expect(wiki.isMediaWiki).toBe(false);
    expect(wiki.apiUrl).toBeNull();
  });
});

describe("isEditPage", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setLocation({ search: "" });
  });

  it("returns true when action=edit in URL", () => {
    setLocation({ search: "?action=edit" });
    expect(isEditPage()).toBe(true);
  });

  it("returns true when action=submit in URL", () => {
    setLocation({ search: "?action=submit" });
    expect(isEditPage()).toBe(true);
  });

  it("returns true when veaction=edit in URL", () => {
    setLocation({ search: "?veaction=edit" });
    expect(isEditPage()).toBe(true);
  });

  it("returns true when wpTextbox1 textarea exists", () => {
    document.body.innerHTML = '<textarea id="wpTextbox1"></textarea>';
    expect(isEditPage()).toBe(true);
  });

  it("returns true when a large textarea is present", () => {
    const ta = document.createElement("textarea");
    Object.defineProperty(ta, "offsetWidth", { configurable: true, value: 500 });
    Object.defineProperty(ta, "offsetHeight", { configurable: true, value: 300 });
    document.body.appendChild(ta);
    expect(isEditPage()).toBe(true);
  });

  it("returns true when contenteditable element exists", () => {
    document.body.innerHTML = '<div contenteditable="true"></div>';
    expect(isEditPage()).toBe(true);
  });

  it("ignores small textareas that are not editors", () => {
    const ta = document.createElement("textarea");
    Object.defineProperty(ta, "offsetWidth", { configurable: true, value: 100 });
    Object.defineProperty(ta, "offsetHeight", { configurable: true, value: 30 });
    document.body.appendChild(ta);
    expect(isEditPage()).toBe(false);
  });

  it("returns false for a regular article page", () => {
    document.body.innerHTML = "<p>Article content here</p>";
    expect(isEditPage()).toBe(false);
  });
});

describe("getPageTitle", () => {
  beforeEach(() => {
    setLocation({ pathname: "/", search: "" });
  });

  it("extracts title from /wiki/ path", () => {
    setLocation({ pathname: "/wiki/Some_Article" });
    expect(getPageTitle()).toBe("Some_Article");
  });

  it("decodes URI-encoded titles", () => {
    setLocation({ pathname: "/wiki/Caf%C3%A9" });
    expect(getPageTitle()).toBe("Café");
  });

  it("extracts title from query parameter", () => {
    setLocation({ pathname: "/w/index.php", search: "?title=Main_Page&action=edit" });
    expect(getPageTitle()).toBe("Main_Page");
  });

  it("returns empty string when no title is found", () => {
    setLocation({ pathname: "/" });
    expect(getPageTitle()).toBe("");
  });
});
