export class Cache<T = unknown> {
  private store = new Map<string, { value: T; expires: number }>();
  private readonly ttl: number;

  constructor(ttlMs: number) {
    this.ttl = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.evictStale();
    this.store.set(key, { value, expires: Date.now() + this.ttl });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    this.evictStale();
    return this.store.size;
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expires) this.store.delete(key);
    }
  }
}

interface IndexedDbEntry<T> {
  key: string;
  value: T;
  expires: number;
}

export class PersistentCache<T = unknown> {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;
  private ready: Promise<void>;

  constructor(dbName = "wikifix-cache", storeName = "api-cache") {
    this.dbName = dbName;
    this.storeName = storeName;
    this.ready = this.init();
  }

  private init(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof indexedDB === "undefined") { resolve(); return; }
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "key" });
          store.createIndex("expires", "expires", { unique: false });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => { this.db = null; resolve(); };
    });
  }

  async get(key: string): Promise<T | undefined> {
    await this.ready;
    const db = this.db;
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const request = store.get(key);
        request.onsuccess = () => {
          const entry = request.result as IndexedDbEntry<T> | undefined;
          if (!entry) { resolve(undefined); return; }
          if (Date.now() > entry.expires) {
            this.delete(key).catch(() => { /* stale entry cleanup is non-fatal */ });
            resolve(undefined);
            return;
          }
          resolve(entry.value);
        };
        request.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  }

  async set(key: string, value: T, ttlMs = 3600000): Promise<void> {
    await this.ready;
    const db = this.db;
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).put({ key, value, expires: Date.now() + ttlMs } as IndexedDbEntry<T>);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch { resolve(); }
    });
  }

  async delete(key: string): Promise<void> {
    await this.ready;
    const db = this.db;
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).delete(key);
        tx.oncomplete = () => resolve();
      } catch { resolve(); }
    });
  }

  async clear(): Promise<void> {
    await this.ready;
    const db = this.db;
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).clear();
        tx.oncomplete = () => resolve();
      } catch { resolve(); }
    });
  }
}
