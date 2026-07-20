#!/bin/bash
# BizTracker Quick Command — горячая клавиша для управления финансами с рабочего стола.
# Вызывает диалоговое окно, отправляет команду AI и показывает результат.

# ===== НАСТРОЙКИ =====
SITE_URL="https://biz-tracker-beta.vercel.app"
API_KEY_FILE="$HOME/.biztracker_key"
QUICK_TOKEN_FILE="$HOME/.biztracker_token" # тот же токен, что в env QUICK_ACCESS_TOKEN на сервере

# Загрузить API ключ
if [ ! -f "$API_KEY_FILE" ]; then
    KEY=$(osascript -e 'display dialog "Введите OpenAI API ключ (сохранится в ~/.biztracker_key):" default answer "" with hidden answer with title "BizTracker — Настройка" with icon note' -e 'text returned of result' 2>/dev/null)
    if [ -z "$KEY" ]; then exit 0; fi
    printf '%s' "$KEY" > "$API_KEY_FILE"
    chmod 600 "$API_KEY_FILE"
fi
OPENAI_KEY=$(cat "$API_KEY_FILE")

QUICK_TOKEN=""
[ -f "$QUICK_TOKEN_FILE" ] && QUICK_TOKEN=$(cat "$QUICK_TOKEN_FILE")

# Показать диалог ввода команды
CMD=$(osascript -e '
display dialog "💼 BizTracker — Быстрая команда

Примеры:
• расход гугл 900$ и комиссию 15%
• заработал 2000 с фриланса
• баланс за месяц
• удали последнюю запись" default answer "" with title "BizTracker AI" with icon note buttons {"Отмена", "Только спросить", "Выполнить"} default button "Выполнить"
set theResult to {button returned of result, text returned of result}
' -e 'item 1 of theResult & "|" & item 2 of theResult' 2>/dev/null)

if [ -z "$CMD" ]; then exit 0; fi

BUTTON=$(echo "$CMD" | cut -d'|' -f1)
MESSAGE=$(echo "$CMD" | cut -d'|' -f2-)

if [ -z "$MESSAGE" ] || [ "$BUTTON" = "Отмена" ]; then exit 0; fi

AUTO="false"
if [ "$BUTTON" = "Выполнить" ]; then
    AUTO="true"
fi

# Собрать JSON безопасно (кавычки/бэкслеши в сообщении не ломают запрос)
TZ_OFFSET=$(python3 -c "import time; print(int(time.timezone/60) if not time.localtime().tm_isdst else int(time.altzone/60))")
BODY=$(MESSAGE="$MESSAGE" AUTO="$AUTO" python3 -c "
import json, os
print(json.dumps({'message': os.environ['MESSAGE'], 'autoConfirm': os.environ['AUTO'] == 'true'}))
")

# Отправить запрос к API
RESPONSE=$(curl -s --max-time 90 -X POST "$SITE_URL/api/ai/quick" \
  -H "Content-Type: application/json" \
  -H "X-OpenAI-Key: $OPENAI_KEY" \
  ${QUICK_TOKEN:+-H "X-Quick-Token: $QUICK_TOKEN"} \
  -H "X-Timezone-Offset: $TZ_OFFSET" \
  -d "$BODY")

# Парсить ответ (текст + результаты действий + ошибки сервера)
RESULT=$(printf '%s' "$RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print('Ошибка связи с сервером'); sys.exit()
if 'error' in d:
    print('Ошибка: ' + str(d['error'])); sys.exit()
lines = [d.get('text', 'Ошибка')]
execs = d.get('executed') or []
if execs:
    lines.append('')
    for e in execs:
        mark = '✅' if e.get('ok') else '❌'
        lines.append(f\"{mark} {e.get('result', '')}\")
print('\n'.join(lines))
")

# Показать результат: текст передаём аргументом, а не интерполяцией в AppleScript
osascript - "$RESULT" <<'APPLESCRIPT' 2>/dev/null
on run argv
    display dialog (item 1 of argv) with title "BizTracker AI" with icon note buttons {"OK"} default button "OK"
end run
APPLESCRIPT

osascript - "$RESULT" <<'APPLESCRIPT' 2>/dev/null
on run argv
    display notification (item 1 of argv) with title "BizTracker"
end run
APPLESCRIPT
