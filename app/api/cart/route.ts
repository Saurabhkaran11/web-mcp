import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimiter, getClientIp } from "../../lib/rate-limit";
import { isShopifyConfigured, shopifyRequest } from "../../lib/shopify";
import {
  hasCheckoutVerification,
  isTurnstileConfigured,
  TURNSTILE_VERIFICATION_COOKIE,
} from "../../lib/turnstile";

const CART_COOKIE = "local-loop-shopify-cart";

const cartFields = `
  id
  checkoutUrl
  totalQuantity
  cost { totalAmount { amount currencyCode } }
  lines(first: 100) {
    nodes {
      id
      quantity
      merchandise {
        ... on ProductVariant {
          id
          title
          price { amount currencyCode }
          product { title }
        }
      }
    }
  }
`;

type ShopifyCart = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: { totalAmount: { amount: string; currencyCode: string } };
  lines: { nodes: Array<{ id: string; quantity: number; merchandise: { id: string; title: string; price: { amount: string; currencyCode: string }; product: { title: string } } }> };
};

type CartPayload = { cart: ShopifyCart | null; userErrors: Array<{ message: string }> };

const commandSchema = z.object({
  action: z.enum(["add", "remove", "checkout"]),
  items: z.array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(20) })).min(1).max(10).optional(),
  variantId: z.string().min(1).optional(),
});

function cartError(errors: Array<{ message: string }>) {
  if (errors.length) throw new Error(errors.map((error) => error.message).join(" "));
}

function serializeCart(cart: ShopifyCart) {
  return {
    total: Number(cart.cost.totalAmount.amount),
    currency: cart.cost.totalAmount.currencyCode,
    total_quantity: cart.totalQuantity,
    checkout_url: cart.checkoutUrl,
    items: cart.lines.nodes.map((line) => ({
      variant_id: line.merchandise.id,
      title: line.merchandise.product.title,
      variant_title: line.merchandise.title,
      quantity: line.quantity,
      unit_price: Number(line.merchandise.price.amount),
      line_total: Number(line.merchandise.price.amount) * line.quantity,
    })),
  };
}

async function fetchCart(cartId: string, ip?: string) {
  const data = await shopifyRequest<{ cart: ShopifyCart | null }>(`query Cart($cartId: ID!) { cart(id: $cartId) { ${cartFields} } }`, { cartId }, ip);
  return data.cart;
}

async function createCart(items: Array<{ variantId: string; quantity: number }>, ip?: string) {
  const data = await shopifyRequest<{ cartCreate: CartPayload }>(
    `mutation CreateCart($input: CartInput!) { cartCreate(input: $input) { cart { ${cartFields} } userErrors { message } } }`,
    { input: { lines: items.map((item) => ({ merchandiseId: item.variantId, quantity: item.quantity })) } },
    ip,
  );
  cartError(data.cartCreate.userErrors);
  if (!data.cartCreate.cart) throw new Error("Shopify could not create a cart.");
  return data.cartCreate.cart;
}

async function addLines(cartId: string, items: Array<{ variantId: string; quantity: number }>, ip?: string) {
  const data = await shopifyRequest<{ cartLinesAdd: CartPayload }>(
    `mutation AddLines($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${cartFields} } userErrors { message } } }`,
    { cartId, lines: items.map((item) => ({ merchandiseId: item.variantId, quantity: item.quantity })) },
    ip,
  );
  cartError(data.cartLinesAdd.userErrors);
  if (!data.cartLinesAdd.cart) throw new Error("Shopify could not update the cart.");
  return data.cartLinesAdd.cart;
}

async function removeLine(cartId: string, variantId: string, ip?: string) {
  const existing = await fetchCart(cartId, ip);
  const line = existing?.lines.nodes.find((item) => item.merchandise.id === variantId);
  if (!line) throw new Error("That item is not in the current cart.");

  const data = await shopifyRequest<{ cartLinesRemove: CartPayload }>(
    `mutation RemoveLine($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${cartFields} } userErrors { message } } }`,
    { cartId, lineIds: [line.id] },
    ip,
  );
  cartError(data.cartLinesRemove.userErrors);
  if (!data.cartLinesRemove.cart) throw new Error("Shopify could not update the cart.");
  return data.cartLinesRemove.cart;
}

function responseForCart(cart: ShopifyCart, rememberCart = false) {
  const response = NextResponse.json({ cart: serializeCart(cart) }, { headers: { "Cache-Control": "no-store" } });
  if (rememberCart) {
    response.cookies.set(CART_COOKIE, cart.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  }
  return response;
}

export async function GET(request: NextRequest) {
  if (!isShopifyConfigured()) return NextResponse.json({ cart: null, error: "Shopify is not configured." }, { status: 503 });
  const limit = apiRateLimiter.check(`cart-read:${getClientIp(request)}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many cart requests. Please try again shortly." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const cartId = (await cookies()).get(CART_COOKIE)?.value;
    if (!cartId) return NextResponse.json({ cart: null }, { headers: { "Cache-Control": "no-store" } });
    const cart = await fetchCart(cartId, getClientIp(request));
    if (!cart) return NextResponse.json({ cart: null }, { headers: { "Cache-Control": "no-store" } });
    return responseForCart(cart);
  } catch {
    return NextResponse.json({ error: "The Shopify cart is temporarily unavailable." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  if (!isShopifyConfigured()) return NextResponse.json({ error: "Shopify is not configured. Add .env.local first." }, { status: 503 });
  const limit = apiRateLimiter.check(`cart-write:${getClientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many cart changes. Please try again shortly." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = commandSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart request." }, { status: 400 });

  try {
    const cartId = (await cookies()).get(CART_COOKIE)?.value;
    const ip = getClientIp(request);

    if (parsed.data.action === "checkout") {
      if (!cartId) return NextResponse.json({ error: "Your cart is empty." }, { status: 422 });
      const cart = await fetchCart(cartId, ip);
      if (!cart?.totalQuantity) return NextResponse.json({ error: "Your cart is empty." }, { status: 422 });
      if (!isTurnstileConfigured()) {
        return NextResponse.json(
          { error: "Checkout protection is not configured yet." },
          { status: 503 },
        );
      }
      const verification = (await cookies()).get(TURNSTILE_VERIFICATION_COOKIE)?.value;
      if (!hasCheckoutVerification(verification)) {
        return NextResponse.json(
          { error: "Complete the human check in Local Loop before requesting checkout." },
          { status: 403 },
        );
      }
      return responseForCart(cart);
    }

    if (parsed.data.action === "add") {
      if (!parsed.data.items) return NextResponse.json({ error: "Choose at least one item to add." }, { status: 400 });
      const cart = cartId ? await addLines(cartId, parsed.data.items, ip) : await createCart(parsed.data.items, ip);
      return responseForCart(cart, !cartId);
    }

    if (!cartId || !parsed.data.variantId) return NextResponse.json({ error: "That item is not in the current cart." }, { status: 422 });
    return responseForCart(await removeLine(cartId, parsed.data.variantId, ip));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Shopify cart is temporarily unavailable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
