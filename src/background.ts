// Background service worker — message bridge for cross-context queries
browser.runtime.onMessage.addListener((message: unknown) => {
  if ((message as Record<string, unknown>)?.type === "getWikiVariant") {
    return browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        return browser.tabs.sendMessage(tab.id, { type: "getWikiVariant" });
      }
      return { variant: "generic" };
    });
  }
  return undefined;
});
