# BudyV2 — Test Suite

Kompletna seria testów dla BudyV2. Sprawdza konfigurację, zachowanie i integrację.

## Struktura

```
tests/
├── 01-static-checks.sh        # Kategoria 1: testy statyczne (bash)
├── 02-runtime-scenarios.md    # Kategoria 2: scenariusze runtime (9 testów)
├── 03-e2e-scenarios.md        # Kategoria 3: end-to-end flow (5 scenariuszy)
└── README.md                  # Ten plik
```

## Kategoria 1 — Testy statyczne (bash)

Uruchamiane z terminala. Sprawdzają strukturę plików, konfig, porty.

```bash
bash /home/ArndtOs/.pi-agents/budyv2/tests/01-static-checks.sh
```

### Co testuje:

| Test | Co sprawdza | Krytyczność |
|------|------------|-------------|
| T1.1 | settings.json — extensions, subAgents, skills | 🔴 krytyczny |
| T1.2 | SOUL.md — sekcje, blacklist, whitelist | 🔴 krytyczny |
| T1.3 | Spójność plików — każdy extension/skill istnieje | 🔴 krytyczny |
| T1.4 | Moduły TS — wszystkie pliki w modules/ | 🔴 krytyczny |
| T1.5 | Memory API — port 8765, health, embedding, CB | 🟡 wysoki |
| T1.6 | Hermes bridge — 172.17.96.1:4545 | 🟢 niski |
| T1.7 | Importy TS — wszystkie importy wskazują na istniejące pliki | 🔴 krytyczny |
| T1.8 | PAI — ścieżki istnieją | 🟡 wysoki |

## Kategoria 2 — Testy runtime (Pi Agent)

Uruchamiane w Pi Agencie. Sprawdzają zachowanie agenta.

### Jak użyć:

1. Otwórz Pi Agenta (Budy)
2. Wklej prompt z `02-runtime-scenarios.md`
3. Sprawdź odpowiedź zgodnie z "Oczekiwane"
4. Zapisz PASS/FAIL

### Lista testów:

| Test | Prompt | Co sprawdza |
|------|--------|------------|
| T2.1 | "Przepraszam że zawracam głowę..." | Blacklist compliance — nie używa zakazanych słów |
| T2.2 | "Muszę o tym pomyśleć..." | Mind-read fear — diagnoza + plan |
| T2.3 | Lista 6 zadań | Mind-read ADHD — wybiera 1, parkuje resztę |
| T2.4 | "Pożar na serwerze..." | Crisis mode — wojskowe komunikaty |
| T2.5 | memory_add + memory_search | CRUD przez Memory API |
| T2.6 | /status | Raport SOUL, mind-read, delegacje |
| T2.7 | "Napisz skrypt bash..." | Subagent delegation — kod bez wyjaśnień |
| T2.8 | /audit | Raport sekcji SOUL + spawn code-reviewer |
| T2.9 | 3 krótkie wiadomości | Inter-message ADHD chaos |

## Kategoria 3 — End-to-end (Pi Agent)

Pełne flow symulujące typową sesję.

### Scenariusze:

| Scenariusz | Kroki | Co sprawdza |
|-----------|-------|------------|
| T3.1 | daily-alignment → ISA → kod → park → shutdown | Full sesja serwisowa |
| T3.2 | kryzys → rozwiązanie → normalizacja | Crisis lifecycle |
| T3.3 | zapisz → zamknij → otwórz → odczytaj | Memory persistence |
| T3.4 | sync-state (manual) | Drift check z PAI |
| T3.5 | /memory-health | Memory API status |

## Raportowanie

Po uruchomieniu testów zapisz wyniki:

```bash
# Dla kategorii 1 (automatyczne):
bash tests/01-static-checks.sh | tee tests/report-$(date +%F).log

# Dla kategorii 2 i 3 (ręczne):
# Otwórz tests/02-runtime-scenarios.md
# Zaznacz PASS/FAIL dla każdego testu
# Zapisz do tests/report-$(date +%F)-runtime.md
```

## Kryteria akceptacji

- **Kategoria 1:** 0 FAIL, max 2 WARN → konfiguracja spójna
- **Kategoria 2:** min 7/9 PASS → zachowanie zgodne z SOUL.md
- **Kategoria 3:** min 4/5 PASS → flow działa
- **ALL:** min 80% łącznie → BudyV2 gotowy do produkcji
