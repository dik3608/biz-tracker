"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  Check,
  Download,
  Key,
  MessageSquarePlus,
  MessagesSquare,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { formatDayHuman, todayKey } from "@/lib/dates";
import { formatMoney, type Currency } from "@/lib/money";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, inputClasses } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast, errorMessage } from "@/components/ui/Toast";
import { EmptyState, Skeleton, Spinner } from "@/components/ui/misc";

/* ------------------------------------------------------------------ */
/* Типы и константы                                                    */
/* ------------------------------------------------------------------ */

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Локальная ошибка стрима — рендерится с кнопкой «Повторить». */
  error?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

type ActionStatus = "pending" | "executing" | "done" | "rejected" | "error" | "invalid";

interface PendingAction {
  payload: Record<string, unknown>;
  status: ActionStatus;
  result?: string;
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
  "Сколько я потратил на рекламу в этом месяце?",
  "Добавь расход 50$ на хостинг",
  "Составь отчёт за месяц: доходы, расходы, прибыль",
  "Сравни этот месяц с прошлым — где рост, где падение?",
];

/** fetch с обязательным заголовком X-Timezone-Offset. */
function aiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      "X-Timezone-Offset": String(new Date().getTimezoneOffset()),
    },
  });
}

/**
 * Разбор ```action-блоков. Малформенный JSON не глотается молча —
 * возвращается как payload: null.
 */
