declare let browser: {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  i18n: {
    getMessage(messageName: string, substitutions?: string | string[]): string;
  };
  runtime?: {
    id?: string;
  };
};
