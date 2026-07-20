"use client";

import { useRef, useState, type FormEvent } from "react";
import { Wallet } from "lucide-react";
import { ApiRequestError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";

/**
 * Логин выполняется прямым fetch, а не apiPost: общий клиент при 401
 * сам редиректит на /login, что здесь превратило бы «Неверный пароль»
 * в бессмысленную перезагрузку страницы.
 */
async function login(password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    let message = "Неверный пароль";
    try {
      const body: unknown = await res.json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // не-JSON ответ — оставляем общий текст
    }
    throw new ApiRequestError(message, res.status);
  }
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await login(password);
      // Полная перезагрузка, чтобы middleware увидел новую cookie сессии
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Неверный пароль");
      setPassword("");
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm px-6 py-7">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-accent-ink">
            <Wallet size={17} strokeWidth={2.2} />
          </div>
          <span className="text-[17px] font-bold tracking-tight text-ink">BizTracker</span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Пароль" error={error}>
            <Input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              autoFocus
              autoComplete="current-password"
              disabled={loading}
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Войти
          </Button>
        </form>
      </Card>
    </div>
  );
}
