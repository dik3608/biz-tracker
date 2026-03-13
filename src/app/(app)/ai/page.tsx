"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Key,
  Loader2,
  Menu,
  MessageSquarePlus,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  X,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import {
  downloadAsWord,
  downloadAsExcel,
  downloadAsText,
} from "@/lib/export-report";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
}

interface PendingAction {
  payload: Record<string, unknown>;
  status: "pending" | "executing" | "done" | "rejected" | "error";
  result?: string;
}

const QUICK_ACTIONS = [
  { label: "📊 Отчёт за месяц", prompt: "Составь детальный отчёт за текущий месяц со всеми доходами, расходами, прибылью и разбивкой по категориям." },
  { label: "🔝 Топ расходов", prompt: "Покажи топ расходов за текущий месяц с суммами и процентами от общих расходов." },
  { label: "📈 ROI рекламы", prompt: "Рассчитай ROI рекламных расходов по каждому рекламному каналу." },
  { label: "🔮 Прогноз", prompt: "Дай прогноз доходов и расходов на следующий месяц на основе трендов." },
  { label: "📉 Сравнение", prompt: "Сравни текущий месяц с прошлым. Где рост, где падение?" },
  { label: "⚠️ Аномалии", prompt: "Найди аномалии в транзакциях — необычные суммы, нетипичные операции." },
  { label: "💰 Оптимизация", prompt: "Предложи способы оптимизации расходов." },
  { label: "🧾 Налоговая сводка", prompt: "Подготовь сводку для налоговой отчётности." },
];

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

