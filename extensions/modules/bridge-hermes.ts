/** Hermes bridge + Pulse heartbeat — komunikacja z ekosystemem. */

import { HERMES_DELEGATE_URL, PULSE_URL } from "./constants";

export async function sendToHermes(event: string, data: Record<string, unknown>): Promise<void> {
  try {
    const payload = {
      event,
      source: "budyv2",
      timestamp: new Date().toISOString(),
      data,
    };
    const res = await fetch(HERMES_DELEGATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[BudyV2] Hermes bridge: ${res.status} ${res.statusText}`);
    } else {
      console.log(`[BudyV2] Hermes bridge: ${event} → ${res.status}`);
    }
  } catch (err) {
    console.error(`[BudyV2] Hermes bridge error:`, err);
  }
}

export async function pulseHeartbeat(event: string, metadata: Record<string, any> = {}): Promise<void> {
  try {
    await fetch(`${PULSE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "heartbeat",
        source: "budyv2",
        message: event,
        metadata: { ...metadata, timestamp: new Date().toISOString() },
      }),
    });
    console.log(`[BudyV2] Pulse: ${event}`);
  } catch (err) {
    console.warn(`[BudyV2] Pulse heartbeat failed:`, err);
  }
}