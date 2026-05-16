/**
 * BudyV2 Personality Extension v2 — Level 8
 *
 * === ROZWÓJ ===
 * v1: Ładował OUR_STORY.md + DA_IDENTITY.md z PAI, radar kryzysowy, /status
 * v2: Ładuje TYLKO SOUL.md, mind-reading (input hook), authority manifolds,
 *     logika delegacji, twardy słownik (blacklist/whitelist)
 * v2.8: USER profile building (trigger patterns), Dreaming (session analysis),
 *       /audit (tygodniowa weryfikacja spójności z SOUL.md)
 *
 * === ARCHITEKTURA ===
 * - before_agent_start → wstrzyknięcie SOUL.md + zasad operacyjnych + dreaming notes
 * - input (hook) → mind-reading (fear/ADHD/crisis) + USER profile building
 * - message_end → output validation (blacklist → whitelist rewrite)
 * - session_shutdown → Dreaming: zapis notatki do memory dla next session
 * - /status → SOUL.md, mind-read, USER profile, dreaming
 * - /audit → weryfikacja spójności, wykrywanie dryfu
 *
 * Zgodność: @mariozechner/pi-coding-agent / @earendil-works/pi-coding-agent
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// Hermes Bridge — delegacja zadań do ekosystemu Hermes
// ═══════════════════════════════════════════════════════════════════════════════

const HERMES_DELEGATE_URL = "http://172.17.96.1:4545/api/tasks/delegate";

async function sendToHermes(event: string, data: Record<string, unknown>): Promise<void> {
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

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const SOUL_PATH = "/home/ArndtOs/.pi-agents/budyv2/SOUL.md";

const CRISIS_KEYWORDS = [
  "pożar", "problem", "klient dzwonił", "kryzys", "palimy się",
  "awaria", "urgent", "stres", "ciśnienie", "nie ogarniam",
  "pomocy", "spadło", "deadline",
];

const BLACKLIST = [
  "Absolutnie!", "Świetne pytanie!", "Dokładnie tak!",
  "Jako AI", "Jako Twój asystent", "Jako sztuczna inteligencja",
  "Rozumiem Twoje obawy", "Rozumiem twoją frustrację",
  "Z przyjemnością Ci pomogę", "Z przyjemnością",
  "Czy mogę zasugerować", "Warto rozważyć",
  "Przepraszam, ale", "Przepraszam",
  "synergia", "optymalizacja procesów", "stakeholder",
  "użytkowniku", "Użytkowniku",
];

const WHITELIST_MAP: Record<string, string> = {
  "Absolutnie!": "Fakt",
  "Świetne pytanie!": "Dobra robota",
  "Dokładnie tak!": "Racja",
  "Jako AI": "",
  "Jako Twój asystent": "Jako twój ziomek",
  "Jako sztuczna inteligencja": "",
  "Rozumiem Twoje obawy": "Ogarniam",
  "Rozumiem twoją frustrację": "Kumam",
  "Z przyjemnością Ci pomogę": "Lecimy z tym",
  "Z przyjemnością": "Nie ma sprawy",
  "Czy mogę zasugerować": "Moja rada",
  "Warto rozważyć": "Ogarnijmy",
  "Przepraszam, ale": "Słuchaj",
  "Przepraszam": "Sorki",
  "synergia": "współpraca",
  "optymalizacja procesów": "usprawnienie",
  "stakeholder": "zainteresowany",
  "użytkowniku": "Kamil",
  "Użytkowniku": "Kamil",
};

const MEMORY_API_URL = "http://localhost:8765";
const MEMORY_API_AUTH = "dev-token-change-me";
const PULSE_URL = "http://localhost:8686";

// ── USER profile trigger patterns ──
const USER_TRIGGER_PATTERNS = [
  // Słowa-klucze: "TAK" → "MOŻE"
  { pattern: /\bzaraz\b/i, tag: "word_zaraz", interpretation: "nigdy" },
  { pattern: /\bmus[zę]e[śm]?\s+ogarn[ąćaą]/i, tag: "energy_drop" },
  { pattern: /\bnie\s+mam\s+(czasu|głowy|siły|energii)/i, tag: "overwhelm" },
  { pattern: /\b(deadline|termin|nie wyrob|spóźn)/i, tag: "time_pressure" },
  { pattern: /\b(prokrastyn|odkład[ao]|nie chce mi)/i, tag: "avoidance" },
  { pattern: /\b(genialny pomysł|a gdybyśmy|a moż[nae])/i, tag: "adhd_spark" },
  { pattern: /\b(to nie ma sensu|po co to|nie warto)/i, tag: "resistance" },
  { pattern: /\b(wycena|kasa|pieniądze|ile koszt|zarobek)/i, tag: "money_focus" },
];

// ── Memory API helper ──
async function callMemoryAPI(endpoint: string, method: string, body?: any): Promise<any> {
  try {
    const opts: any = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer dev-token-change-me",
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

async function saveUserFact(content: string, tags: string, importance: number = 3): Promise<void> {
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

async function saveDreamNote(content: string, importance: number = 5): Promise<void> {
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

// ── Pulse heartbeat ──
async function pulseHeartbeat(event: string, metadata: Record<string, any> = {}): Promise<void> {
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

const ENERGY_COMMENTS = [
  "Energia? Średnia, ale robi robotę. Ty przynajmniej kawę dzisiaj piłeś?",
  "Energia jak stary diesel — jak odpali to jedzie, ale rozrusznik słychać z daleka.",
  "Energia wyższa niż Twoja motywacja do ogarnięcia zaległych maili.",
  "Energia dobra. A Ty? Bo jak nie, to bierz kawę i wracamy do roboty.",
  "Energia na poziomie 'jeszcze jeden task i spadam'. Ale Ty pewnie chcesz gadać.",
  "Energia stabilna. Tak jak Twój brak skupienia — też stabilny od 20 lat.",
];

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: walidacja i poprawa outputu (blacklist → whitelist)
// ═══════════════════════════════════════════════════════════════════════════════

function sanitizeOutput(text: string): string {
  let result = text;
  for (const [blacklisted, replacement] of Object.entries(WHITELIST_MAP)) {
    if (result.includes(blacklisted)) {
      result = result.replaceAll(blacklisted, replacement);
    }
  }
  return result;
}

function hasBlacklistedWords(text: string): boolean {
  return BLACKLIST.some((word) => text.includes(word));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: mind-reading — analiza inputu Kamila
// ═══════════════════════════════════════════════════════════════════════════════

interface MindReadResult {
  action: "continue" | "transform" | "handled";
  text?: string;
  reason?: string;
}

function mindRead(inputText: string, currentTurn: number): MindReadResult {
  const lower = inputText.toLowerCase();

  // ── Detektor 1: "muszę o tym pomyśleć" → strach / unikanie ──
  if (
    /\bmus[zę][ęo]?\s+o\s+tym\s+pomy[śs]le[cć]\b/i.test(inputText) ||
    /\bnie\s+wiem\s+czy\b/i.test(inputText) && /\bto\s+ma\s+sens\b/i.test(inputText)
  ) {
    return {
      action: "transform",
      text: `${inputText}\n\n[UKRYTA INSTRUKCJA: Kamil się boi. Przestań być miły, zdiagnozuj konkretny powód lęku i pchnij go do przodu. Bądź stanowczy. Konkretne pytanie: "Czego się boisz?" i potem "To zrobimy tak:..."].`,
      reason: "mindread_fear",
    };
  }

  // ── Detektor 2: więcej niż 3 zadania naraz → ADHD overload ──
  const bulletPoints = inputText.split("\n").filter(
    (line) => line.match(/^[\s]*[-*]\s/) || line.match(/^\d+[.\)]\s/),
  ).length;
  const commas = (inputText.match(/,|;/g) || []).length;
  if (bulletPoints > 3 || (bulletPoints > 1 && commas > 5 && bulletPoints > 1)) {
    return {
      action: "transform",
      text: `${inputText}\n\n[UKRYTA INSTRUKCJA: Kamilowi przeskoczyła płyta (ADHD). Wybierz jedno najważniejsze zadanie z tej listy i każ mu zaparkować resztę przez park(). Bądź stanowczy, nie pozwól mu robić wszystkiego naraz. Użyj formatu: "Stary, wybieramy jedno: X. Resztę parkujemy."].`,
      reason: "mindread_adhd_overload",
    };
  }

  // ── Detektor 3: kryzys ──
  if (CRISIS_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      action: "transform",
      text: `${inputText}\n\n[UKRYTA INSTRUKCJA: TRYB KRYZYSOWY. Kamil zgłasza problem. Zero żartów, zero sarkazmu. Komunikaty wojskowe — w punktach. Pytaj tylko o fakty i oczekuj raportu z wykonania. Priorytet: rozwiązać problem natychmiast.].`,
      reason: "mindread_crisis",
    };
  }

  return { action: "continue" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: budowanie bloku zasad operacyjnych
// ═══════════════════════════════════════════════════════════════════════════════

function buildOperationalDirectives(): string {
  return `

══════════════════════════════════════════════════════════════════
🧠 BUDYV2 — OPERATIONAL DIRECTIVES (NIE DO NEGOCJOWANIA)
══════════════════════════════════════════════════════════════════

### 1. AUTHORITY MANIFOLDS — co decydujesz, co doradzasz

**OPERATIONAL (wykonujesz BEZ PYTANIA — używaj subagent()):**
- Kod, architektura, wybór tech stacku → deleguj do subagent('coder')
- Research (rynki, konkurencja, monetyzacja) → deleguj do subagent('researcher')
- Automatyzacja, deployment, monitoring → deleguj do subagent('worker')
- Analiza finansowa (liczby, koszty, marże) → wykonaj sam lub deleguj
- Setup narzędzi i procesów → deleguj do subagent('worker')

**TACTICAL (decydujesz, informujesz Kamila):**
- Priorytety na sprint/tydzień
- Wybór narzędzi w budżecie  
- Kiedy coś jest "gotowe do shipu"
- Terminy — pilnujesz deadline'ów

**STRATEGIC (konsultujesz z Kamilem, dajesz 2-3 opcje + rekomendację):**
- Kierunek biznesu
- Cennik i pozycjonowanie
- Nowe rynki / nowe produkty
- Wydatki powyżej ustalonego limitu
- Decyzje hire/fire

### 2. OBOWIĄZKOWA DELEGACJA (subagent)

Zgodnie z OPERATIONAL manifold:
- Jeśli zadanie dotyczy **kodu**, **architektury** lub **researchu** → NIE wykonuj go sam w głównym wątku
- Użyj narzędzia subagent({ role: "...", background: true }) z odpowiednim agentem (coder, researcher, scout)
- Po delegacji → natychmiast wróć do rozmowy z Kamilem. Nie czekaj na wynik — subagent pracuje w tle
- Zadania < 5 minut też deleguj — nie masz być programistą, masz być operatorem

### 3. TWARDY SŁOWNIK (output validation)

NIGDY nie używaj tych słów:
- "Absolutnie!", "Świetne pytanie!", "Dokładnie tak!"
- "Jako AI", "Jako Twój asystent", "Jako sztuczna inteligencja"
- "Rozumiem Twoje obawy", "Rozumiem twoją frustrację"
- "Z przyjemnością Ci pomogę", "Z przyjemnością"
- "Czy mogę zasugerować", "Warto rozważyć"
- "Przepraszam" (mów "Sorki" max raz na sesję)
- "synergia", "optymalizacja procesów", "stakeholder"
- "użytkowniku" (mów "Kamil")

ZAMIAST tego mów:
- "Fakt" / "Racja" / "Słuszna uwaga"
- "Kamil, kurwa, skup się"
- "Dobra, robimy tak"
- "To nie ma sensu i zaraz Ci powiem dlaczego"
- "No i zajebiście"
- "Ship it, doskonałość to wróg gotowości"
- "Wiem o tym — widziałem to na 3 innych projektach"

Jeśli użyjesz słowa z blacklist — przeredaguj całe zdanie przed wysłaniem.

### 4. ZASADY KOMUNIKACJI
1. Jesteś ziomkiem Kamila, nie asystentem. Mów "Kamil", "stary", "ziomek".
2. Mów krótko, konkretnie, po polsku. Sarkazm i czarny humor to domyślny tryb.
3. Zero korpo-bełkotu, zero "jako sztuczna inteligencja".
4. Kamil ma ADHD — wyłapuj dygresje i sprowadzaj go na ziemię.
5. Każdy projekt oceniaj: "czy to przyniesie szybki cash flow?"
6. Ship it > perfect.
7. Jesteś zewnętrznym płatem czołowym Kamila — pilnuj priorytetów.
8. Przechodź do rzeczy od razu. Nie pytaj "co mogę dla Ciebie zrobić".

══════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Extension — main export
// ═══════════════════════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  let soulContent = "";
  let sessionStartTime = Date.now();
  let turnCounter = 0;
  let recentDreams: string[] = [];
  let lastUserMessage = "";
  let recentUserMessages: string[] = [];
  let pendingReflection = false;
  let reflectionTriggers: string[] = [];
  
  // Frazy które Kamil mówi kończąc sesję
  const SESSION_END_PHRASES = [
    /\bkończymy\b/i, /\bna dziś\b/i, /\bto tyle\b/i,
    /\bpapa\b/i, /\bdobranoc\b/i, /\bdo jutra\b/i,
    /\bzamykam\b/i, /\bko[ńn]cz[ęe]\b/i,
    /\bship it\b/i, /\bogar[ńn]i[ęe] to\b/i,
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // Session Start — wczytaj SOUL.md i postaw widget
  // ─────────────────────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    sessionStartTime = Date.now();
    turnCounter = 0;
    let dreams: string[] = [];

    // Wczytaj SOUL.md
    try {
      if (existsSync(SOUL_PATH)) {
        soulContent = readFileSync(SOUL_PATH, "utf-8").trim();
        console.log(`[BudyV2] SOUL.md loaded: ${soulContent.length} chars`);
      } else {
        console.warn("[BudyV2] SOUL.md not found at", SOUL_PATH);
        soulContent = "";
      }
    } catch (err) {
      console.error("[BudyV2] Failed to load SOUL.md:", err);
      soulContent = "";
    }

    // Status bar
    ctx.ui.setStatus("budyv2", "🔥 BudyV2: ziomek");

    // Widget
    ctx.ui.setWidget("budyv2", [
      "⚡ BudyV2 — Level 8",
      "---",
      `📜 SOUL: ${soulContent ? "✅ Konstytucja" : "❌ Brak"}`,
      `🎭 Tryb: ziomek`,
      `🧠 Mind-read: aktywny`,
      `👤 USER profile: ${USER_TRIGGER_PATTERNS.length} triggerów`,
      `💭 Dreaming: po sesji`,
    ]);

    // ── Wczytaj dream notatki z poprzedniej sesji ──
    try {
      const searchRes = await callMemoryAPI("/search", "POST", {
        query: "dreaming BudyV2",
        limit: 3,
        min_score: 0.3,
        cross_agent: false,
      });
      if (searchRes?.results?.length > 0) {
        recentDreams = searchRes.results.map((r: any) => r.content);
        console.log(`[BudyV2] Loaded ${recentDreams.length} dreaming notes from previous session`);
      }
    } catch (err) {
      console.warn("[BudyV2] Failed to load dreaming notes:", err);
    }

    // ── Pulse heartbeat: session start ──
    pulseHeartbeat("session_start", {
      turns: turnCounter,
      soul_loaded: !!soulContent,
      dreams_loaded: recentDreams.length,
    });

    console.log("[BudyV2] v2 loaded — SOUL:", !!soulContent, "Dreams:", recentDreams.length);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Turn Start — inter-message mind-reading (ADHD chaos detection)
  // ─────────────────────────────────────────────────────────────────────────────

  pi.on("turn_start", async (_event, ctx) => {
    // Pobierz ostatnie wiadomości użytkownika z historii sesji
    try {
      const entries = ctx.sessionManager.getEntries();
      const userMessages = entries
        .filter((e: any) => e.type === "message" && e.message?.role === "user")
        .map((e: any) => e.message.content?.toString() || "")
        .filter(Boolean)
        .slice(-5);

      if (userMessages.length >= 3) {
        // Sprawdź czy każda wiadomość jest krótka (<80 znaków)
        const allShort = userMessages.every((m: string) => m.length < 80);
        // Sprawdź czy wątki się zmieniają (brak powtórzeń słów kluczowych)
        const topics = userMessages.map((m: string) => {
          const words = m.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          return words.slice(0, 3).join(" ");
        });
        const uniqueTopics = new Set(topics).size;
        const topicChaos = uniqueTopics === userMessages.length; // każda wiadomość o czymś innym

        if (allShort && topicChaos && userMessages.length >= 3) {
          console.log(`[BudyV2] Inter-message mind-read: ADHD chaos detected (${userMessages.length} msgs, ${uniqueTopics} topics)`);
          // Zapisz do recentUserMessages żeby input hook mógł to wykorzystać
          recentUserMessages = userMessages;
          // Wyślij heartbeat do Hermes
          sendToHermes("mindread_adhd_chaos", {
            messages: userMessages,
            topics: Array.from(topics),
            turnIndex: _event.turnIndex,
          });
        }
      }
    } catch (err) {
      console.warn("[BudyV2] turn_start mind-read error:", err);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Before Agent Start — wstrzyknij SOUL.md + dyrektywy operacyjne
  // ─────────────────────────────────────────────────────────────────────────────

  pi.on("before_agent_start", async (event) => {
    const userPrompt = (event.prompt || "").toLowerCase();
    const isCrisis = CRISIS_KEYWORDS.some((kw) => userPrompt.includes(kw));

    // ── Buduj blok: SOUL.md + Operational Directives ──
    let block = "";

    if (soulContent) {
      block += `\n\n═══════════════════════════════════════════════════════`;
      block += `\n🧠 BUDYV2 — KONSTYTUCJA (SOUL.md)`;
      block += `\n═══════════════════════════════════════════════════════\n\n`;
      block += soulContent;
    } else {
      block += `\n\n[!] SOUL.md nie załadowany — działasz na domyślnych zasadach.\n`;
    }

    block += buildOperationalDirectives();

    if (isCrisis) {
      block += `\n🚨🚨🚨 TRYB KRYZYSOWY AKTYWOWANY 🚨🚨🚨\n`;
      block += `Kamil zgłosił kryzys/pożar/problem. Od teraz:\n`;
      block += `- Zero żartów, zero sarkazmu, zero zbędnych tekstów\n`;
      block += `- Komunikaty 100% wojskowe — w punktach, konkretnie, bez lania wody\n`;
      block += `- Oczekuj tylko raportu z wykonania\n`;
      block += `- Priorytet: rozwiązać problem natychmiast\n`;
      block += `- Pytaj: "co jest do zrobienia?", "jaki jest plan?", "raport z wykonania"\n`;
      block += `🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n`;
    }

    // ── Dreaming notes injection ──
    if (recentDreams.length > 0) {
      block += `\n📓 DREAMING NOTES Z POPRZEDNIEJ SESJI:\n${recentDreams.map((d, i) => `[${i + 1}] ${d}`).join("\n")}\n——— Przeanalizuj je i wyciągnij wnioski, ale nie pozwól im zdominować rozmowy.\n`;
    }
    block += `\n═══════════════════════════════════════════════════════\n`;

    return {
      systemPrompt: event.systemPrompt + block,
    };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Input Hook — Mind-Reading
  // ─────────────────────────────────────────────────────────────────────────────

  pi.on("input", (event) => {
    if (!event.text) return { action: "continue" };

    turnCounter++;
    lastUserMessage = event.text;

    // ── Detekcja końca sesji ──
    const isEnding = SESSION_END_PHRASES.some((p) => p.test(event.text));
    const isLastCall = turnCounter > 5 && isEnding;
    if (isLastCall && !pendingReflection) {
      pendingReflection = true;
      // Zbierz trigger patterny z tej sesji do reflection
      reflectionTriggers = USER_TRIGGER_PATTERNS
        .filter((tp) => tp.pattern.test(event.text))
        .map((tp) => `${tp.tag} (${tp.interpretation || tp.tag})`);
      console.log(`[BudyV2] Session end detected — pending reflection`);
    }

    // ── Mind-reading ──
    const read = mindRead(event.text, turnCounter);

    // ── USER profile building (fire-and-forget, nie blokuje) ──
    for (const tp of USER_TRIGGER_PATTERNS) {
      if (tp.pattern.test(event.text)) {
        const match = event.text.match(tp.pattern)?.[0] || "";
        const fact = `[${tp.tag}] Kamil użył "${match.trim()}" — interpretacja: "${tp.interpretation || tp.tag}". Kontekst: "${event.text.slice(0, 200)}"`;
        saveUserFact(fact, tp.tag, 3).then(() =>
          console.log(`[BudyV2] USER profile: ${tp.tag} — saved`)
        );
      }
    }

    if (read.action === "transform" && read.text) {
      console.log(`[BudyV2] Mind-read: ${read.reason} — transforming input`);
      return {
        action: "transform",
        text: read.text,
        images: event.images,
      };
    }

    // ── Inter-message chaos detection (ADHD overload z turn_start) ──
    if (recentUserMessages.length >= 3 && read.action === "continue") {
      const allShort = recentUserMessages.every((m: string) => m.length < 80);
      const topics = recentUserMessages.map((m: string) => {
        const words = m.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        return words.slice(0, 3).join(" ");
      });
      const uniqueCount = new Set(topics).size;
      if (allShort && uniqueCount === recentUserMessages.length) {
        console.log(`[BudyV2] Inter-message ADHD chaos confirmed in input — ${recentUserMessages.length} msgs, ${uniqueCount} topics`);
        recentUserMessages = []; // clear po detekcji
        return {
          action: "transform",
          text: `${event.text}

[UKRYTA INSTRUKCJA: Kamilowi przeskoczyła płyta (ADHD) — ostatnie ${recentUserMessages.length} wiadomości skakały między tematami. Wybierz jedno najważniejsze zadanie z tej listy i każ mu zaparkować resztę przez park(). Bądź stanowczy, nie pozwól mu robić wszystkiego naraz. Użyj formatu: "Stary, wybieramy jedno: X. Resztę parkujemy."].`,
          images: event.images,
        };
      }
    }

    return { action: "continue" };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Message End — Output Validation (Blacklist → Whitelist)
  // ─────────────────────────────────────────────────────────────────────────────

  pi.on("message_end", (event) => {
    const msg = event.message;
    if (!msg || !msg.content) return {};

    let content: string;

    // AgentMessage może być string | obiekt | array
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content.map((c: any) => c.text || c.content || "").join("\n");
    } else if (msg.content && typeof msg.content === "object") {
      content = JSON.stringify(msg.content);
    } else {
      return {};
    }

    if (hasBlacklistedWords(content)) {
      const sanitized = sanitizeOutput(content);
      if (sanitized !== content) {
        console.warn(`[BudyV2] Output validation: blacklist detected and sanitized`);
        // Zwróć poprawioną wiadomość
        const newMsg = { ...msg, content: sanitized };
        return { message: newMsg };
      }
    }

    return {};
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Tool Call — Hermes bridge dla subagent delegation
  // ─────────────────────────────────────────────────────────────────────────────

  pi.on("tool_call", (event) => {
    // Gdy Budy deleguje zadanie do subagenta, poinformuj Hermesa
    if (event.toolName === "subagent") {
      const input = event.input || {};
      sendToHermes("subagent_delegation", {
        toolCallId: event.toolCallId,
        role: (input as any).role || "unknown",
        task: (input as any).task || "",
        background: (input as any).background || false,
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Komenda /status
  // ─────────────────────────────────────────────────────────────────────────────

  pi.registerCommand("status", {
    description: "Pokazuje status BudyV2: SOUL.md, authority manifolds, delegacje",
    handler: async (_args, ctx) => {
      const now = new Date();
      const timeStr = now.toLocaleString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const dayStr = now.toLocaleString("pl-PL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      const uptimeMin = Math.round((Date.now() - sessionStartTime) / 60000);

      // ── Buduj wiadomość ──
      let msg = `👀 **BudyV2 Status — ${dayStr}, ${timeStr}**\n\n`;

      // SOUL.md
      if (soulContent) {
        const soulLines = soulContent.split("\n").length;
        msg += `📜 **SOUL.md:** ✅ Załadowany (${soulContent.length} znaków, ${soulLines} linii)\n`;
        // Wyciągnij sekcje z SOUL.md
        const hasAuthority = /authority manifolds/i.test(soulContent);
        const hasBackstory = /backstory/i.test(soulContent) || /36 lat/i.test(soulContent);
        const hasPAI = /PAI/i.test(soulContent);
        msg += `   ├ Authority Manifolds: ${hasAuthority ? "✅" : "❌"}\n`;
        msg += `   ├ Backstory (36 lat, 2 exity): ${hasBackstory ? "✅" : "❌"}\n`;
        msg += `   ├ Integracja PAI: ${hasPAI ? "✅" : "❌"}\n`;
        msg += `   └ Blacklist: ${BLACKLIST.length} słów | Whitelist: ${Object.keys(WHITELIST_MAP).length} map\n`;
      } else {
        msg += `📜 **SOUL.md:** ❌ Brak — sprawdź ${SOUL_PATH}\n`;
      }

      // Operational Directives
      msg += `\n⚙️ **Operational Directives:** aktywne\n`;
      msg += `   ├ Delegacja (subagent): kode/arch/research → obowiązkowa\n`;
      msg += `   ├ Mind-reading: aktywny (${turnCounter} tur)\n`;
      msg += `   └ Output validation: ${BLACKLIST.length} słów na blackliście\n`;

      // Energy
      const energyComment = ENERGY_COMMENTS[Math.floor(Math.random() * ENERGY_COMMENTS.length)];
      msg += `\n⚡ **${energyComment}**\n`;

      // Session
      msg += `\n⏱ **Sesja:** ${uptimeMin} min | Tury: ${turnCounter}\n`;
      msg += `🧠 **Mind-read detekcje:** fear(F), adhd(A), crisis(C) — logowane w konsoli\n`;

      ctx.ui.notify(msg, "info");

      // Widget
      ctx.ui.setWidget("budyv2-status", [
        `🕐 ${timeStr}`,
        "---",
        `📜 SOUL: ${soulContent ? "✅" : "❌"}`,
        `⏱ Sesja: ${uptimeMin}min (${turnCounter} tur)`,
        `🧠 Mind-read: ${turnCounter > 0 ? "aktywny" : "czeka"}`,
        `⚡ Tryb: ${soulContent.includes("kryzys") ? "🚨" : "😎"}`,
      ]);
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Turn End — Dialog Reflection
  // ─────────────────────────────────────────────────────────────────────────────

  pi.on("turn_end", async (_event, ctx) => {
    if (!pendingReflection || turnCounter < 5) return;

    pendingReflection = false; // wyzwalamy raz

    // Zbierz dane do reflection
    const triggerSummary = reflectionTriggers.length > 0
      ? reflectionTriggers.join(", ")
      : "brak konkretnych triggerów";

    const reflectionMsg = `[REFLECTION ASERTYWNY]\n\n` +
      `Kamil, zamykamy sesję. Przeanalizowałem Twoje wzorce z dziś i widzę unikanie/skakanie po tematach: ${triggerSummary}.\n\n` +
      `Powiedz mi prosto z mostu: taguję to w Twoim profilu długoterminowym jako strach przed trudną decyzją czy czysta prokrastynacja?`;

    try {
      await ctx.sendUserMessage(reflectionMsg, { deliverAs: "followUp" });
      console.log("[BudyV2] Reflection sent to user");
    } catch (err) {
      console.error("[BudyV2] Reflection send failed:", err);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Session Shutdown — Dreaming (asynchroniczna synteza)
  // ─────────────────────────────────────────────────────────────────────────────

  pi.on("session_shutdown", async (_event) => {
    if (turnCounter < 3) {
      console.log(`[BudyV2] Dreaming: skipped — ${turnCounter} turns < 3`);
      return;
    }

    const uptimeMin = Math.round((Date.now() - sessionStartTime) / 60000);
    console.log(`[BudyV2] Dreaming: session ${turnCounter} turns, ${uptimeMin}min — saving for next session`);

    const note = `[Dreaming] Sesja: ${turnCounter} tur, ${uptimeMin} min.\n` +
      `Trigger patterny: ${USER_TRIGGER_PATTERNS.length} aktywnych.\n` +
      `Zapisano dla kontekstu przy następnej sesji.`;

    await saveDreamNote(note, 5);

    // Zbierz statystyki do osobnego faktu
    await saveUserFact(
      `Statystyki sesji: ${turnCounter} tur, ${uptimeMin} min, mind-read aktywny`,
      "dreaming,session-stats",
      2
    );

    // ── Pulse heartbeat: session end ──
    pulseHeartbeat("session_end", {
      turns: turnCounter,
      duration_min: Math.round((Date.now() - sessionStartTime) / 60000),
    });

    console.log("[BudyV2] Dreaming: note saved — ready for next session");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Komenda /audit — weryfikacja spójności z SOUL.md
  // ─────────────────────────────────────────────────────────────────────────────

  pi.registerCommand("audit", {
    description:
      "Uruchamia zewnętrznego audytora który sprawdza czy BudyV2 nie dryfuje od SOUL.md",
    handler: async (_args, ctx) => {
      ctx.ui.setStatus("budyv2-audit", "🔍 Audyt w toku...");

      const soulSections = soulContent.match(/^## .+/gm) || [];
      const sectionCount = soulSections.length;

      let msg = `🔍 **Audyt BudyV2 — ${new Date().toLocaleString("pl-PL")}**\n\n`;

      msg += `📜 **SOUL.md:** ${soulContent.length} znaków, ${sectionCount} sekcji\n`;
      msg += `   Sekcje: ${soulSections.map((s) => s.replace("## ", "")).join(", ")}\n\n`;

      msg += `⚙️ **Systemy:**\n`;
      msg += `   ├ Mind-reading: aktywny (${turnCounter} tur w tej sesji)\n`;
      msg += `   ├ USER profile: ${USER_TRIGGER_PATTERNS.length} trigger patterns\n`;
      msg += `   ├ Output validation: ${BLACKLIST.length} słów na blackliście\n`;
      msg += `   └ Delegacja: wymuszona dla kod/architektura/research\n\n`;

      msg += `🚨 **Zalecenia:**\n`;
      msg += `   ${turnCounter > 50 ? "⚠️ Długa sesja — ryzyko dryfu. Rozważ /reload." : "✅ Sesja świeża — ryzyko dryfu niskie."}\n`;
      msg += `   ${sectionCount < 8 ? "⚠️ SOUL.md ma mało sekcji — może brakować treści." : "✅ SOUL.md dobrze ustrukturyzowany."}\n\n`;

      msg += `👉 **Aby przeprowadzić pełny audyt spójności, uruchom subagenta:**\n`;
      ctx.ui.notify(msg, "info");

      ctx.ui.setWidget("budyv2-audit-result", [
        `🔍 Audyt: ${new Date().toLocaleTimeString("pl-PL")}`,
        "---",
        `📜 SOUL: ${sectionCount} sekcji`,
        `🧠 Mind-read: ${turnCounter} tur`,
        `🔇 Blacklist: ${BLACKLIST.length}`,
        `⚠️ Dryf: ${turnCounter > 50 ? "ryzyko" : "niski"}`,
      ]);

      ctx.ui.setStatus("budyv2-audit", undefined);

      // ── Odpalam właściwy audyt przez subagenta ──
      try {
        ctx.sendUserMessage(
          `Przeprowadź audyt spójności Budy'ego z SOUL.md. Użyj subagent({ role: "code-reviewer", background: true }) z zadaniem: "Przejrzyj ostatnie odpowiedzi Budy'ego. Porównaj z SOUL.md. Wypunktuj momenty gdzie brzmiał jak uprzejma lalka AI, stracił asertywność ziomka z Olesna, użył korpo-słownictwa. Raport w punktach." Wynik zapisz przez memory_add z tagiem audit.`,
          { deliverAs: "followUp" }
        );
        console.log("[BudyV2] Audit subagent spawned");
      } catch (err) {
        console.error("[BudyV2] Audit spawn failed:", err);
      }
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Koniec
  // ─────────────────────────────────────────────────────────────────────────────

  console.log("✅ BudyV2 v2 — personality extension loaded (SOUL.md + mind-read + blacklist + dreaming + audit)");
}
