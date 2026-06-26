const CRYPTO_KEY_STORAGE = "wikifix_crypto_key";
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;

type BufferSource = ArrayBufferView | ArrayBuffer;

async function getOrCreateKey(): Promise<CryptoKey> {
  try {
    const raw = await browser.storage.local.get(CRYPTO_KEY_STORAGE);
    const stored = raw[CRYPTO_KEY_STORAGE] as string | undefined;
    if (stored) {
      const keyBytes = hexToUint8(stored);
      return await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, ALGORITHM, false, ["encrypt", "decrypt"]);
    }
  } catch { /* fall through */ }

  const key = await crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_LENGTH }, true, ["encrypt", "decrypt"]);
  const exported = await crypto.subtle.exportKey("raw", key);
  await browser.storage.local.set({ [CRYPTO_KEY_STORAGE]: uint8ToHex(new Uint8Array(exported)) });
  return key;
}

export async function encrypt(text: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return uint8ToHex(combined);
}

export async function decrypt(hex: string): Promise<string | null> {
  try {
    const key = await getOrCreateKey();
    const combined = hexToUint8(hex);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data as any);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToUint8(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) throw new Error("Invalid hex");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
