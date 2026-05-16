/**
 * Memory extension — modular entry point.
 *
 * Ładuje pamięć, rejestruje hooki i 9 custom tooli.
 * Każdy moduł to osobny plik < 300 linii.
 *
 * UWAGA: Współdzielony obiekt memState jest przekazywany przez referencję.
 * checkHealth() i hooki mutują memState.isHealthy — zmiany widoczne w toolach.
 */
import type { ExtensionAPI, ExtensionContext, TurnEndEvent } from "@mariozechner/pi-coding-agent";
import { apiRequest, deriveProjectId } from "./client";
import { createSyncState, queueFact, flushPendingFacts } from "./sync";
import { registerTools } from "./tools";
import { ok, type SearchResponse, type HealthResponse } from "./types";

const EXT_NAME = "memory-sync";

export default function (pi: ExtensionAPI) {
  // ════════════════════════════════════════════════════════════════════════════
  // Współdzielony stan — mutowany przez hooki, czytany przez tool-e
  // Przekazywany przez referencję do registerTools() — zmiany widoczne live
  // ════════════════════════════════════════════════════════════════════════════
  const memState = {
    agentId: "pi-agent",
    projectId: "unknown",
    totalFacts: 0,
    isHealthy: false,
    embedModel: "gemini-embedding-001",
  };

  let initialized = false;
  let sessionCwd = "";
  let initialContextLines: string[] = [];
  const syncState = createSyncState();

  // ── Agent ID resolution ──────────────────────────────────────────────────
  function resolveAgentId(): string {
    if (process.env.PI_AGENT_ID) return process.env.PI_AGENT_ID;
    try {
      const { existsSync } = require("node:fs") as typeof import("node:fs");
      const { join } = require("node:path") as typeof import("node:path");
      const appendPath = join(sessionCwd, "APPEND_SYSTEM.md");
      if (existsSync(appendPath)) {
        const content = require("fs").readFileSync(appendPath, "utf-8");
        const match = content.match(/agent_id:\s*(\S+)/i);
        if (match) return match[1];
      }
      const homeAgent = join(require("os").homedir(), ".pi-agents");
      const agentName = process.env.PI_CODING_AGENT_DIR?.split("/").pop() || "";
      if (agentName) {
        const agentAppend = join(homeAgent, agentName, "APPEND_SYSTEM.md");
        if (existsSync(agentAppend)) {
          const content = require("fs").readFileSync(agentAppend, "utf-8");
          const match = content.match(/agent_id:\s*(\S+)/i);
          if (match) return match[1];
        }
      }
    } catch {}
    return "pi-agent";
  }

  // ── Health check — mutuje memState ───────────────────────────────────────
  async function checkHealth(ctx: ExtensionContext): Promise<boolean> {
    const result = await apiRequest<HealthResponse>("/health");
    if (!result.ok) {
      memState.isHealthy = false;
      ctx.ui.setStatus(EXT_NAME, "🧠 offline");
      if (result.status !== 429) ctx.ui.notify(`🧠 Memory API offline: ${result.error}`, "warning");
      return false;
    }
    memState.isHealthy = true;
    memState.embedModel = result.data.checks.embedding?.model || "baai/bge-m3";
    const statsResult = await apiRequest<{ overview: { active: number } }>("/memories/stats");
    if (statsResult.ok) memState.totalFacts = statsResult.data.overview?.active ?? 0;
    const dim = result.data.checks.embedding?.dimension || 1024;
    ctx.ui.setStatus(EXT_NAME, `🧠 ${memState.totalFacts}f | ${memState.embedModel.split("/")[0] || memState.embedModel} | ${dim}d`);
    return true;
  }

  // ── Rejestracja tooli — dostają referencję do memState ───────────────────
  registerTools(pi, memState);

  // ── Session Lifecycle ────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    sessionCwd = ctx.cwd || process.cwd();
    memState.projectId = deriveProjectId(sessionCwd);
    memState.agentId = resolveAgentId();
    const healthy = await checkHealth(ctx);
    if (healthy) {
      ctx.ui.notify(`🧠 Memory: ${memState.totalFacts}f | ${memState.embedModel} | agent: ${memState.agentId} | project: ${memState.projectId}`, "info");
      await flushPendingFacts(syncState, memState.agentId, memState.projectId, memState.isHealthy);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await flushPendingFacts(syncState, memState.agentId, memState.projectId, memState.isHealthy);
  });

  // ── Context Injection ────────────────────────────────────────────────────
  pi.on("before_agent_start", async (event, ctx) => {
    if (!initialized) {
      initialized = true;
      if (!memState.isHealthy) await checkHealth(ctx);
      try {
        const initResult = await apiRequest<SearchResponse>("/pi-search", "POST", {
          query: "session context work arrangements orchestrator subagenty",
          limit: 5, min_score: 0.2, agent_id: memState.agentId,
        });
        if (initResult.ok && initResult.data?.results?.length) {
          initialContextLines = initResult.data.results.map((r) => {
            const prefix = r.pi_memory_key ? `[${r.pi_memory_key}]` : `[${r.category}]`;
            const conf = r.confidence ? ` (${(r.confidence * 100).toFixed(0)}%)` : "";
            return `${prefix} ${(r.excerpt || r.content?.slice(0, 300) || "")}${conf}`;
          });
        }
      } catch {}
    }
    if (!memState.isHealthy) return undefined;
    await flushPendingFacts(syncState, memState.agentId, memState.projectId, memState.isHealthy);
    try {
      const query = (event.prompt || "").slice(0, 200) || "session context current project";
      const result = await apiRequest<SearchResponse>("/pi-search", "POST", { query, limit: 5, min_score: 0.25, agent_id: memState.agentId });
      if (!result.ok || !result.data.results?.length) return undefined;
      const lines = result.data.results.map((m) => `${m.pi_memory_key ? `[${m.pi_memory_key}]` : `[${m.category}]`}${m.confidence ? ` (confidence: ${(m.confidence * 100).toFixed(0)}%)` : ""} ${(m.excerpt || m.content?.slice(0, 300) || "")}`);
      const lessonLines = lines.filter((l) => l.startsWith("[lesson]") || l.includes("lesson"));
      const toolLines = lines.filter((l) => l.startsWith("[tool]") || l.includes("tool"));
      const projectLines = lines.filter((l) => l.startsWith("[project]") || l.includes("project"));
      const userLines = lines.filter((l) => l.startsWith("[user]") || l.includes("[user_pref]") || l.includes("user"));
      const otherLines = lines.filter((l) => !l.startsWith("[") || (!lessonLines.includes(l) && !toolLines.includes(l) && !projectLines.includes(l) && !userLines.includes(l)));
      const blocks: string[] = [];
      if (lessonLines.length) blocks.push("### CORE_PERSONA (Lessons)\n" + lessonLines.join("\n"));
      if (toolLines.length) blocks.push("### TOOL_SPECIFICS (Tool Knowledge)\n" + toolLines.join("\n"));
      if (projectLines.length) blocks.push("### PROJECT_CONTEXT (Project State)\n" + projectLines.join("\n"));
      if (userLines.length) blocks.push("### USER_PREFERENCES (User Info)\n" + userLines.join("\n"));
      if (otherLines.length) blocks.push("### OTHER_MEMORIES\n" + otherLines.join("\n"));
      let finalResult = { systemPrompt: event.systemPrompt + "\n\n## Relevant Knowledge\n" + blocks.join("\n\n") + "\n" };
      if (initialContextLines.length > 0) {
        finalResult.systemPrompt += "\n\n## Session Context\n" + initialContextLines.slice(0, 10).join("\n") + "\n";
        initialContextLines = [];
      }
      return finalResult;
    } catch {
      return undefined;
    }
  });

  // ── Auto-Sync ────────────────────────────────────────────────────────────
  pi.on("turn_end", async (event: TurnEndEvent, ctx: ExtensionContext) => {
    if (!memState.isHealthy) return;
    const assistantMsg = event.message;
    if (!assistantMsg?.content) return;
    const text = typeof assistantMsg.content === "string" ? assistantMsg.content : Array.isArray(assistantMsg.content) ? assistantMsg.content.map((c: any) => c.text || "").join(" ") : "";
    if (text.length < 100) return;
    const decisionMarkers = ["decision", "decided", "chosen", "selected", "implemented", "changed", "fixed", "added", "refactored", "renamed", "moved", "removed", "conclusion:", "summary:", "I'll use", "let's use"];
    const lines = text.split("\n").filter((l: string) => l.trim());
    const decisionLines = lines.filter((l: string) => decisionMarkers.some((m) => l.toLowerCase().includes(m)));
    for (const line of decisionLines.slice(0, 3)) queueFact(syncState, line.replace(/^[-*]\s*/, "").slice(0, 300), `decision_${Date.now()}`, "lesson", 3);
    const toolResults = event.toolResults || [];
    for (const tr of toolResults) {
      if (tr.toolName === "edit" && tr.input) { const filePath = (tr.input as any).path || "unknown"; queueFact(syncState, `Edited: ${filePath}`, `edit_${filePath.replace(/[./]/g, "_")}`, "project", 2); }
      if (tr.toolName === "write" && tr.input) { const filePath = (tr.input as any).path || "unknown"; queueFact(syncState, `Created: ${filePath}`, `create_${filePath.replace(/[./]/g, "_")}`, "project", 2); }
    }
    await flushPendingFacts(syncState, memState.agentId, memState.projectId, memState.isHealthy);
  });

  // ── Commands ─────────────────────────────────────────────────────────────
  pi.registerCommand("memory-health", {
    description: "Check Memory API v2 health, stats, and embedding status",
    handler: async (_args, ctx) => {
      if (memState.isHealthy) {
        ctx.ui.notify(`🧠 Memory v2 OK | ${memState.totalFacts}f | model: ${memState.embedModel} | agent: ${memState.agentId} | project: ${memState.projectId}`, "info");
      } else {
        ctx.ui.notify("🧠 Memory offline — start:\n  cd /home/ArndtOs/Tools/memory-api-v2 && python main.py", "warning");
      }
    },
  });

  pi.registerCommand("memory-sync", {
    description: "Force-sync pending facts to memory immediately",
    handler: async (_args, ctx) => {
      const pending = syncState.pendingFacts.length;
      if (pending === 0) { ctx.ui.notify("🧠 No pending facts to sync.", "info"); return; }
      syncState.lastSync = 0;
      const saved = await flushPendingFacts(syncState, memState.agentId, memState.projectId, memState.isHealthy);
      ctx.ui.notify(`🧠 Synced ${saved}/${pending} fact(s)`, "success");
    },
  });

  console.log("✅ memory extension loaded (modular, 5 modules)");
}
