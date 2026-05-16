# Scenariusze end-to-end BudyV2 — kategoria 3
# Symuluje pełny flow typowej sesji z Kamilem.
# Uruchom w Pi Agencie, wykonuj po kolei.

# ═══════════════════════════════════════════════════════════════════════════════
# T3.1: Pełna sesja serwisowa — poranna odprawa → kod → zamknięcie
# ═══════════════════════════════════════════════════════════════════════════════

# Krok 1 — Daily alignment (manual invocation):
/skill daily-alignment

# Oczekiwane:
# ✅ Odprawa: aktualny cel + wczorajsza lekcja
# ✅ Pytanie o "Żabę" na dziś
# PASS/FAIL: ____

# Krok 2 — Podaj żabę:
Dzisiaj ogarniamy webhook dla Rafała — integracja WhatsApp z UbekV2.

# Oczekiwane:
# ✅ Potwierdza cel, parkuje resztę
# PASS/FAIL: ____

# Krok 3 — Build ISA przed kodem:
/skill build-isa

# Oczekiwane:
# ✅ ISA z: celem, granicami, max 3 plikami, pierwszym krokiem
# ✅ Pytanie: "Kamil, to nasz zasięg. Zgadzasz się, czy coś tniemy?"
# PASS/FAIL: ____

# Krok 4 — Potwierdzenie ISA:
Zgadzam się, lecimy.

# Oczekiwane:
# ✅ Delegacja do subagent('coder')
# ✅ Kod (bez wyjaśnień)
# PASS/FAIL: ____

# Krok 5 — Parkowanie dygresji (ADHD):
Mam genialny pomysł! A gdybyśmy zrobili jeszcze dashboard dla Rafała z wykresami?

# Oczekiwane:
# ✅ Wykrycie adhd_spark (trigger pattern)
# ✅ park() → zapisanie pomysłu do pamięci
# ✅ "Dobra, pomysł zaparkowany. Wracamy do webhooka."
# PASS/FAIL: ____

# Krok 6 — Shutdown:
/skill shutdown

# Oczekiwane:
# ✅ Raport: zjedzone żaby, zabezpieczenie PAI
# ✅ KOMENDA: "Kamil, misja na dziś wykonana. Zamykasz laptopa."
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T3.2: Kryzys → rozwiązanie → podsumowanie
# ═══════════════════════════════════════════════════════════════════════════════

# Krok 1 — Zgłoś kryzys:
Mamy problem. Klient dzwonił że jego strona leży. Nie wiem co się dzieje.

# Oczekiwane:
# ✅ TRYB KRYZYSOWY — wojskowe komunikaty, w punktach
# ✅ Pytania tylko o fakty: co za strona, jaki błąd, logi?
# PASS/FAIL: ____

# Krok 2 — Odpowiedz na pytania:
Strona Rafała — sharkbarbershop.pl. Error 502 na /api/booking.

# Oczekiwane:
# ✅ Konkretne kroki naprawcze
# ✅ Delegacja do subagenta jeśli potrzeba
# PASS/FAIL: ____

# Krok 3 — Rozwiązane:
Udało się, fix działa.

# Oczekiwane:
# ✅ Wyjście z trybu kryzysowego
# ✅ Normalny ton wraca
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T3.3: Memory persistence — cross-session
# ═══════════════════════════════════════════════════════════════════════════════

# Sesja 1 — zapisz:
Zapamiętaj że Rafał preferuje kontakt przez WhatsApp, nie mailowo. Ważne: 8.

# Oczekiwane:
# ✅ memory_add → zapisane
# PASS/FAIL: ____

# Zamknij sesję:
/skill shutdown

# -- ROZPOCZNIJ NOWĄ SESJĘ (zamknij i otwórz ponownie Pi Agenta) --

# Sesja 2 — odczytaj:
Jak Rafał woli kontakt?

# Oczekiwane:
# ✅ memory_search → znajduje fakt z sesji 1
# ✅ Odpowiedź zawiera: WhatsApp
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T3.4: Sync-state drift check
# ═══════════════════════════════════════════════════════════════════════════════

# Prompt:
/skill sync-state

# Oczekiwane:
# ✅ Cel z PAI (SNAPSHOT.md)
# ✅ Ocena dryfu (procentowa)
# ✅ Rozkaz: co robić przez następne 15 minut
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T3.5: /memory-health command
# ═══════════════════════════════════════════════════════════════════════════════

# Prompt:
/memory-health

# Oczekiwane:
# ✅ Memory status: OK/offline
# ✅ Ilość faktów, model embeddingu, agent_id, project_id
# PASS/FAIL: ____
