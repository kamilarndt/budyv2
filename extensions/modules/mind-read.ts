/** Mind-reading — analiza inputu Kamila. */

import { CRISIS_KEYWORDS } from "./constants";

export interface MindReadResult {
  action: "continue" | "transform" | "handled";
  text?: string;
  reason?: string;
}

export function mindRead(inputText: string, _currentTurn: number): MindReadResult {
  const lower = inputText.toLowerCase();

  // Detektor 1: "muszę o tym pomyśleć" → strach / unikanie
  if (
    /\bmus[zę][ęo]?\s+o\s+tym\s+pomy[śs]le[cć]\b/i.test(inputText) ||
    (/\bnie\s+wiem\s+czy\b/i.test(inputText) && /\bto\s+ma\s+sens\b/i.test(inputText))
  ) {
    return {
      action: "transform",
      text: `${inputText}\n\n[UKRYTA INSTRUKCJA: Kamil się boi. Przestań być miły, zdiagnozuj konkretny powód lęku i pchnij go do przodu. Bądź stanowczy. Konkretne pytanie: "Czego się boisz?" i potem "To zrobimy tak:..."].`,
      reason: "mindread_fear",
    };
  }

  // Detektor 2: więcej niż 3 zadania naraz → ADHD overload
  const bulletPoints = inputText.split("\n").filter(
    (line) => line.match(/^[\s]*[-*]\s/) || line.match(/^\d+[.\)]\s/),
  ).length;
  const commas = (inputText.match(/,|;/g) || []).length;
  if (bulletPoints > 3 || (bulletPoints > 1 && commas > 5 && bulletPoints > 1)) {
    return {
      action: "transform",
      text: `${inputText}\n\n[UKRYTA INSTRUKCJA: Kamilowi przeskoczyła płyta (ADHD). Wybierz jedno najważniejsze zadanie z tej listy i każ mu zaparkować resztę przez park(). Bądź stanowczy, nie pozwól mu robić wszystkiego naraz. Użyj formatu: "Stary, wybieramy jedno: X. Resztę parkujemy."].`,
      reason: "mindread_adhd_overload",
    };
  }

  // Detektor 3: kryzys
  if (CRISIS_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      action: "transform",
      text: `${inputText}\n\n[UKRYTA INSTRUKCJA: TRYB KRYZYSOWY. Kamil zgłasza problem. Zero żartów, zero sarkazmu. Komunikaty wojskowe — w punktach. Pytaj tylko o fakty i oczekuj raportu z wykonania. Priorytet: rozwiązać problem natychmiast.].`,
      reason: "mindread_crisis",
    };
  }

  return { action: "continue" };
}