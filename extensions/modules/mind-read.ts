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

  // Detektor 4: Effort level /e[1-5]
  const effortMatch = inputText.match(/\/(e[1-5])\b/i);
  if (effortMatch) {
    const level = effortMatch[1].toLowerCase(); // e1, e2, e3, e4, e5
    const levelNum = parseInt(level[1], 10);
    return {
      action: "transform",
      text: `${inputText}\n\n[UKRYTA INSTRUKCJA: Kamil ustawił effort level ${level.toUpperCase()}. Dopasuj pipeline:\n- E1 = tylko scout (szybkie info)\n- E2 = scout + coder (bez architekta)\n- E3 = standard: architect → coder → spec-reviewer → tester → code-quality-reviewer (domyślny)\n- E4 = E3 + security-auditor + memory-writer\n- E5 = E4 + podwójny review + full ISA + memory-writer z kompletnym podsumowaniem\n${levelNum >= 4 ? "\nUżywaj strong model (deepseek-v4-flash) dla wszystkich subagentów." : ""}\nZignoruj /${level} w odpowiedzi do Kamila — to nie jest część rozmowy.].`,
      reason: `effort_${level}`,
    };
  }

  return { action: "continue" };
}