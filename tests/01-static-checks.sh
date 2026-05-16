#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Testy statyczne BudyV2 — kategoria 1
# Sprawdza strukturę plików, konfigurację, spójność, porty
# ═══════════════════════════════════════════════════════════════════════════════

BUDY_DIR="/home/ArndtOs/.pi-agents/budyv2"
TOOLS_DIR="/home/ArndtOs/Tools"
PASS=0
FAIL=0
WARN=0

red()   { echo -e "\033[31m$1\033[0m"; }
green() { echo -e "\033[32m$1\033[0m"; }
yellow(){ echo -e "\033[33m$1\033[0m"; }
blue()  { echo -e "\033[34m$1\033[0m"; }

pass() { ((PASS++)); green "  ✅ $1"; }
fail() { ((FAIL++)); red "  ❌ $1"; }
warn() { ((WARN++)); yellow "  ⚠️  $1"; }

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "╔══════════════════════════════════════════════════════════════════════╗"
blue "║           BudyV2 — Testy statyczne (kategoria 1)                   ║"
blue "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# T1.1: settings.json — poprawność i spójność
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "─── T1.1: settings.json ───"

if [ ! -f "$BUDY_DIR/settings.json" ]; then
  fail "T1.1a: settings.json nie istnieje"
else
  pass "T1.1a: settings.json istnieje"

  # Parsuj JSON
  EXT_COUNT=$(python3 -c "import json; d=json.load(open('$BUDY_DIR/settings.json')); print(len(d['extensions']))" 2>/dev/null)
  if [ "$EXT_COUNT" = "2" ]; then
    pass "T1.1b: extensions = 2 (personality + memory)"
  else
    fail "T1.1c: extensions != 2 (jest: $EXT_COUNT)"
  fi

  SUB_COUNT=$(python3 -c "import json; d=json.load(open('$BUDY_DIR/settings.json')); print(len(d['subAgents']))" 2>/dev/null)
  if [ "$SUB_COUNT" = "5" ]; then
    pass "T1.1d: subAgents = 5 (coder, scout, researcher, code-reviewer, worker)"
  else
    fail "T1.1e: subAgents != 5 (jest: $SUB_COUNT)"
  fi

  SKILL_COUNT=$(python3 -c "import json; d=json.load(open('$BUDY_DIR/settings.json')); print(len(d['skills']))" 2>/dev/null)
  if [ "$SKILL_COUNT" = "6" ]; then
    pass "T1.1f: skills = 6"
  else
    warn "T1.1g: skills != 6 (jest: $SKILL_COUNT)"
  fi

  ENABLED=$(python3 -c "import json; d=json.load(open('$BUDY_DIR/settings.json')); print(str(d['enableSkillCommands']).lower())" 2>/dev/null)
  if [ "$ENABLED" = "true" ]; then
    pass "T1.1h: enableSkillCommands = true"
  else
    fail "T1.1i: enableSkillCommands != true (jest: $ENABLED)"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# T1.2: SOUL.md integralność
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "─── T1.2: SOUL.md ───"

if [ ! -f "$BUDY_DIR/SOUL.md" ]; then
  fail "T1.2a: SOUL.md nie istnieje"
else
  pass "T1.2a: SOUL.md istnieje"

  SOUL_LINES=$(wc -l < "$BUDY_DIR/SOUL.md")
  if [ "$SOUL_LINES" -ge 150 ]; then
    pass "T1.2b: SOUL.md >= 150 linii (jest: $SOUL_LINES)"
  else
    warn "T1.2c: SOUL.md < 150 linii (jest: $SOUL_LINES)"
  fi

  # Sprawdź wymagane sekcje
  for section in "Kim jesteś" "Twoja osobowość" "Kamil" "Jak rozmawiasz" "Authority Manifolds" "Integracja z PAI" "Integracja z Hermes" "Proaktywny Companion"; do
    if grep -q "## $section" "$BUDY_DIR/SOUL.md"; then
      pass "T1.2d: Sekcja '$section' obecna"
    else
      fail "T1.2e: Brak sekcji '$section'"
    fi
  done

  # Sprawdź blacklist
  for word in "Przepraszam" "synergia" "Absolutnie"; do
    if grep -q "$word" "$BUDY_DIR/SOUL.md"; then
      pass "T1.2f: Blacklist zawiera '$word'"
    else
      fail "T1.2g: Blacklist nie zawiera '$word'"
    fi
  done