function parseAllActionBlocks(content: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const regex = /```action\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else {
        results.push(parsed);
      }
    } catch {}
  }
  return results;
}

function stripActionBlocks(content: string): string {
  return content.replace(/```action\s*\n?[\s\S]*?```/g, "").trim();
}

export default function AIPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [pendingActions, setPendingActions] = useState<Map<string, PendingAction>>(new Map());
  const actionsRef = useRef<Map<string, PendingAction>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("openai_api_key") ?? "";
    setApiKey(stored);
    setKeyInput(stored);
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/sessions");
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    if (apiKey) fetchSessions();
  }, [apiKey, fetchSessions]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingActions, scrollToBottom]);

  function saveKey() {
    const k = keyInput.trim();
    localStorage.setItem("openai_api_key", k);
    setApiKey(k);
  }

  async function loadSession(id: string) {
    setActiveSessionId(id);
    setSidebarOpen(false);
    setPendingActions(new Map());
    try {
      const res = await fetch(`/api/ai/sessions/${id}`);
      const data = await res.json();
      setMessages(
        (data.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      );
    } catch {
      setMessages([]);
    }
  }

  async function createNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setPendingActions(new Map());
    setSidebarOpen(false);
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/ai/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
        setPendingActions(new Map());
      }
    } catch {}
  }

  function startRename(s: ChatSession) {
    setEditingId(s.id);
    setEditTitle(s.title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  async function saveRename(id: string) {
    if (!editTitle.trim()) return;
    try {
      await fetch(`/api/ai/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: editTitle.trim() } : s)),
      );
    } catch {}
    setEditingId(null);
  }

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
      const res = await fetch("/api/ai/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pa.payload),
      });
      const data = await res.json();
      updateAction(key, { status: data.ok ? "done" : "error", result: data.result });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.ok ? `✅ **Выполнено:** ${data.result}` : `❌ **Ошибка:** ${data.result}`,
        },
      ]);
    } catch (err) {
      updateAction(key, { status: "error", result: String(err) });
    }
  }

  function rejectAction(key: string) {
    updateAction(key, { status: "rejected" });
    setMessages((prev) => [...prev, { role: "assistant", content: "🚫 Действие отменено." }]);
  }

  async function confirmAll(keys: string[]) {
    for (const key of keys) {
      const pa = actionsRef.current.get(key);
      if (pa?.status === "pending") {
        await executeAction(key);
        await new Promise((r) => setTimeout(r, 100));
      }
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
    setMessages((prev) => [...prev, { role: "assistant", content: "🚫 Все действия отменены." }]);
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const key = apiKey || localStorage.getItem("openai_api_key") || "";
    if (!key) {
      alert("Введите API-ключ OpenAI в настройках или выше.");
      return;
    }

    const userMsg: Message = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenAI-Key": key },
        body: JSON.stringify({ messages: updated, sessionId: activeSessionId || undefined }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ Ошибка: ${err.error || "Неизвестная ошибка"}` },
        ]);
        setLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let receivedSessionId = false;

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      const assistantMsgIndex = updated.length;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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
            if (parsed.sessionId && !receivedSessionId) {
              receivedSessionId = true;
              if (!activeSessionId) setActiveSessionId(parsed.sessionId);
              continue;
            }
            if (parsed.content) {
              assistantContent += parsed.content;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantContent };
                return copy;
              });
            }
          } catch {}
        }
      }

      const actions = parseAllActionBlocks(assistantContent);
      if (actions.length > 0) {
        setPendingActions((prev) => {
          const m = new Map(prev);
          actions.forEach((payload, idx) => {
            m.set(`${assistantMsgIndex}-${idx}`, { payload, status: "pending" });
          });
          actionsRef.current = m;
          return m;
        });
      }

      fetchSessions();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Ошибка сети: ${err instanceof Error ? err.message : "Попробуйте ещё раз"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function hasReport(content: string) {
    return content.includes("```report");
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
    setInput(el.value);
  }

  function getActionsForMessage(msgIndex: number): [string, PendingAction][] {
    return [...pendingActions.entries()].filter(([k]) => k.startsWith(`${msgIndex}-`));
  }

  if (!apiKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
        <div className="glass-card mx-auto max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-blue)]/15">
            <Key className="h-8 w-8 text-[var(--accent-blue)]" />
          </div>
          <h2 className="mb-2 text-xl font-bold">Введите API-ключ OpenAI</h2>
          <p className="mb-5 text-sm" style={{ color: "var(--text-muted)" }}>
            Для работы AI-ассистента нужен ключ от OpenAI. Ключ хранится только в вашем браузере.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-..."
              className="flex-1 !py-2 !text-sm"
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
            />
            <button onClick={saveKey} className="btn-primary shrink-0">Сохранить</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] md:h-[calc(100vh-1rem)]">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-white/8 bg-[rgba(12,12,20,0.97)] backdrop-blur-2xl transition-transform md:relative md:z-auto md:translate-x-0 md:border-r md:bg-transparent md:backdrop-blur-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:w-64 md:shrink-0`}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-3 py-3">
          <span className="text-sm font-semibold">Чаты</span>
          <button
            onClick={createNewChat}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-white/5"
            style={{ color: "var(--accent-blue)" }}
          >
            <MessageSquarePlus size={14} />
            Новый
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sessions.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
              Нет чатов. Начните диалог.
            </p>
          ) : (
            <div className="space-y-0.5">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center gap-1 rounded-lg px-2.5 py-2 transition-colors ${
                    activeSessionId === s.id
                      ? "bg-[var(--accent-blue)]/10 text-white"
                      : "text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]"
                  }`}
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
                        className="flex-1 !rounded-md !py-0.5 !text-xs"
                      />
                      <button onClick={() => saveRename(s.id)} className="rounded p-0.5 hover:bg-white/10" style={{ color: "var(--accent-green)" }}>
                        <Check size={12} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="rounded p-0.5 hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => loadSession(s.id)} className="flex-1 truncate text-left text-xs">{s.title}</button>
                      <button onClick={() => startRename(s)} className="shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => deleteSession(s.id)} className="shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-400/10" style={{ color: "#f87171" }}>
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5 md:hidden">
              <Menu size={18} />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-blue)]/15">
              <Bot className="h-4 w-4 text-[var(--accent-blue)]" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">AI-ассистент</h1>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>GPT-5.4 · Финансовый аналитик · Управление данными</p>
            </div>
          </div>
          <button onClick={createNewChat} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-white/5" style={{ color: "var(--text-muted)" }}>
            <MessageSquarePlus size={14} />
            Новый чат
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto rounded-2xl border border-white/5 bg-[rgba(15,15,25,0.5)] p-4 pb-24 md:pb-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/20">
                <Sparkles className="h-10 w-10 text-[var(--accent-blue)]" />
              </div>
              <div className="text-center">
                <h2 className="mb-1 text-lg font-semibold">Привет! Я ваш финансовый аналитик</h2>
                <p className="mx-auto max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
                  Пишите что угодно: «расход гугл 900$ и комиссию 15% отдельно» — я всё пойму и сделаю
                </p>
              </div>
              <div className="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => sendMessage(a.prompt)}
                    className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-left text-xs transition-all hover:border-[var(--accent-blue)]/30 hover:bg-white/5"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 w-full max-w-2xl">
                <p className="mb-2 text-center text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  <Zap className="mr-1 inline h-3 w-3" />
                  Примеры голосовых команд
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {[
                    "Расход гугл 900$ и комиссию агентства 15% отдельно",
                    "Бинг пополнил на 500 вчера + комиссия 10%",
                    "Заработал 3000$ с гугла за сегодня",
                    "Создай подкатегорию «Возвраты» для Bing Ads",
                  ].map((cmd) => (
                    <button
                      key={cmd}
                      onClick={() => sendMessage(cmd)}
                      className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-left text-[11px] transition-all hover:border-[var(--accent-purple)]/30 hover:bg-white/5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      &laquo;{cmd}&raquo;
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => {
                const msgActions = getActionsForMessage(i);
                const pendingKeys = msgActions.filter(([, a]) => a.status === "pending").map(([k]) => k);
                return (
                  <div key={i}>
                    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-[var(--accent-blue)]/15 text-white"
                            : "bg-white/[0.04] text-[var(--text)]"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <div className="ai-response">
                            <div
                              className="markdown-body"
                              dangerouslySetInnerHTML={{
                                __html: renderMarkdown(
                                  stripActionBlocks(msg.content).replace(/```report\n[\s\S]*?```/g, ""),
                                ),
                              }}
                            />
                            {hasReport(msg.content) && <ReportDownloadMenu content={msg.content} />}
                          </div>
                        ) : (
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        )}
                      </div>
                    </div>

                    {/* Action cards */}
                    {msgActions.length > 0 && (
                      <div className="my-3 ml-0 max-w-[85%] space-y-2">
                        {/* Bulk buttons for 2+ pending actions */}
                        {pendingKeys.length >= 2 && (
                          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                            <span className="flex-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                              {pendingKeys.length} действий ожидают подтверждения
                            </span>
                            <button
                              onClick={() => confirmAll(pendingKeys)}
                              className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/30"
                            >
                              <CheckCircle2 size={13} />
                              Всё верно
                            </button>
                            <button
                              onClick={() => rejectAll(pendingKeys)}
                              className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold transition-all hover:bg-white/10"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <XCircle size={13} />
                              Отменить всё
                            </button>
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
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-blue)]" />
                    <span style={{ color: "var(--text-muted)" }}>Анализирую...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="fixed bottom-16 left-0 right-0 z-30 border-t border-white/5 bg-[rgba(10,10,18,0.95)] px-4 py-3 backdrop-blur-xl md:static md:mt-3 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <div className="mx-auto flex max-w-3xl items-end gap-2 md:max-w-none">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKeyDown}
              placeholder="Напишите что угодно: «расход гугл 900$ и комиссию 15%»..."
              rows={1}
              className="flex-1 resize-none !rounded-xl !py-3 !text-sm"
              style={{ maxHeight: "120px" }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-blue)] text-white transition-all hover:brightness-110 disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ActionCard                                                          */
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
  const a = payload.action as string;

  const rows: { label: string; value: string }[] = [];
  rows.push({ label: "Действие", value: ACTION_LABELS[a] || a });
  if (payload.type) rows.push({ label: "Тип", value: payload.type === "INCOME" ? "💰 Доход" : "📉 Расход" });
  if (payload.description) rows.push({ label: "Описание", value: String(payload.description) });
  if (payload.amount) {
    const cur = payload.currency === "EUR" ? " EUR" : "";
    rows.push({ label: "Сумма", value: `$${Number(payload.amount).toFixed(2)}${cur}` });
  }
  if (payload.categoryName) rows.push({ label: "Категория", value: String(payload.categoryName) });
  if (payload.subcategoryName) rows.push({ label: "Подкатегория", value: String(payload.subcategoryName) });
  if (payload.date) rows.push({ label: "Дата", value: String(payload.date) });
  if (payload.name) rows.push({ label: "Название", value: String(payload.name) });

  const isDone = status === "done";
  const isRejected = status === "rejected";
  const isError = status === "error";
  const isExecuting = status === "executing";
  const isPending = status === "pending";

  const borderColor = isDone
    ? "border-emerald-500/30"
    : isRejected
    ? "border-white/5"
    : isError
    ? "border-red-500/30"
    : "border-[var(--accent-blue)]/30";

  const bgColor = isDone
    ? "bg-emerald-500/5"
    : isRejected
    ? "bg-white/[0.02]"
    : isError
    ? "bg-red-500/5"
    : "bg-[var(--accent-blue)]/5";

  const headerBg = isDone
    ? "bg-emerald-500/10"
    : isRejected
    ? "bg-white/[0.03]"
    : isError
    ? "bg-red-500/10"
    : "bg-[var(--accent-blue)]/10";

  return (
    <div className={`overflow-hidden rounded-2xl border ${borderColor} ${bgColor} ${isRejected ? "opacity-50" : ""}`}>
      <div className={`flex items-center gap-2 px-4 py-2 ${headerBg}`}>
        <Zap className={`h-3.5 w-3.5 ${isDone ? "text-emerald-400" : isError ? "text-red-400" : "text-[var(--accent-blue)]"}`} />
        <span className="text-xs font-semibold">
          {isDone ? "Выполнено" : isRejected ? "Отменено" : isError ? "Ошибка" : ACTION_LABELS[a] || "Действие"}
        </span>
      </div>
      <div className="px-4 py-2.5">
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline gap-2 text-xs">
              <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{r.label}:</span>
              <span className="font-medium text-white">{r.value}</span>
            </div>
          ))}
        </div>
        {result && (
          <p className={`mt-2 text-xs ${isError ? "text-red-400" : "text-emerald-400"}`}>{result}</p>
        )}
        {isPending && (
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={onConfirm}
              className="flex items-center gap-1 rounded-xl bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/30"
            >
              <CheckCircle2 size={13} />
              Да
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1 rounded-xl bg-white/5 px-3.5 py-1.5 text-xs font-semibold transition-all hover:bg-white/10"
              style={{ color: "var(--text-muted)" }}
            >
              <XCircle size={13} />
              Нет
            </button>
          </div>
        )}
        {isExecuting && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-blue)]" />
            <span style={{ color: "var(--text-muted)" }}>Выполняю...</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ReportDownloadMenu                                                  */
/* ------------------------------------------------------------------ */

function ReportDownloadMenu({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-green)]/15 px-3 py-2 text-xs font-medium text-[var(--accent-green)] transition-colors hover:bg-[var(--accent-green)]/25"
      >
        <Download size={14} />
        Скачать отчёт
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-48 rounded-xl border border-white/10 bg-[rgba(20,20,35,0.97)] p-1 shadow-xl backdrop-blur-xl">
          <button onClick={() => { downloadAsWord(content); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-white/5">
            <FileText size={14} className="text-blue-400" />
            <div><div className="font-medium">Word (.doc)</div><div style={{ color: "var(--text-muted)" }}>Красивый документ</div></div>
          </button>
          <button onClick={() => { downloadAsExcel(content); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-white/5">
            <FileSpreadsheet size={14} className="text-green-400" />
            <div><div className="font-medium">Excel (.xlsx)</div><div style={{ color: "var(--text-muted)" }}>Таблицы</div></div>
          </button>
          <button onClick={() => { downloadAsText(content); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-white/5">
            <FileText size={14} style={{ color: "var(--text-muted)" }} />
            <div><div className="font-medium">Текст (.txt)</div><div style={{ color: "var(--text-muted)" }}>Простой текст</div></div>
          </button>
        </div>
      )}
    </div>
  );
}
