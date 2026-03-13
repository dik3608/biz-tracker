import { NextResponse } from "next/server";
import { buildFinancialContext } from "@/lib/ai-context";

export async function GET() {
  const context = await buildFinancialContext();
  return NextResponse.json({ context });
}
