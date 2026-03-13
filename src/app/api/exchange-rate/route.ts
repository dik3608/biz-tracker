import { NextResponse } from "next/server";

const CACHE_DURATION = 3600_000; // 1 hour
let cached: { rate: number; ts: number } | null = null;

export async function GET() {
  if (cached && Date.now() - cached.ts < CACHE_DURATION) {
    return NextResponse.json({ rate: cached.rate, currency: "EUR", base: "USD" });
  }

  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/EUR",
      { next: { revalidate: 3600 } }
    );
    const data = await res.json();
    const rate = data.rates?.USD ?? 1.08;
    cached = { rate, ts: Date.now() };
    return NextResponse.json({ rate, currency: "EUR", base: "USD" });
  } catch {
    return NextResponse.json({ rate: cached?.rate ?? 1.08, currency: "EUR", base: "USD" });
  }
}
