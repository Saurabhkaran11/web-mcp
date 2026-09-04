"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bindToolHandler } from "@webmcp-registry/kit";
import { useWebMCPTools } from "@webmcp-registry/kit/react";
import {
  addToCartContract,
  checkoutContract,
  fulfillShoppingListContract,
  getCartContract,
  orderStatusContract,
  removeFromCartContract,
  searchInventoryContract,
} from "./commerce.tools";

type Product = {
  id: string;
  title: string;
  description: string;
  price: number;
  stock: number;
  brand: string;
  category: string;
  thumbnail: string;
  variant_title: string;
};

type Cart = Record<string, number>;
type InventorySource = "shopify" | "built-in-demo";
type CartSnapshot = {
  total: number;
  currency: string;
  total_quantity: number;
  checkout_url: string;
  items: Array<{
    variant_id: string;
    title: string;
    variant_title: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};
type ShoppingListRequest = {
  query: string;
  quantity?: number;
  max_price?: number;
};
type ShoppingListResult =
  | {
      query: string;
      matched: true;
      item: { id: string; title: string; price: number; quantity: number };
    }
  | { query: string; matched: false; message: string };
type ShoppingListPlan = {
  items: ShoppingListRequest[];
  additions: Array<{ variantId: string; quantity: number }>;
  results: ShoppingListResult[];
  matched: number;
  unmatched: number;
};

const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);

function mapCart(snapshot: CartSnapshot | null) {
  return Object.fromEntries(
    (snapshot?.items ?? []).map((item) => [item.variant_id, item.quantity]),
  );
}

function parseShoppingListInput(input: string): ShoppingListRequest[] {
  return input
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .flatMap((line) => {
      const quantityMatch = line.match(/^([1-9]\d?)\s*(?:x|×)?\s*/i);
      const priceMatch = line.match(
        /\b(?:under|below|max(?:imum)?|less than)\s*\$?(\d+(?:\.\d+)?)/i,
      );
      const query = line
        .replace(/^(\d{1,2})\s*(?:x|×)?\s*/i, "")
        .replace(
          /\b(?:under|below|max(?:imum)?|less than)\s*\$?\d+(?:\.\d+)?/i,
          "",
        )
        .replace(/\s+/g, " ")
        .trim();

      if (!query) return [];
      return [{
        query,
        quantity: quantityMatch ? Math.min(20, Number(quantityMatch[1])) : 1,
        max_price: priceMatch ? Number(priceMatch[1]) : undefined,
      }];
    });
}