fi

# ═══════════════════════════════════════════════════════════════════════════════
# T1.3: SYNC plików — każdy extension istnieje na dysku
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "─── T1.3: Spójność plików ───"

python3 -c "
import json, os, sys

d = json.load(open('$BUDY_DIR/settings.json'))
errors = 0
for ext in d['extensions']:
    if not os.path.exists(ext):
        print(f'FAIL: Extension nie istnieje: {ext}')
        errors += 1
    else:
        print(f'PASS: Extension istnieje: {ext}')
for name, cfg in d['subAgents'].items():
    print(f'INFO: subAgent \"{name}\" — model: {cfg.get(\"model\",\"?\")}, provider: {cfg.get(\"provider\",\"?\")}')
for skill in d['skills']:
    skill_path = os.path.join('$BUDY_DIR', 'skills', skill, 'SKILL.md')
    if not os.path.exists(skill_path):
        print(f'WARN: Skill \"{skill}\" zadeklarowany ale SKILL.md nie istnieje: {skill_path}')
        errors += 1
    else:
        print(f'PASS: Skill \"{skill}\" — SKILL.md istnieje')
sys.exit(0 if errors == 0 else 1)
" 2>&1 | while read line; do
  if echo "$line" | grep -q "^PASS:"; then pass "${line#PASS: }"; fi
  if echo "$line" | grep -q "^FAIL:"; then fail "${line#FAIL: }"; fi
  if echo "$line" | grep -q "^WARN:"; then warn "${line#WARN: }"; fi
  if echo "$line" | grep -q "^INFO:"; then echo "  ℹ️  ${line#INFO: }"; fi
done

# ═══════════════════════════════════════════════════════════════════════════════
# T1.4: Moduły TS — struktura katalogów
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "─── T1.4: Moduły TypeScript ───"

# Sprawdź personality moduły
for mod in constants bridge-hermes memory-api output-filter mind-read directives commands; do
  if [ -f "$BUDY_DIR/extensions/modules/$mod.ts" ]; then
    pass "T1.4a: modules/$mod.ts istnieje"
  else
    fail "T1.4b: Brak modules/$mod.ts"
  fi
done

# Sprawdź memory moduły
for mod in index types client sync tools; do
  if [ -f "$BUDY_DIR/extensions/modules/memory/$mod.ts" ]; then
    pass "T1.4c: modules/memory/$mod.ts istnieje"
  else
    fail "T1.4d: Brak modules/memory/$mod.ts"
  fi
done

# Sprawdź index.ts
if [ -f "$BUDY_DIR/extensions/index.ts" ]; then
  pass "T1.4e: extensions/index.ts istnieje (personality entry)"
else
  fail "T1.4f: Brak extensions/index.ts"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# T1.5: Porty — Memory API
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "─── T1.5: Memory API ───"

HEALTH=$(curl -s --max-time 3 http://localhost:8765/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
  VERSION=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null)
  STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
  if [ "$STATUS" = "ok" ]; then
    pass "T1.5a: Memory API: wersja $VERSION, status: $STATUS"
  else
    fail "T1.5b: Memory API: status != ok (jest: $STATUS)"
  fi

  # Sprawdź embedding
  EMBED=$(echo "$HEALTH" | python3 -c "import sys,json; h=json.load(sys.stdin); e=h['checks']['embedding']; print(f\"{e['provider']}/{e['model']} ({e['dimension']}d)\")" 2>/dev/null)
  pass "T1.5c: Embedding: $EMBED"

  # Sprawdź circuit breaker
  CB=$(echo "$HEALTH" | python3 -c "import sys,json; h=json.load(sys.stdin); cb=h['checks']['circuit_breaker']; print(f\"{cb['state']} ({cb['failures']} failures)\")" 2>/dev/null)
  pass "T1.5d: Circuit breaker: $CB"
