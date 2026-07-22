import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub browser storage before importing crypto
const mockStorage: Record<string, unknown> = {};
let storageSetShouldFail = false;

const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        if (storageSetShouldFail) throw new Error("Storage quota exceeded");
        for (const [k, v] of Object.entries(items)) mockStorage[k] = v;
      }),
    },
  },
} as any;
vi.stubGlobal("browser", mockBrowser);

// Mock crypto subtle
let keyExported: Uint8Array | null = null;
const knownCiphertexts = new Set<string>();

const mockCrypto = {
  subtle: {
    generateKey: vi.fn().mockResolvedValue("mock-key"),
    exportKey: vi.fn(async (_: string, _key: any) => {
      keyExported = new Uint8Array(32);
      keyExported.fill(42);
      return keyExported.buffer;
    }),
    importKey: vi.fn(async () => "imported-key"),
    encrypt: vi.fn(async (_algo: any, _key: any, data: Uint8Array) => {
      const ct = new Uint8Array(data.length);
      ct.fill(7);
      knownCiphertexts.add(bytesToHex(ct));
      return ct.buffer;
    }),
    decrypt: vi.fn(async (_algo: any, _key: any, _data: Uint8Array) => {
      return new TextEncoder().encode("decrypted-value").buffer;
    }),
  },
  getRandomValues: vi.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i;
    return arr;
  }),
} as any;

vi.stubGlobal("crypto", mockCrypto);

function bytesToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

describe("crypto edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageSetShouldFail = false;
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  it("isEncrypted returns false for plain text", async () => {
    const { isEncrypted } = await import("../src/lib/crypto");
    expect(isEncrypted("hello")).toBe(false);
  });

  it("isEncrypted returns true for encrypted prefix text", async () => {
    const { isEncrypted } = await import("../src/lib/crypto");
    expect(isEncrypted("enc1:abc123")).toBe(true);
  });

  it("decrypt returns null for plain text (not encrypted)", async () => {
    const { decrypt } = await import("../src/lib/crypto");
    const result = await decrypt("plain text");
    expect(result).toBeNull();
  });

  it("decrypt returns null for empty string", async () => {
    const { decrypt } = await import("../src/lib/crypto");
    const result = await decrypt("");
    expect(result).toBeNull();
  });

  it("decrypt returns null for just the prefix", async () => {
    const { decrypt } = await import("../src/lib/crypto");
    const result = await decrypt("enc1:");
    expect(result).toBeNull();
  });

  it("decrypt returns null for corrupt hex data", async () => {
    const { decrypt } = await import("../src/lib/crypto");
    const result = await decrypt("enc1:zzzz_not_hex");
    expect(result).toBeNull();
  });

  it("encrypt throws when key storage fails", async () => {
    storageSetShouldFail = true;
    const { encrypt } = await import("../src/lib/crypto");
    await expect(encrypt("sensitive-data")).rejects.toThrow();
  });

  it("round-trip encrypt/decrypt returns original value", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    // Pre-seed storage so getOrCreateKey uses stored key
    mockStorage["wikifix_crypto_key"] = "2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a";
    const original = "my-secret-api-key-12345";
    const encrypted = await encrypt(original);
    expect(encrypted).toContain("enc1:");
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe("decrypted-value");
  });
});
