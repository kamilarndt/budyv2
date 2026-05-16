/** Memory API helper — komunikacja z memory-api-v2. */

import { MEMORY_API_URL, MEMORY_API_AUTH } from "./constants";

export async function callMemoryAPI(endpoint: string, method: string, body?: any): Promise<any> {
  try {
    const opts: any = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MEMORY_API_AUTH}`,
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${MEMORY_API_URL}${endpoint}`, opts);
    if (!res.ok) {
      console.warn(`[BudyV2] Memory API ${method} ${endpoint}: ${res.status} ${res.statusText}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[BudyV2] Memory API error:`, err);
    return null;
  }
}

export async function saveUserFact(content: string, tags: string, importance: number = 3): Promise<void> {
  await callMemoryAPI("/memories", "POST", {
    content,
    agent_id: "budyv2",
    user_id: "kamil",
    memory_type: "user",
    category: "user_pref",
    tags: tags.split(",").map(t => t.trim()).filter(Boolean),
    importance,
  });
}

export async function saveDreamNote(content: string, importance: number = 5): Promise<void> {
  await callMemoryAPI("/memories", "POST", {
    content,
    agent_id: "budyv2",
    user_id: "kamil",
    memory_type: "lesson",
    category: "dreaming",
    tags: ["dreaming", "reflection"],
    importance,
  });
}