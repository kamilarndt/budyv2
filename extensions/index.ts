/**
 * BudyV2 Extension — modular entry point.
 *
 * Ładuje SOUL.md, rejestruje hooki i komendy z modułów.
 * Każdy moduł to osobny plik < 200 linii.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "fs";

import { SOUL_PATH, CRISIS_KEYWORDS, USER_TRIGGER_PATTERNS, SESSION_END_PHRASES } from "./modules/constants";
import { mindRead } from "./modules/mind-read";
import { sanitizeOutput, hasBlacklistedWords, isNoise } from "./modules/output-filter";
import { callMemoryAPI, saveUserFact, saveDreamNote } from "./modules/memory-api";
import { sendToHermes, pulseHeartbeat } from "./modules/bridge-hermes";
import { buildOperationalDirectives } from "./modules/directives";
import { registerCommands } from "./modules/commands";
import { TaskQueue } from "./modules/task-queue";
import { routeModel, estimateTaskComplexity } from "./modules/model-router";
import { renderDashboard, renderDashboardEmpty } from "./modules/task-dashboard";
import { AutoEvalSystem } from "./modules/auto-eval";

export default function (pi: ExtensionAPI) {
  // ════════════════════════════════════════════════════════════════════════════
  // State — wspólny stan sesji dla wszystkich modułów
  // ════════════════════════════════════════════════════════════════════════════

  const state = {
    soulContent: "",
    sessionStartTime: Date.now(),
    turnCounter: 0,
    recentDreams: [] as string[],
    lastUserMessage: "",
    recentUserMessages: [] as string[],
    pendingReflection: false,
    reflectionTriggers: [] as string[],
    taskQueue: new TaskQueue(4),
    autoEval: new AutoEvalSystem(),
  };

  // ════════════════════════════════════════════════════════════════════════════
  // Rejestracja komend
  // ════════════════════════════════════════════════════════════════════════════

  registerCommands(pi, state);

  // ════════════════════════════════════════════════════════════════════════════
  // session_start — wczytaj SOUL.md, dreaming notes, pulse
  // ════════════════════════════════════════════════════════════════════════════

  pi.on("session_start", async (_event, ctx) => {
    state.sessionStartTime = Date.now();
    state.turnCounter = 0;

    try {
      if (existsSync(SOUL_PATH)) {
        state.soulContent = readFileSync(SOUL_PATH, "utf-8").trim();
        console.log(`[BudyV2] SOUL.md loaded: ${state.soulContent.length} chars`);
      } else {
        console.warn("[BudyV2] SOUL.md not found at", SOUL_PATH);
        state.soulContent = "";
      }
    } catch (err) {
      console.error("[BudyV2] Failed to load SOUL.md:", err);
      state.soulContent = "";
    }

    ctx.ui.setStatus("budyv2", "🔥 BudyV2: ziomek");
    ctx.ui.setWidget("budyv2", [
      "⚡ BudyV2 — Level 8",
      "---",
      `📜 SOUL: ${state.soulContent ? "✅ Konstytucja" : "❌ Brak"}`,
      "🎭 Tryb: ziomek",
      `🧠 Mind-read: aktywny`,
      `👤 USER profile: ${USER_TRIGGER_PATTERNS.length} triggerów`,
      "💭 Dreaming: po sesji",
    ]);
    renderDashboardEmpty(ctx);

    try {
      const searchRes = await callMemoryAPI("/search", "POST", {
        query: "dreaming BudyV2",
        limit: 3,
        min_score: 0.3,
        cross_agent: false,
      });
      if (searchRes?.results?.length > 0) {
        state.recentDreams = searchRes.results.map((r: any) => r.content);
        console.log(`[BudyV2] Loaded ${state.recentDreams.length} dreaming notes`);
      }
    } catch (err) {
      console.warn("[BudyV2] Failed to load dreaming notes:", err);
    }

    pulseHeartbeat("session_start", {
      turns: state.turnCounter,
      soul_loaded: !!state.soulContent,
      dreams_loaded: state.recentDreams.length,
    });

    console.log("[BudyV2] v2 loaded — SOUL:", !!state.soulContent, "Dreams:", state.recentDreams.length);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // turn_start — inter-message mind-reading (ADHD chaos detection)
  // ════════════════════════════════════════════════════════════════════════════

  pi.on("turn_start", async (_event, ctx) => {
    try {
      const entries = ctx.sessionManager.getEntries();
      const userMessages = entries
        .filter((e: any) => e.type === "message" && e.message?.role === "user")
        .map((e: any) => e.message.content?.toString() || "")
        .filter(Boolean)
        .slice(-5);

      if (userMessages.length >= 3) {
        const allShort = userMessages.every((m: string) => m.length < 80);
        const topics = userMessages.map((m: string) => {
          const words = m.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
          return words.slice(0, 3).join(" ");
        });
        const uniqueTopics = new Set(topics).size;
        const topicChaos = uniqueTopics === userMessages.length;

        if (allShort && topicChaos && userMessages.length >= 3) {
          console.log(`[BudyV2] Inter-message ADHD chaos: ${userMessages.length} msgs, ${uniqueTopics} topics`);
          state.recentUserMessages = userMessages;
          sendToHermes("mindread_adhd_chaos", {
            messages: userMessages,
            topics: Array.from(topics),
          });
        }
      }
    } catch (err) {
      console.warn("[BudyV2] turn_start mind-read error:", err);
    }

    // Update factory dashboard on every turn
    try {
      const agents = ["architect", "scout", "researcher", "coder", "tester", "code-reviewer", "worker", "memory-writer", "evaluator"];
      const evalStats: string[] = [];
      for (const agent of agents) {
        const stats = state.autoEval.getAgentStats(agent);
        if (stats && stats.evals > 0) {
          const trendIcon = stats.trend === "up" ? "📈" : stats.trend === "down" ? "📉" : "➡️";
          evalStats.push(`${agent.slice(0, 4)}:${stats.avgScore}${trendIcon}`);
        }
      }

      const attention = state.autoEval.getAttentionList();
      if (attention.length > 0) {
        console.log(`[AutoEval] ⚠️ Attention: ${attention.map(a => `${a.agent}(${a.avgScore})`).join(", ")}`);
      }

      renderDashboard(ctx, {
        taskQueue: state.taskQueue,
        totalTurns: () => state.turnCounter,
        sessionUptime: () => {
          const ms = Date.now() - state.sessionStartTime;
          const min = Math.floor(ms / 60000);
          return `${min}m`;
        },
        extraLines: evalStats.length > 0
          ? ["───", "📊 Eval: " + evalStats.join(" | ")]
          : [],
      });
    } catch (err) {
      console.warn("[BudyV2] Dashboard render error:", err);
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // before_agent_start — wstrzyknij SOUL.md + directives + dreaming
  // ════════════════════════════════════════════════════════════════════════════

  pi.on("before_agent_start", async (event) => {
    const userPrompt = (event.prompt || "").toLowerCase();
    const isCrisis = CRISIS_KEYWORDS.some((kw) => userPrompt.includes(kw));

    let block = "";

    if (state.soulContent) {
      block += `\n\n═══════════════════════════════════════════════════════`;
      block += `\n🧠 BUDYV2 — KONSTYTUCJA (SOUL.md)`;
      block += `\n═══════════════════════════════════════════════════════\n\n`;
      block += state.soulContent;
    } else {
      block += `\n\n[!] SOUL.md nie załadowany — działasz na domyślnych zasadach.\n`;
    }

    block += buildOperationalDirectives();

    if (isCrisis) {
      block += `\n🚨🚨🚨 TRYB KRYZYSOWY AKTYWOWANY 🚨🚨🚨\n`;
      block += `Kamil zgłosił kryzys/pożar/problem. Od teraz:\n`;
      block += `- Zero żartów, zero sarkazmu, zero zbędnych tekstów\n`;
      block += `- Komunikaty 100% wojskowe — w punktach, konkretnie, bez lania wody\n`;
      block += `- Oczekuj tylko raportu z wykonania\n`;
      block += `- Priorytet: rozwiązać problem natychmiast\n`;
      block += `🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n`;
    }

    if (state.recentDreams.length > 0) {
      block += `\n📓 DREAMING NOTES Z POPRZEDNIEJ SESJI:\n`;
      block += state.recentDreams.map((d, i) => `[${i + 1}] ${d}`).join("\n");
      block += `\n——— Przeanalizuj je i wyciągnij wnioski, ale nie pozwól im zdominować rozmowy.\n`;
    }

    // Subagent deployment contract
    block += `\n📋 SYSTEM SUBAGENTÓW — ZASADY DELEGACJI:\n`;
    block += `- NIE używaj write/edit/terminal/bash/execute_code/patch — to są ZABRONIONE dla Budy\n`;
    block += `- Każde zadanie kodowania → subagent('coder', { task: '...' })\n`;
    block += `- Każde zadanie researchu → subagent('researcher', { task: '...' })\n`;
    block += `- Każde zadanie przeczytania kodu → subagent('scout', { task: '...' })\n`;
    block += `- Przed kodowaniem → subagent('architect', { task: '...' }) → ISA → subagent('coder')\n`;
    block += `- Po kodzie → subagent('tester', { task: '...' }) → subagent('code-reviewer', { task: '...' })\n`;
    block += `- Automatyzacja/deploy → subagent('worker', { task: '...' })\n`;
    block += `- Zapis do pamięci → subagent('memory-writer', { task: '...' })\n`;
    block += `- Nie czekaj na wynik — subagent działa w tle, czytaj wyniki z plików\n`;
    block += `- Równoległość: niezależne taski tego samego typu startuj równolegle\n`;
    block += `- Szczegóły w AGENTS.md\n`;

    // Auto-Eval instructions
    block += `\n📊 AUTO-EVAL SYSTEM — FEEDBACK LOOP:\n`;
    block += `- Po przeczytaniu outputu subagenta → zleć ewaluację: subagent('evaluator', { task: 'oceń output subagenta [nazwa]', context: { goal: '...', output: '[treść outputu]' } })\n`;
    block += `- Evaluator zwróci score 1-10 + sugestie poprawy instrukcji\n`;
    block += `- Jeśli score ≤ 6 → system automatycznie zmodyfikuje instrukcje agents/*.md\n`;
    block += `- Jeśli score spada po modyfikacji → system zrobi rollback\n`;
    block += `- Sprawdzaj ewaluacje w dashboardzie: 📊 Eval: coder:7.2📈 | scout:8.0➡️\n`;
    block += `- NIE oceniaj wszystkiego — tylko taski produkcyjne, architektoniczne, ryzykowne\n`;
    block += `- Pomijaj eval dla prostych tasków (read, search, simple queries)\n`;
    block += `\n═══════════════════════════════════════════════════════\n`;

    return { systemPrompt: event.systemPrompt + block };
  });

  // ════════════════════════════════════════════════════════════════════════════
  // input — mind-reading + USER profile building + inter-message chaos
  // ════════════════════════════════════════════════════════════════════════════

  pi.on("input", (event) => {
    if (!event.text) return { action: "continue" };

    state.turnCounter++;
    state.lastUserMessage = event.text;

    // Detekcja końca sesji
    const isEnding = SESSION_END_PHRASES.some((p) => p.test(event.text));
    const isLastCall = state.turnCounter > 5 && isEnding;
    if (isLastCall && !state.pendingReflection) {
      state.pendingReflection = true;
      state.reflectionTriggers = USER_TRIGGER_PATTERNS
        .filter((tp) => tp.pattern.test(event.text))
        .map((tp) => `${tp.tag} (${tp.interpretation || tp.tag})`);
      console.log("[BudyV2] Session end detected — pending reflection");
    }

    // Mind-reading (intra-message)
    const read = mindRead(event.text, state.turnCounter);

    // USER profile building (fire-and-forget)
    for (const tp of USER_TRIGGER_PATTERNS) {
      if (tp.pattern.test(event.text)) {
        const match = event.text.match(tp.pattern)?.[0] || "";
        const fact = `[${tp.tag}] Kamil użył "${match.trim()}" — interpretacja: "${tp.interpretation || tp.tag}". Kontekst: "${event.text.slice(0, 200)}"`;
        saveUserFact(fact, tp.tag, 3);
      }
    }

    if (read.action === "transform" && read.text) {
      console.log(`[BudyV2] Mind-read: ${read.reason} — transforming input`);
      return { action: "transform", text: read.text, images: event.images };
    }

    // Inter-message chaos detection
    if (state.recentUserMessages.length >= 3 && read.action === "continue") {
      const allShort = state.recentUserMessages.every((m: string) => m.length < 80);
      const topics = state.recentUserMessages.map((m: string) => {
        const words = m.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        return words.slice(0, 3).join(" ");
      });
      const uniqueCount = new Set(topics).size;
      if (allShort && uniqueCount === state.recentUserMessages.length) {
        console.log(`[BudyV2] Inter-message ADHD chaos confirmed — ${state.recentUserMessages.length} msgs, ${uniqueCount} topics`);
        state.recentUserMessages = [];
        return {
          action: "transform",
          text: `${event.text}\n\n[UKRYTA INSTRUKCJA: Kamilowi przeskoczyła płyta (ADHD) — ostatnie wiadomości skakały między tematami. Wybierz jedno najważniejsze zadanie i każ mu zaparkować resztę przez park(). Bądź stanowczy. Użyj formatu: "Stary, wybieramy jedno: X. Resztę parkujemy."].`,
          images: event.images,
        };
      }
    }

    return { action: "continue" };
  });

  // ════════════════════════════════════════════════════════════════════════════
  // message_end — output validation (blacklist → whitelist)
  // ════════════════════════════════════════════════════════════════════════════

  pi.on("message_end", (event) => {
    const msg = event.message;
    if (!msg || !msg.content) return {};

    let content: string;
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content.map((c: any) => c.text || c.content || "").join("\n");
    } else if (msg.content && typeof msg.content === "object") {
      content = JSON.stringify(msg.content);
    } else {
      return {};
    }

    if (hasBlacklistedWords(content)) {
      const sanitized = sanitizeOutput(content);
      if (sanitized !== content) {
        console.warn("[BudyV2] Output validation: blacklist detected and sanitized");
        return { message: { ...msg, content: sanitized } };
      }
    }

    // Sentinel: if response is noise and user didn't ask a question — suppress
    const lastUserMsg = state.lastUserMessage || "";
    const userAskedQuestion = lastUserMsg.includes("?") || lastUserMsg.includes("czy") || lastUserMsg.includes("jak");
    if (isNoise(content) && !userAskedQuestion) {
      console.log(`[BudyV2] Sentinel suppressed noise response: "${content.slice(0, 40)}"`);
      return { message: { ...msg, content: "" } };
    }

    return {};
  });

  // ════════════════════════════════════════════════════════════════════════════
  // tool_call — Hermes bridge + tool restriction (Budy nie ma tooli wykonawczych)
  // ════════════════════════════════════════════════════════════════════════════

  const FORBIDDEN_TOOLS = new Set([
    "write", "edit", "terminal", "bash", "execute_code", "patch",
    "write_file",
  ]);

  pi.on("tool_call", (event) => {
    // Block forbidden tools — Budy tylko deleguje
    if (FORBIDDEN_TOOLS.has(event.toolName)) {
      console.warn(`[BudyV2] BLOCKED: Budy próbował użyć ${event.toolName} — to narusza kontrakt`);
      return {
        abort: true,
        error: `❌ Budy nie ma dostępu do narzędzia "${event.toolName}". Zgodnie z AGENTS.md, Budy jest tylko orkiestratorem. Użyj subagent() do delegacji tego zadania.`,
      };
    }

    if (event.toolName === "subagent") {
      const input = event.input || {};
      const role = (input as any).role || "unknown";
      const goal = (input as any).task || "";
      const agentType = role as string;

      // Track in task queue
      const routing = routeModel({
        agentType,
        taskComplexity: estimateTaskComplexity(goal),
        priority: agentType === "evaluator" ? 4 : 2,
        retryCount: 0,
        isProduction: goal.toLowerCase().includes("deploy") || goal.toLowerCase().includes("production"),
        filesToAnalyze: 0,
        explicitRequest: "auto",
      });

      const taskId = state.taskQueue.enqueue({
        agent: agentType,
        goal: goal.slice(0, 200),
        context: JSON.stringify(input || {}).slice(0, 500),
        priority: agentType === "evaluator" ? 4 : 2,
        tier: routing.tier,
        maxRetries: 2,
        parentTaskId: null,
        type: "independent",
      });

      console.log(`[BudyV2] Subagent ${agentType} → tier:${routing.tier} (${routing.reason}) task:${taskId}`);

      sendToHermes("subagent_delegation", {
        toolCallId: event.toolCallId,
        role: agentType,
        task: goal.slice(0, 200),
        background: (input as any).background || false,
        tier: routing.tier,
        taskId,
      });
    }

    // Auto-process eval results when Budy reads eval-report.md
    if (event.toolName === "read" || event.toolName === "search_files") {
      const inputStr = JSON.stringify(event.input || {}).toLowerCase();
      if (inputStr.includes("eval-report")) {
        console.log("[AutoEval] Budy czyta eval-report — gotowy do przetworzenia");
      }
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // turn_end — dialog reflection
  // ════════════════════════════════════════════════════════════════════════════

  pi.on("turn_end", async (_event, ctx) => {
    if (!state.pendingReflection || state.turnCounter < 5) return;

    state.pendingReflection = false;

    const triggerSummary = state.reflectionTriggers.length > 0
      ? state.reflectionTriggers.join(", ")
      : "brak konkretnych triggerów";

    const reflectionMsg = `[REFLECTION AUTOMATYCZNY]\n\n` +
      `Kamil, zamykamy. Tu Budy.\n\n` +
      `Podsumowanie tej sesji (${state.turnCounter} tur):\n` +
      `- Zauważyłem wzorce: ${triggerSummary}\n` +
      `- Mind-read analiz: ${state.turnCounter}\n` +
      `- ${state.turnCounter > 15 ? "Długa sesja — ryzyko dryfu, przydałby się /reload." : "Sesja w normie."}\n\n` +
      `Chcesz żebym to otagował w Twoim profilu i zaparkował do jutra? Czy lecimy jeszcze z czymś konkretnym?`;

    try {
      await ctx.sendUserMessage(reflectionMsg, { deliverAs: "followUp" });
      console.log("[BudyV2] Reflection sent to user");
    } catch (err) {
      console.error("[BudyV2] Reflection send failed:", err);
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // session_shutdown — dreaming (zapis do memory)
  // ════════════════════════════════════════════════════════════════════════════

  pi.on("session_shutdown", async (_event) => {
    if (state.turnCounter < 3) {
      console.log(`[BudyV2] Dreaming: skipped — ${state.turnCounter} turns < 3`);
      return;
    }

    const uptimeMin = Math.round((Date.now() - state.sessionStartTime) / 60000);
    console.log(`[BudyV2] Dreaming: session ${state.turnCounter} turns, ${uptimeMin}min`);

    const note = `[Dreaming] Sesja: ${state.turnCounter} tur, ${uptimeMin} min.\n` +
      `Trigger patterny: ${USER_TRIGGER_PATTERNS.length} aktywnych.\n` +
      `Zapisano dla kontekstu przy następnej sesji.`;
    await saveDreamNote(note, 5);

    await saveUserFact(
      `Statystyki sesji: ${state.turnCounter} tur, ${uptimeMin} min, mind-read aktywny`,
      "dreaming,session-stats",
      2,
    );

    pulseHeartbeat("session_end", {
      turns: state.turnCounter,
      duration_min: uptimeMin,
    });

    console.log("[BudyV2] Dreaming: note saved — ready for next session");
  });

  console.log("✅ BudyV2 v2 — personality extension loaded (modular, 8 modules)");
}