# BudyV2 — Fix Plan

> Analiza Gemini 3.1 Pro. Zbierane po kolei, na końcu implementacja.

---

## Wiadomość #1 — Architektura ogólnie

**Źródło:** Gemini 3.1 Pro, pełny przegląd systemu

### 1. 🔴 KATASTROFA Z KODEM: Globalny Output Filter

**Problem:** `message_end` hook w `index.ts` spłaszcza tablicę `msg.content` do stringa przez `.join("\n")`, niszcząc strukturę bloków (code, thinking, tool_calls). `sanitizeOutput` robi `replaceAll` na wszystkim, więc kod zawierający słowa z blacklisty (np. `stakeholder`, `synergia`) zostanie zniszczony.

**Plik:** `extensions/index.ts` — hook `message_end`, funkcja `sanitizeOutput` w `output-filter.ts`

**Fix:**
- W `message_end`: nie spłaszczaj tablicy `msg.content` — sprawdzaj bloki indywidualnie
- W `sanitizeOutput`: pomijaj bloki typu "code" lub "thinking"
- Blacklist powinna działać tylko na blokach tekstowych (typu "text")

**Priorytet:** 🔴 Krytyczny — niszczy kod

---

### 2. 🔴 FAT PROMPT: Paraliż Okna Kontekstowego

**Problem:** `before_agent_start` ładuje: SOUL.md (8500 znaków) + directives + auto-eval + dreaming + TELOS + SYSTEM.md = 4-6k tokenów system promptu. To powoduje:
- Wzrost TTFT (Time To First Token)
- Efekt "Lost in the Middle" — model ignoruje połowę reguł

**Plik:** `extensions/index.ts` — hook `before_agent_start`

**Fix:**
- SOUL.md → skrócić o 50% (usunąć duplikaty z directives)
- directives → przenieść część zasad do agents/*.md (nie do system promptu)
- TELOS → ładować tylko na żądanie, nie zawsze
- dreaming/backlog → limit 2 notatek, nie wszystkie

**Priorytet:** 🔴 Krytyczny — performance i jakość odpowiedzi

---

### 3. 🟡 FAŁSZYWE ALARMY ADHD: Wadliwy Mind-Reading

**Problem:** `mindRead` zlicza puntory/bullet points regexem `^[\s]*[-*]\s`. Kod z komentarzami, logi błędów, package.json — wszystko triggeruje ADHD alarm. Dodatkowo race condition: `turn_start` i `input` hooki operują na `state.recentUserMessages` bez gwarantowanej kolejności.

**Plik:** `extensions/modules/mind-read.ts`

**Fix:**
- Pomijaj wiadomości >500 znaków (to kod/logi, nie ADHD)
- Regex tylko dla krótkich wiadomości (< 200 znaków)
- Przenieś całą logikę inter-message do jednego hooka (tylko `input`)

**Priorytet:** 🟡 Średni — fałszywe alarmy denerwują

---

### 4. 🟡 SIECIOWY BUBEL: Nieskończone Zawieszenia i Brak Retry

**Problem:** `bridge-hermes.ts` i `memory-api.ts` używają `fetch` bez timeoutów. Jeśli serwer Pulse (8686) lub Hermes (4545) zawiesi połączenie, agent wisi w nieskończoność. `saveUserFact` nie ma retry — cenne dane przepadają.

**Plik:** `extensions/modules/bridge-hermes.ts`, `extensions/modules/memory-api.ts`

**Fix:**
- Dodać `AbortSignal.timeout(3000)` do wszystkich fetch
- Dodać retry (2 próby z backoffem 500ms) dla krytycznych zapisów
- Fire-and-forget dla niekrytycznych (logowanie)

**Priorytet:** 🟡 Średni — wisi na localhost, ale może zablokować sesję

---

### 5. 🟡 PUŁAPKA SUBAGENTÓW: Limit Osiągnięty

**Problem:** Wszyscy subagenci na `openrouter:openrouter/free` — darmowe modele mają rate limity (10-20 req/min). 4 równoległych subagentów = 429 Too Many Requests. Do tego jakość security auditu na free modelu to halucynacje.

**Plik:** `settings.json` — subAgents modele

**Fix:**
- `coder` → płatny model (np. deepseek-v4-flash lub claude-haiku)
- `security-auditor` → zawsze strong model
- Dodać rate limiter w task-queue (max 2 równoległe free subagentów)

**Priorytet:** 🟡 Średni — wybuchnie przy pierwszym pipeline

---

> **Koniec wiadomości #1.**
