#!/bin/bash
# BizTracker Quick Command — горячая клавиша для управления финансами с рабочего стола
# Вызывает диалоговое окно, отправляет команду AI и показывает результат

# ===== НАСТРОЙКИ =====
SITE_URL="https://biz-tracker-beta.vercel.app"
API_KEY_FILE="$HOME/.biztracker_key"

# Загрузить API ключ
if [ ! -f "$API_KEY_FILE" ]; then
    KEY=$(osascript -e 'display dialog "Введите OpenAI API ключ (сохранится в ~/.biztracker_key):" default answer "" with hidden answer with title "BizTracker — Настройка" with icon note' -e 'text returned of result' 2>/dev/null)
    if [ -z "$KEY" ]; then exit 0; fi
    echo "$KEY" > "$API_KEY_FILE"
    chmod 600 "$API_KEY_FILE"
fi
OPENAI_KEY=$(cat "$API_KEY_FILE")

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

if [ -z "$MESSAGE" ]; then exit 0; fi

AUTO="false"
if [ "$BUTTON" = "Выполнить" ]; then
    AUTO="true"
fi

# Отправить запрос к API
RESPONSE=$(curl -s -X POST "$SITE_URL/api/ai/quick" \
  -H "Content-Type: application/json" \
  -H "X-OpenAI-Key: $OPENAI_KEY" \
  -d "{\"message\":\"$MESSAGE\",\"autoConfirm\":$AUTO}")

# Парсить ответ
TEXT=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('text','Ошибка'))" 2>/dev/null || echo "Ошибка связи")
EXECUTED=$(echo "$RESPONSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
execs=d.get('executed',[])
if execs:
    for e in execs:
        s='✅' if e['ok'] else '❌'
        print(f\"{s} {e['result']}\")
" 2>/dev/null)

RESULT="$TEXT"
if [ -n "$EXECUTED" ]; then
    RESULT="$TEXT

$EXECUTED"
fi

# Показать результат
osascript -e "display dialog \"$RESULT\" with title \"BizTracker AI\" with icon note buttons {\"OK\"} default button \"OK\"" 2>/dev/null

# Уведомление в центр уведомлений
osascript -e "display notification \"$TEXT\" with title \"BizTracker\"" 2>/dev/null