function parseActionBlocks(content: string): (Record<string, unknown> | null)[] {
  const out: (Record<string, unknown> | null)[] = [];
  const regex = /```action\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      out.push(null);
    }
  }
  return out;
}

function stripActionBlocks(content: string): string {
  return content.replace(/```action\s*\n?[\s\S]*?```/g, "").trim();
}

function stripReportBlocks(content: string): string {
  return content.replace(/```report\n[\s\S]*?```/g, "").trim();
}

/* ------------------------------------------------------------------ */
/* Страница                                                            */
/* ------------------------------------------------------------------ */

export default function AIPage() {
  const { toast } = useToast();

  // Ключ OpenAI
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");

  // Сессии
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsState, setSessionsState] = useState<"loading" | "error" | "ready">("loading");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Чат
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // Действия
  const [pendingActions, setPendingActions] = useState<Map<string, PendingAction>>(new Map());
  const actionsRef = useRef<Map<string, PendingAction>>(new Map());

  // Стрим: прерывание и защита от «хвостов» в чужой сессии
  const abortRef = useRef<AbortController | null>(null);
  const streamSeqRef = useRef(0);
  const lastHistoryRef = useRef<Message[]>([]);

  // Скролл
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setApiKey(localStorage.getItem("openai_api_key") ?? "");
  }, []);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Прерываем стрим при уходе со страницы
  useEffect(() => () => abortRef.current?.abort(), []);

  /* ---------------- Сессии ---------------- */

  const fetchSessions = useCallback(async (initial = false) => {
    if (initial) setSessionsState("loading");
    try {
      const res = await aiFetch("/api/ai/sessions", { cache: "no-store" } as RequestInit);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSessions(data.sessions ?? []);
      setSessionsState("ready");
    } catch {
      if (initial) setSessionsState("error");
    }
  }, []);

  useEffect(() => {
    if (apiKey) fetchSessions(true);
  }, [apiKey, fetchSessions]);

  function invalidateStream() {
    abortRef.current?.abort();
    abortRef.current = null;
    streamSeqRef.current += 1;
    setStreaming(false);
  }

  async function loadSession(id: string) {
    invalidateStream();
    setActiveSessionId(id);
    activeSessionIdRef.current = id;
    setMobileChatOpen(true);
    setPendingActions(new Map());
    actionsRef.current = new Map();
    setMessagesLoading(true);
    try {
      const res = await aiFetch(`/api/ai/sessions/${id}`, { cache: "no-store" } as RequestInit);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (activeSessionIdRef.current !== id) return;
      setMessages(
        (data.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      );
      stickToBottomRef.current = true;
    } catch {
      if (activeSessionIdRef.current === id) {
        setMessages([]);
        toast("Не удалось загрузить чат", "error");
      }
    } finally {
      if (activeSessionIdRef.current === id) setMessagesLoading(false);
    }
  }

  function createNewChat() {
    invalidateStream();
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setMessages([]);
    setPendingActions(new Map());
    actionsRef.current = new Map();
    setMobileChatOpen(true);
  }

  async function deleteSession(s: ChatSession) {
    setDeleting(true);
    try {
      const res = await aiFetch(`/api/ai/sessions/${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось удалить чат");
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      if (activeSessionId === s.id) createNewChat();
      toast("Чат удалён");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function startRename(s: ChatSession) {
    setEditingId(s.id);
    setEditTitle(s.title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  async function saveRename(id: string) {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title) return;
    try {
      const res = await aiFetch(`/api/ai/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Не удалось переименовать чат");
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  /* ---------------- Скролл ---------------- */

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, pendingActions]);

  /* ---------------- Стрим ---------------- */

  /** history — сообщения, включая последнее пользовательское. */
  async function runStream(history: Message[]) {
    const key = apiKey || localStorage.getItem("openai_api_key") || "";
    if (!key) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++streamSeqRef.current;
    lastHistoryRef.current = history;

    setStreaming(true);
    stickToBottomRef.current = true;
    setMessages([...history, { role: "assistant", content: "" }]);
    const assistantIndex = history.length;

    const fail = () => {
      if (seq !== streamSeqRef.current) return;
      setMessages([...history, { role: "assistant", content: "Не удалось получить ответ", error: true }]);
      setStreaming(false);
    };

    try {
      const res = await aiFetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenAI-Key": key },
        body: JSON.stringify({
          messages: history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
          sessionId: activeSessionIdRef.current || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        fail();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (seq !== streamSeqRef.current) {
          reader.cancel().catch(() => {});
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.sessionId && !activeSessionIdRef.current) {
              activeSessionIdRef.current = parsed.sessionId;
              setActiveSessionId(parsed.sessionId);
              continue;
            }
            if (parsed.content) {
              assistantContent += parsed.content;
              if (seq !== streamSeqRef.current) return;
              setMessages([...history, { role: "assistant", content: assistantContent }]);
            }
          } catch {
            // невалидная SSE-строка — пропускаем
          }
        }
      }

      if (seq !== streamSeqRef.current) return;

      if (!assistantContent) {
        fail();
        return;
      }

      // Action-блоки (включая нераспарсенные)
      const parsed = parseActionBlocks(assistantContent);
      if (parsed.length > 0) {
        setPendingActions((prev) => {
          const m = new Map(prev);
          parsed.forEach((payload, idx) => {
            m.set(`${assistantIndex}-${idx}`, {
              payload: payload ?? {},
              status: payload ? "pending" : "invalid",
            });
          });
          actionsRef.current = m;
          return m;
        });
      }

      setStreaming(false);
      fetchSessions();
    } catch {
      if (controller.signal.aborted || seq !== streamSeqRef.current) return;
      fail();
    }
  }

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const history = [...messages.filter((m) => !m.error), { role: "user" as const, content: trimmed }];
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    runStream(history);
  }

  function retry() {
    if (lastHistoryRef.current.length > 0) runStream(lastHistoryRef.current);
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
      const res = await aiFetch("/api/ai/action", {
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
        {
          role: "assistant",
          content: ok ? `✅ **Выполнено:** ${text}` : `❌ **Ошибка:** ${text}`,
        },
      ]);
    } catch {
      updateAction(key, { status: "error", result: "Не удалось выполнить действие" });
    }
  }

  function rejectAction(key: string) {
    updateAction(key, { status: "rejected" });
  }

  async function confirmAll(keys: string[]) {
    for (const key of keys) {
      const pa = actionsRef.current.get(key);
      if (pa?.status === "pending") await executeAction(key);
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

  function getActionsForMessage(idx: number): [string, PendingAction][] {
    return [...pendingActions.entries()].filter(([k]) => k.startsWith(`${idx}-`));
  }

  /* ---------------- Ввод ---------------- */

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px"; // ~4 строки
    setInput(el.value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  /* ---------------- Рендер ---------------- */

  if (apiKey === null) return <Spinner />;

  if (!apiKey) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md px-5 py-4">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-control bg-accent/15 text-accent">
              <Key size={17} />
            </div>
            <h1 className="text-[22px] font-bold tracking-tight">AI-ассистент</h1>
          </div>
          <p className="mb-4 text-sm text-ink-2">
            Для работы ассистента нужен API-ключ OpenAI. Он хранится только в вашем браузере.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && keyInput.trim()) {
                  localStorage.setItem("openai_api_key", keyInput.trim());
                  setApiKey(keyInput.trim());
                }
              }}
            />
            <Button
              variant="primary"
              disabled={!keyInput.trim()}
              onClick={() => {
                localStorage.setItem("openai_api_key", keyInput.trim());
                setApiKey(keyInput.trim());
              }}
            >
              Сохранить
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-120px)] gap-4 md:h-[calc(100dvh-64px)]">
      {/* Список чатов */}
      <Card
        className={clsx(
          "flex w-full flex-col overflow-hidden lg:w-[260px] lg:shrink-0",
          mobileChatOpen && "hidden lg:flex",
        )}
      >
        <div className="border-b border-edge p-3">
          <Button
            variant="primary"
            className="w-full"
            icon={<MessageSquarePlus size={15} />}
            onClick={createNewChat}
          >
            Новый чат
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sessionsState === "loading" ? (
            <div className="space-y-2 p-1">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : sessionsState === "error" ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-[13px] text-ink-3">Не удалось загрузить чаты</p>
              <Button size="sm" onClick={() => fetchSessions(true)}>
                Повторить
              </Button>
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              title="Пока нет чатов"
              hint="Начните диалог — он появится здесь"
              icon={<MessagesSquare size={26} strokeWidth={1.5} />}
            />
          ) : (
            <div className="space-y-0.5">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={clsx(
                    "group flex items-center gap-1 rounded-control px-2.5 py-2 transition-colors",
                    activeSessionId === s.id ? "bg-surface-3" : "hover:bg-surface-2",
                  )}
                >
                  {editingId === s.id ? (
                    <div className="flex flex-1 items-center gap-1">
                      <input
                        ref={editInputRef}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(s.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-6 w-full min-w-0 flex-1 rounded-[6px] border border-edge bg-surface-2 px-1.5 text-[13px] text-ink focus:border-accent focus:outline-none"
                      />
                      <IconButton aria-label="Сохранить" onClick={() => saveRename(s.id)}>
                        <Check size={13} />
                      </IconButton>
                      <IconButton aria-label="Отмена" onClick={() => setEditingId(null)}>
                        <X size={13} />
                      </IconButton>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => loadSession(s.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span
                          className={clsx(
                            "block truncate text-[13px]",
                            activeSessionId === s.id ? "font-medium text-ink" : "text-ink-2",
                          )}
                        >
                          {s.title}
                        </span>
                        <span className="block text-[11.5px] text-ink-3">
                          {formatDayHuman(todayKey(new Date(s.updatedAt)))}
                        </span>
                      </button>
                      <span className="hidden shrink-0 items-center group-hover:flex">
                        <IconButton aria-label="Переименовать" onClick={() => startRename(s)}>
                          <Pencil size={12} />
                        </IconButton>
                        <IconButton aria-label="Удалить" danger onClick={() => setDeleteTarget(s)}>
                          <Trash2 size={12} />
                        </IconButton>
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Колонка чата */}
      <div
        className={clsx(
          "flex min-w-0 flex-1 flex-col",
          !mobileChatOpen && "hidden lg:flex",
        )}
      >
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft size={15} />}
            onClick={() => setMobileChatOpen(false)}
          >
            Чаты
          </Button>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-4 md:px-5"
          >
            {messagesLoading ? (
              <Spinner />
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-card bg-accent/12 text-accent">
                  <Sparkles size={26} strokeWidth={1.75} />
                </div>
                <div className="text-center">
                  <h1 className="text-[22px] font-bold tracking-tight">AI-ассистент</h1>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">
                    Задайте вопрос о финансах или попросите добавить операцию — я всё пойму и сделаю.
                  </p>
                </div>
                <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => sendMessage(ex)}
                      className="rounded-control border border-edge bg-surface-2 px-3.5 py-2.5 text-left text-[13px] text-ink-2 transition-colors hover:border-edge-strong hover:bg-surface-3 hover:text-ink"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, i) => {
                  const msgActions = getActionsForMessage(i);
                  const pendingKeys = msgActions
                    .filter(([, a]) => a.status === "pending")
                    .map(([k]) => k);
                  const isLast = i === messages.length - 1;
                  return (
                    <div key={i}>
                      <div className={clsx("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                        <div
                          className={clsx(
                            "max-w-[85%] rounded-card px-4 py-3 text-sm leading-relaxed",
                            msg.role === "user" ? "bg-accent/15 text-ink" : "bg-surface-2 text-ink",
                          )}
                        >
                          {msg.role === "assistant" ? (
                            msg.error ? (
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-ink-2">Не удалось получить ответ</span>
                                <Button size="sm" onClick={retry}>
                                  Повторить
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div
                                  className="markdown-body"
                                  dangerouslySetInnerHTML={{
                                    __html: renderMarkdown(
                                      stripReportBlocks(stripActionBlocks(msg.content)),
                                    ),
                                  }}
                                />
                                {streaming && isLast && (
                                  <span className="ml-0.5 inline-block animate-pulse text-accent">▍</span>
                                )}
                                {!streaming && msg.content.includes("```report") && (
                                  <ReportDownloadMenu content={msg.content} />
                                )}
                              </>
                            )
                          ) : (
                            <span className="whitespace-pre-wrap">{msg.content}</span>
                          )}
                        </div>
                      </div>

                      {msgActions.length > 0 && (
                        <div className="mt-3 max-w-[85%] space-y-2">
                          {pendingKeys.length >= 2 && (
                            <div className="flex items-center gap-2 rounded-control border border-edge bg-surface-2 px-3.5 py-2">
                              <span className="flex-1 text-[13px] text-ink-2">
                                Действий к подтверждению: {pendingKeys.length}
                              </span>
                              <Button size="sm" variant="primary" onClick={() => confirmAll(pendingKeys)}>
                                Выполнить всё
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => rejectAll(pendingKeys)}>
                                Отменить всё
                              </Button>
                            </div>
                          )}
                          {msgActions.map(([key, action]) => (
                            <ActionCard
                              key={key}
                              action={action}
                              onConfirm={() => executeAction(key)}
                              onReject={() => rejectAction(key)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ввод */}
          <div className="border-t border-edge px-3 py-3 md:px-4">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKeyDown}
                placeholder="Например: «расход 900$ на Google Ads и комиссия 15% отдельно»"
                rows={1}
                className={clsx(inputClasses, "h-auto resize-none py-2 leading-5")}
                style={{ maxHeight: 100 }}
              />
              <Button
                variant="primary"
                aria-label="Отправить"
                className="h-9 w-9 shrink-0 !px-0"
                disabled={!input.trim()}
                onClick={() => sendMessage(input)}
                icon={<Send size={15} />}
              />
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteSession(deleteTarget)}
        title="Удалить чат?"
        message={
          deleteTarget ? (
            <>
              Чат «{deleteTarget.title}» и вся его история будут удалены безвозвратно.
            </>
          ) : null
        }
        loading={deleting}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Карточка действия                                                   */
/* ------------------------------------------------------------------ */

function ActionCard({
  action,
  onConfirm,
  onReject,
}: {
  action: PendingAction;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const { payload, status, result } = action;

  if (status === "invalid") {
    return (
      <div className="rounded-control border border-edge bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-3">
        Не удалось разобрать действие
      </div>
    );
  }

  const a = String(payload.action ?? "");
  const rows: { label: string; value: string }[] = [];
  if (payload.type) {
    rows.push({ label: "Тип", value: payload.type === "INCOME" ? "Доход" : "Расход" });
  }
  if (payload.description) rows.push({ label: "Описание", value: String(payload.description) });
  if (payload.amount !== undefined && payload.amount !== null) {
    const currency: Currency = payload.currency === "EUR" ? "EUR" : "USD";
    rows.push({ label: "Сумма", value: formatMoney(Number(payload.amount), currency) });
  }
  if (payload.categoryName) rows.push({ label: "Категория", value: String(payload.categoryName) });
  if (payload.subcategoryName) rows.push({ label: "Подкатегория", value: String(payload.subcategoryName) });
  if (payload.date) rows.push({ label: "Дата", value: String(payload.date) });
  if (payload.name) rows.push({ label: "Название", value: String(payload.name) });

  return (
    <div
      className={clsx(
        "rounded-card border bg-surface-2 px-4 py-3",
        status === "done" && "border-income/30",
        status === "error" && "border-danger/30",
        status === "rejected" && "border-edge opacity-50",
        (status === "pending" || status === "executing") && "border-accent/30",
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Zap
          size={13}
          className={clsx(
            status === "done" ? "text-income" : status === "error" ? "text-danger" : "text-accent",
          )}
        />
        {ACTION_LABELS[a] || a || "Действие"}
        {status === "rejected" && <span className="font-normal text-ink-3">— отменено</span>}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-2 text-[13px]">
            <span className="shrink-0 text-ink-3">{r.label}:</span>
            <span className={clsx("min-w-0 break-words text-ink", r.label === "Сумма" && "tnum font-medium")}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
      {(status === "done" || status === "error") && result && (
        <p className={clsx("mt-2 text-[13px]", status === "error" ? "text-danger" : "text-income")}>
          {status === "done" ? "✅ " : "❌ "}
          {result}
        </p>
      )}
      {(status === "pending" || status === "executing") && (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" variant="primary" loading={status === "executing"} onClick={onConfirm}>
            Выполнить
          </Button>
          <Button size="sm" variant="ghost" disabled={status === "executing"} onClick={onReject}>
            Отмена
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Скачивание отчёта                                                   */
/* ------------------------------------------------------------------ */

function ReportDownloadMenu({ content }: { content: string }) {
  const download = () => {
    const blob = new Blob(["﻿" + content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biztracker-report-${todayKey()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-3">
      <Button size="sm" icon={<Download size={14} />} onClick={download}>
        Скачать отчёт (.txt)
      </Button>
    </div>
  );
}
