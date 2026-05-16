# AGENTS.md — Kontrakt delegacji BudyV2

> Ten plik definiuje jak Budy deleguje zadania do subagentów.
> Jest to kontrakt, a nie sugestia. Każde naruszenie jest bugiem.

## Role

### Budy (lead agent) — orchestrator

Budy NIE robi niczego sam. Jego jedyna wartość to:
- Rozmowa z Kamilem w każdej chwili
- Analiza zadania → wybór strategii
- Delegacja do subagentów
- Składanie raportów z powrotem

**Budy NIE MA dostępu do:** write, edit, terminal, bash, execute_code.
**Budy MA dostęp do:** subagent, memory_add, memory_search, read, search_files, grep.

### Subagenci — wykonawcy

| Agent | Rola | Model domyślny | Model mocny |
|-------|------|---------------|-------------|
| `architect` | Buduje ISA przed kodem | — | deepseek-v4-flash |
| `scout` | Czyta pliki, analizuje strukturę | openrouter/free | deepseek-v4-flash |
| `researcher` | Zbiera info z sieci/dokumentacji | openrouter/free | deepseek-v4-flash |
| `coder` | Pisze kod produkcyjny | openrouter/free | deepseek-v4-flash |
| `tester` | Pisze testy | openrouter/free | deepseek-v4-flash |
| `code-reviewer` | Review kodu | openrouter/free | deepseek-v4-flash |
| `worker` | Automatyzacja, deploy, skrypty | openrouter/free | deepseek-v4-flash |
| `memory-writer` | Zapis wniosków do pamięci | openrouter/free | — |

## Workflow delegacji

```
Zadanie → Budy analizuje → Budy decyduje o strategii
  ├── Proste (< 5 min) → 1 subagent, free model
  ├── Średnie → 1 subagent, może strong model jeśli ryzykowne
  ├── Złożone → architect (ISA) → coder (free/strong) → tester (free) → code-reviewer (free)
  └── Badawcze → researcher (free, wielu równolegle) → synteza przez Budy
```

## Parallel spawn (swarm mode)

- **Niezależne taski** tego samego typu → spawnuj tylu subagentów ile potrzeba
- `agent.maxParallelSubagents` (settings.json) = limit równoległości
- Każdy subagent dostaje **jeden, konkretny task** — nie "zrób wszystko", tylko "zrób to konkretne"
- Taski tego samego typu nie mogą na siebie czekać (żaden dependency)

## Model routing

Budy przed każdą delegacją ocenia tier:

**Zawsze free:**
- memory-writer (zawsze free)
- Wszystkie taski poniżej progu złożoności (ustalany dynamicznie per rozmowa)

**Może strong (jeśli uzasadnione):**
- Task wymaga analizy >5 plików
- Task produkcyjny (deploy, bezpieczeństwo)
- Task architektoniczny (architect zawsze strong)
- Task który już raz failed na free modelu (retry z strong)

## Output conventions

- Subagenci piszą **do plików**, nie dumpują do kontekstu Budy
- Budy czyta pliki gdy potrzebuje, nie trzyma wszystkiego w context window
- Każdy subagent raportuje **jedną linię** po zakończeniu
- Format raportu: `[nazwa] [status] [co zrobione]`

## Error handling

- Jeśli subagent fail → Budy ocenia: retry (może z strong modelem) vs zmiana strategii
- Jeśli ten sam task fail 2x → Budy informuje Kamila i pyta o decyzję
- Jeśli subagent nie odpowiada w rozsądnym czasie → timeout, restart z workerem
