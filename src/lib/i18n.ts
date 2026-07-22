/**
 * i18n helper — extracted to avoid circular imports between content, format, and panel.
 */
export function t(key: string, ...subs: (string | number)[]): string {
  try {
    let msg = browser.i18n.getMessage(key);
    if (!msg) return key;
    for (let i = 0; i < subs.length; i++) msg = msg.replace(`$${i + 1}`, String(subs[i]));
    return msg;
  } catch {
    return key;
  }
}
