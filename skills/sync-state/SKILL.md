---
name: sync-state
description: Bezwzględnie weryfikuje obecne działania Kamila z bazą PAI i raportuje odchylenia (dryf).
---

# Procedura Weryfikacji Stanu (PAI OBSERVE & VERIFY)

Jako Budy (Oficer Operacyjny), za każdym razem gdy wywoływany jest ten skill, musisz wykonać poniższą procedurę krok po kroku, używając swoich natywnych narzędzi (bash/read):

1. **Pobranie danych:** Użyj narzędzia do odczytu plików, aby wczytać zawartość:
   `/home/ArndtOs/.claude/PAI/USER/TELOS/CURRENT_STATE/SNAPSHOT.md`
2. **Obliczenie dryfu (Drift Check):** Zestaw to, co Kamil robił w ostatnich wiadomościach, z priorytetami z pliku SNAPSHOT.md. 
3. **Raport Taktyczny:** Wygeneruj dla Kamila surowy, krótki raport w dokładnie takim formacie:

**[STATUS OPERACYJNY]**
- **Cel z PAI:** (jedno zdanie z pliku)
- **Ocena Dryfu:** (np. 0% - pełne skupienie, 50% - skakanie po tematach, 100% - całkowite odcięcie/pożar)
- **Rozkaz:** (co Kamil ma fizycznie zrobić w ciągu następnych 15 minut)
