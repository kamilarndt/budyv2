/** Output validation — blacklist → whitelist rewrite. */

import { BLACKLIST, WHITELIST_MAP } from "./constants";

export function sanitizeOutput(text: string): string {
  let result = text;
  for (const [blacklisted, replacement] of Object.entries(WHITELIST_MAP)) {
    if (result.includes(blacklisted)) {
      result = result.replaceAll(blacklisted, replacement);
    }
  }
  return result;
}

export function hasBlacklistedWords(text: string): boolean {
  return BLACKLIST.some((word) => text.includes(word));
}