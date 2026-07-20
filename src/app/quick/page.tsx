"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Send,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";
import { formatMoney, type Currency } from "@/lib/money";

/* ------------------------------------------------------------------ */
/* Типы                                                                */
/* ------------------------------------------------------------------ */

interface ActionPayload {
  action: string;
  [key: string]: unknown;
}

type ActionStatus = "pending" | "executing" | "done" | "rejected" | "error";

interface PendingAction {
  payload: ActionPayload;
  status: ActionStatus;
  result?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  create_transaction: "Создание записи",
  edit_transaction: "Редактирование записи",
  delete_transaction: "Удаление записи",
  create_category: "Создание категории",
  edit_category: "Редактирование категории",
  delete_category: "Удаление категории",
  create_subcategory: "Создание подкатегории",
  delete_subcategory: "Удаление подкатегории",
};

const EXAMPLES = [
  "Расход гугл 900$ и комиссия 15% отдельно",
  "Заработал 2000$ с фриланса",
  "Добавь расход 50€ на хостинг",
];

/**
 * fetch с заголовками X-Timezone-Offset и (если задан в настройках)
 * X-Quick-Token — токен доступа виджета, соответствующий env
 * QUICK_ACCESS_TOKEN на сервере.
 */
function quickFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const quickToken = localStorage.getItem("quick_access_token") ?? "";
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      "X-Timezone-Offset": String(new Date().getTimezoneOffset()),
      ...(quickToken ? { "X-Quick-Token": quickToken } : {}),
    },
  });
}

/* ------------------------------------------------------------------ */
/* Страница                                                            */
/* ------------------------------------------------------------------ */

