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
  status: "pending" | "active" | "completed" | "failed" | "timeout";
  priority: number;          // 1 (niski) → 5 (krytyczny)
  tier: "free" | "strong";   // model tier
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  result: string | null;     // one-line report z subagenta
  error: string | null;
  retryCount: number;
  maxRetries: number;
  parentTaskId: string | null; // dla zależności
  type: "parallel" | "sequential" | "independent";
}

export class TaskQueue {
  private tasks: Map<string, Task> = new Map();
  private activeCounts: Map<string, number> = new Map(); // agent → ile aktywnych

  constructor(private maxParallelSubagents: number = 4) {}

  enqueue(task: Omit<Task, "id" | "createdAt" | "status" | "retryCount" | "startedAt" | "completedAt" | "result" | "error">): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.tasks.set(id, {
      ...task,
      id,
      status: "pending",
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      retryCount: 0,
    });
    console.log(`[TaskQueue] Enqueued ${id} → ${task.agent}: ${task.goal.slice(0, 60)}`);
    return id;
  }

  /** Kolejne zadanie do odpalenia (z uwzględnieniem max parallel per agent) */
  dequeue(): Task | null {
    const sorted = Array.from(this.tasks.values())
      .filter(t => t.status === "pending")
      .sort((a, b) => b.priority - a.priority);

    for (const task of sorted) {
      const currentActive = this.activeCounts.get(task.agent) || 0;
      const maxPerAgent = Math.max(1, Math.floor(this.maxParallelSubagents / 2));

      if (currentActive < maxPerAgent) {
        task.status = "active";
        task.startedAt = Date.now();
        this.activeCounts.set(task.agent, currentActive + 1);
        return task;
      }
    }
    return null;
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
    task.retryCount++;
    task.error = error;

    if (task.retryCount >= task.maxRetries) {
      task.status = "failed";
      console.log(`[TaskQueue] ${id} FAILED after ${task.retryCount} retries: ${error}`);
    } else {
      task.status = "pending"; // retry
      console.log(`[TaskQueue] ${id} retry ${task.retryCount}/${task.maxRetries}`);
    }
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
    pending: number;
    active: number;
    completed: number;
    failed: number;
    activeByAgent: Record<string, number>;
    latest: Task[];
  } {
    const all = Array.from(this.tasks.values());
    const activeAgents: Record<string, number> = {};
    this.activeCounts.forEach((count, agent) => {
      activeAgents[agent] = count;
    });

    return {
      pending: all.filter(t => t.status === "pending").length,
      active: all.filter(t => t.status === "active").length,
      completed: all.filter(t => t.status === "completed").length,
      failed: all.filter(t => t.status === "failed").length,
      activeByAgent: activeAgents,
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
}
