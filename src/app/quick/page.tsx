"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Loader2,
  Send,
  Settings,
  Sparkles,
  XCircle,
  Zap,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react";

interface ActionPayload {
  action: string;
  [key: string]: unknown;
}

interface PendingAction {
  payload: ActionPayload;
  status: "pending" | "executing" | "done" | "rejected" | "error";
  result?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: ActionPayload[];
}

const ACTION_LABELS: Record<string, string> = {
  create_transaction: "Создание записи",
  edit_transaction: "Редактирование",
  delete_transaction: "Удаление записи",
  create_category: "Создание категории",
  edit_category: "Редакт. категории",
  delete_category: "Удаление категории",
  create_subcategory: "Создание подкатегории",
  delete_subcategory: "Удаление подкатегории",
};

const SITE = typeof window !== "undefined" ? window.location.origin : "";

export default function QuickPage() {
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
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
    if (!k) setShowSettings(true);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [showSettings]);

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
    setShowSettings(false);
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
      const res = await fetch(`${SITE}/api/ai/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pa.payload),
      });
      const data = await res.json();
      updateAction(key, { status: data.ok ? "done" : "error", result: data.result });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.ok ? `✅ ${data.result}` : `❌ ${data.result}` },
      ]);
    } catch (err) {
      updateAction(key, { status: "error", result: String(err) });
    }
  }

  function rejectAction(key: string) {
    updateAction(key, { status: "rejected" });
    setMessages((prev) => [...prev, { role: "assistant", content: "🚫 Отменено" }]);
  }

  async function confirmAll(keys: string[]) {
    for (const k of keys) {
      const pa = actionsRef.current.get(k);
      if (pa?.status === "pending") {
        await executeAction(k);
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
    setMessages((prev) => [...prev, { role: "assistant", content: "🚫 Все отменено" }]);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    setInput("");
    setLoading(true);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch(`${SITE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenAI-Key": apiKey },
        body: JSON.stringify({ messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })) }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ошибка" }));
        setMessages((prev) => [...prev, { role: "assistant", content: `❌ ${err.error}` }]);
        setLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      const aMsgIdx = messages.length + 1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data: ")) continue;
          const d = t.slice(6);
          if (d === "[DONE]") continue;
          try {
            const p = JSON.parse(d);
            if (p.content) {
              full += p.content;
              setMessages((prev) => {
                const c = [...prev];
                c[c.length - 1] = { role: "assistant", content: full };
                return c;
              });
            }
          } catch {}
        }
      }

      const actionRegex = /```action\s*\n?([\s\S]*?)```/g;
      let match;
      let idx = 0;
      const newActions: [string, PendingAction][] = [];
      while ((match = actionRegex.exec(full)) !== null) {
        try {
          const parsed = JSON.parse(match[1].trim());
          const items = Array.isArray(parsed) ? parsed : [parsed];
          items.forEach((payload: ActionPayload) => {
            newActions.push([`${aMsgIdx}-${idx}`, { payload, status: "pending" }]);
            idx++;
          });
        } catch {}
      }
      if (newActions.length > 0) {
        setPendingActions((prev) => {
          const m = new Map(prev);
          newActions.forEach(([k, v]) => m.set(k, v));
          actionsRef.current = m;
          return m;
        });
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "❌ Ошибка связи" }]);
    } finally {
      setLoading(false);
    }
  }

  function getActionsForMsg(idx: number): [string, PendingAction][] {
    return [...pendingActions.entries()].filter(([k]) => k.startsWith(`${idx}-`));
  }

  function stripActions(s: string) {
    return s.replace(/```action\s*\n[\s\S]*?```/g, "").trim();
  }

  if (showSettings) {
    return (
      <div className="quick-root">
        <div className="quick-card">
          <div className="quick-header">
            {apiKey && (
              <button onClick={() => setShowSettings(false)} className="quick-back">
                <ArrowLeft size={16} />
              </button>
            )}
            <Bot size={20} className="text-blue-400" />
            <span className="quick-title">Настройки</span>
          </div>
          <div className="quick-settings">
            <label className="quick-label">OpenAI API ключ</label>
            <div className="quick-key-row">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-..."
                className="quick-input"
                onKeyDown={(e) => e.key === "Enter" && saveKey()}
              />
              <button onClick={() => setShowKey(!showKey)} className="quick-icon-btn">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button onClick={saveKey} className="quick-save-btn">
              Сохранить
            </button>
            <div className="quick-hint">
              <p><strong>Горячая клавиша:</strong></p>
              <p>Системные настройки → Клавиатура → Сочетания клавиш → Службы</p>
              <p>Или назначь в Automator / Shortcuts на приложение <code>BizTracker Quick.app</code></p>
            </div>
          </div>
        </div>
        <style>{quickStyles}</style>
      </div>
    );
  }

  return (
    <div className="quick-root">
      <div className="quick-card">
        {/* Header */}
        <div className="quick-header">
          <div className="quick-header-left">
            <div className="quick-avatar">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="quick-title">BizTracker AI</div>
              <div className="quick-subtitle">Быстрые команды</div>
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} className="quick-settings-btn">
            <Settings size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="quick-messages">
          {messages.length === 0 && (
            <div className="quick-empty">
              <Bot size={32} className="text-blue-400" style={{ opacity: 0.5 }} />
              <p>Напишите команду</p>
              <div className="quick-examples">
                {[
                  "Расход гугл 900$ и комиссию 15%",
                  "Заработал 2000$ с фриланса",
                  "Баланс за месяц",
                ].map((ex) => (
                  <button key={ex} onClick={() => { setInput(ex); }} className="quick-example">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const acts = getActionsForMsg(i);
            const pendingKeys = acts.filter(([, a]) => a.status === "pending").map(([k]) => k);
            return (
              <div key={i} className={`quick-msg ${msg.role}`}>
                {msg.role === "assistant" ? (
                  <div className="quick-msg-content assistant">
                    <Bot size={14} className="quick-msg-icon" />
                    <div>{stripActions(msg.content)}</div>
                  </div>
                ) : (
                  <div className="quick-msg-content user">{msg.content}</div>
                )}

                {acts.length > 0 && (
                  <div className="quick-actions-list">
                    {pendingKeys.length >= 2 && (
                      <div className="quick-bulk">
                        <span>{pendingKeys.length} действий</span>
                        <button onClick={() => confirmAll(pendingKeys)} className="quick-btn-yes">
                          <CheckCircle2 size={13} /> Всё верно
                        </button>
                        <button onClick={() => rejectAll(pendingKeys)} className="quick-btn-no">
                          <XCircle size={13} /> Отмена
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
            <div className="quick-msg assistant">
              <div className="quick-msg-content assistant">
                <Loader2 size={14} className="animate-spin text-blue-400" />
                <span style={{ opacity: 0.5 }}>Думаю...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="quick-input-area">
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
            placeholder="Расход гугл 900$ и комиссию 15%..."
            rows={1}
            className="quick-textarea"
          />
          <button onClick={send} disabled={!input.trim() || loading} className="quick-send">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
      <style>{quickStyles}</style>
    </div>
  );
}

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
  const a = payload.action as string;
  const rows: string[] = [];
  if (payload.type) rows.push(payload.type === "INCOME" ? "💰 Доход" : "📉 Расход");
  if (payload.categoryName) rows.push(String(payload.categoryName));
  if (payload.subcategoryName) rows.push(`→ ${payload.subcategoryName}`);
  if (payload.description) rows.push(String(payload.description));
  if (payload.amount) rows.push(`$${Number(payload.amount).toFixed(2)}`);
  if (payload.date) rows.push(String(payload.date));
  if (payload.name) rows.push(String(payload.name));

  const done = status === "done";
  const rejected = status === "rejected";
  const err = status === "error";
  const executing = status === "executing";
  const pending = status === "pending";

  return (
    <div className={`quick-action ${done ? "done" : rejected ? "rejected" : err ? "error" : "pending"}`}>
      <div className="quick-action-header">
        <Zap size={12} />
        <span>{ACTION_LABELS[a] || a}</span>
      </div>
      <div className="quick-action-body">
        {rows.map((r, i) => (
          <span key={i} className="quick-action-tag">{r}</span>
        ))}
      </div>
      {result && <div className={`quick-action-result ${err ? "err" : ""}`}>{result}</div>}
      {pending && (
        <div className="quick-action-btns">
          <button onClick={onConfirm} className="quick-btn-yes"><CheckCircle2 size={13} /> Да</button>
          <button onClick={onReject} className="quick-btn-no"><XCircle size={13} /> Нет</button>
        </div>
      )}
      {executing && (
        <div className="quick-action-exec">
          <Loader2 size={12} className="animate-spin" /> Выполняю...
        </div>
      )}
    </div>
  );
}

const quickStyles = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background: transparent !important; }

  .quick-root {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(circle at 20% 0%, rgba(139,124,246,0.28), transparent 34%),
      radial-gradient(circle at 90% 90%, rgba(45,212,191,0.14), transparent 34%),
      rgba(7,8,18,0.98);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
    color: #f3f6ff;
    padding: 0;
  }

  .quick-card {
    width: 100%;
    max-width: 480px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, rgba(18,21,39,0.94) 0%, rgba(9,10,22,0.98) 100%);
    border-left: 1px solid rgba(255,255,255,0.1);
    border-right: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 24px 70px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.08);
  }

  .quick-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.035);
  }
  .quick-header-left { display:flex; align-items:center; gap:10px; flex:1; }
  .quick-avatar {
    width:36px; height:36px; border-radius:14px;
    background: linear-gradient(135deg, #8b7cf6, #2dd4bf);
    display:flex; align-items:center; justify-content:center;
    color: #fff;
    box-shadow: 0 12px 26px rgba(139,124,246,0.24);
  }
  .quick-title { font-size:14px; font-weight:800; letter-spacing:-0.01em; }
  .quick-subtitle { font-size:10px; color:rgba(198,208,232,0.58); }
  .quick-settings-btn {
    background:none; border:none; color:rgba(255,255,255,0.3); cursor:pointer;
    padding:6px; border-radius:8px; transition:all 0.2s;
  }
  .quick-settings-btn:hover { background:rgba(255,255,255,0.05); color:#fff; }
  .quick-back {
    background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer;
    padding:4px; border-radius:6px;
  }
  .quick-back:hover { color:#fff; }

  .quick-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .quick-empty {
    flex:1; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:12px;
    text-align:center;
  }
  .quick-empty p { font-size:13px; color:rgba(255,255,255,0.35); }
  .quick-examples { display:flex; flex-direction:column; gap:6px; width:100%; max-width:320px; }
  .quick-example {
    background:rgba(255,255,255,0.03); border:1px dashed rgba(255,255,255,0.08);
    border-radius:10px; padding:8px 12px; text-align:left;
    font-size:11px; color:rgba(255,255,255,0.4); cursor:pointer;
    transition:all 0.2s;
  }
  .quick-example:hover { border-color:rgba(59,130,246,0.3); background:rgba(255,255,255,0.05); color:#fff; }

  .quick-msg { display:flex; flex-direction:column; }
  .quick-msg.user { align-items:flex-end; }
  .quick-msg.assistant { align-items:flex-start; }

  .quick-msg-content {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 18px;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .quick-msg-content.user {
    background: rgba(139,124,246,0.18);
    border: 1px solid rgba(139,124,246,0.24);
    color: #fff;
  }
  .quick-msg-content.assistant {
    background: rgba(255,255,255,0.055);
    border: 1px solid rgba(255,255,255,0.1);
    display:flex; gap:8px; align-items:flex-start;
  }
  .quick-msg-icon { flex-shrink:0; margin-top:2px; color:#60a5fa; }

  .quick-actions-list { display:flex; flex-direction:column; gap:6px; margin-top:6px; max-width:85%; }

  .quick-bulk {
    display:flex; align-items:center; gap:8px;
    padding:8px 12px; border-radius:12px;
    background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08);
    font-size:11px; color:rgba(255,255,255,0.4);
  }
  .quick-bulk span { flex:1; }

  .quick-action {
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(139,124,246,0.22);
    background: rgba(139,124,246,0.08);
    transition: all 0.2s;
  }
  .quick-action.done { border-color:rgba(16,185,129,0.3); background:rgba(16,185,129,0.05); }
  .quick-action.rejected { border-color:rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); opacity:0.5; }
  .quick-action.error { border-color:rgba(239,68,68,0.3); background:rgba(239,68,68,0.05); }

  .quick-action-header {
    display:flex; align-items:center; gap:6px;
    padding:8px 12px; font-size:11px; font-weight:600;
    background:rgba(139,124,246,0.12); color:#b9afff;
  }
  .quick-action.done .quick-action-header { background:rgba(16,185,129,0.08); color:#34d399; }
  .quick-action.error .quick-action-header { background:rgba(239,68,68,0.08); color:#f87171; }

  .quick-action-body {
    display:flex; flex-wrap:wrap; gap:4px; padding:8px 12px;
  }
  .quick-action-tag {
    font-size:11px; background:rgba(255,255,255,0.06);
    padding:3px 8px; border-radius:6px;
  }

  .quick-action-result { font-size:11px; padding:4px 12px 8px; color:#34d399; }
  .quick-action-result.err { color:#f87171; }

  .quick-action-btns { display:flex; gap:6px; padding:4px 12px 10px; }
  .quick-action-exec { display:flex; align-items:center; gap:6px; padding:4px 12px 10px; font-size:11px; color:rgba(255,255,255,0.4); }

  .quick-btn-yes {
    display:flex; align-items:center; gap:4px;
    background:rgba(16,185,129,0.15); border:none; border-radius:10px;
    padding:6px 14px; font-size:11px; font-weight:600;
    color:#34d399; cursor:pointer; transition:all 0.2s;
  }
  .quick-btn-yes:hover { background:rgba(16,185,129,0.25); }
  .quick-btn-no {
    display:flex; align-items:center; gap:4px;
    background:rgba(255,255,255,0.05); border:none; border-radius:10px;
    padding:6px 14px; font-size:11px; font-weight:600;
    color:rgba(255,255,255,0.4); cursor:pointer; transition:all 0.2s;
  }
  .quick-btn-no:hover { background:rgba(255,255,255,0.1); }

  .quick-input-area {
    display:flex; gap:8px; padding:12px 16px;
    border-top:1px solid rgba(255,255,255,0.1);
    background:rgba(255,255,255,0.035);
  }
  .quick-textarea {
    flex:1; resize:none;
    background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12);
    border-radius:16px; padding:10px 14px;
    font-size:13px; color:#fff;
    outline:none; transition:border 0.2s;
    font-family:inherit;
  }
  .quick-textarea:focus { border-color:rgba(139,124,246,0.5); box-shadow:0 0 0 4px rgba(139,124,246,0.14); }
  .quick-textarea::placeholder { color:rgba(255,255,255,0.25); }
  .quick-send {
    width:42px; height:42px; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    background:linear-gradient(135deg, #8b7cf6, #2dd4bf);
    border:1px solid rgba(255,255,255,0.14); border-radius:16px; color:#fff; cursor:pointer;
    transition:all 0.2s;
    box-shadow:0 14px 30px rgba(139,124,246,0.24);
  }
  .quick-send:hover { filter:brightness(1.1); transform:scale(1.02); }
  .quick-send:disabled { opacity:0.3; cursor:default; transform:none; }

  .quick-settings { padding:16px; display:flex; flex-direction:column; gap:12px; }
  .quick-label { font-size:12px; font-weight:600; color:rgba(255,255,255,0.5); }
  .quick-key-row { display:flex; gap:6px; }
  .quick-input {
    flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
    border-radius:10px; padding:10px 12px; font-size:13px; color:#fff;
    outline:none; font-family:inherit;
  }
  .quick-input:focus { border-color:rgba(59,130,246,0.4); }
  .quick-icon-btn {
    background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
    border-radius:10px; padding:0 10px; color:rgba(255,255,255,0.4); cursor:pointer;
  }
  .quick-save-btn {
    background:linear-gradient(135deg, #3b82f6, #8b5cf6);
    border:none; border-radius:10px; padding:10px;
    font-size:13px; font-weight:600; color:#fff; cursor:pointer;
    transition:all 0.2s;
  }
  .quick-save-btn:hover { filter:brightness(1.1); }
  .quick-hint {
    margin-top:8px; padding:12px; border-radius:10px;
    background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06);
    font-size:11px; color:rgba(255,255,255,0.35); line-height:1.6;
  }
  .quick-hint code {
    background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:4px;
    font-size:10px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }

  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
`;
