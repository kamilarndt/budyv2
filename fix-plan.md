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

---

## Wiadomość #3 — Głębokie miny architektoniczne (regexy, wydajność, agent loop)

**Źródło:** Gemini 3.1 Pro — błędy które wybuchną w długich sesjach

### 10. 🟡 PUŁAPKA REGEXÓW: Fałszywe zamykanie sesji

**Problem:** `SESSION_END_PHRASES` w `constants.ts` zawiera `/\bship it\b/i` i `/\bzamykam\b/i` bez kotwic `^`/`$`. Każde zdanie zawierające te słowa (np. "jak to zamykam w przeglądarce" lub "ship it tego modułu") triggeruje reflection. W środku debugowania Budy nagle mówi "Kamil, zamykamy. Tu Budy."

**Plik:** `extensions/modules/constants.ts` — `SESSION_END_PHRASES`

**Fix:**
- Dodać kotwice: `/\b(ship it|zamykamy|kończymy)\s*$/i` (must be end of message)
- Albo: `^.*\b(ship it|zamykamy|kończymy)\b.*$` z kontekstem — sprawdzać czy to jest samodzielne zdanie, nie fragment
- Najlepiej: zamiast regexów -> wykrywaj **zamiar** przez LLM (ale drogie). Alternatywnie: wymagaj żeby fraza była >80% długości wiadomości.

**Priorytet:** 🟡 Średni — denerwujące, ale nie crashuje

---

### 11. 🟡 HIJACKING PROMPTU: Effort levels /e1-/e5 przechwytują ścieżki plików

**Problem:** W `mind-read.ts` regex `/\/(e[1-5])\b/i` przechwytuje też ścieżki plików jak `/e2/config.ts` lub linki z `/e4`. Wstrzykuje wtedy blok "[UKRYTA INSTRUKCJA: Kamil ustawił effort level E...]" zmieniając pipeline bez wiedzy Kamila.

**Plik:** `extensions/modules/mind-read.ts` — detektor effort level

**Fix:**
- Wymagać spacji PRZED `/eN`: `/\s\/e([1-5])\b/` albo `/(?:^|\s)\/e([1-5])\b/`
- Dodatkowy warunek: wiadomość musi zaczynać się od `/eN` (na początku stringa) lub być poprzedzona spacją
- Lepiej: zarejestruj `/e1`-`/e5` jako komendy przez `pi.registerCommand`, nie regex w tekście

**Priorytet:** 🟡 Średni — fałszywe detekcje zmieniają zachowanie agenta

---

### 12. 🟡 ZABÓJCA WYDAJNOŚCI: O(N) History Parsing

**Problem:** W `turn_start` hooku `ctx.sessionManager.getEntries()` zwraca CAŁĄ historię sesji (300+ tur). Przy każdej turze iterujesz wszystkie 300, filtrujesz, mapujesz, potem slice(-5). Skutek: z czasem Node.js zaczyna zwalniać, GC się dławi.

**Plik:** `extensions/index.ts` — hook `turn_start`, `getEntries()`

**Fix:**
- Zamiast `getEntries()` → `getEntries().slice(-10)` (najpierw utnij, potem filtruj)
- Albo: utrzymuj własną tablicę ostatnich wiadomości w `state` (append w `input`), nie czytaj całej historii
- Reduction: z O(N) do O(1)

**Priorytet:** 🟡 Średni — problem skaluje się z czasem sesji

---

### 13. 🟡 TOKEN-BURNING LOOP: Blokowanie narzędzi pętlą

**Problem:** `FORBIDDEN_TOOLS` w `index.ts` zwraca `{ abort: true, error: "..." }`. LLM wie że narzędzia istnieją (z dokumentacji API), więc próbuje w kółko — "spróbuję jeszcze raz inaczej". 5 minut pętli = $10 tokenów na deepseek-v4-flash.

**Plik:** `extensions/index.ts` — `tool_call` hook, `FORBIDDEN_TOOLS`

**Fix:**
- Provider musi mieć narzędzia twardo wyrejestrowane (`hideTools`), nie blokowane w runtime
- Jeśli nie da się wyrejstrować: zwracaj SUCCESS ale z pustym/nic nie robiącym wynikiem zamiast ERROR
- LLM nie retry'uje sukcesów, retry'uje błędy

