import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCheckoutVerification,
  isTurnstileConfigured,
  TURNSTILE_VERIFICATION_COOKIE,
  verifyCheckoutTurnstile,
} from "../../lib/turnstile";
import { apiRateLimiter, getClientIp } from "../../lib/rate-limit";

const tokenSchema = z.object({
  token: z.string().min(1).max(2048),
});

export async function POST(request: NextRequest) {
  const limit = apiRateLimiter.check(`turnstile:${getClientIp(request)}`, {
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please try again shortly." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

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

  const verified = await verifyCheckoutTurnstile(parsed.data.token, getClientIp(request));
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
