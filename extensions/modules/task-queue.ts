/**
 * Task Queue — system kolejki zadań + swarm mode.
 *
 * Budy enqueuje zadania, subagenci je wykonują.
 * Równoległy spawn dla niezależnych tasków tego samego typu.
 */

export interface Task {
  id: string;                // uuid
  agent: string;             // coder | scout | researcher | ...
  goal: string;              // co ma zrobić
  context: string;           // pliki, ścieżki, kontekst
  status: "spawned" | "completed" | "failed" | "timeout";
  priority: number;          // 1 (niski) → 5 (krytyczny)
  tier: "free" | "strong";   // model tier
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  result: string | null;     // one-line report z subagenta
  error: string | null;
  parentTaskId: string | null; // dla zależności
  type: "parallel" | "sequential" | "independent";
}

export class TaskQueue {
  private tasks: Map<string, Task> = new Map();
  private activeCounts: Map<string, number> = new Map(); // agent → ile aktywnych

  constructor(private maxParallelSubagents: number = 4) {}

  enqueue(task: Omit<Task, "id" | "createdAt" | "status" | "startedAt" | "completedAt" | "result" | "error">): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.tasks.set(id, {
      ...task,
      id,
      status: "spawned",
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    });
    console.log(`[TaskQueue] Enqueued ${id} → ${task.agent}: ${task.goal.slice(0, 60)}`);
    return id;
  }

  /** Oznacz jako zakończone */
  complete(id: string, result: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = "completed";
    task.completedAt = Date.now();
    task.result = result;
    const count = this.activeCounts.get(task.agent) || 1;
    this.activeCounts.set(task.agent, Math.max(0, count - 1));
  }

  /** Oznacz jako failed */
  fail(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = "failed";
    task.error = error;
    console.log(`[TaskQueue] ${id} FAILED: ${error}`);
    const count = this.activeCounts.get(task.agent) || 1;
    this.activeCounts.set(task.agent, Math.max(0, count - 1));
  }

  /** Czy mogę spawnić więcej tasków danego typu? */
  canSpawnMore(agent: string): boolean {
    const currentActive = this.activeCounts.get(agent) || 0;
    const maxPerAgent = Math.max(1, Math.floor(this.maxParallelSubagents / 2));
    return currentActive < maxPerAgent;
  }

  /** Czy wszystkie taski zakończone? */
  get allCompleted(): boolean {
    return Array.from(this.tasks.values()).every(t => t.status === "completed" || t.status === "failed");
  }

  /** Ściągnij wszystkie taski dla podglądu dashboardu */
  snapshot(): {
    spawned: number;
    completed: number;
    failed: number;
    timeout: number;
    latest: Task[];
  } {
    const all = Array.from(this.tasks.values());

    return {
      spawned: all.filter(t => t.status === "spawned").length,
      completed: all.filter(t => t.status === "completed").length,
      failed: all.filter(t => t.status === "failed").length,
      timeout: all.filter(t => t.status === "timeout").length,
      latest: all.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    };
  }

  /** Czyść stare zakończone taski (po 30 min) */
  cleanOld(olderThanMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;
    this.tasks.forEach((task, id) => {
      if (task.status === "completed" || task.status === "failed") {
        if (task.completedAt && (now - task.completedAt) > olderThanMs) {
          this.tasks.delete(id);
          removed++;
        }
      }
    });
    return removed;
  }

  /** Detekcja zakończonego pipeline'a — sprawdza czy code-reviewer (ostatni) dopiero skończył */
  detectCompletedPipeline(): {
    isComplete: boolean;
    tasks: { agent: string; goal: string; result: string | null }[];
  } | null {
    const now = Date.now();
    const PIPELINE_WINDOW = 10_000; // 10s — pipeline musi być zakończony w tym oknie

    const all = Array.from(this.tasks.values());
    const completed = all.filter(
      t => t.status === "completed" && t.completedAt && (now - t.completedAt) < PIPELINE_WINDOW
    );

    // Sprawdź czy code-quality-reviewer lub security-auditor (ostatnie w pipeline) właśnie skończyli
    const hasRecentReviewer = completed.some(t => t.agent === "code-quality-reviewer" || t.agent === "security-auditor" || t.agent === "tester");
    if (!hasRecentReviewer) return null;

    // Zbierz wszystkie taski z ostatnich 60s dla kontekstu
    const recent = all.filter(
      t => t.completedAt && (now - t.completedAt) < 60_000
    );

    const pipelineTasks = recent
      .filter(t => t.status === "completed")
      .map(t => ({ agent: t.agent, goal: t.goal, result: t.result }));

    return {
      isComplete: true,
      tasks: pipelineTasks,
    };
  }
}
