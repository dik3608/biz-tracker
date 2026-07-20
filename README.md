# BizTracker

Личный трекер доходов и расходов бизнеса: Next.js 16 (App Router) + Prisma 7 +
PostgreSQL + Tailwind 4. Деплой — Vercel (`biz-tracker-beta.vercel.app`).

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
```

## Переменные окружения (`.env`)

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `AUTH_PASSWORD_HASH` | bcrypt-хэш пароля входа |
| `OPENAI_API_KEY` | ключ для AI-ассистента (или заголовок `X-OpenAI-Key`) |
| `QUICK_ACCESS_TOKEN` | необязательно: токен доступа macOS-виджета. Пока не задан, `/api/ai/quick` и `/api/ai/action` открыты без входа (совместимость со старым виджетом). **Рекомендуется задать** и положить тот же токен в `~/.biztracker_token` на Mac. |

## Архитектурные контракты

- **Даты**: во всей логике дата — строка `YYYY-MM-DD` (`src/lib/dates.ts`).
  В БД `@db.Date` читается/пишется как UTC-полночь. Никаких `new Date(iso)`
  по данным транзакций. Проверка логики: `npx tsx scripts/check-dates.ts`.
- **Деньги**: базовая валюта USD. `amount` — сумма в USD, `originalAmount` +
  `currency` + `exchangeRate` — ввод пользователя. Все агрегаты считает сервер
  (Prisma Decimal), клиент только форматирует (`src/lib/money.ts`).
- **API**: контракты и DTO — `src/lib/types.ts`, серверные хелперы (zod-валидация,
  auth) — `src/lib/api-server.ts`. Спецификация пересборки — `docs/REBUILD_SPEC.md`.
- **Дизайн-токены**: `@theme` в `src/app/globals.css` (bg/surface/ink/edge/accent/
  income/expense), компоненты — `src/components/ui/`.

## Данные

- Бэкап всех таблиц в JSON: `npx tsx scripts/backup-db.ts` → `backups/`.
- Экспорт из интерфейса: Отчёты → Экспорт (.xlsx с тремя листами или CSV
  с `;`-разделителем для русского Excel).
- Точка отката до пересборки 2026-07-20: git-тег `pre-rebuild`.

## macOS-виджет

- `scripts/BizTrackerQuick.swift` — окно WKWebView на `/quick` (компилированный
  бинарник `scripts/BizTrackerQuick`).
- `scripts/biztracker-quick.sh` — быстрая команда через диалог: шлёт
  `POST /api/ai/quick` с заголовками `X-OpenAI-Key` (ключ из `~/.biztracker_key`)
  и `X-Quick-Token` (из `~/.biztracker_token`, если файл есть).