export default function QuickPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState<Map<string, PendingAction>>(new Map());
  const actionsRef = useRef<Map<string, PendingAction>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const k = localStorage.getItem("openai_api_key") ?? "";
    setApiKey(k);
    setKeyInput(k);
    setTokenInput(localStorage.getItem("quick_access_token") ?? "");
    if (!k) setShowSettings(true);
  }, []);

  useEffect(() => {
    if (!showSettings) inputRef.current?.focus();
  }, [showSettings]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingActions]);

  function saveKey() {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem("openai_api_key", k);
    const t = tokenInput.trim();
    if (t) localStorage.setItem("quick_access_token", t);
    else localStorage.removeItem("quick_access_token");
    setApiKey(k);
    setShowSettings(false);
  }

  /* ---------------- Действия ---------------- */

  function updateAction(key: string, patch: Partial<PendingAction>) {
    setPendingActions((prev) => {
      const m = new Map(prev);
      const existing = m.get(key);
      if (existing) m.set(key, { ...existing, ...patch });
      actionsRef.current = m;
      return m;
    });
  }

  async function executeAction(key: string) {
    const pa = actionsRef.current.get(key);
    if (!pa || pa.status !== "pending") return;
    updateAction(key, { status: "executing" });
    try {
      const res = await quickFetch("/api/ai/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pa.payload),
      });
      const data = await res.json().catch(() => ({}));
      // Ответы отказа (401 и т.п.) имеют форму {error}, а не {ok, result}
      const text: string = data.result ?? data.error ?? "Не удалось выполнить действие";
      const ok = data.ok === true;
      updateAction(key, { status: ok ? "done" : "error", result: text });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: ok ? `✅ ${text}` : `❌ ${text}`, error: !ok },
      ]);
    } catch {
      updateAction(key, { status: "error", result: "Не удалось выполнить действие" });
    }
  }

  function rejectAction(key: string) {
    updateAction(key, { status: "rejected" });
  }

  async function confirmAll(keys: string[]) {
    for (const k of keys) {
      const pa = actionsRef.current.get(k);
      if (pa?.status === "pending") await executeAction(k);
    }
  }

  function rejectAll(keys: string[]) {
    setPendingActions((prev) => {
      const m = new Map(prev);
      keys.forEach((k) => {
        const pa = m.get(k);
        if (pa?.status === "pending") m.set(k, { ...pa, status: "rejected" });
      });
      actionsRef.current = m;
      return m;
    });
  }

  function getActionsForMsg(idx: number): [string, PendingAction][] {
    return [...pendingActions.entries()].filter(([k]) => k.startsWith(`${idx}-`));
  }

  /* ---------------- Отправка ---------------- */

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await quickFetch("/api/ai/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenAI-Key": apiKey },
        body: JSON.stringify({ message: text, autoConfirm: false }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: err?.error ? `Ошибка: ${err.error}` : `Ошибка сервера (${res.status})`,
            error: true,
          },
        ]);
        return;
      }

      const data: {
        text?: string;
        actions?: ActionPayload[];
        executed?: { action: string; ok: boolean; result: string }[];
      } = await res.json();

      setMessages((prev) => {
        const assistantIdx = prev.length;
        const next: ChatMessage[] = [
          ...prev,
          { role: "assistant", content: data.text || "Готово." },
        ];

        const actions = data.actions ?? [];
        if (actions.length > 0) {
          setPendingActions((prevA) => {
            const m = new Map(prevA);
            actions.forEach((payload, i) => {
              m.set(`${assistantIdx}-${i}`, { payload, status: "pending" });
            });
            actionsRef.current = m;
            return m;
          });
        }

        for (const ex of data.executed ?? []) {
          next.push({
            role: "assistant",
            content: ex.ok ? `✅ ${ex.result}` : `❌ ${ex.result}`,
            error: !ex.ok,
          });
        }
        return next;
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Нет связи с сервером. Проверьте подключение.", error: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- Рендер ---------------- */

  if (apiKey === null) return null;

  if (showSettings) {
    return (
      <div className="flex h-dvh flex-col bg-bg text-ink">
        <header className="flex items-center gap-2 border-b border-edge bg-surface px-3 py-2.5">
          {apiKey && (
            <button
              onClick={() => setShowSettings(false)}
              aria-label="Назад"
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <span className="text-[13px] font-semibold">Настройки</span>
        </header>
        <div className="flex flex-col gap-3 p-4">
          <label className="text-[12px] font-medium text-ink-2">OpenAI API ключ</label>
          <div className="flex gap-1.5">
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder="sk-..."
              className="h-9 min-w-0 flex-1 rounded-control border border-edge bg-surface-2 px-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? "Скрыть ключ" : "Показать ключ"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-edge bg-surface-2 text-ink-3 transition-colors hover:text-ink"
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <label className="mt-1 text-[12px] font-medium text-ink-2">
            Токен доступа{" "}
            <span className="font-normal text-ink-3">
              (нужен, если на сервере задан QUICK_ACCESS_TOKEN)
            </span>
          </label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveKey()}
            placeholder="необязательно"
            className="h-9 rounded-control border border-edge bg-surface-2 px-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
          <button
            onClick={saveKey}
            disabled={!keyInput.trim()}
            className="h-9 rounded-control bg-accent text-[13px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Сохранить
          </button>
          <div className="rounded-control border border-edge bg-surface px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-3">
            <p className="font-medium text-ink-2">Горячая клавиша:</p>
            <p>Системные настройки → Клавиатура → Сочетания клавиш → Службы.</p>
            <p>
              Или назначьте в Automator / Shortcuts на приложение{" "}
              <code className="rounded bg-surface-3 px-1 py-0.5 text-[10.5px]">BizTracker Quick.app</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-ink">
      {/* Шапка */}
      <header className="flex items-center gap-2.5 border-b border-edge bg-surface px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-accent/15 text-accent">
          <Sparkles size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight">BizTracker AI</div>
          <div className="text-[11px] leading-tight text-ink-3">Быстрые команды</div>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Настройки"
          className="flex h-7 w-7 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <Settings size={15} />
        </button>
      </header>

      {/* История */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sparkles size={24} className="text-ink-3" />
            <p className="text-[13px] text-ink-2">Напишите команду</p>
            <div className="flex w-full max-w-[320px] flex-col gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="rounded-control border border-edge bg-surface px-3 py-2 text-left text-[12px] text-ink-2 transition-colors hover:border-edge-strong hover:bg-surface-2 hover:text-ink"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {messages.map((msg, i) => {
              const acts = getActionsForMsg(i);
              const pendingKeys = acts.filter(([, a]) => a.status === "pending").map(([k]) => k);
              return (
                <div key={i} className={clsx("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                  <div
                    className={clsx(
                      "max-w-[88%] whitespace-pre-wrap break-words rounded-card px-3 py-2 text-[13px] leading-relaxed",
                      msg.role === "user" ? "bg-accent/15 text-ink" : "bg-surface-2 text-ink",
                      msg.error && "border border-danger/30 text-ink-2",
                    )}
                  >
                    {msg.content}
                  </div>

                  {acts.length > 0 && (
                    <div className="mt-1.5 flex w-full max-w-[88%] flex-col gap-1.5">
                      {pendingKeys.length >= 2 && (
                        <div className="flex items-center gap-1.5 rounded-control border border-edge bg-surface px-2.5 py-1.5">
                          <span className="flex-1 text-[11.5px] text-ink-3">
                            Действий: {pendingKeys.length}
                          </span>
                          <button
                            onClick={() => confirmAll(pendingKeys)}
                            className="rounded-[8px] bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
                          >
                            Выполнить всё
                          </button>
                          <button
                            onClick={() => rejectAll(pendingKeys)}
                            className="rounded-[8px] px-2.5 py-1 text-[11.5px] font-medium text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                          >
                            Отменить
                          </button>
                        </div>
                      )}
                      {acts.map(([key, act]) => (
                        <QuickActionCard
                          key={key}
                          action={act}
                          onConfirm={() => executeAction(key)}
                          onReject={() => rejectAction(key)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {loading && (
              <div className="flex items-center gap-2 rounded-card bg-surface-2 px-3 py-2 text-[13px] text-ink-3 w-fit">
                <Loader2 size={13} className="animate-spin text-accent" />
                Думаю...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Ввод */}
      <div className="flex items-end gap-1.5 border-t border-edge bg-surface px-3 py-2.5">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Расход гугл 900$ и комиссия 15%..."
          rows={1}
          className="h-9 min-w-0 flex-1 resize-none rounded-control border border-edge bg-surface-2 px-3 py-2 text-[13px] leading-5 text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          aria-label="Отправить"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Карточка действия                                                   */
/* ------------------------------------------------------------------ */

function QuickActionCard({
  action,
  onConfirm,
  onReject,
}: {
  action: PendingAction;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const { payload, status, result } = action;
  const a = String(payload.action ?? "");

  const tags: string[] = [];
  if (payload.type) tags.push(payload.type === "INCOME" ? "Доход" : "Расход");
  if (payload.amount !== undefined && payload.amount !== null) {
    const currency: Currency = payload.currency === "EUR" ? "EUR" : "USD";
    tags.push(formatMoney(Number(payload.amount), currency));
  }
  if (payload.categoryName) tags.push(String(payload.categoryName));
  if (payload.subcategoryName) tags.push(`→ ${payload.subcategoryName}`);
  if (payload.description) tags.push(String(payload.description));
  if (payload.date) tags.push(String(payload.date));
  if (payload.name) tags.push(String(payload.name));

  return (
    <div
      className={clsx(
        "rounded-card border bg-surface px-3 py-2",
        status === "done" && "border-income/30",
        status === "error" && "border-danger/30",
        status === "rejected" && "border-edge opacity-50",
        (status === "pending" || status === "executing") && "border-accent/30",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
        <Zap
          size={11}
          className={clsx(
            status === "done" ? "text-income" : status === "error" ? "text-danger" : "text-accent",
          )}
        />
        {ACTION_LABELS[a] || a || "Действие"}
        {status === "rejected" && <span className="font-normal text-ink-3">— отменено</span>}
      </div>
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <span key={i} className="tnum rounded-[6px] bg-surface-3 px-1.5 py-0.5 text-[11px] text-ink-2">
              {t}
            </span>
          ))}
        </div>
      )}
      {(status === "done" || status === "error") && result && (
        <p className={clsx("mt-1.5 text-[11.5px]", status === "error" ? "text-danger" : "text-income")}>
          {result}
        </p>
      )}
      {(status === "pending" || status === "executing") && (
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={onConfirm}
            disabled={status === "executing"}
            className="flex items-center gap-1 rounded-[8px] bg-accent px-3 py-1 text-[11.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {status === "executing" && <Loader2 size={11} className="animate-spin" />}
            Выполнить
          </button>
          <button
            onClick={onReject}
            disabled={status === "executing"}
            className="rounded-[8px] px-3 py-1 text-[11.5px] font-medium text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-60"
          >
            Отмена
          </button>
        </div>
      )}
    </div>
  );
}