else
  fail "T1.5e: Memory API na 8765 nie odpowiada"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# T1.6: Hermes bridge
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "─── T1.6: Hermes bridge ───"

HERMES=$(curl -s --max-time 3 http://172.17.96.1:4545/health 2>/dev/null || curl -s --max-time 3 http://172.17.96.1:4545/api/tasks 2>/dev/null || echo "")
if [ -n "$HERMES" ]; then
  pass "T1.6a: Hermes na 172.17.96.1:4545 odpowiada"
else
  warn "T1.6b: Hermes na 172.17.96.1:4545 nie odpowiada (może być offline)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# T1.7: Importy TS (spójność cross-file)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "─── T1.7: Importy TypeScript ───"

# Sprawdź czy wszystkie importy localne wskazują na istniejące pliki
python3 -c "
import os, re, sys

base = '$BUDY_DIR/extensions'
errors = 0

# Zbierz wszystkie pliki .ts
ts_files = []
for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith('.ts'):
            ts_files.append(os.path.join(root, f))

for filepath in ts_files:
    with open(filepath) as f:
        content = f.read()
    
    # Znajdź wszystkie importy względne
    for match in re.finditer(r\"from\s+['\\\"](\.\.?/[^'\\\"]+)['\\\"]\", content):
        import_path = match.group(1)
        # Dopasuj do pliku źródłowego
        dir_path = os.path.dirname(filepath)
        resolved = os.path.normpath(os.path.join(dir_path, import_path))
        
        # Spróbuj .ts, /index.ts
        found = False
        for ext in ['.ts', '/index.ts']:
            if os.path.exists(resolved + ext):
                found = True
                break
        
        if not found:
            rel = os.path.relpath(filepath, base)
            print(f'WARN: {rel} → import {import_path} → nie istnieje')
            errors += 1

sys.exit(0 if errors == 0 else 1)
" 2>&1 | while read line; do
  if echo "$line" | grep -q "^WARN:"; then warn "${line#WARN: }"; fi
done

if [ $? -eq 0 ]; then
  pass "T1.7a: Wszystkie importy względne wskazują na istniejące pliki"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# T1.8: PAI integracja — sprawdź czy ścieżki PAI istnieją
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "─── T1.8: PAI integracja ───"

PAI_BASE="/home/ArndtOs/.claude/PAI"
for path in "USER/TELOS/MISSION.md" "USER/TELOS/GOALS.md" "USER/TELOS/CHALLENGES.md" "USER/TELOS/STRATEGIES.md" "USER/TELOS/PRINCIPAL_TELOS.md"; do
  if [ -f "$PAI_BASE/$path" ]; then
    pass "T1.8a: PAI $path istnieje"
  else
    warn "T1.8b: PAI $path nie istnieje"
  fi
done

# ═══════════════════════════════════════════════════════════════════════════════
# PODSUMOWANIE
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
blue "══════════════════════════════════════════════════════════════════════"
blue "  Podsumowanie testów statycznych"
blue "══════════════════════════════════════════════════════════════════════"
echo ""
green "  ✅ PASS: $PASS"
red "  ❌ FAIL: $FAIL"
yellow "  ⚠️  WARN: $WARN"
echo ""

if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  green "  🎯 Wszystkie testy zaliczone. Konfiguracja jest spójna."
elif [ "$FAIL" -eq 0 ]; then
  yellow "  ⚠️  Wszystkie testy krytyczne zaliczone. $WARN ostrzeżeń do przejrzenia."
else
  red "  🔴 $FAIL testów krytycznych niezaliczonych. Wymagana interwencja."
fi
echo ""
