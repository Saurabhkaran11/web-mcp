import { createHmac, timingSafeEqual } from "node:crypto";

export const TURNSTILE_VERIFICATION_COOKIE = "local-loop-human-verified";
const VERIFICATION_WINDOW_SECONDS = 5 * 60;

type SiteverifyResponse = {
  success: boolean;
  action?: string;
};

function getSecret() {
  return process.env.TURNSTILE_SECRET_KEY;
}

function signature(expiresAt: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`local-loop-checkout:${expiresAt}`)
    .digest("base64url");
}

export function isTurnstileConfigured() {
  return Boolean(getSecret());
}

export async function verifyCheckoutTurnstile(token: string, remoteIp?: string) {
  const secret = getSecret();
  if (!secret) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body,
        cache: "no-store",
      },
    );
    const result = (await response.json()) as SiteverifyResponse;
    return response.ok && result.success && result.action === "checkout";
  } catch {
    return false;
  }
}

export function createCheckoutVerification() {
  const secret = getSecret();
  if (!secret) throw new Error("Turnstile is not configured.");

  const expiresAt = String(Date.now() + VERIFICATION_WINDOW_SECONDS * 1000);
  return `${expiresAt}.${signature(expiresAt, secret)}`;
}

export function hasCheckoutVerification(value: string | undefined) {
  const secret = getSecret();
  if (!secret || !value) return false;

  const [expiresAt, receivedSignature, ...rest] = value.split(".");
  if (!expiresAt || !receivedSignature || rest.length || !/^\d+$/.test(expiresAt)) {
    return false;
  }
  if (Number(expiresAt) <= Date.now()) return false;

  const expectedSignature = signature(expiresAt, secret);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
