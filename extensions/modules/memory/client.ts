/** HTTP client — komunikacja z Memory API v2. */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

const MEMORY_API_URL = process.env.MEMORY_API_URL || "http://localhost:8765";
const API_TOKEN = process.env.MEMORY_API_TOKEN || "dev-token-change-me";

export async function apiRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  const url = `${MEMORY_API_URL}${endpoint}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (method !== "GET") {
    headers["Authorization"] = `Bearer ${API_TOKEN}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") || "30";
      return { ok: false, error: `Rate limited. Retry after ${retryAfter}s.`, status: 429 };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "unknown error");
      return { ok: false, error: `API ${response.status}: ${text.slice(0, 250)}`, status: response.status };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "Request cancelled", status: 0 };
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return {
        ok: false,
        error: "Memory API offline.\n  Start: cd /home/ArndtOs/Tools/memory-api-v2 && python main.py\n  Or:    cd /home/ArndtOs/Tools/memory-api-v2 && venv/bin/python main.py",
        status: 0,
      };
    }
    return { ok: false, error: msg, status: 0 };
  }
}

export function deriveProjectId(cwd: string): string {
  let dir = resolve(cwd);
  const parts: string[] = [];

  for (let i = 0; i < 5; i++) {
    const parent = resolve(dir, "..");
    if (parent === dir) break;

    const basename = dir.split("/").pop() || dir;
    if (existsSync(join(dir, "package.json"))) {
      parts.unshift(basename);
      return parts.join("/") || basename;
    }
    if (existsSync(join(dir, ".git"))) {
      parts.unshift(basename);
      return parts.join("/") || basename;
    }
    parts.unshift(basename);
    dir = parent;
  }

  const cwdParts = cwd.split("/").filter(Boolean);
  return cwdParts.slice(-2).join("/") || "unknown";
}