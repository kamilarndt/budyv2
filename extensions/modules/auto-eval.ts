/**
 * Auto-Eval — feedback loop subagentów.
 *
 * Po zakończeniu taska przez subagenta:
 * 1. Evaluator ocenia output (score 1-10)
 * 2. Jeśli score < threshold → snapshot instrukcji → modyfikacja agents/*.md
 * 3. Śledzi czy modyfikacje poprawiają wyniki
 * 4. Jeśli po modyfikacji score spada → rollback do snapshota
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Task } from "./task-queue";

// ═══════════════════════════════════════════════════════════════════════════════
// Typy
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvalRecord {
  taskId: string;
  agent: string;
  score: number;
  critique: string;    // słabe strony
  strengths: string;   // mocne strony
  suggestion: string;  // sugestia poprawy instrukcji
  decision: "PASS" | "BORDERLINE" | "FAIL";
  timestamp: number;
  instructionVersion: number; // która wersja instrukcji była użyta
}

export interface AgentEvalHistory {
  agent: string;
  scores: number[];
  instructionVersions: number;
  lastModification: number | null;
  modifications: ModificationRecord[];
}

interface ModificationRecord {
  version: number;
  previousFile: string;    // snapshot ścieżka
  suggestion: string;      // co zmieniono
  scoreBefore: number;
  scoreAfter: number | null;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Główny system
// ═══════════════════════════════════════════════════════════════════════════════

const AGENTS_DIR = "/home/ArndtOs/.pi-agents/budyv2/agents";
const VERSIONS_DIR = join(AGENTS_DIR, "versions");
const EVAL_STORE_PATH = "/home/ArndtOs/.pi-agents/budyv2/sessions/eval-history.json";

const SCORE_BORDERLINE = 6;   // score ≤ 6 → modyfikacja instrukcji
const SCORE_FAIL = 4;         // score ≤ 4 → priorytetowa modyfikacja
const MIN_EVALS_BEFORE_ROLLBACK = 3; // min ewaluacji przed rollbackiem

export class AutoEvalSystem {
  private evalHistory: Map<string, AgentEvalHistory> = new Map();
  private recentEvals: EvalRecord[] = [];

  constructor() {
    this.loadHistory();
    this.ensureVersionsDir();
  }

  private ensureVersionsDir() {
    if (!existsSync(VERSIONS_DIR)) {
      try {
        mkdirSync(VERSIONS_DIR, { recursive: true });
      } catch (e) {
        console.warn("[AutoEval] Can't create versions dir:", e);
      }
    }
  }

  private loadHistory() {
    try {
      if (existsSync(EVAL_STORE_PATH)) {
        const raw = readFileSync(EVAL_STORE_PATH, "utf-8");
        const data = JSON.parse(raw);
        this.evalHistory = new Map(Object.entries(data));
        console.log(`[AutoEval] Loaded ${this.evalHistory.size} agent histories`);
      }
    } catch (e) {
      console.warn("[AutoEval] Failed to load eval history:", e);
    }
  }

  private saveHistory() {
    try {
      const obj: Record<string, AgentEvalHistory> = {};
      this.evalHistory.forEach((v, k) => { obj[k] = v; });
      writeFileSync(EVAL_STORE_PATH, JSON.stringify(obj, null, 2), "utf-8");
    } catch (e) {
      console.warn("[AutoEval] Failed to save eval history:", e);
    }
  }

  /** Główna pętla: odbierz ewaluację i zdecyduj co robić */
  processEval(record: EvalRecord): {
    action: "none" | "modify" | "rollback" | "priority_modify";
    suggestion: string | null;
    instructionVersion: number;
  } {
    const agent = record.agent;
    this.recentEvals.push(record);

    // Inicjalizuj historię agenta
    if (!this.evalHistory.has(agent)) {
      this.evalHistory.set(agent, {
        agent,
        scores: [],
        instructionVersions: 1,
        lastModification: null,
        modifications: [],
      });
    }

    const history = this.evalHistory.get(agent)!;
    history.scores.push(record.score);

    // ═══ Zdecyduj o akcji ═══

    // FAIL → natychmiastowa modyfikacja priorytetowa
    if (record.score <= SCORE_FAIL) {
      if (record.suggestion) {
        const version = history.instructionVersions + 1;
        const result = this.applyModification(agent, record.suggestion, version, record.score);
        if (result) {
          return { action: "priority_modify", suggestion: record.suggestion, instructionVersion: version };
        }
      }
    }

    // BORDERLINE → modyfikacja z próbą
    if (record.score <= SCORE_BORDERLINE) {
      if (record.suggestion) {
        const version = history.instructionVersions + 1;
        const result = this.applyModification(agent, record.suggestion, version, record.score);
        if (result) {
          return { action: "modify", suggestion: record.suggestion, instructionVersion: version };
        }
      }
    }

    // PASS → sprawdź czy ostatnia modyfikacja była dobra
    if (record.score > SCORE_BORDERLINE && history.modifications.length > 0) {
      const lastMod = history.modifications[history.modifications.length - 1];
      if (lastMod.scoreAfter === null) {
        lastMod.scoreAfter = record.score;
        // Jeśli po modyfikacji score spadł → rollback
        if (lastMod.scoreBefore > record.score && history.scores.length >= MIN_EVALS_BEFORE_ROLLBACK) {
          console.log(`[AutoEval] Score dropped after modification (${lastMod.scoreBefore}→${record.score}) — rolling back ${agent}`);
          this.rollbackModification(agent, lastMod);
          return { action: "rollback", suggestion: null, instructionVersion: history.instructionVersions };
        }
        this.saveHistory();
      }
    }

    this.saveHistory();
    return { action: "none", suggestion: null, instructionVersion: history.instructionVersions };
  }

  /** Zastosuj zmianę instrukcji */
  private applyModification(agent: string, suggestion: string, version: number, currentScore: number): boolean {
    const filePath = join(AGENTS_DIR, `${agent}.md`);
    if (!existsSync(filePath)) {
      console.warn(`[AutoEval] Agent file not found: ${filePath}`);
      return false;
    }

    try {
      // 1. Snapshot przed zmianą
      const content = readFileSync(filePath, "utf-8");
      const snapshotPath = join(VERSIONS_DIR, `${agent}.v${version - 1}.md`);
      writeFileSync(snapshotPath, content, "utf-8");

      // 2. Aplikuj zmianę — dodaj sugestię jako przypis w frontmatterze lub na końcu
      const note = `\n\n<!-- AUTO-EVAL v${version} (${new Date().toISOString()}): ${suggestion.replace(/-->/g, "→")} -->`;
      writeFileSync(filePath, content + note, "utf-8");

      // 3. Zapisz w historii
      const history = this.evalHistory.get(agent)!;
      history.instructionVersions = version;
      history.lastModification = Date.now();
      history.modifications.push({
        version,
        previousFile: snapshotPath,
        suggestion,
        scoreBefore: currentScore,
        scoreAfter: null,
        timestamp: Date.now(),
      });

      console.log(`[AutoEval] ✅ Applied modification v${version} to ${agent}`);
      this.saveHistory();
      return true;
    } catch (e) {
      console.error(`[AutoEval] Failed to apply modification to ${agent}:`, e);
      return false;
    }
  }

  /** Rollback ostatniej modyfikacji */
  private rollbackModification(agent: string, mod: ModificationRecord): boolean {
    if (!existsSync(mod.previousFile)) {
      console.warn(`[AutoEval] Snapshot not found: ${mod.previousFile}`);
      return false;
    }

    try {
      const snapshotContent = readFileSync(mod.previousFile, "utf-8");
      const filePath = join(AGENTS_DIR, `${agent}.md`);
      writeFileSync(filePath, snapshotContent, "utf-8");
      console.log(`[AutoEval] 🔄 Rolled back ${agent} to v${mod.version - 1}`);
      return true;
    } catch (e) {
      console.error(`[AutoEval] Failed to rollback ${agent}:`, e);
      return false;
    }
  }

  /** Statystyki dla dashboardu */
  getAgentStats(agent: string): {
    avgScore: number;
    evals: number;
    modifications: number;
    lastScore: number | null;
    trend: "up" | "down" | "stable" | "new";
  } | null {
    const history = this.evalHistory.get(agent);
    if (!history || history.scores.length === 0) return null;

    const scores = history.scores;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const recent = scores.slice(-3);
    const trend = recent.length >= 2
      ? (recent[recent.length - 1] > recent[0] ? "up"
        : recent[recent.length - 1] < recent[0] ? "down"
        : "stable")
      : "new";

    return {
      avgScore: Math.round(avg * 10) / 10,
      evals: scores.length,
      modifications: history.modifications.length,
      lastScore: scores[scores.length - 1] ?? null,
      trend,
    };
  }

  /** Czy agent wymaga uwagi? */
  getAttentionList(): { agent: string; avgScore: number; issue: string }[] {
    const result: { agent: string; avgScore: number; issue: string }[] = [];

    this.evalHistory.forEach((history, agent) => {
      if (history.scores.length === 0) return;
      const avg = history.scores.reduce((a, b) => a + b, 0) / history.scores.length;
      if (avg <= SCORE_BORDERLINE) {
        result.push({ agent, avgScore: Math.round(avg * 10) / 10, issue: "niska średnia" });
      }
      const lastMod = history.modifications[history.modifications.length - 1];
      if (lastMod && lastMod.scoreAfter !== null && lastMod.scoreAfter < lastMod.scoreBefore) {
        result.push({ agent, avgScore: Math.round(avg * 10) / 10, issue: "regresja po modyfikacji" });
      }
    });

    return result;
  }
}