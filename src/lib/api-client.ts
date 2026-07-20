/**
 * Клиентский слой доступа к API: единая обработка ошибок и типизация.
 * Ошибка любого запроса — исключение ApiRequestError с человекочитаемым
 * сообщением (его показывает toast).
 */

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiRequestError("Требуется вход", 401);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // не-JSON ответ — оставляем body = null
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Ошибка запроса (${res.status})`;
    throw new ApiRequestError(message, res.status);
  }
  return body as T;
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  return handle<T>(res);
}

async function send<T>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

/**
 * Скачивание файла (экспорт): при ошибке сервер отвечает JSON {error} —
 * кидаем ApiRequestError вместо перехода на страницу с сырым JSON.
 */
export async function apiDownload(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): Promise<void> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    let message = `Ошибка запроса (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // не-JSON тело — оставляем общий текст
    }
    throw new ApiRequestError(message, res.status);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "export";
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export const apiPost = <T>(path: string, body?: unknown) => send<T>("POST", path, body);
export const apiPatch = <T>(path: string, body?: unknown) => send<T>("PATCH", path, body);
export const apiPut = <T>(path: string, body?: unknown) => send<T>("PUT", path, body);
export const apiDelete = <T>(path: string, body?: unknown) => send<T>("DELETE", path, body);
