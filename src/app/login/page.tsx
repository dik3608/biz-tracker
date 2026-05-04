"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Lock, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Ошибка авторизации");
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-18%] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-[var(--accent-blue)]/22 blur-3xl" />
        <div className="absolute bottom-[-12%] right-[-10%] h-[420px] w-[420px] rounded-full bg-[var(--accent-green)]/14 blur-3xl" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="glass-card relative w-full max-w-md p-8 md:p-10"
      >
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-green)] text-white shadow-2xl shadow-[var(--accent-blue)]/30">
            <BarChart3 className="h-8 w-8" />
          </div>
          <div>
            <div className="premium-kicker mb-2 flex items-center justify-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Private finance workspace
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">BizTracker</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Премиальный кабинет для контроля доходов, расходов и прибыли.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              required
              autoFocus
              className="!pl-11 !py-3.5"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full !py-3.5"
          >
            {loading ? "Вход…" : "Войти"}
          </button>
        </div>
      </form>
    </div>
  );
}
