/** Types for Memory API v2 integration. */

import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

export type ToolResult = AgentToolResult<unknown>;

export function ok(text: string, details?: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], details: details ?? {} };
}

export function err(text: string): ToolResult {
  return { content: [{ type: "text", text }], details: {}, isError: true };
}

export interface MemoryRecord {
  id: string;
  content?: string;
  excerpt?: string;
  category: string;
  agent_id: string;
  project_id?: string;
  user_id?: string;
  tags?: string[];
  source_file?: string;
  confidence?: number;
  importance?: number;
  trust_score?: number;
  archived?: boolean;
  archived_at?: string;
  pi_memory_key?: string;
  memory_type?: string;
  created_at: string;
  updated_at?: string;
}

export interface SearchResponse {
  results: MemoryRecord[];
  count: number;
}

export interface ListResponse {
  memories: MemoryRecord[];
  count: number;
  total?: number;
  has_more?: boolean;
}

export interface StatsResponse {
  overview: {
    total: number;
    active: number;
    archived: number;
    avg_trust?: number;
    avg_importance?: number;
    agents: number;
    projects: number;
  };
  by_agent: Record<string, number>;
  by_project: Record<string, number>;
  by_category: Record<string, number>;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  checks: {
    db: { ok: boolean; latency_ms: number };
    embedding: { ok: boolean; provider: string; model: string; dimension: number };
    circuit_breaker: { state: string; failures: number; cooldown_remaining: number };
  };
}

export interface PendingFact {
  content: string;
  key: string;
  memoryType: string;
  importance: number;
}

export interface SyncState {
  lastSync: number;
  pendingFacts: PendingFact[];
}