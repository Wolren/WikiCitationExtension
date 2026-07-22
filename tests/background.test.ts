import { describe, it, expect, vi } from "vitest";

const mockTabsQuery = vi.fn();
const mockTabsSendMessage = vi.fn();
let addListenerCallback: ((message: any) => any) | null = null;

const mockBrowser = {
  tabs: {
    query: mockTabsQuery,
    sendMessage: mockTabsSendMessage,
  },
  runtime: {
    onMessage: {
      addListener: vi.fn((cb: any) => { addListenerCallback = cb; }),
    },
  },
} as any;

vi.stubGlobal("browser", mockBrowser);

describe("background service worker", () => {
  it("registers onMessage listener on import", async () => {
    await import("../src/background");
    expect(mockBrowser.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(addListenerCallback).toBeTruthy();
  });

  it("getWikiVariant returns generic when no tabs", async () => {
    mockTabsQuery.mockResolvedValue([]);
    const result = await addListenerCallback!({ type: "getWikiVariant" });
    expect(result).toEqual({ variant: "generic" });
  });

  it("getWikiVariant returns variant from active tab", async () => {
    const tabId = 42;
    mockTabsQuery.mockResolvedValue([{ id: tabId }]);
    mockTabsSendMessage.mockResolvedValue({ variant: "wikipedia" });
    const result = await addListenerCallback!({ type: "getWikiVariant" });
    expect(result).toEqual({ variant: "wikipedia" });
    expect(mockTabsSendMessage).toHaveBeenCalledWith(tabId, { type: "getWikiVariant" });
  });

  it("ignores unknown message types", () => {
    const result = addListenerCallback!({ type: "unknown" });
    expect(result).toBeUndefined();
  });

  it("handles tab without id gracefully", async () => {
    mockTabsQuery.mockResolvedValue([{ id: undefined }]);
    const result = await addListenerCallback!({ type: "getWikiVariant" });
    expect(result).toEqual({ variant: "generic" });
  });

  it("handles tabs query rejection gracefully", async () => {
    mockTabsQuery.mockRejectedValue(new Error("permission denied"));
    await expect(addListenerCallback!({ type: "getWikiVariant" })).rejects.toThrow("permission denied");
  });
});
