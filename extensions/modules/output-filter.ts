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

/** Sprawdza czy tekst to blok kodu/składni — wtedy blacklist NIE obowiązuje. */
export function isCodeOrThinkingBlock(text: string): boolean {
  const trimmed = text.trim();

  // Wrapped in markdown code fences ```...```
  if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) return true;

  // Single-line inline code: `code`
  if (/^`[^`]+`$/.test(trimmed)) return true;

  // TypeScript / JSON / code patterns — starts with common declarations
  const codeStartPatterns = [
    /^import\s/,
    /^export\s/,
    /^const\s/,
    /^let\s/,
    /^var\s/,
    /^function\s/,
    /^interface\s/,
    /^type\s/,
    /^class\s/,
    /^enum\s/,
    /^async\s/,
    /^await\s/,
    /^def\s/,
    /^public\s/,
    /^private\s/,
    /^protected\s/,
    /^readonly\s/,
    /^static\s/,
    /^return\s/,
    /^throw\s/,
    /^new\s/,
    /^if\s*\(/,
    /^for\s*\(/,
    /^while\s*\(/,
    /^switch\s*\(/,
    /^catch\s*\(/,
    /^try\s*\{/,
    /^\{/,
    /^\[/,
    /^\d/,
    /^<\w+/,
    /^\/\//,
    /^\/\*/,
    /^#!/,
    /^#\s*(include|define|pragma|import|require|![a-z])/i,
    /^package\s/,
    /^using\s/,
    /^namespace\s/,
  ];

  for (const pattern of codeStartPatterns) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

export function sanitizeOutput(text: string): string {
  // Skip blacklist sanitization for code / thinking blocks
  if (isCodeOrThinkingBlock(text)) {
    return text;
  }

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