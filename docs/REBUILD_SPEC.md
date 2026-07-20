# BizTracker — спецификация пересборки

Прочитай этот файл целиком перед работой. Он описывает контракты, на которые
опираются все страницы. Отступления от контрактов не допускаются.

## Стек и структура

- Next.js 16 App Router, React 19, Tailwind 4 (токены в `@theme` в `src/app/globals.css`),
  Prisma 7 + PostgreSQL, recharts, lucide-react, clsx, zod (только сервер).
- Все страницы — клиентские компоненты (`"use client"`) внутри `src/app/(app)/`,
  общий каркас — `src/app/(app)/layout.tsx` (сайдбар + мобильные табы + ToastProvider).

## Железные правила

1. **Даты.** В коде дата — только строка `YYYY-MM-DD` (`DateKey` из `@/lib/dates`).
   Запрещено: `new Date(isoString)` для дат транзакций, `.getDate()/.getMonth()`
   по данным, `Date.now()` для календарной логики. «Сегодня» — `todayKey()`.
   Форматирование — `formatDay`, `formatDayHuman`, `formatMonth`, `formatRange`.
2. **Деньги.** Клиент никогда не считает валюту и не суммирует то, что может
   посчитать сервер. Отображение — только `formatMoney`, `formatMoneyWhole`,
   `formatSigned`, `formatCompact`, `formatPercent` из `@/lib/money`. Все суммы
   в таблицах — с классом `tnum`.
3. **API.** Только через `apiGet/apiPost/apiPut/apiPatch/apiDelete` из
   `@/lib/api-client` — они кидают `ApiRequestError` с русским сообщением.
   Каждая мутация: `try { … toast("…") } catch (e) { toast(errorMessage(e), "error") }`
   (`useToast`, `errorMessage` из `@/components/ui/Toast`).
4. **Состояния.** У каждого списка/блока три состояния: загрузка (`Skeleton`/`Spinner`),
   пусто (`EmptyState`), данные. Ошибка загрузки — не пустой экран, а текст с кнопкой
   «Повторить». Гонки фетчей гасятся `AbortController` либо guard'ом
   `if (requestId !== latestRef.current) return`.
5. **Дизайн.** Никаких стеклянных градиентов и свечения. Используй готовые
   компоненты из `@/components/ui/*` и токены Tailwind: `bg-bg`, `bg-surface`,
   `bg-surface-2/3`, `border-edge`, `text-ink`, `text-ink-2`, `text-ink-3`,
   `text-income`, `text-expense`, `text-accent`, `rounded-card`, `rounded-control`.
   Заголовок страницы: `<h1 className="text-[22px] font-bold tracking-tight">`.
   Отступы: секции `gap-4`/`gap-5`, карточки `px-5 py-4`.
6. **Русский язык** во всех надписях. Числа: разряды с пробелом, десятичная запятая
   (это делают форматтеры).

## Готовые компоненты (`src/components/ui/`)

- `Button` (`variant: primary|secondary|ghost|danger`, `size, loading, icon`), `IconButton`
- `Card`, `CardHeader` (`title, subtitle, actions`)
- `Field` (label+error), `Input`, `TextArea`, `inputClasses`; `Select` (нативный стилизованный)
- `SegmentedControl` (`options: {value,label,tone?}`)
- `Modal` (`open,onClose,title,footer,width`), `ConfirmDialog`
- `ToastProvider/useToast/errorMessage`
- `Spinner`, `EmptyState`, `Skeleton`, `CategoryDot`, `CategoryBadge`, `TxAmount`
- `StatCard` (`label,value,change,changeHint,upIsGood,tone,loading`)
- `Pagination` (`page,totalPages,total,pageSize,onPageChange,onPageSizeChange`)
- `PeriodPicker` + `usePeriod(storageKey)` + тип `Period {preset, range|null}`;
  `defaultPeriod()`. range=null означает «всё время» — тогда в API не передаются from/to.
- Графики (`src/components/charts/`): `TrendChart` (`points,granularity,height,showProfit`),
  `Donut` (`slices,centerLabel,centerValue`), `BarList` (`rows:{key,label,color,value,share,hint?,onClick?}`),
  `ChartTooltip`.

## API-контракты (все ответы см. типы в `src/lib/types.ts`)

- `GET /api/transactions?from&to&type&categoryId&subcategoryId&currency&search&page&pageSize&sort=date|amount&dir=asc|desc`
  → `TransactionListResponse` (в `totals` — суммы по всему фильтру).
- `POST /api/transactions` body `TransactionInput` → `TransactionDto` (201).
  Для EUR обязателен `exchangeRate` (EUR→USD). `amount` — в валюте `currency`.
- `PUT /api/transactions/:id` body `TransactionInput` → `TransactionDto`.
- `DELETE /api/transactions/:id` → `{ok:true}`.
- `POST /api/transactions/bulk-delete` body `{ids:string[]}` → `{ok,deleted}`.
- `GET /api/transactions/summary?from&to&preset` → `SummaryResponse`
  (сравнение с сопоставимым прошлым периодом; передавай `preset` из Period).
- `GET /api/transactions/series?from&to&granularity=auto|day|week|month` → `SeriesResponse`.
- `GET /api/reports/by-category?from&to` → `BreakdownResponse` (оба типа сразу).
- `GET /api/reports/monthly?from&to` или `?months=N` →
  `{months: MonthlyReportRow[], best, worst, totals}`.
- `GET /api/export?from&to&format=xlsx|csv` → файл (скачивание через
  `window.location.href` или создание ссылки).
- `GET /api/categories` → `{categories: CategoryDto[]}` (с подкатегориями и
  `transactionCount`). `POST /api/categories {name,type,color?}`;
  `PATCH /api/categories/:id {name?,color?,sortOrder?}`; `DELETE` (409, если есть операции).
- `POST /api/subcategories {name, categoryId}`; `PATCH/DELETE /api/subcategories/:id`.
- `GET /api/exchange-rate?date=YYYY-MM-DD` → `{rate, date, source}` (курс на дату операции!).
- `POST /api/auth/login {password}`; `POST /api/auth/logout`.

Все ошибки API: JSON `{error: "русский текст"}` с корректным статусом; 401 → apiGet сам
редиректит на /login.

## Ключевые исправления (не повторять старые баги)

- Сравнение периодов и границы дат считает сервер — клиент не дублирует.
- Рост расходов красится как плохое (в `StatCard` — `upIsGood={false}`).
- Пагинация: после удаления последней строки страницы — переход на предыдущую.
- Выделение чекбоксами сбрасывается при смене фильтров/страницы.
- Курс EUR запрашивается на дату операции при её изменении.
- Суммы всегда с центами; «целые» — только в KPI (`formatMoneyWhole`) и осях (`formatCompact`).