function makeShoppingListPlan(
  products: Product[],
  cart: Cart,
  items: ShoppingListRequest[],
): ShoppingListPlan {
  const plannedQuantities = new Map<string, number>();
  const additions: Array<{ variantId: string; quantity: number }> = [];
  const results = items.map(({ query, quantity = 1, max_price }) => {
    const wanted = query.toLowerCase();
    const match = products.reduce<Product | undefined>((best, product) => {
      const matches =
        `${product.title} ${product.description}`.toLowerCase().includes(wanted) &&
        (max_price === undefined || product.price <= max_price) &&
        product.stock >=
          (cart[product.id] ?? 0) + (plannedQuantities.get(product.id) ?? 0) + quantity;
      if (!matches) return best;
      return !best || product.price < best.price ? product : best;
    }, undefined);

    if (!match) {
      return {
        query,
        matched: false as const,
        message: "No in-stock match within budget.",
      };
    }

    plannedQuantities.set(
      match.id,
      (plannedQuantities.get(match.id) ?? 0) + quantity,
    );
    additions.push({ variantId: match.id, quantity });
    return {
      query,
      matched: true as const,
      item: { id: match.id, title: match.title, price: match.price, quantity },
    };
  });

  const matched = results.filter((result) => result.matched).length;
  return { items, additions, results, matched, unmatched: items.length - matched };
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [cartSnapshot, setCartSnapshot] = useState<CartSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [agentMessage, setAgentMessage] = useState(
    "Ready for an agent-assisted shop.",
  );
  const [inventoryStatus, setInventoryStatus] = useState<
    "loading" | "ready" | "fallback" | "error"
  >("loading");
  const [inventorySource, setInventorySource] =
    useState<InventorySource>("built-in-demo");
  const [cartCurrency, setCartCurrency] = useState("USD");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [shoppingListInput, setShoppingListInput] = useState("");
  const [shoppingListPlan, setShoppingListPlan] = useState<ShoppingListPlan | null>(null);
  const [shoppingListBusy, setShoppingListBusy] = useState(false);

  const refreshInventory = useCallback(async () => {
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      if (!response.ok) throw new Error("Inventory is unavailable");

      const data = (await response.json()) as {
        products: Product[];
        source: InventorySource;
        updatedAt: string;
      };
      setProducts(data.products);
      setInventorySource(data.source);
      setUpdatedAt(new Date(data.updatedAt));
      setInventoryStatus(data.source === "shopify" ? "ready" : "fallback");
    } catch {
      setInventoryStatus("error");
      setAgentMessage(
        "Inventory is temporarily unavailable. Try refreshing in a moment.",
      );
    }
  }, []);

  const refreshCart = useCallback(async () => {
    const response = await fetch("/api/cart", { cache: "no-store" });
    const payload = (await response.json()) as {
      cart: CartSnapshot | null;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? "Cart is unavailable");

    setCart(mapCart(payload.cart));
    setCartSnapshot(payload.cart);
    if (payload.cart) setCartCurrency(payload.cart.currency);
    return payload.cart;
  }, []);

  const updateCart = useCallback(
    async (
      body:
        | { action: "add"; items: Array<{ variantId: string; quantity: number }> }
        | { action: "remove"; variantId: string }
        | { action: "checkout" },
    ) => {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        cart?: CartSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.cart) {
        throw new Error(payload.error ?? "Cart is unavailable");
      }

      setCart(mapCart(payload.cart));
      setCartSnapshot(payload.cart);
      setCartCurrency(payload.cart.currency);
      return payload.cart;
    },
    [],
  );

  useEffect(() => {
    void refreshInventory();
    const timer = window.setInterval(() => void refreshInventory(), 30_000);
    return () => window.clearInterval(timer);
  }, [refreshInventory]);

  useEffect(() => {
    void refreshCart().catch(() => undefined);
  }, [refreshCart]);

  const searchInventory = useCallback(
    ({
      query: nextQuery,
      category: nextCategory,
      max_price,
      availability = "all",
    }: {
      query?: string;
      category?: string;
      max_price?: number;
      availability?: "in_stock" | "low_stock" | "all";
    }) => {
      if (!products.length) {
        return {
          items: [],
          message: "Inventory is still syncing. Please try again shortly.",
        };
      }

      const filtered = products.filter((item) => {
        const textMatch =
          !nextQuery ||
          `${item.title} ${item.description} ${item.brand}`
            .toLowerCase()
            .includes(nextQuery.toLowerCase());
        const categoryMatch =
          !nextCategory || nextCategory === "all" || item.category === nextCategory;
        const priceMatch = max_price === undefined || item.price <= max_price;
        const availabilityMatch =
          availability === "all" ||
          (availability === "in_stock"
            ? item.stock > 5
            : item.stock > 0 && item.stock <= 5);
        return textMatch && categoryMatch && priceMatch && availabilityMatch;
      });

      setQuery(nextQuery ?? "");
      if (nextCategory) setCategory(nextCategory);
      setAgentMessage(
        `Found ${filtered.length} matching item${filtered.length === 1 ? "" : "s"} in ${
          inventorySource === "shopify" ? "Shopify" : "demo"
        } inventory.`,
      );
      return {
        items: filtered.map(({ id, title, variant_title, price, stock, category }) => ({
          id,
          title,
          variant_title,
          price,
          stock,
          category,
        })),
      };
    },
    [inventorySource, products],
  );

  const addToCart = useCallback(
    async ({ item_id, quantity }: { item_id: string; quantity: number }) => {
      const product = products.find((item) => item.id === item_id);
      if (!product) {
        return { success: false, message: "Item not found in the current catalog." };
      }
      if (inventorySource !== "shopify") {
        return {
          success: false,
          message: "Shopify credentials are not connected yet, so carts are unavailable.",
        };
      }

      const alreadyInCart = cart[item_id] ?? 0;
      if (product.stock < alreadyInCart + quantity) {
        return {
          success: false,
          message: `Only ${product.stock} available; ${alreadyInCart} already in your cart.`,
        };
      }

      try {
        await updateCart({ action: "add", items: [{ variantId: item_id, quantity }] });
        setAgentMessage(`${quantity} × ${product.title} added to the shared Shopify cart.`);
        return { success: true, item: { id: product.id, title: product.title, quantity } };
      } catch (error) {
        return {
          success: false,
          message:
            error instanceof Error ? error.message : "Shopify could not update the cart.",
        };
      }
    },
    [cart, inventorySource, products, updateCart],
  );

  const getCart = useCallback(async () => {
    if (inventorySource !== "shopify") {
      return {
        items: [],
        total: 0,
        message: "Shopify credentials are not connected yet.",
      };
    }

    try {
      const snapshot = await refreshCart();
      return {
        items: snapshot?.items ?? [],
        total: snapshot?.total ?? 0,
        currency: snapshot?.currency ?? "USD",
      };
    } catch (error) {
      return {
        items: [],
        total: 0,
        message: error instanceof Error ? error.message : "Shopify cart is unavailable.",
      };
    }
  }, [inventorySource, refreshCart]);

  const removeFromCart = useCallback(
    async ({ item_id, quantity }: { item_id: string; quantity?: number }) => {
      const current = cart[item_id];
      if (!current) return { success: false, message: "That item is not in the cart." };
      if (quantity && quantity < current) {
        return {
          success: false,
          message: "Reducing quantities individually will be added with the next cart update.",
        };
      }

      try {
        await updateCart({ action: "remove", variantId: item_id });
        const title = products.find((item) => item.id === item_id)?.title ?? "Item";
        setAgentMessage(`${title} removed from the shared Shopify cart.`);
        return { success: true, remaining_quantity: 0 };
      } catch (error) {
        return {
          success: false,
          message:
            error instanceof Error ? error.message : "Shopify could not update the cart.",
        };
      }
    },
    [cart, products, updateCart],
  );

  const checkout = useCallback(
    async ({ confirm }: { confirm: true }) => {
      if (!confirm) {
        return { success: false, message: "Checkout needs explicit confirmation." };
      }

      try {
        const snapshot = await updateCart({ action: "checkout" });
        setAgentMessage(
          "Shopify Checkout is ready. Review the order there before any payment.",
        );
        return {
          success: true,
          checkout_url: snapshot.checkout_url,
          total: snapshot.total,
          currency: snapshot.currency,
        };
      } catch (error) {
        return {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Shopify Checkout is unavailable.",
        };
      }
    },
    [updateCart],
  );

  const beginCheckout = useCallback(async () => {
    const result = await checkout({ confirm: true });
    if (result.success && typeof result.checkout_url === "string") {
      window.location.assign(result.checkout_url);
    }
  }, [checkout]);

  const getOrderStatus = useCallback(
    ({ order_id }: { order_id?: string }) => ({
      success: false,
      order_id,
      message:
        "After checkout, Shopify securely handles order status in the customer order-history page. Local Loop does not store customer order data.",
    }),
    [],
  );

  const buildShoppingListPlan = useCallback(
    (items: ShoppingListRequest[]) => makeShoppingListPlan(products, cart, items),
    [cart, products],
  );

  const fulfillShoppingList = useCallback(
    async ({
      items,
    }: {
      items: ShoppingListRequest[];
    }) => {
      if (!products.length) {
        return {
          results: [],
          matched: 0,
          unmatched: items.length,
          message: "Inventory is still syncing. Please try again shortly.",
        };
      }
      if (inventorySource !== "shopify") {
        return {
          results: [],
          matched: 0,
          unmatched: items.length,
          message: "Shopify credentials are not connected yet.",
        };
      }

      const plan = buildShoppingListPlan(items);

      try {
        if (plan.additions.length) {
          await updateCart({ action: "add", items: plan.additions });
        }
        setAgentMessage(
          `Shopping list: added ${plan.matched} of ${items.length} requested item${
            items.length === 1 ? "" : "s"
          } to the Shopify cart.`,
        );
        return {
          results: plan.results,
          matched: plan.matched,
          unmatched: plan.unmatched,
        };
      } catch (error) {
        return {
          results: plan.results,
          matched: 0,
          unmatched: items.length,
          message:
            error instanceof Error
              ? error.message
              : "Shopify could not update the cart.",
        };
      }
    },
    [buildShoppingListPlan, inventorySource, products.length, updateCart],
  );

  const previewShoppingList = useCallback(() => {
    const items = parseShoppingListInput(shoppingListInput);
    if (!items.length) {
      setShoppingListPlan(null);
      setAgentMessage(
        "Add one item per line, such as “1 honey under 15”.",
      );
      return;
    }
    if (!products.length) {
      setAgentMessage("Inventory is still syncing. Please try again shortly.");
      return;
    }

    const plan = buildShoppingListPlan(items);
    setShoppingListPlan(plan);
    setAgentMessage(
      plan.matched
        ? `Shopping list ready: review ${plan.matched} live match${
            plan.matched === 1 ? "" : "es"
          } below. Nothing has been added yet.`
        : "No live Shopify matches were found for that list.",
    );
  }, [buildShoppingListPlan, products.length, shoppingListInput]);

  const approveShoppingList = useCallback(async () => {
    if (!shoppingListPlan?.additions.length) return;

    setShoppingListBusy(true);
    try {
      const result = await fulfillShoppingList({ items: shoppingListPlan.items });
      if (result.matched) {
        setShoppingListPlan(null);
        setShoppingListInput("");
      }
    } finally {
      setShoppingListBusy(false);
    }
  }, [fulfillShoppingList, shoppingListPlan]);

  const runDemoAssistant = useCallback(
    async (requestedText?: string) => {
      const request = (requestedText ?? assistantInput).trim();
      if (!request) {
        setAgentMessage(
          "Try a simple request, such as “find honey” or “add Rose Clay Mask.”",
        );
        return;
      }

      const normalized = request.toLowerCase();
      setAssistantBusy(true);
      try {
        if (/\b(checkout|pay|purchase)\b/.test(normalized)) {
          const snapshot = await getCart();
          if (snapshot.items.length) {
            setAgentMessage(
              "Your cart is ready. Review it on the right, then choose Continue to Shopify Checkout.",
            );
          } else {
            setAgentMessage("Your cart is empty. Ask me to find or add a product first.");
          }
          return;
        }

        if (/\b(cart|basket)\b/.test(normalized)) {
          const snapshot = await getCart();
          if (!snapshot.items.length) {
            setAgentMessage("Your Shopify cart is empty. What would you like to add?");
            return;
          }

          const itemCount = snapshot.items.reduce((total, item) => total + item.quantity, 0);
          setAgentMessage(
            `Your Shopify cart has ${itemCount} item${itemCount === 1 ? "" : "s"} totaling ${money(
              snapshot.total,
              "currency" in snapshot ? snapshot.currency : cartCurrency,
            )}.`,
          );
          return;
        }

        if (/\b(add|put|buy)\b/.test(normalized)) {
          const match =
            products.find((product) => normalized.includes(product.title.toLowerCase())) ??
            products.find((product) =>
              product.title
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .some((word) => word.length > 3 && normalized.includes(word)),
            );

          if (!match) {
            setAgentMessage(
              "I couldn't identify that product. Try its name, such as “add Wildflower Honey.”",
            );
            return;
          }

          const quantityMatch = normalized.match(/\b([1-9]|1\d|20)\b/);
          const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
          const result = await addToCart({ item_id: match.id, quantity });
          if (!result.success) {
            setAgentMessage(result.message ?? "Shopify could not update the cart.");
          }
          return;
        }

        const maxPriceMatch = normalized.match(
          /(?:under|below|less than|max(?:imum)?)[^\d]*\$?(\d+(?:\.\d+)?)/,
        );
        const maxPrice = maxPriceMatch ? Number(maxPriceMatch[1]) : undefined;
        let searchTerm = normalized;
        if (/\b(skin|skincare|beauty|mask)\b/.test(normalized)) searchTerm = "mask";
        else if (/\b(coffee|cold brew|drink)\b/.test(normalized)) searchTerm = "coffee";
        else if (/\b(honey|pantry|grocery)\b/.test(normalized)) searchTerm = "honey";
        else {
          searchTerm = normalized
            .replace(
              /\b(find|show|search|looking|for|me|products?|items?|please|under|below|less|than|max(?:imum)?|price|dollars?|usd|and|a|an|the)\b/g,
              " ",
            )
            .replace(/\$?\d+(?:\.\d+)?/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }

        const result = searchInventory({
          query: searchTerm || undefined,
          max_price: maxPrice,
          availability: "all",
        });
        if (!result.items.length) {
          setAgentMessage("I couldn't find a match. Try honey, coffee, or skincare.");
        }
      } finally {
        setAssistantBusy(false);
        setAssistantInput("");
      }
    },
    [addToCart, assistantInput, cartCurrency, getCart, products, searchInventory],
  );

  const webMCPTools = useMemo(
    () => [
      bindToolHandler(searchInventoryContract, searchInventory),
      bindToolHandler(addToCartContract, addToCart),
      bindToolHandler(getCartContract, getCart),
      bindToolHandler(removeFromCartContract, removeFromCart),
      bindToolHandler(checkoutContract, checkout),
      bindToolHandler(orderStatusContract, getOrderStatus),
      bindToolHandler(fulfillShoppingListContract, fulfillShoppingList),
    ],
    [
      addToCart,
      checkout,
      fulfillShoppingList,
      getCart,
      getOrderStatus,
      removeFromCart,
      searchInventory,
    ],
  );
  useWebMCPTools(webMCPTools);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(products.map((item) => item.category)))],
    [products],
  );
  const cartItems = cartSnapshot?.items ?? [];
  const cartItemCount = cartSnapshot?.total_quantity ?? 0;
  const cartTotal = cartSnapshot?.total ?? 0;
  const inventoryLabel =
    inventoryStatus === "loading"
      ? "SYNCING INVENTORY"
      : inventoryStatus === "error"
        ? "INVENTORY UNAVAILABLE"
        : inventorySource === "shopify"
          ? "SHOPIFY LIVE CATALOG"
          : "DEMO INVENTORY · CONFIGURE SHOPIFY";

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="grain pointer-events-none fixed inset-0" />

      <header className="relative border-b border-[#174b36]/15 bg-[#d9f99d] px-6 py-5 md:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[#174b36] text-xl text-[#d9f99d]">
              ↗
            </div>
            <span className="font-black tracking-tight">LOCAL LOOP</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#174b36]/20 bg-white/50 px-3 py-2 text-xs font-bold">
            <span
              className={`h-2 w-2 rounded-full ${
                inventoryStatus === "error" ? "bg-rose-600" : "animate-pulse bg-emerald-600"
              }`}
            />
            {inventoryLabel} · {updatedAt ? `updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "connecting"}
          </div>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[1fr_320px] md:px-12 md:py-20">
        <div>
          <p className="mb-5 text-sm font-bold uppercase tracking-[.25em] text-[#e15b35]">
            Neighborhood commerce, upgraded
          </p>
          <h1 className="max-w-3xl text-5xl font-black leading-[.95] tracking-[-.06em] md:text-8xl">
            Shop with your <span className="text-[#e15b35]">agent.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-7 text-[#174b36]/70">
            Local Loop lets a shopper and their browser agent work from one Shopify cart.
            Search and prepare the order together; you stay in control of checkout.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="rounded-full bg-[#174b36] px-4 py-2 text-xs font-bold text-white">
              7 WEBMCP TOOLS
            </span>
            <span className="rounded-full border border-[#174b36]/20 px-4 py-2 text-xs font-bold">
              SHOPIFY CART
            </span>
            <span className="rounded-full border border-[#174b36]/20 px-4 py-2 text-xs font-bold">
              HUMAN CHECKOUT
            </span>
          </div>
        </div>

        <aside
          aria-live="polite"
          className="rounded-[2rem] bg-[#174b36] p-6 text-[#f8f7f2] shadow-xl shadow-[#174b36]/15"
        >
          <div className="mb-12 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-[#d9f99d]">
              Agent activity
            </span>
            <span className="text-xl">✦</span>
          </div>
          <p className="text-2xl font-bold leading-tight">“{agentMessage}”</p>
          <div className="mt-10 border-t border-white/20 pt-4 text-sm text-white/60">
            Use the demo assistant below, or connect a compatible browser agent to the
            WebMCP tools.
          </div>
        </aside>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 pb-8 md:px-12">
        <div className="rounded-[2rem] border border-[#174b36]/15 bg-white/80 p-5 shadow-lg shadow-[#174b36]/5 md:p-7">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-[#e15b35]">
                Try Local Loop
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                Ask for a product in plain language.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-5 text-[#174b36]/60">
              Free guided demo for simple requests. Compatible browser agents can call the
              seven WebMCP tools directly.
            </p>
          </div>

          <form
            className="mt-5 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void runDemoAssistant();
            }}
          >
            <label className="sr-only" htmlFor="local-loop-request">
              Ask Local Loop
            </label>
            <input
              id="local-loop-request"
              value={assistantInput}
              onChange={(event) => setAssistantInput(event.target.value)}
              placeholder='Try “find honey”, “add Rose Clay Mask”, or “show my cart”'
              className="min-w-0 flex-1 rounded-2xl border border-[#174b36]/15 bg-[#f8f7f2] px-5 py-4 text-sm outline-none placeholder:text-[#174b36]/40 focus:border-[#e15b35]"
            />
            <button
              type="submit"
              disabled={assistantBusy || !products.length}
              className="rounded-2xl bg-[#e15b35] px-6 py-4 text-sm font-bold text-white transition hover:bg-[#174b36] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {assistantBusy ? "Working…" : "Ask Local Loop"}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {["Find skincare", "Add Wildflower Honey", "Show my cart"].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={assistantBusy || !products.length}
                onClick={() => void runDemoAssistant(suggestion)}
                className="rounded-full border border-[#174b36]/15 bg-[#d9f99d]/50 px-4 py-2 text-xs font-bold text-[#174b36] transition hover:bg-[#d9f99d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="mt-7 border-t border-[#174b36]/10 pt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.2em] text-[#e15b35]">
                  Shopping list mode
                </p>
                <h3 className="mt-2 text-xl font-black tracking-tight">
                  Plan the list first. Add only after you approve.
                </h3>
              </div>
              <p className="max-w-md text-sm leading-5 text-[#174b36]/60">
                Add one request per line, such as “1 honey under 15” or “2 cold brews under 12”.
              </p>
            </div>

            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                previewShoppingList();
              }}
            >
              <label className="sr-only" htmlFor="shopping-list-request">
                Shopping list
              </label>
              <textarea
                id="shopping-list-request"
                value={shoppingListInput}
                onChange={(event) => setShoppingListInput(event.target.value)}
                placeholder={"1 honey under 15\n2 cold brews under 12"}
                rows={3}
                className="min-h-28 w-full rounded-2xl border border-[#174b36]/15 bg-[#f8f7f2] px-5 py-4 text-sm outline-none placeholder:text-[#174b36]/40 focus:border-[#e15b35]"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={!shoppingListInput.trim() || !products.length || shoppingListBusy}
                  className="rounded-full bg-[#174b36] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#e15b35] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Review live matches
                </button>
                <span className="text-xs text-[#174b36]/55">
                  Reviewing never changes your cart.
                </span>
              </div>
            </form>

            {shoppingListPlan ? (
              <div
                aria-live="polite"
                className="mt-5 rounded-2xl border border-[#174b36]/10 bg-[#f8f7f2] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black">
                      {shoppingListPlan.matched} of {shoppingListPlan.items.length} request
                      {shoppingListPlan.items.length === 1 ? "" : "s"} matched
                    </p>
                    <p className="mt-1 text-xs text-[#174b36]/60">
                      Only the matches below will be added after your approval.
                    </p>
                  </div>
                  {shoppingListPlan.additions.length ? (
                    <button
                      type="button"
                      onClick={() => void approveShoppingList()}
                      disabled={shoppingListBusy}
                      className="rounded-full bg-[#e15b35] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#174b36] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {shoppingListBusy ? "Adding…" : "Add matched items to cart"}
                    </button>
                  ) : null}
                </div>

                <ul className="mt-4 space-y-2 text-sm">
                  {shoppingListPlan.results.map((result, index) => (
                    <li
                      key={`${result.query}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-[#174b36]/10 pt-2 first:border-0 first:pt-0"
                    >
                      <span className="font-semibold">
                        {result.matched
                          ? `${result.item.quantity} × ${result.item.title}`
                          : result.query}
                      </span>
                      <span
                        className={
                          result.matched ? "text-[#174b36]/70" : "text-[#a03b20]"
                        }
                      >
                        {result.matched
                          ? `${money(result.item.price, cartCurrency)} each`
                          : result.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="relative mx-auto grid max-w-7xl items-start gap-8 px-6 pb-20 md:grid-cols-[minmax(0,1fr)_320px] md:px-12">
        <div>
          <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-[#174b36]/15 bg-white/60 p-4 md:flex-row">
            <input
              aria-label="Search inventory"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the neighborhood shelf..."
              className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-3 outline-none placeholder:text-[#174b36]/40"
            />
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-xl border-0 bg-[#d9f99d] px-4 py-3 text-sm font-bold outline-none"
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products
              .filter(
                (item) =>
                  (!query ||
                    `${item.title} ${item.description}`
                      .toLowerCase()
                      .includes(query.toLowerCase())) &&
                  (category === "all" || item.category === category),
              )
              .map((product) => (
                <article
                  key={product.id}
                  className="group overflow-hidden rounded-[1.5rem] border border-[#174b36]/10 bg-white transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="relative aspect-[1.15] overflow-hidden bg-[#eef0e6]">
                    <Image
                      src={product.thumbnail}
                      alt={product.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-contain p-8 transition duration-500 group-hover:scale-105"
                    />
                    <div
                      className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${
                        product.stock <= 5
                          ? "bg-[#ffe0c8] text-[#a03b20]"
                          : "bg-[#d9f99d] text-[#174b36]"
                      }`}
                    >
                      {product.stock === 0
                        ? "Out of stock"
                        : product.stock <= 5
                          ? `Only ${product.stock} left`
                          : `${product.stock} in stock`}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[#174b36]/45">
                          {product.brand}
                        </p>
                        <h2 className="mt-1 text-lg font-black leading-tight">
                          {product.title}
                        </h2>
                        {product.variant_title !== "Default Title" ? (
                          <p className="mt-1 text-xs text-[#174b36]/45">
                            {product.variant_title}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-lg font-black">
                        {money(product.price, cartCurrency)}
                      </span>
                    </div>
                    <div className="mt-5 flex items-center justify-between">
                      <span className="text-sm text-[#174b36]/55">{product.category}</span>
                      <button
                        disabled={product.stock === 0}
                        onClick={() => void addToCart({ item_id: product.id, quantity: 1 })}
                        className="rounded-full bg-[#174b36] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#e15b35] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </div>

        <aside className="w-full rounded-[1.5rem] border border-[#174b36]/15 bg-white/95 p-5 shadow-xl md:sticky md:top-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#e15b35]">
                Your cart
              </p>
              <h2 className="text-2xl font-black">
                {cartItemCount} items
              </h2>
            </div>
            <span className="text-3xl">🛒</span>
          </div>

          <div className="mt-4 max-h-44 space-y-2 overflow-auto text-sm">
            {cartItems.length ? (
              cartItems.map((item) => (
                <div key={item.variant_id} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {item.quantity} × {item.title}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-bold">
                      {money(item.line_total, cartCurrency)}
                    </span>
                    <button
                      aria-label={`Remove ${item.title}`}
                      onClick={() => void removeFromCart({ item_id: item.variant_id })}
                      className="rounded-full px-1.5 text-[#a03b20] transition hover:bg-[#ffe0c8]"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[#174b36]/45">
                Your Shopify cart is waiting for an agent.
              </p>
            )}
          </div>

          <div className="mt-4 flex justify-between border-t border-[#174b36]/10 pt-3 font-black">
            <span>Total</span>
            <span>{money(cartTotal, cartCurrency)}</span>
          </div>

          {cartItemCount ? (
            <button
              onClick={() => void beginCheckout()}
              className="mt-4 w-full rounded-full bg-[#e15b35] py-3 text-sm font-bold text-white transition hover:bg-[#174b36]"
            >
              Continue to Shopify Checkout · {money(cartTotal, cartCurrency)}
            </button>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-[#174b36]/50">
            An agent can prepare the cart. Shopify Checkout always gives you the final review
            and payment decision.
          </p>
        </aside>
      </section>
    </main>
  );
}
