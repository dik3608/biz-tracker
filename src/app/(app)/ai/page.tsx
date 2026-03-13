"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Download,
  Key,
  Loader2,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_ACTIONS = [
  { label: "📊 Отчёт за месяц", prompt: "Составь детальный отчёт за текущий месяц со всеми доходами, расходами, прибылью и разбивкой по категориям. Оформи красиво в виде таблиц." },
  { label: "🔝 Топ расходов", prompt: "Покажи топ расходов за текущий месяц с суммами и процентами от общих расходов." },
  { label: "📈 ROI рекламы", prompt: "Рассчитай ROI рекламных расходов. Покажи сколько потрачено на рекламу (Google Ads, Bing и т.д.) и какой возврат инвестиций." },
  { label: "🔮 Прогноз", prompt: "На основе текущих трендов дай прогноз доходов и расходов на следующий месяц. Объясни на чём основан прогноз." },
  { label: "📉 Сравнение", prompt: "Сравни текущий месяц с прошлым. Что изменилось? Где рост, где падение? Выдели ключевые изменения." },
  { label: "⚠️ Аномалии", prompt: "Проанализируй все транзакции и найди аномалии — необычно большие или маленькие суммы, нетипичные операции." },
  { label: "💰 Оптимизация", prompt: "Проанализируй мои расходы и предложи конкретные способы оптимизации. Где я могу сэкономить?" },
  { label: "🧾 Налоговая сводка", prompt: "Подготовь сводку по расходам и доходам, которая может пригодиться для налоговой отчётности." },
];

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("openai_api_key") ?? "";
    setApiKey(stored);
    setKeyInput(stored);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  function saveKey() {
    const k = keyInput.trim();
    localStorage.setItem("openai_api_key", k);
    setApiKey(k);
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

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": key,
        },
        body: JSON.stringify({ messages: updated }),
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

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

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
            if (parsed.content) {
              assistantContent += parsed.content;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Ошибка сети: ${err instanceof Error ? err.message : "Попробуйте ещё раз"}`,
        },
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

  function clearChat() {
    setMessages([]);
  }

  function downloadReport(content: string) {
    const reportMatch = content.match(/```report\n([\s\S]*?)```/);
    const text = reportMatch ? reportMatch[1] : content;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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

  // --- No API key set ---
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
            <button onClick={saveKey} className="btn-primary shrink-0">
              Сохранить
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main chat UI ---
  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col md:h-[calc(100vh-1rem)]">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-blue)]/15">
            <Bot className="h-5 w-5 text-[var(--accent-blue)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">AI-ассистент</h1>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              GPT-5.4 · Финансовый аналитик
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
            style={{ color: "var(--text-muted)" }}
          >
            <Trash2 size={14} />
            Очистить
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-white/5 bg-[rgba(15,15,25,0.5)] p-4 pb-24 md:pb-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/20">
              <Sparkles className="h-10 w-10 text-[var(--accent-blue)]" />
            </div>
            <div className="text-center">
              <h2 className="mb-1 text-lg font-semibold">Привет! Я ваш финансовый аналитик</h2>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Задайте вопрос или выберите быстрое действие
              </p>
            </div>
            <div className="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.prompt)}
                  className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-left text-xs transition-all hover:border-[var(--accent-blue)]/30 hover:bg-white/5"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
                            msg.content.replace(/```report\n[\s\S]*?```/g, ""),
                          ),
                        }}
                      />
                      {hasReport(msg.content) && (
                        <button
                          onClick={() => downloadReport(msg.content)}
                          className="mt-3 flex items-center gap-1.5 rounded-lg bg-[var(--accent-green)]/15 px-3 py-2 text-xs font-medium text-[var(--accent-green)] transition-colors hover:bg-[var(--accent-green)]/25"
                        >
                          <Download size={14} />
                          Скачать отчёт
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
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

      {/* Input area */}
      <div className="fixed bottom-16 left-0 right-0 z-30 border-t border-white/5 bg-[rgba(10,10,18,0.95)] px-4 py-3 backdrop-blur-xl md:static md:mt-3 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl items-end gap-2 md:max-w-none">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={autoResize}
            onKeyDown={handleKeyDown}
            placeholder="Спросите что-нибудь..."
            rows={1}
            className="flex-1 resize-none !rounded-xl !py-3 !text-sm"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-blue)] text-white transition-all hover:brightness-110 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
