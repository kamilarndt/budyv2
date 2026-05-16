/** Custom tools — 9 tooli do zarządzania pamięcią. */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { apiRequest } from "./client";
import { ok, err, type MemoryRecord, type SearchResponse, type ListResponse, type StatsResponse, type HealthResponse } from "./types";

type ToolResult = AgentToolResult<unknown>;

interface MemState {
  agentId: string;
  projectId: string;
  totalFacts: number;
  isHealthy: boolean;
  embedModel: string;
}

export function registerTools(pi: ExtensionAPI, state: MemState): void {
  // ── memory_add ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_add", label: "Memory: Add Fact",
    description: "Store a fact, preference, lesson, or project pattern in persistent memory via Memory API v2. Auto-sets agent_id and project_id from current session context. Use dotted keys: 'pref.editor', 'project.rosie.lang', 'lesson.mistake'. Supports importance (0-10).",
    promptSnippet: "Add facts, preferences, and project patterns to persistent memory",
    promptGuidelines: ["Use memory_add to store important decisions, user preferences, and project patterns for cross-session recall.", "Use memory_add with memory_type 'lesson' when the user corrects you.", "Set importance=5+ for critical facts."],
    parameters: Type.Object({
      content: Type.String({ description: "Fact content (what to remember)", minLength: 5, maxLength: 10000 }),
      memory_type: Type.Optional(Type.String({ description: "Type: 'pref', 'project', 'tool', 'user', 'lesson', 'general'" })),
      key: Type.Optional(Type.String({ description: "Structured key (e.g., 'commit_style'). Creates 'type.key'.", maxLength: 100 })),
      tags: Type.Optional(Type.String({ description: "Comma-separated tags for filtering", maxLength: 500 })),
      importance: Type.Optional(Type.Number({ description: "Importance 0-10. Default: 0", minimum: 0, maximum: 10 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      if (!state.isHealthy) return ok("Memory API offline. Start: cd memory-api-v2 && venv/bin/python main.py");
      const memoryType = (params.memory_type as string) || "general";
      const content = String(params.content);
      const keyName = (params.key as string) || content.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      const fullKey = `${memoryType}.${keyName}`;
      const result = await apiRequest<{ status: string; id: string; pi_memory_key?: string }>("/pi-remember", "POST", { content, agent_id: state.agentId, project_id: state.projectId, key: fullKey, importance: (params.importance as number) ?? 0 }, signal as AbortSignal);
      if (!result.ok) return err(`Failed: ${result.error}`);
      state.totalFacts++;
      ctx.ui.setStatus("memory-sync", `🧠 ${state.totalFacts}f`);
      const storedKey = result.data.pi_memory_key || fullKey;
      if (result.data.status === "duplicate") return ok(`⚠️ Duplicate (stored as ${storedKey})`, { id: result.data.id, status: "duplicate" });
      return ok(`✅ Stored: ${storedKey}\n   ${content.slice(0, 200)}`, { id: result.data.id, key: storedKey, status: "added" });
    },
  });

  // ── memory_search ─────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_search", label: "Memory: Semantic Search",
    description: "Search persistent memory semantically via pgvector. Results include confidence score, excerpt, and metadata. Use filters to narrow by type, category, or minimum confidence.",
    promptSnippet: "Search persistent memory for facts, preferences, and patterns",
    promptGuidelines: ["Use memory_search to recall stored info from previous sessions.", "Use min_score=0.5 for precise matches, 0.2 for broader recall."],
    parameters: Type.Object({
      query: Type.String({ description: "Search query in natural language", minLength: 2 }),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 10, max: 100)", default: 10, minimum: 1, maximum: 100 })),
      memory_type: Type.Optional(Type.String({ description: "Filter by type: 'pref', 'project', 'tool', 'user', 'lesson', or all" })),
      category: Type.Optional(Type.String({ description: "Filter by category (e.g., 'user_pref', 'decision')" })),
      min_score: Type.Optional(Type.Number({ description: "Min confidence 0.0-1.0 (default: 0.3)", default: 0.3, minimum: 0.0, maximum: 1.0 })),
      cross_agent: Type.Optional(Type.Boolean({ description: "Include all agents (default: true). Set false for only your agent.", default: true })),
    }),
    async execute(_id, params, signal, _update, _ctx) {
      if (!state.isHealthy) return ok("Memory API offline");
      const result = await apiRequest<SearchResponse>("/pi-search", "POST", { query: String(params.query), limit: (params.limit as number) || 10, memory_type: (params.memory_type as string) || undefined, category: (params.category as string) || undefined, min_score: (params.min_score as number) ?? 0.3, agent_id: (params.cross_agent as boolean) === false ? state.agentId : undefined }, signal as AbortSignal);
      if (!result.ok) return err(`Search failed: ${result.error}`);
      const { results, count } = result.data;
      if (count === 0) return ok("No matching memories found.");
      const formatted = results.map((r, i) => {
        const tag = r.pi_memory_key ? `[${r.pi_memory_key}]` : `[${r.category}]`;
        return `${i + 1}. ${tag} ${(r.content || r.excerpt || "").slice(0, 250)}...\n   confidence: ${(r.confidence * 100).toFixed(0)}%${r.importance && r.importance > 0 ? ` | importance: ${r.importance}` : ""}${r.agent_id !== state.agentId ? ` | agent: ${r.agent_id}` : ""} | ${r.created_at.slice(0, 10)}`;
      }).join("\n\n");
      return ok(`🧠 Showing ${count} results\n\n${formatted}`, { results, count });
    },
  });

  // ── memory_list ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_list", label: "Memory: List Facts",
    description: "List stored facts with filters and pagination. Newest first. Use memory_search for semantic search.",
    promptSnippet: "Browse stored facts from persistent memory",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max results (default: 20, max: 200)", default: 20, minimum: 1, maximum: 200 })),
      offset: Type.Optional(Type.Number({ description: "Pagination offset", default: 0, minimum: 0 })),
      category: Type.Optional(Type.String({ description: "Filter by category: 'user_pref', 'project', 'tool', 'user', 'lesson', 'decision'" })),
      memory_type: Type.Optional(Type.String({ description: "Filter by pi-memory type: 'pref', 'project', 'tool', 'user', 'lesson'" })),
      sort_by: Type.Optional(Type.String({ description: "Sort: 'created_at' (default), 'importance', 'category', 'updated_at'" })),
    }),
    async execute(_id, params, signal, _update, _ctx) {
      if (!state.isHealthy) return ok("Memory API offline");
      const categoryMap: Record<string, string> = { pref: "user_pref", project: "project", tool: "tool", user: "user", lesson: "lesson", general: "general" };
      const category = (params.memory_type as string) ? categoryMap[params.memory_type as string] || (params.memory_type as string) : (params.category as string) || undefined;
      const limit = Math.min((params.limit as number) || 20, 200);
      const offset = (params.offset as number) || 0;
      const qs = new URLSearchParams({ limit: String(limit), offset: String(offset), agent_id: state.agentId });
      if (category) qs.set("category", category);
      if (params.sort_by) qs.set("sort_by", String(params.sort_by));
      const result = await apiRequest<ListResponse>(`/memories?${qs.toString()}`, "GET", undefined, signal as AbortSignal);
      if (!result.ok) return err(`Failed: ${result.error}`);
      const { memories, count } = result.data;
      if (count === 0) return ok(`No memories found${category ? ` in '${category}'` : ""}. Use memory_add to store.`);
      const text = memories.map((r, i) => `${i + 1 + offset}.${r.pi_memory_key ? ` [${r.pi_memory_key}]` : ` [${r.category}]`}${r.importance && r.importance > 0 ? ` (imp: ${r.importance})` : ""} ${(r.content || "").slice(0, 180)}...\n   Created: ${r.created_at.slice(0, 10)}`).join("\n\n");
      return ok(`🧠 ${count} facts (offset ${offset})\n\n${text}`, { results: memories, count });
    },
  });

  // ── memory_stats ──────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_stats", label: "Memory: Statistics",
    description: "Show persistent memory statistics: facts, agents, categories, embedding info.",
    promptSnippet: "Show memory usage statistics",
    parameters: Type.Object({}),
    async execute(_id, _params, signal, _update, _ctx) {
      if (!state.isHealthy) return ok("Memory API offline");
      const [statsResult, healthResult] = await Promise.all([
        apiRequest<StatsResponse>("/memories/stats", "GET", undefined, signal as AbortSignal),
        apiRequest<HealthResponse>("/health", "GET", undefined, signal as AbortSignal),
      ]);
      if (!statsResult.ok) return err(`Failed: ${statsResult.error}`);
      const s = statsResult.data;
      const h = healthResult.ok ? healthResult.data : null;
      const lines = ["🧠  Memory Statistics", "━".repeat(42)];
      if (h) {
        const embed = h.checks.embedding;
        const cb = h.checks.circuit_breaker;
        lines.push(`Status: ${h.status === "ok" ? "✅ OK" : "⚠️ Degraded"}`, `Provider: ${embed.provider} | Model: ${embed.model}`, `Dimension: ${embed.dimension} | CB: ${cb.state} (${cb.failures} failures)`, "");
      }
      const o = s.overview;
      lines.push(`Total: ${o.total} | Active: ${o.active} | Archived: ${o.archived}`, `Avg trust: ${o.avg_trust ?? "?"} | Avg importance: ${o.avg_importance ?? "?"}`, `Agents: ${o.agents} | Projects: ${o.projects}`);
      if (Object.keys(s.by_agent).length > 0) { lines.push("", "By Agent:"); for (const [a, c] of Object.entries(s.by_agent)) lines.push(`  ${a}: ${c}`); }
      if (Object.keys(s.by_project).length > 0) { lines.push("", "By Project:"); for (const [p, c] of Object.entries(s.by_project)) lines.push(`  ${p}: ${c}`); }
      if (Object.keys(s.by_category).length > 0) { lines.push("", "By Category:"); for (const [c, cnt] of Object.entries(s.by_category)) lines.push(`  ${c}: ${cnt}`); }
      return ok(lines.join("\n"), { overview: o, byAgent: s.by_agent, byCategory: s.by_category });
    },
  });

  // ── memory_forget ─────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_forget", label: "Memory: Forget",
    description: "Archive (soft-delete) a fact from persistent memory by ID. Use memory_list first to find the ID.",
    promptSnippet: "Archive/forget a fact from persistent memory",
    promptGuidelines: ["Use memory_forget to clean up outdated or incorrect memories.", "First use memory_list or memory_search to find the memory ID."],
    parameters: Type.Object({ id: Type.String({ description: "Memory ID to forget", minLength: 1 }) }),
    async execute(_id, params, signal, _update, ctx) {
      if (!state.isHealthy) return ok("Memory API offline");
      const memoryId = String(params.id).trim();
      if (!memoryId) return err("Provide a memory id");
      const result = await apiRequest<{ status: string; memory_id: string }>(`/memories/${memoryId}`, "DELETE", undefined, signal as AbortSignal);
      if (!result.ok) return result.status === 404 ? err(`Memory not found: ${memoryId}`) : err(`Forget failed: ${result.error}`);
      state.totalFacts = Math.max(0, state.totalFacts - 1);
      ctx.ui.setStatus("memory-sync", `🧠 ${state.totalFacts}f`);
      return ok(`🗑️ Forgotten: ${memoryId}`, { memory_id: memoryId, status: "archived" });
    },
  });

  // ── memory_related ────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_related", label: "Memory: Related Facts",
    description: "Find facts related to a specific memory by ID. Uses entity overlap first, then semantic similarity.",
    promptSnippet: "Find facts related to a specific memory",
    parameters: Type.Object({
      id: Type.String({ description: "Memory ID to find related facts for", minLength: 1 }),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 10, max: 50)", default: 10, minimum: 1, maximum: 50 })),
    }),
    async execute(_id, params, signal, _update, _ctx) {
      if (!state.isHealthy) return ok("Memory API offline");
      const memoryId = String(params.id).trim();
      const limit = (params.limit as number) || 10;
      const result = await apiRequest<{ results: MemoryRecord[]; count: number }>(`/memories/${memoryId}/related?limit=${limit}`, "GET", undefined, signal as AbortSignal);
      if (!result.ok) return result.status === 404 ? err(`Memory not found: ${memoryId}`) : err(`Failed: ${result.error}`);
      const { results, count } = result.data;
      if (count === 0) return ok("No related memories found.");
      const formatted = results.map((r, i) => `${i + 1}. ${r.pi_memory_key ? `[${r.pi_memory_key}]` : `[${r.category}]`}${r.agent_id !== state.agentId ? ` (agent: ${r.agent_id})` : ""} ${(r.content || "").slice(0, 200)}...${r.trust_score ? ` | trust: ${(r.trust_score * 100).toFixed(0)}%` : ""}`).join("\n\n");
      return ok(`🧠 ${count} related facts\n\n${formatted}`, { results, count });
    },
  });

  // ── memory_feedback ───────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_feedback", label: "Memory: Feedback",
    description: "Record feedback on a memory to update its trust score. Use 'helpful' / 'not_helpful' / 'incorrect' / 'outdated'.",
    promptSnippet: "Rate a memory (helpful/not_helpful/incorrect/outdated)",
    promptGuidelines: ["Use memory_feedback to improve memory quality.", "Use 'incorrect' when you see wrong information."],
    parameters: Type.Object({
      id: Type.String({ description: "Memory ID to give feedback on", minLength: 1 }),
      feedback_type: Type.String({ description: "Type: 'helpful', 'not_helpful', 'incorrect', 'outdated'" }),
      comment: Type.Optional(Type.String({ description: "Optional comment", maxLength: 500 })),
    }),
    async execute(_id, params, signal, _update, _ctx) {
      if (!state.isHealthy) return ok("Memory API offline");
      const allowed = ["helpful", "not_helpful", "incorrect", "outdated"];
      const feedbackType = String(params.feedback_type).toLowerCase();
      if (!allowed.includes(feedbackType)) return err(`Invalid feedback_type. Must be: ${allowed.join(", ")}`);
      const result = await apiRequest<{ status: string; trust_score?: number }>(`/memories/${String(params.id)}/feedback`, "POST", { agent_id: state.agentId, feedback_type: feedbackType, comment: (params.comment as string) || "" }, signal as AbortSignal);
      if (!result.ok) return result.status === 404 ? err(`Memory not found: ${String(params.id)}`) : err(`Feedback failed: ${result.error}`);
      const ts = result.data.trust_score;
      return ok(`✅ Feedback recorded: ${feedbackType}${ts !== undefined ? ` (new trust: ${(ts * 100).toFixed(0)}%)` : ""}`, result.data);
    },
  });

  // ── memory_extract ────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_extract", label: "Memory: Extract Facts",
    description: "Use LLM to automatically extract key facts from text and save them to memory. Useful for processing conversations, articles, or notes.",
    promptSnippet: "Extract key facts from text and save to memory",
    parameters: Type.Object({
      text: Type.String({ description: "Text to extract facts from", minLength: 20, maxLength: 8000 }),
      category: Type.Optional(Type.String({ description: "Category for extracted facts (default: 'general')", default: "general" })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      if (!state.isHealthy) return ok("Memory API offline");
      const result = await apiRequest<{ extracted: number; saved: number; duplicates: number; facts?: Array<{ content?: string }> }>("/extract-facts", "POST", { text: String(params.text).slice(0, 8000), agent_id: state.agentId, project_id: state.projectId, category: (params.category as string) || "general" }, signal as AbortSignal);
      if (!result.ok) return err(`Extract failed: ${result.error}`);
      const { extracted, saved, duplicates, facts } = result.data;
      let detail = "";
      if (facts && facts.length > 0) detail = "\n\n" + facts.slice(0, 5).map((f, i) => `${i + 1}. ${f.content?.slice(0, 150)}`).join("\n");
      state.totalFacts += saved;
      ctx.ui.setStatus("memory-sync", `🧠 ${state.totalFacts}f`);
      return ok(`🧠 Extracted: ${extracted} facts, saved: ${saved}, duplicates: ${duplicates}${detail}`, { extracted, saved, duplicates });
    },
  });

  // ── memory_profile ────────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_profile", label: "Memory: User Profile",
    description: "Get or update a user profile in persistent memory. Profiles store cross-session user preferences, identity, and context.",
    promptSnippet: "Manage user profiles in memory",
    parameters: Type.Object({
      action: Type.String({ description: "'get' to read, 'update' to write/merge" }),
      user_id: Type.String({ description: "User identifier (e.g., 'kamil', 'default')", default: "default" }),
      data: Type.Optional(Type.String({ description: "JSON data to merge (only for action='update')" })),
    }),
    async execute(_id, params, signal, _update, _ctx) {
      if (!state.isHealthy) return ok("Memory API offline");
      const action = String(params.action).toLowerCase();
      const userId = String(params.user_id) || "default";
      if (action === "get") {
        const result = await apiRequest<{ profile?: Record<string, unknown> }>(`/profiles/${userId}`, "GET", undefined, signal as AbortSignal);
        if (!result.ok) return err(`Failed: ${result.error}`);
        const profile = result.data.profile;
        if (!profile || Object.keys(profile).length === 0) return ok(`No profile found for user: ${userId}`);
        return ok(`Profile for ${userId}:\n${JSON.stringify(profile, null, 2)}`, { profile });
      }
      if (action === "update") {
        if (!params.data) return err("Provide 'data' (JSON string) for action='update'");
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(String(params.data)); } catch { return err("Invalid JSON in 'data' parameter"); }
        const result = await apiRequest<{ status: string }>(`/profiles/${userId}`, "POST", parsed, signal as AbortSignal);
        if (!result.ok) return err(`Failed: ${result.error}`);
        return ok(`✅ Profile updated for ${userId}`, { user_id: userId, data: parsed });
      }
      return err("Action must be 'get' or 'update'");
    },
  });
}