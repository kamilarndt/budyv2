/** Output validation — blacklist → whitelist rewrite + sentinel (cisza zamiast "git"). */

import { BLACKLIST, WHITELIST_MAP } from "./constants";

const NOISE_PATTERNS = [
  /^(git|spoko|okej|ok|ok\.|okay|dobra|jasne|no|no\.|ta|tak)$/i,
  /^(dobra|no dobra|dobra dobra)$/i,
  /^(rozumiem|kumam|ogarniam)$/i,
  /^(.+)(?:\1)+$/i, // powtórzenia
];

/** Czy odpowiedź to szum (za krótka, bez informacji)? */
export function isNoise(content: string): boolean {
  const trimmed = content.trim();

  // Pusta odpowiedź
  if (!trimmed || trimmed.length === 0) return true;

  // Bardzo krótkie bez znaku zapytania = szum
  if (trimmed.length <= 30 && !trimmed.includes("?")) return true;

  // Pasuje do patternów szumu
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

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