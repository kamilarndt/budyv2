# BudyV2

**Pi Agent subagent factory — 8 subagentów, task queue, model router, TUI dashboard.**

BudyV2 to system subagentów dla Pi Agent. Budy jest orkiestratorem — nie pisze kodu, nie edytuje plików, nie odpala komend. Każde zadanie deleguje do odpowiedniego subagenta.

## Architektura

```
Budy (orchestrator)
  ├── architect     → ISA przed kodem (zawsze strong model)
  ├── scout         → czyta pliki, analizuje strukturę
  ├── researcher    → zbiera info z sieci/dokumentacji
  ├── coder         → pisze kod produkcyjny (TypeScript strict)
  ├── tester        → pisze testy, uruchamia przed oddaniem
  ├── code-reviewer → review kodu (problem + fix)
  ├── worker        → automatyzacja, deploy, skrypty
  └── memory-writer → zapis wniosków do pamięci długoterminowej
```

## Kluczowe cechy

- **Zero tooli wykonawczych dla Budy** — write/edit/terminal/bash zablokowane
- **Model routing** — free (openrouter/free) domyślnie, strong (deepseek-v4-flash) dla złożonych zadań
- **Task queue** — kolejka zadań z równoległym spawnem (swarm mode)
- **TUI dashboard** — widok fabryki subagentów odświeżany na każdej turze
- **AGENTS.md** — kontrakt delegacji (kiedy spawn, jak raportować, error handling)

## Struktura

```
├── agents/              # Definicje subagentów (.md z frontmatterem)
│   ├── architect.md
│   ├── coder.md
│   ├── code-reviewer.md
│   ├── memory-writer.md
│   ├── researcher.md
│   ├── scout.md
│   ├── tester.md
│   └── worker.md
├── extensions/          # Pi Agent extensions (TypeScript)
│   ├── index.ts         # Entry point — hooki, tool restriction, dashboard
│   └── modules/
│       ├── task-queue.ts     # Kolejka zadań + swarm mode
│       ├── model-router.ts   # Free/strong routing
│       ├── task-dashboard.ts # TUI widget
│       ├── directives.ts     # Operational directives
│       ├── mind-read.ts      # ADHD chaos detection
│       ├── output-filter.ts  # Blacklist/whitelist
│       ├── memory-api.ts     # Memory API client
│       ├── bridge-hermes.ts  # Hermes integration
│       ├── constants.ts      # Stałe
│       └── commands.ts       # Custom commands
├── AGENTS.md             # Kontrakt delegacji
├── SOUL.md               # Osobowość Budy
├── settings.json         # Konfiguracja Pi Agent
└── tests/                # Testy
```

## Wymagania

- Pi Agent (runtime)
- OpenRouter API key (free tier)
- Memory API v2 (opcjonalnie)