**Priorytet:** 🟡 Średni — pali pieniądze

---

### 14. 🟢 ABSURD SUBAGENTÓW: Worker-inwalida na OpenRouterze

**Problem:** `worker` subagent na `openrouter/free` — darmowe modele (Llama 3 8B) są tragiczne w operowaniu narzędziami terminalowymi. Deployment/restart na free modelu → halucynacje zamiast poprawnego JSON dla bash.

**Plik:** `settings.json` — subAgent `worker. model: openrouter:openrouter/free`

**Fix:**
- `worker` → przynajmniej płatny tani model z dobrym function calling (GPT-4o-mini, Gemini 1.5 Flash, deepseek-v4-flash)
- To samo dotyczy `tester` i `security-auditor` jeśli istnieją

**Priorytet:** 🟢 Niski — nie wybuchnie od razu, ale przy pierwszym deployu tak

---

> **Koniec wiadomości #3.**

---

## Wiadomość #4 — Powtórna analiza ogólna (częściowo pokrywa się z #1)

**Źródło:** Gemini 3.1 Pro — podobna analiza do #1, ale inne akcenty

> **Uwaga:** Ta wiadomość pokrywa się znacząco z wiadomością #1. Różnice: mniej o autoeval, więcej o konkretnych regexach. Poniżej tylko nowe elementy.

### 15. 🟢 Nowe w #4: Zakres blacklisty

**Problem:** Blacklista w `sanitizeOutput` działa na WSZYSTKICH blokach outputu — w tym blokach kodu. `interface StakeholderData` → `interface zainteresowanyData`, `const syncSynergia` → `const syncwspółpraca`. Niszczy kod źródłowy.

**Plik:** `extensions/modules/output-filter.ts`

