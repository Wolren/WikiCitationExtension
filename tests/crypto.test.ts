import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub browser storage before importing crypto
const mockStorage: Record<string, unknown> = {};
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) mockStorage[k] = v;
      }),
    },
  },
} as any;
vi.stubGlobal("browser", mockBrowser);

// Mock crypto subtle — tracks known ciphertexts to simulate AES-GCM auth
let keyExported: Uint8Array | null = null;
const knownCiphertexts = new Set<string>();
function bytesToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}
const mockCrypto = {
  subtle: {
    generateKey: vi.fn().mockResolvedValue("mock-key"),
    exportKey: vi.fn(async (_: string, _key: any) => {
      keyExported = new Uint8Array(32);
      keyExported.fill(42);
      return keyExported.buffer;
    }),
    importKey: vi.fn().mockResolvedValue("mock-imported-key"),
    encrypt: vi.fn().mockImplementation(async (_algo: any, _key: any, data: Uint8Array) => {
      const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
      const result = new Uint8Array(buf.length);
      for (let i = 0; i < buf.length; i++) result[i] = buf[i] ^ 0xFF;
      knownCiphertexts.add(bytesToHex(result));
      return result.buffer;
    }),
    decrypt: vi.fn().mockImplementation(async (_algo: any, _key: any, data: Uint8Array) => {
      const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (!knownCiphertexts.has(bytesToHex(buf))) throw new Error("decrypt failed");
      const result = new Uint8Array(buf.length);
      for (let i = 0; i < buf.length; i++) result[i] = buf[i] ^ 0xFF;
      return result.buffer;
    }),
  },
  getRandomValues: vi.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
    return arr;
  }),
} as any;
Object.defineProperty(globalThis, "crypto", { value: mockCrypto });

import { encrypt, decrypt } from "../src/lib/crypto";

beforeEach(() => {
  delete mockStorage["wikifix_crypto_key"];
  vi.clearAllMocks();
});

describe("encrypt/decrypt", () => {
  it("encrypts and decrypts a string", async () => {
    const original = "my-secret-api-key-12345";
    const encrypted = await encrypt(original);
    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(0);
    expect(encrypted).not.toBe(original);

    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("returns null for corrupted data", async () => {
    const result = await decrypt("not-a-valid-hex-string");
    expect(result).toBeNull();
  });

  it("returns null for tampered ciphertext", async () => {
    const original = "test-key";
    const encrypted = await encrypt(original);
    // Tamper with the hex string
    const tampered = encrypted.slice(0, -2) + "00";
    const result = await decrypt(tampered);
    expect(result).toBeNull();
  });

  it("generates and persists the crypto key on first use", async () => {
    expect(mockStorage["wikifix_crypto_key"]).toBeUndefined();

    await encrypt("hello");

    expect(mockStorage["wikifix_crypto_key"]).toBeDefined();
    expect(typeof mockStorage["wikifix_crypto_key"]).toBe("string");
    expect(mockStorage["wikifix_crypto_key"]!.length).toBeGreaterThan(0);
  });

  it("reuses existing crypto key", async () => {
    await encrypt("first");
    const key1 = mockStorage["wikifix_crypto_key"];
    mockCrypto.subtle.generateKey.mockClear();

    await encrypt("second");

    // generateKey should NOT be called again since key exists
    expect(mockCrypto.subtle.generateKey).not.toHaveBeenCalled();
    expect(mockStorage["wikifix_crypto_key"]).toBe(key1);
  });

  it("handles empty string", async () => {
    const encrypted = await encrypt("");
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it("handles special characters", async () => {
    const original = "abc123!@#$%^&*()_+-=[]{}|;':\",./<>?`~你好";
    const encrypted = await encrypt(original);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(original);
  });
});
