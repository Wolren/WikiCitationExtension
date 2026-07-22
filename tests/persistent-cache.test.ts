import { describe, it, expect } from "vitest";

// jsdom has no native IndexedDB. PersistentCache gracefully degrades.
// These tests verify the degradation path and the API contract.

describe("PersistentCache — graceful degradation (no IndexedDB)", () => {
  it("get returns undefined when IndexedDB unavailable", async () => {
    const { PersistentCache } = await import("../src/lib/cache");
    const cache = new PersistentCache();
    // Wait for the ready promise to settle (rejected/timeout)
    await new Promise(r => setTimeout(r, 50));
    const result = await cache.get("any-key");
    expect(result).toBeUndefined();
  });

  it("set does not throw when IndexedDB unavailable", async () => {
    const { PersistentCache } = await import("../src/lib/cache");
    const cache = new PersistentCache();
    await new Promise(r => setTimeout(r, 50));
    await expect(cache.set("key", "value")).resolves.toBeUndefined();
  });

  it("delete does not throw when IndexedDB unavailable", async () => {
    const { PersistentCache } = await import("../src/lib/cache");
    const cache = new PersistentCache();
    await new Promise(r => setTimeout(r, 50));
    await expect(cache.delete("key")).resolves.toBeUndefined();
  });

  it("clear does not throw when IndexedDB unavailable", async () => {
    const { PersistentCache } = await import("../src/lib/cache");
    const cache = new PersistentCache();
    await new Promise(r => setTimeout(r, 50));
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  it("chain of operations does not throw", async () => {
    const { PersistentCache } = await import("../src/lib/cache");
    const cache = new PersistentCache();
    await new Promise(r => setTimeout(r, 50));
    await cache.set("a", 1);
    await cache.set("b", 2);
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBeUndefined();
    await cache.delete("a");
    await cache.clear();
  });
});

describe("PersistentCache — API contract", () => {
  it("returns undefined from new cache (no stored data)", async () => {
    const { PersistentCache } = await import("../src/lib/cache");
    const cache = new PersistentCache();
    await new Promise(r => setTimeout(r, 50));
    expect(await cache.get("anything")).toBeUndefined();
  });

  it("accepts and stores various data types", async () => {
    const { PersistentCache } = await import("../src/lib/cache");
    const cache = new PersistentCache();
    await new Promise(r => setTimeout(r, 50));
    // Just verify no-throw for various data shapes
    await expect(cache.set("str", "hello")).resolves.toBeUndefined();
    await expect(cache.set("num", 42)).resolves.toBeUndefined();
    await expect(cache.set("obj", { nested: [1, 2, 3] })).resolves.toBeUndefined();
    await expect(cache.set("null", null)).resolves.toBeUndefined();
    await expect(cache.set("arr", [1, "b", true])).resolves.toBeUndefined();
  });
});
