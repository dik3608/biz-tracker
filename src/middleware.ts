import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Публичные маршруты:
 * - /login, /api/auth/login — вход;
 * - /quick и /api/ai/quick — окно macOS-виджета (WKWebView без cookie-сессии);
 *   сам /api/ai/quick дополнительно защищается токеном QUICK_ACCESS_TOKEN,
 *   если тот задан в env (проверка в роуте — здесь только пропуск).
 * Остальные /api/* без валидной сессии получают 401 JSON (проверка в роутах,
 * здесь — быстрый отсев по наличию cookie), страницы — редирект на /login.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/quick",
  "/api/ai/quick",
  "/api/ai/action",
  "/_next",
  "/favicon.ico",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/ai/action доступен без cookie ради виджета: сам роут проверяет
  // сессию либо QUICK_ACCESS_TOKEN (см. requireQuickAccess)
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const session = request.cookies.get("biz_session");

  if (!session?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
