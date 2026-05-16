/**
 * Model Router — decyduje free vs strong model per task.
 *
 * Logika:
 * - architect → zawsze strong (planowanie architektury)
 * - memory-writer → zawsze free (banał)
 * - Pozostali → free domyślnie, strong gdy:
 *   - Task już failował (retry > 0)
 *   - Task produkcyjny (deploy, security, production code)
 *   - Task wymaga analizy >5 plików
 *   - Task z priorytetem >= 4
 *   - Eksplicytne żądanie od Budy
 */

const ALWAYS_STRONG = new Set(["architect"]);
const ALWAYS_FREE = new Set(["memory-writer"]);
const STRONG_MODEL = "deepseek-v4-flash";
const FREE_MODEL = "openrouter:openrouter/free";

export interface RoutingInput {
  agentType: string;         // coder | scout | researcher | ...
  taskComplexity: number;    // 1-10 (ocena Budy)
  priority: number;          // 1-5
  retryCount: number;        // 0+ (ile razy task failował)
  isProduction: boolean;     // deploy, security, prod code
  filesToAnalyze: number;    // liczba plików do analizy
  explicitRequest: "free" | "strong" | "auto";
}

export interface RoutingResult {
  tier: "free" | "strong";
  model: string;
  reason: string;
}

export function routeModel(input: RoutingInput): RoutingResult {
  // Hard rules — nie do negocjowania
  if (ALWAYS_STRONG.has(input.agentType)) {
    return { tier: "strong", model: STRONG_MODEL, reason: "architect — zawsze strong" };
  }
  if (ALWAYS_FREE.has(input.agentType)) {
    return { tier: "free", model: FREE_MODEL, reason: "memory-writer — zawsze free" };
  }

  // Explicit override od Budy
  if (input.explicitRequest === "strong") {
    return { tier: "strong", model: STRONG_MODEL, reason: "explicit — Budy zażądał strong" };
  }
  if (input.explicitRequest === "free") {
    return { tier: "free", model: FREE_MODEL, reason: "explicit — Budy zażądał free" };
  }

  // Retry logic — jeśli failował na free, próbuj strong
  if (input.retryCount > 0) {
    return { tier: "strong", model: STRONG_MODEL, reason: `retry ${input.retryCount} — przestawiam na strong` };
  }

  // Production code
  if (input.isProduction) {
    return { tier: "strong", model: STRONG_MODEL, reason: "production code — bezpieczeństwo" };
  }

  // Złożoność taska
  if (input.taskComplexity >= 7) {
    return { tier: "strong", model: STRONG_MODEL, reason: `complexity ${input.taskComplexity} >= 7` };
  }

  // Dużo plików
  if (input.filesToAnalyze >= 5) {
    return { tier: "strong", model: STRONG_MODEL, reason: `${input.filesToAnalyze} files — strong` };
  }

  // Priorytet krytyczny
  if (input.priority >= 4) {
    return { tier: "strong", model: STRONG_MODEL, reason: `priority ${input.priority} — strong` };
  }

  // Domyślnie — free
  return { tier: "free", model: FREE_MODEL, reason: "domyślny tier — free" };
}

/** Helper: ocena złożoności taska na podstawie goal stringa */
export function estimateTaskComplexity(goal: string, contextLength: number = 0): number {
  let score = 3; // baseline

  const strongIndicators = [
    "deploy", "security", "auth", "database", "migration", "production",
    "scale", "scalability", "performance", "optimize", "refactor",
    "integration", "api", "webhook", "websocket", "streaming",
    "encryption", "validation", "error handling", "recovery",
  ];
  const weakIndicators = [
    "read", "find", "search", "lookup", "simple", "basic",
    "cosmetic", "rename", "reorder", "format", "prettify",
  ];

  const lower = goal.toLowerCase();

  for (const ind of strongIndicators) {
    if (lower.includes(ind)) score += 2;
  }
  for (const ind of weakIndicators) {
    if (lower.includes(ind)) score -= 1;
  }

  // Duży kontekst = większa złożoność
  if (contextLength > 5000) score += 2;
  if (contextLength > 2000) score += 1;

  // Długi goal = bardziej złożony
  if (goal.length > 300) score += 2;
  if (goal.length > 150) score += 1;

  return Math.max(1, Math.min(10, score));
}
