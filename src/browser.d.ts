declare let browser: {
  storage: {
    local: {
      get(key: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  i18n: {
    getMessage(messageName: string, substitutions?: string | string[]): string;
  };
  runtime: {
    id?: string;
    onMessage: {
      addListener(callback: (message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => unknown): void;
    };
    sendMessage(message: unknown): Promise<unknown>;
  };
  tabs: {
    query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ id?: number }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
};
