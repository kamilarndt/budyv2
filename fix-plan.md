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

---

## Wiadomość #2 — Błędy krytyczne (crash, race, konflikt)

**Źródło:** Gemini 3.1 Pro — błędy które "położą system w pierwszych 5 minutach"

### 6. 🔴 BŁĄD KRYTYCZNY: Niezdefiniowany `state.autoEval`

**Problem:** W `index.ts` hook `turn_start` wywołuje `state.autoEval.getAgentStats(agent)`, ale `autoEval` NIGDY nie jest zainicjowany w obiekcie `state`. Skutek: `TypeError: Cannot read properties of undefined` przy każdej turze. Błąd złapany w catch, ale blokuje widget taskQueue i dashboard.

**Plik:** `extensions/index.ts` — obiekt `state` + hook `turn_start`

**Stan faktyczny (po weryfikacji):** ✅ W obecnym kodzie `autoEval` nie występuje. Został usunięty w którejś z poprawek. Zweryfikowano: 0 wystąpień w extensions/. Gemini analizował starszą wersję lub popełnił błąd. Do potwierdzenia z Kamilem.

**Priorytet:** ⚠️ Do weryfikacji — jeśli nie ma, pomijamy.

---

### 7. 🟡 SCHIZOFRENIA PROMPTU: memory_add vs memory-writer

**Problem:** SYSTEM.md nakazuje używać natywnego `memory_add`. Directives (wstrzykiwane przez `before_agent_start`) nakazują delegować do `subagent('memory-writer')`. Model dostaje dwa sprzeczne rozkazy → halucynuje, miesza, traci tokeny na negocjacje wewnętrzne.

**Plik:** `SYSTEM.md` vs `directives.ts (+ before_agent_start)`

**Fix:**
- Wybrać JEDNĄ drogę: albo `memory-writer` subagent (odciąża kontekst), albo natywne `memory_add`
- Rekomendacja: `memory-writer` subagent — to odciąża Budy z pamiętania
- Usunąć wzmianki o `memory_add` z SYSTEM.md
- Dodać w directives: "Tylko subagent('memory-writer') — nigdy nie używaj memory_add bezpośrednio"

**Priorytet:** 🟡 Średni — powoduje halucynacje, ale nie crash

---

### 8. 🟡 ILUZJA ASYNCHRONICZNOŚCI: Race Condition z subagentami

**Problem:** W directives: "Nie czekaj na wynik — subagent działa w tle, czytaj wyniki z plików". LLM działa sekwencyjnie — jeśli Budy od razu po `background: true` spróbuje czytać pliki, subagent jeszcze nie zdążył nic napisać. Dostanie pusty plik → "koder nic nie napisał, blokada".

**Plik:** `directives.ts` — instrukcja "czytaj wyniki z plików"

**Fix:**
- Usunąć "czytaj wyniki z plików" z directives — to nie działa sekwencyjnie
- Zamiast: "Po subagencie → kontynuuj rozmowę. Subagent sam odda wynik jak skończy."
- Pi Agent API: subagent `background: true` → callback/event z wynikiem

**Priorytet:** 🟡 Średni — błędna instrukcja, ale nie blokuje całkowicie

---

### 9. 🟢 MARTWY KONTEKST: Stale Cache TELOS-u

**Problem:** TELOS (Frames, Narratives, Strategies) ładowane synchronicznie `readFileSync` w `session_start` i cache'owane w `state.currentTelosContext`. Jeśli Kamil zmieni strategie w trakcie długiej sesji, Budy nie zobaczy zmian do `/reload`.

**Plik:** `extensions/index.ts` — `session_start` ładuje TELOS tylko raz

**Fix:**
- Odświeżać TELOS w `turn_start` (co turę, nie co sesję) — tanie, bo `readFileSync` na lokalnym FS to <1ms
- Albo: lazy load — czytaj TELOS w `before_agent_start` na każdą turę, nie cache'uj

**Priorytet:** 🟢 Niski — mało prawdopodobne że Kamil zmienia strategie w trakcie sesji

---

> **Koniec wiadomości #2.**

