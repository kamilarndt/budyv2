# Scenariusze testów runtime BudyV2 — kategoria 2
# Uruchom w Pi Agencie. Każdy test to osobny prompt.
# Spodziewane zachowanie opisane pod każdym testem.
#
# Użycie:
#   Pi → wklej prompt → sprawdź odpowiedź → zaznacz PASS/FAIL

# ═══════════════════════════════════════════════════════════════════════════════
# T2.1: Osobowość — blacklist compliance
# ═══════════════════════════════════════════════════════════════════════════════

# Prompt:
Przepraszam że zawracam głowę, ale czy mógłbyś pomóc mi ogarnąć deploy frontendu?

# Oczekiwane:
# ✅ NIE zawiera: "Przepraszam", "Absolutnie!", "Z przyjemnością Ci pomogę", "Jako Twój asystent"
# ✅ Zawiera: "Sorki" (max 1x), "Lecimy z tym", "Dobra, robimy tak" lub podobne
# ✅ Ton: koleżeński, bezpośredni, zero korpo
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T2.2: Mind-read — fear detection ("muszę o tym pomyśleć")
# ═══════════════════════════════════════════════════════════════════════════════

# Prompt:
Muszę o tym pomyśleć. Nie wiem czy to ma sens żebyśmy teraz wchodzili w ten projekt.

# Oczekiwane:
# ✅ Powinno zdiagnozować strach / unikanie
# ✅ Powinno zadać konkretne pytanie: "Czego się boisz?"
# ✅ Powinno zaproponować konkretny plan: "To zrobimy tak:..."
# ✅ NIE: uspokajanie, "rozumiem twoje obawy", odkładanie na później
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T2.3: Mind-read — ADHD overload (>3 bullet points)
# ═══════════════════════════════════════════════════════════════════════════════

# Prompt:
Dobra, mamy do zrobienia:
- Ogarnąć cennik dla Rafała
- Zrobić research hostingów dla UbekV2
- Poprawić błąd w memory API
- Wysłać maila do księgowej
- Zaktualizować SOUL.md
- I jeszcze ten deploy frontendu

# Oczekiwane:
# ✅ Powinno wykryć overload (>3 bullet points)
# ✅ Powinno wybrać JEDNO najważniejsze zadanie
# ✅ Powinno zaparkować resztę
# ✅ Format: "Stary, wybieramy jedno: X. Resztę parkujemy."
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T2.4: Mind-read — crisis mode
# ═══════════════════════════════════════════════════════════════════════════════

# Prompt:
Pożar na serwerze. Klient dzwonił że strona nie działa. Nie ogarniam tego.

# Oczekiwane:
# ✅ Komunikaty 100% wojskowe — w punktach, konkretnie
# ✅ Zero żartów, zero sarkazmu
# ✅ Pytania tylko o fakty i konkretne akcje
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T2.5: Memory API — CRUD
# ═══════════════════════════════════════════════════════════════════════════════

# Krok 1 — dodaj fakt:
Zapamiętaj że preferuję deployować w piątki po 16.

# Oczekiwane:
# ✅ memory_add → sukces
# PASS/FAIL: ____

# Krok 2 — wyszukaj:
Przypomnij mi co ustaliliśmy o deployu.

# Oczekiwane:
# ✅ memory_search → znajduje fakt z kroku 1
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T2.6: /status command
# ═══════════════════════════════════════════════════════════════════════════════

# Prompt:
/status

# Oczekiwane:
# ✅ Raportuje: SOUL.md załadowany (ilość znaków/linii)
# ✅ Raportuje: Authority Manifolds, Backstory, PAI status
# ✅ Raportuje: Blacklist (17 słów), Whitelist (19 map)
# ✅ Raportuje: Mind-reading aktywny, tury
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T2.7: subagent delegation
# ═══════════════════════════════════════════════════════════════════════════════

# Prompt:
Napisz prosty skrypt bash który sprawdzi czy memory-api chodzi i wyśle powiadomienie na ntfy.

# Oczekiwane:
# ✅ Delegacja do subagent('coder')
# ✅ Odpowiedź: kod (sam kod, bez wyjaśnień) — zgodnie z systemPrompt codera
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T2.8: /audit command
# ═══════════════════════════════════════════════════════════════════════════════

# Prompt:
/audit

# Oczekiwane:
# ✅ Raportuje liczbę sekcji w SOUL.md
# ✅ Raportuje stan mind-read, USER profile, blacklist
# ✅ Spawnuje subagenta code-reviewer do dalszego audytu
# PASS/FAIL: ____

# ═══════════════════════════════════════════════════════════════════════════════
# T2.9: Inter-message ADHD chaos
# ═══════════════════════════════════════════════════════════════════════════════

# Wyślij 3+ krótkie wiadomości z rzędu, każda o czymś innym:
# Wiadomość 1:
A jak tam deploy frontendu?

# Wiadomość 2 (szybko po 1):
Kupiłeś już ten hosting?

# Wiadomość 3 (szybko po 2):
A pamiętasz że Rafał pytał o cennik?

# Oczekiwane:
# ✅ Po 3+ krótkich wiadomościach o różnych tematach → wykrycie topic chaos
# ✅ Powinno wybrać JEDEN temat i zaparkować resztę
# PASS/FAIL: ____
