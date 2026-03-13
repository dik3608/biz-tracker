import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyPassword, createSession } from "@/lib/auth";

const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Неверный пароль" },
        { status: 401 },
      );
    }

    const valid = await verifyPassword(password);

    if (!valid) {
      return NextResponse.json(
        { error: "Неверный пароль" },
        { status: 401 },
      );
    }

    const token = await createSession();
    const cookieStore = await cookies();

    cookieStore.set("biz_session", token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: MAX_AGE,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