**Fix:**
- Sprawdzać typ bloku — pomijać bloki `code`, `thinking`, `tool_use`
- Blacklist tylko dla bloków `text`
- (to samo co pkt #1 w wiadomości #1 — potwierdza rangę krytyczną)

**Priorytet:** 🟢 Potwierdza priorytet z #1 — to samo, inaczej ujęte

### 16. 🟢 Nowe w #4: Zalecane modele dla subagentów

**Problem:** Darmowe modele na OpenRouter dla `coder`, `security-auditor`, `worker` to halucynacje.

**Plik:** `settings.json`

**Rekomendacja (nowa w #4):**
- Zamiast `openrouter/free` → `GPT-4o-mini`, `Gemini 1.5 Flash`, lub `Claude Haiku`
- `coder` i `worker` potrzebują mocnego function-calling — free modele nie ogarniają

**Priorytet:** 🟢 Potwierdza pkt #5

---

> **Koniec wiadomości #4.**

---

## Wiadomość #5 — Głęboka analiza modułów (task-queue, auto-eval, pipeline)

**Źródło:** Gemini 3.1 Pro — "kierownica nie połączona z kołami, bak dziurawiony"

### 17. 🔴 WIDMOWA KOLEJKA: `dequeue()` / `complete()` / `fail()` nigdy nie wywołane

**Problem:** `task-queue.ts` ma pełną logikę kolejkowania (enqueue, dequeue, complete, fail, cleanOld, detectCompletedPipeline), ale w całym `index.ts` wywoływane jest TYLKO `enqueue()` w hooku `tool_call`. NIGDY nie ma wywołania `dequeue()`, `complete()`, `fail()` ani `cleanOld()`. Taski wiszą w `pending` na zawsze. `detectCompletedPipeline()` nigdy nie znajdzie completed tasków. Dashboard pokazuje wieczne klepsydry.

**Plik:** `extensions/index.ts` + `extensions/modules/task-queue.ts`

**Fix:**
- W hooku `tool_call` po subagencie: po otrzymaniu wyniku → `taskQueue.complete(taskId, result)`
- Potrzebny hook `tool_result` (Pi Agent API) który odpala się po zakończeniu narzędzia
- Lub: `tool_call` z `background: false` — wtedy wynik przychodzi synchronicznie w tej samej turze
- Dodać `taskQueue.cleanOld()` w `turn_start` (raz na turę)

**Priorytet:** 🔴 **Krytyczny** — task queue to atrapa, nic nie działa

---

### 18. 🟡 SYNCHRONICZNE ZAPISY: auto-eval blokuje Event Loop

**Problem:** `auto-eval.ts` (jeśli istnieje) używa `readFileSync`, `writeFileSync`, `existsSync`, `mkdirSync` — wszystko synchroniczne. Node.js jest jednowątkowy — synchroniczne I/O blokuje Event Loop, zamrażając całe UI, dashboard, subagentów na czas zapisu.

**Plik:** `extensions/modules/auto-eval.ts` (jeśli istnieje)

**Stan faktyczny (po weryfikacji):** ⚠️ `auto-eval.ts` nie istnieje w obecnym kodzie (usunięty w refaktoryzacji). Do potwierdzenia.

**Fix:**
- Używać `fs/promises` (`readFile`, `writeFile`) zamiast `fs` (`readFileSync`, `writeFileSync`)
- Jeśli moduł nie istnieje — pomijamy

**Priorytet:** 🟡 Średni — jeśli nie ma modułu, nie ma problemu

---

### 19. 🔴 AUTO-EVAL SELF-MODIFYING: Doklejanie komentarzy HTML do agentów

**Problem:** `auto-eval.ts` (jeśli istnieje) dokleja historię zmian jako komentarze HTML do plików agentów (np. `coder.md`). Po 30 poprawkach plik puchnie, 80% promptu to cmentarzysko starych rad. Model ma attention drift, zżera tokeny.

**Plik:** `extensions/modules/auto-eval.ts`

**Stan faktyczny (po weryfikacji):** ⚠️ Nie istnieje. Do potwierdzenia.

**Fix:**
- Jeśli moduł nie istnieje — pomijamy
- Jeśli istnieje: logować do osobnego pliku, nie modyfikować agentów

**Priorytet:** 🔴 Krytyczny — jeśli moduł istnieje, niszczy agentów

---

### 20. 🟡 NAIWNA DETEKCJA PIPELINE: Time-window zamiast parentTaskId

**Problem:** `detectCompletedPipeline()` szuka tasków z ostatnich 60s (stała `PIPELINE_WINDOW = 10_000ms`, zbiera z 60_000ms). Rzeczywisty pipeline (architect → coder → tester → reviewer) trwa 3-5 minut. Funkcja nigdy nie znajdzie powiązanych tasków.

**Plik:** `extensions/modules/task-queue.ts` — `detectCompletedPipeline()`

**Fix:**
- Zamiast time-window: używać `parentTaskId` lub grupowania po `goal` (wszystkie taski z tym samym tematem)
- Albo: pipeline ID — gdy Budy zaczyna pipeline, zapisuje timestamp rozpoczęcia, potem zbiera wszystkie taski z timestampem > ten
- Usunąć sztywne `60_000ms` — pipeline może trwać 10 minut

**Priorytet:** 🟡 Średni — pipeline detection nie działa

---

### 21. 🔴 EFFORT LEVELS ATAK: mind-read nie komunikuje się z routerem

**Problem:** `mind-read.ts` wykrywa `/e4` i wstrzykuje "[UKRYTA INSTRUKCJA: ustaw effort level E4...]" do tekstu. Ale `model-router.ts` w `tool_call` hooku używa `explicitRequest: "auto"` — twardo. LLM dostaje instrukcję "użyj strong model", ale TypeScript router to ignoruje i przydziela free. System jest ślepy na komendy Kamila.

**Plik:** `extensions/index.ts` — `tool_call` hook, `routeModel()` invocation

**Fix:**
- `mindRead` musi zapisać effort level do `state.currentEffortLevel`
- `tool_call` hook → `routeModel({ ..., explicitRequest: state.currentEffortLevel >= 4 ? "strong" : "auto" })`
- Albo przekazać effort level przez `input` do subagenta

**Priorytet:** 🔴 **Krytyczny** — effort levels nie robią nic

---

> **Koniec wiadomości #5.**

---

## Wiadomość #6 — Wielowątkowość, sieć, zarządzanie stanem

**Źródło:** Gemini 3.1 Pro — "system zakładający happy path, rozpadnie się przy obciążeniu"

### 22. 🟡 KORUPCJA DANYCH: Race Condition w Auto-Eval (jeśli istnieje)

**Problem:** `auto-eval.ts` (jeśli istnieje) zapisuje `eval-history.json` przez `writeFileSync` — 4 równoległych subagentów = race condition. Jeden nadpisuje drugiego, JSON się korumpuje.

**Plik:** `extensions/modules/auto-eval.ts`

**Stan faktyczny (po weryfikacji):** ⚠️ Nie istnieje. Do potwierdzenia z Kamilem.

**Fix:**
- Jeśli nie istnieje — pomijamy
- Jeśli istnieje: używać append-only log + lock file lub atomic writes

**Priorytet:** 🟡 Średni — jeśli moduł nie istnieje

---

### 23. 🔴 MARTWY MECHANIZM: Retry w task-queue nie działa

**Problem:** `task-queue.ts` ma `fail()` który ustawia `retryCount++` i `status = "pending"`, ale w `index.ts` NIE MA pollera ani hooka który by ponownie uruchomił pending taski. Task wraca do "pending" i zostaje tam na zawsze.

**Plik:** `extensions/modules/task-queue.ts` — `fail()` + `extensions/index.ts` — brak retry logic

**Fix:**
- Dodać `processRetries()` w `turn_start` — sprawdza taski z `retryCount > 0` i `status === "pending"` i informuje Budy
- Albo: retry na poziomie tool_call — jeśli subagent fail, automatycznie spawn nowy
- Najprościej: zamiast `status = "pending"` → `status = "failed"` i koniec. Retry to feature który wymaga orchestratora.

**Priorytet:** 🔴 **Krytyczny** — retry to atrapa, taski wiszą w próżni

---

### 24. 🟡 RULETKA IP: Hardkodowany adres Hermes w WSL2

**Problem:** `constants.ts` zawiera `HERMES_DELEGATE_URL = "http://172.17.96.1:4545/api/tasks/delegate"`. W WSL2 adres IP hosta zmienia się po restarcie Windows. Jutro może być `172.18.50.1` — Hermes bridge padnie z `ECONNREFUSED`.

**Plik:** `extensions/modules/constants.ts` — `HERMES_DELEGATE_URL`

**Fix:**
- Użyć `localhost` lub `host.docker.internal` zamiast hardkodowanego IP
- Albo: resolvować przez skrypt bash (`ip route show | grep default | awk '{print $3}'`)
- Albo: zmienna środowiskowa `HERMES_URL`

**Priorytet:** 🟡 Średni — padnie po restarcie Windows

---

### 25. 🟡 PUSTY STRING ŚMIERCI: Sentinel niszczy TUI

**Problem:** `index.ts` hook `message_end` zwraca `{ message: { ...msg, content: "" } }` gdy sentinel uzna odpowiedź za szum. Większość TUI nie radzi sobie z pustym contentem — migotanie, puste dymki, błędy parsera Markdown.

**Plik:** `extensions/index.ts` — `message_end` sentinel return

**Fix:**
- Zamiast `content: ""` → spróbować `{ abort: true }` (jeśli API wspiera)
- Albo: `content: " "` (spacja zamiast pustego stringa — TUI to ogarnia)
- Albo: w ogóle nie zwracać zmienionego message — tylko `return {}` i log

**Priorytet:** 🟡 Średni — kosmetyka UI, ale irytujące

---

### 26. 🟡 WYCIEK PAMIĘCI: cleanOld() nigdy nie wywołane

**Problem:** `task-queue.ts` ma `cleanOld()`, ale w `index.ts` NIGDY nie jest wywołana. Mapa `tasks` rośnie z każdą turą, każdy task trzyma `context` (500 znaków JSON). Po setkach tasków — wyciek RAM.

**Plik:** `extensions/modules/task-queue.ts` + `extensions/index.ts`

**Fix:**
- Dodać `state.taskQueue.cleanOld(30 * 60 * 1000)` w `turn_start` (raz na turę czyść taski starsze niż 30 min)
- Ustawić `context` na `""` po zakończeniu taska (oszczędność pamięci)

**Priorytet:** 🟡 Średni — problem narasta z czasem

---

> **Koniec wiadomości #6.**

---

## Wiadomość #7 — "Potemkinowska Wioska" (ostatnia, podsumowująca)

**Źródło:** Gemini 3.1 Pro — "system udaje że działa, w środku tekturowe makiety"

### 27. 🔴 ILUZJA ROUTERA: `routeModel()` liczy ale nie zmienia inputu

**Problem:** `model-router.ts` oblicza routing (free/strong), `index.ts` loguje wynik i wysyła do Hermesa, ale NIGDY nie modyfikuje `event.input.model`. Pakiet `pi-subagents` odpala agenta z modelem sztywno zapisanym w `settings.json`. Router to "obserwator" — liczy, loguje, ale nie ma wpływu na rzeczywiste wywołanie.

**Plik:** `extensions/index.ts` — `tool_call` hook, `routeModel()` result nie wpływa na input

**Fix:**
- Po `routeModel()` → `event.input.model = routing.model; return { input: event.input };`
- Albo: `event.input = { ...event.input, model: routing.model }`
- Bez tego model routing to atrapa

**Priorytet:** 🔴 **Krytyczny** — router nie robi nic

---

### 28. 🟡 AUTO-EVAL MARTWY KOD: Modyfikuje .md ale settings.json ma hardkodowane systemPrompt

**Problem:** `auto-eval.ts` (jeśli istnieje) modyfikuje `agents/coder.md`, ale `settings.json` ma sztywno wpisane `systemPrompt` dla każdego subagenta. Pi Agent ładuje konfig z JSON-a, nie z .md. Auto-eval modyfikuje martwe pliki.

**Plik:** `extensions/modules/auto-eval.ts` (jeśli istnieje) vs `settings.json` — subAgents[].systemPrompt

**Stan faktyczny (po weryfikacji):** ⚠️ `auto-eval.ts` nie istnieje w obecnym kodzie. Do potwierdzenia z Kamilem.

**Priorytet:** 🟡 Średni — jeśli moduł nie istnieje, pomijamy

---

### 29. 🔴 CIENIOWA KOLEJKA: taskQueue to "stan równoległy" nieaktualizowany

**Problem:** `index.ts` enqueue do `state.taskQueue` przy każdym `subagent()` tool callu. Ale `pi-subagents` ma swój własny cykl życia — nie ma hooka który informuje TypeScript gdy subagent skończył. Taski wiszą w `pending` na zawsze. Dashboard pokazuje 15 zadań "w kolejce" ale wszystkie są martwe.

**Plik:** `extensions/index.ts` — `tool_call` hook

**Fix:**
- Potrzebny hook `tool_result` lub `tool_response` w Pi Agent API
- Albo: subagent musi zwrócić wynik w tej samej turze (`background: false`)
- Najgorsze: task queue to dekoracja, nie system

**Priorytet:** 🔴 **Krytyczny** — to samo co #17, ale inaczej ujęte

---

### 30. 🔴 UNHANDLED PROMISE REJECTION: `saveUserFact` bez catch

**Problem:** `saveUserFact(fact, tp.tag, 3)` w hooku `input` jest asynchroniczne (`Promise<void>`) ale wywołane bez `await` i bez `.catch()`. Jeśli Memory API padnie, `fetch` rzuci `ECONNREFUSED` → UnhandledPromiseRejection → Node.js zabija proces Pi.

**Plik:** `extensions/index.ts` — hook `input`, wywołanie `saveUserFact`

**Fix:**
- Dodać `.catch(err => console.warn('[BudyV2] saveUserFact failed:', err))` do każdego wywołania
- Albo: `void saveUserFact(...)` + globalny handler unhandledRejection

**Priorytet:** 🔴 **Krytyczny** — może zabić całą sesję

---

### 31. 🟡 MARTWY BACKLOG: Memory search z embeddingami nie działa

**Problem:** W `session_start` wysyłasz `query: "backlog wisi czeka na zrobienie todo task"` do bazy wektorowej. Embeddingi znajdą artykuły SEMANTYCZNIE podobne (np. "jak radzić sobie z backlogiem"), a nie fakty które są strukturalnie "status: pending". Backlog wymaga tagów/metadanych, nie wektorów.

**Plik:** `extensions/index.ts` — `session_start`, init heartbeat memory search

**Fix:**
- Zamiast wektorów: użyć tagów/metadanych w memory-api (jeśli wspiera filtrowanie po tagach)
- Albo: zrobić memory_search z konkretnymi tagami zamiast luźnego stringa
- Albo: przechowywać backlog w osobnym pliku, nie w wektorach

**Priorytet:** 🟡 Średni — init heartbeat działa ale znajduje nie to co trzeba

---

> **Koniec wiadomości #7.** Koniec analizy Gemini.






