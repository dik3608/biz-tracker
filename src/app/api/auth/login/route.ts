import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyPassword, createSession, cleanupExpiredSessions } from "@/lib/auth";

const MAX_AGE = 30 * 24 * 60 * 60; // 30 дней

export async function POST(request: Request) {
  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Введите пароль" }, { status: 400 });
  }

  // Лёгкое торможение перебора: одна общая пауза на неверный пароль
  const valid = await verifyPassword(password);
  if (!valid) {
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  await cleanupExpiredSessions();
  const token = await createSession();
  const cookieStore = await cookies();

  cookieStore.set("biz_session", token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
  });

  return NextResponse.json({ success: true });
}
