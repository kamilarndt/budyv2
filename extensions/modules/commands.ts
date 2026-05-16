/** Komendy /status i /audit. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BLACKLIST, WHITELIST_MAP, ENERGY_COMMENTS, USER_TRIGGER_PATTERNS } from "./constants";
import { callMemoryAPI } from "./memory-api";

export interface BudyState {
  soulContent: string;
  sessionStartTime: number;
  turnCounter: number;
  recentDreams: string[];
}

export function registerCommands(pi: ExtensionAPI, state: BudyState): void {
  pi.registerCommand("status", {
    description: "Pokazuje status BudyV2: SOUL.md, authority manifolds, delegacje",
    handler: async (_args, ctx) => {
      const now = new Date();
      const timeStr = now.toLocaleString("pl-PL", { hour: "2-digit", minute: "2-digit" });
      const dayStr = now.toLocaleString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
      const uptimeMin = Math.round((Date.now() - state.sessionStartTime) / 60000);

      let msg = `👀 **BudyV2 Status — ${dayStr}, ${timeStr}**\n\n`;

      if (state.soulContent) {
        const soulLines = state.soulContent.split("\n").length;
        msg += `📜 **SOUL.md:** ✅ Załadowany (${state.soulContent.length} znaków, ${soulLines} linii)\n`;
        const hasAuthority = /authority manifolds/i.test(state.soulContent);
        const hasBackstory = /backstory/i.test(state.soulContent) || /36 lat/i.test(state.soulContent);
        const hasPAI = /PAI/i.test(state.soulContent);
        msg += `   ├ Authority Manifolds: ${hasAuthority ? "✅" : "❌"}\n`;
        msg += `   ├ Backstory (36 lat, 2 exity): ${hasBackstory ? "✅" : "❌"}\n`;
        msg += `   ├ Integracja PAI: ${hasPAI ? "✅" : "❌"}\n`;
        msg += `   └ Blacklist: ${BLACKLIST.length} słów | Whitelist: ${Object.keys(WHITELIST_MAP).length} map\n`;
      } else {
        msg += `📜 **SOUL.md:** ❌ Brak\n`;
      }

      msg += `\n⚙️ **Operational Directives:** aktywne\n`;
      msg += `   ├ Delegacja (subagent): kod/arch/research → obowiązkowa\n`;
      msg += `   ├ Mind-reading: aktywny (${state.turnCounter} tur)\n`;
      msg += `   └ Output validation: ${BLACKLIST.length} słów na blackliście\n`;

      const energyComment = ENERGY_COMMENTS[Math.floor(Math.random() * ENERGY_COMMENTS.length)];
      msg += `\n⚡ **${energyComment}**\n`;
      msg += `\n⏱ **Sesja:** ${uptimeMin} min | Tury: ${state.turnCounter}\n`;
      msg += `🧠 **Mind-read detekcje:** fear(F), adhd(A), crisis(C) — logowane w konsoli\n`;

      ctx.ui.notify(msg, "info");

      ctx.ui.setWidget("budyv2-status", [
        `🕐 ${timeStr}`,
        "---",
        `📜 SOUL: ${state.soulContent ? "✅" : "❌"}`,
        `⏱ Sesja: ${uptimeMin}min (${state.turnCounter} tur)`,
        `🧠 Mind-read: ${state.turnCounter > 0 ? "aktywny" : "czeka"}`,
        `⚡ Tryb: ${state.soulContent.includes("kryzys") ? "🚨" : "😎"}`,
      ]);
    },
  });

  pi.registerCommand("audit", {
    description: "Uruchamia zewnętrznego audytora który sprawdza czy BudyV2 nie dryfuje od SOUL.md",
    handler: async (_args, ctx) => {
      ctx.ui.setStatus("budyv2-audit", "🔍 Audyt w toku...");

      const soulSections = state.soulContent.match(/^## .+/gm) || [];
      const sectionCount = soulSections.length;

      let msg = `🔍 **Audyt BudyV2 — ${new Date().toLocaleString("pl-PL")}**\n\n`;
      msg += `📜 **SOUL.md:** ${state.soulContent.length} znaków, ${sectionCount} sekcji\n`;
      msg += `   Sekcje: ${soulSections.map((s) => s.replace("## ", "")).join(", ")}\n\n`;
      msg += `⚙️ **Systemy:**\n`;
      msg += `   ├ Mind-reading: aktywny (${state.turnCounter} tur w tej sesji)\n`;
      msg += `   ├ USER profile: ${USER_TRIGGER_PATTERNS.length} trigger patterns\n`;
      msg += `   ├ Output validation: ${BLACKLIST.length} słów na blackliście\n`;
      msg += `   └ Delegacja: wymuszona dla kod/architektura/research\n\n`;
      msg += `🚨 **Zalecenia:**\n`;
      msg += `   ${state.turnCounter > 50 ? "⚠️ Długa sesja — ryzyko dryfu. Rozważ /reload." : "✅ Sesja świeża — ryzyko dryfu niskie."}\n`;
      msg += `   ${sectionCount < 8 ? "⚠️ SOUL.md ma mało sekcji — może brakować treści." : "✅ SOUL.md dobrze ustrukturyzowany."}\n\n`;
      msg += `👉 **Aby przeprowadzić pełny audyt spójności, uruchom subagenta:**\n`;

      ctx.ui.notify(msg, "info");

      ctx.ui.setWidget("budyv2-audit-result", [
        `🔍 Audyt: ${new Date().toLocaleTimeString("pl-PL")}`,
        "---",
        `📜 SOUL: ${sectionCount} sekcji`,
        `🧠 Mind-read: ${state.turnCounter} tur`,
        `🔇 Blacklist: ${BLACKLIST.length}`,
        `⚠️ Dryf: ${state.turnCounter > 50 ? "ryzyko" : "niski"}`,
      ]);

      ctx.ui.setStatus("budyv2-audit", undefined);

      try {
        ctx.sendUserMessage(
          `Przeprowadź audyt spójności Budy'ego z SOUL.md. Użyj subagent({ role: "code-reviewer", background: true }) z zadaniem: "Przejrzyj ostatnie odpowiedzi Budy'ego. Porównaj z SOUL.md. Wypunktuj momenty gdzie brzmiał jak uprzejma lalka AI, stracił asertywność ziomka z Olesna, użył korpo-słownictwa. Raport w punktach." Wynik zapisz przez memory_add z tagiem audit.`,
          { deliverAs: "followUp" }
        );
        console.log("[BudyV2] Audit subagent spawned");
      } catch (err) {
        console.error("[BudyV2] Audit spawn failed:", err);
      }
    },
  });
}