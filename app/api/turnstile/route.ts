import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCheckoutVerification,
  isTurnstileConfigured,
  TURNSTILE_VERIFICATION_COOKIE,
  verifyCheckoutTurnstile,
} from "../../lib/turnstile";

const tokenSchema = z.object({
  token: z.string().min(1).max(2048),
});

function buyerIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

export async function POST(request: NextRequest) {
  if (!isTurnstileConfigured()) {
    return NextResponse.json(
      { error: "Checkout protection is not configured yet." },
      { status: 503 },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = tokenSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification response." }, { status: 400 });
  }

  const verified = await verifyCheckoutTurnstile(parsed.data.token, buyerIp(request));
  if (!verified) {
    return NextResponse.json(
      { error: "Verification expired or could not be confirmed. Please try again." },
      { status: 403 },
    );
  }

  const response = NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(TURNSTILE_VERIFICATION_COOKIE, createCheckoutVerification(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
  return response;
}
