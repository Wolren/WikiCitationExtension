import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { processWikitext } from "../src/content";
import type { StorageSettings } from "../src/lib/types";

const TEXT_DIR = join(__dirname, "fixtures", "texts");
const files = readdirSync(TEXT_DIR).filter((f) => f.endsWith(".txt"));

function mockOkResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  const mockFetch = vi.fn().mockResolvedValue(mockOkResponse(null));
  globalThis.fetch = mockFetch;
});

if (files.length === 0) {
  it("FAIL: no text fixture files found", () => {
    // Hard failure, not a silent skip — an empty fixture dir means the
    // real-article smoke tests above are not running at all.
    expect(files.length, "tests/fixtures/texts/ must contain .txt fixtures").toBeGreaterThan(0);
  });
} else {
  describe("text file smoke tests", () => {
    for (const file of files) {
      it(file, async () => {
        const original = readFileSync(join(TEXT_DIR, file), "utf-8");
        expect(original.trim()).toBeTruthy();

        const settings: StorageSettings = {
          modules: "cleanup,dates,authors,spacing,sort,dedup",
          force: false,
          ref_names: false,
          spacing_style: "standard",
        };
        const result = await processWikitext(original, settings);

        expect(result.text.trim()).toBeTruthy();
        expect(result.text).not.toContain("<ref><ref");
        expect(result.text).not.toContain("<ref >");
        expect(result.text.length).toBeGreaterThanOrEqual(original.length * 0.5);
      }, 60000);
    }
  });
}
