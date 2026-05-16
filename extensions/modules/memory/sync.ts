/** Sync state machine — queue + flush z rate limiting. */

import type { SyncState, PendingFact } from "./types";
import { apiRequest } from "./client";

export const AUTO_SYNC_INTERVAL_MS = 60_000;
export const AUTO_SYNC_MAX_FACTS = 10;
export const MAX_CONTENT_LENGTH = 10000;

export function createSyncState(): SyncState {
  return { lastSync: 0, pendingFacts: [] };
}

export function queueFact(
  syncState: SyncState,
  content: string,
  key: string,
  memoryType: string = "general",
  importance: number = 0,
): void {
  if (!content || content.length < 10) return;
  const prefix = content.slice(0, 80);
  if (syncState.pendingFacts.some((f) => f.content.startsWith(prefix))) return;
  syncState.pendingFacts.push({ content, key: `${memoryType}.${key}`, memoryType, importance });
}

export async function flushPendingFacts(
  syncState: SyncState,
  agentId: string,
  projectId: string,
  isHealthy: boolean,
): Promise<number> {
  if (syncState.pendingFacts.length === 0) return 0;
  if (!isHealthy) return 0;

  const now = Date.now();
  if (now - syncState.lastSync < AUTO_SYNC_INTERVAL_MS) return 0;

  const batch = syncState.pendingFacts.splice(0, AUTO_SYNC_MAX_FACTS);
  syncState.lastSync = now;

  let saved = 0;
  for (const fact of batch) {
    const result = await apiRequest<{ status: string; id: string; pi_memory_key?: string }>(
      "/pi-remember", "POST",
      {
        content: fact.content.slice(0, MAX_CONTENT_LENGTH),
        key: fact.key,
        agent_id: agentId,
        project_id: projectId,
        importance: fact.importance,
      },
    );
    if (result.ok) saved++;
  }

  return saved;
}