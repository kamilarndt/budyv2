/**
 * Task Dashboard — TUI widok fabryki subagentów.
 *
 * Renderuje się w session_start (setup) i odświeża na każdej turze.
 * Pokazuje: aktywnych agentów, pending taski, historię.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TaskQueue } from "./task-queue";

const DASHBOARD_WIDGET_NAME = "budy-factory";
const MAX_LATEST_DISPLAY = 3;

export interface DashboardConfig {
  taskQueue: TaskQueue;
  totalTurns: () => number;
  sessionUptime: () => string;
  extraLines?: string[];
}

export function renderDashboard(ctx: any, config: DashboardConfig): void {
  const snapshot = config.taskQueue.snapshot();
  const uptime = config.sessionUptime();
  const turns = config.totalTurns();

  const lines: string[] = [];

  // ═══ Header ═══
  lines.push(`🏭 Fabryka Budy — T${turns} · ${uptime}`);
  lines.push("───");

  // ═══ Agent status bar ═══
  const agents = ["architect", "scout", "researcher", "coder", "tester", "reviewer", "worker", "mem-writer", "eval"];
  const agentLabels: Record<string, string> = {
    architect: "🏗️ ARCH",
    scout: "🔍 SCOUT",
    researcher: "📚 RSCH",
    coder: "💻 CODER",
    tester: "🧪 TEST",
    reviewer: "👁️ REVW",
    worker: "⚡ WORK",
    "mem-writer": "🧠 MEM",
    evaluator: "📊 EVAL",
    eval: "📊 EVAL",
  };

  const agentStatuses = agents.map(agent => {
    const count = snapshot.activeByAgent[agent] || 0;
    const label = agentLabels[agent] || agent.toUpperCase();
    if (count > 0) return `${label}×${count}`;
    return `${label}·`; // idle
  });

  // Podziel na dwa rzędy dla czytelności
  lines.push(agentStatuses.slice(0, 4).join(" "));
  lines.push(agentStatuses.slice(4).join(" "));
  lines.push("───");

  // ═══ Queue stats ═══
  const totals = `📥 ${snapshot.pending} 📤 ${snapshot.active} ✅ ${snapshot.completed} ❌ ${snapshot.failed}`;
  lines.push(totals);

  // ═══ Latest tasks ═══
  if (snapshot.latest.length > 0) {
    lines.push("───");
    const recent = snapshot.latest.slice(0, MAX_LATEST_DISPLAY);
    for (const task of recent) {
      const statusIcon = task.status === "completed" ? "✅"
        : task.status === "failed" ? "❌"
        : task.status === "active" ? "🔄"
        : "⏳";
      const label = agentLabels[task.agent] || task.agent.toUpperCase();
      const goal = task.goal.length > 50 ? task.goal.slice(0, 47) + "..." : task.goal;
      lines.push(`${statusIcon} ${label} ${goal}`);
    }
  }

  // ═══ Active agents detail ═══
  const activeTasks = snapshot.latest.filter(t => t.status === "active");
  if (activeTasks.length > 0) {
    lines.push("───");
    for (const task of activeTasks) {
      const elapsed = task.startedAt ? Math.round((Date.now() - task.startedAt) / 1000) : 0;
      lines.push(`▶️ ${agentLabels[task.agent] || task.agent} [${elapsed}s]`);
    }
  }

  // ═══ Extra lines (eval stats etc.) ═══
  if (config.extraLines && config.extraLines.length > 0) {
    for (const line of config.extraLines) {
      lines.push(line);
    }
  }

  ctx.ui.setWidget(DASHBOARD_WIDGET_NAME, lines);
}

/** Wersja skrócona — na początek sesji */
export function renderDashboardEmpty(ctx: any): void {
  ctx.ui.setWidget(DASHBOARD_WIDGET_NAME, [
    "🏭 Fabryka Budy",
    "───",
    "🟢 Wszystkie agenty gotowe",
    "⏳ Czekam na zadania...",
  ]);
}
